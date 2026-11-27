-- =====================================================================
-- Dash Lebanon — phase 11 database update
-- Run this ONCE in Supabase > SQL Editor, BEFORE deploying the new site.
-- It only ADDS things (tables, functions) and replaces one trigger
-- function. It does not delete any of your data.
--
-- What it adds
--   1. admin_audit_log        who did what (role changes, deletes, points...)
--   2. admin_set_role         make / remove an admin (realtime on the site)
--   3. admin_delete_user      delete a customer account directly
--   4. admin_adjust_points    add or remove points for a customer
--   5. delete_selected_data   "Delete data" screen: you choose what to delete
--   6. track_guest_order      track an order with order number + phone
--   7. claim_guest_orders     attach guest orders to the account after login
--   8. chat_* tables + RPCs   realtime chat between customers and you
--   9. realtime               missing tables + REPLICA IDENTITY FULL
--  10. English-only defaults  AI assistant name
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Audit log
-- Only the database functions below can write to it. Admins can read it.
-- ---------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references auth.users(id) on delete set null,
  admin_label text,
  action      text not null,
  target      text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
alter table public.admin_audit_log enable row level security;
drop policy if exists audit_admin_read on public.admin_audit_log;
create policy audit_admin_read on public.admin_audit_log
  for select to authenticated using (public.is_admin());

create or replace function public.dl_audit(p_action text, p_target text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_audit_log(admin_id, admin_label, action, target, details)
  select auth.uid(),
         (select coalesce(nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''), p.username)
            from public.profiles p where p.id = auth.uid()),
         p_action, p_target, coalesce(p_details, '{}'::jsonb);
$$;
revoke all on function public.dl_audit(text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Role changes
-- The old trigger blocked every role change coming from a browser session.
-- It now also allows the change when it is made by admin_set_role() below,
-- which sets a transaction-local flag that browsers cannot set.
-- ---------------------------------------------------------------------
create or replace function public.dash_prevent_client_profile_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and coalesce(current_setting('dl.role_change', true), '') <> '1' then
    if (tg_op = 'INSERT' and new.role::text = 'admin')
       or (tg_op = 'UPDATE' and new.role is distinct from old.role) then
      raise exception 'Changing profiles.role is not allowed for client sessions'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_role not in ('customer', 'admin') then raise exception 'invalid_role'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_change_own_role'; end if;

  select role into v_old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_old = p_role then
    return jsonb_build_object('id', p_user_id, 'role', p_role, 'changed', false);
  end if;

  perform set_config('dl.role_change', '1', true);   -- true = this transaction only
  update public.profiles set role = p_role where id = p_user_id;
  perform set_config('dl.role_change', '', true);

  perform public.dl_audit('role_change', p_user_id::text,
    jsonb_build_object('from', v_old, 'to', p_role));
  return jsonb_build_object('id', p_user_id, 'role', p_role, 'changed', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Delete a user directly
-- Orders are kept (their user_id becomes empty). Wishlist, addresses,
-- points history, chat and reviews of that user are removed by the
-- existing / new foreign keys (ON DELETE CASCADE).
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_delete_self'; end if;
  select email into v_email from auth.users where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;

  perform public.dl_audit('delete_user', p_user_id::text, jsonb_build_object('email', v_email));
  delete from auth.users where id = p_user_id;
  return jsonb_build_object('deleted', true, 'id', p_user_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Add / remove points
-- ---------------------------------------------------------------------
create or replace function public.admin_adjust_points(p_user_id uuid, p_points integer, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal integer;
  v_note text := left(coalesce(nullif(trim(p_note), ''), 'Manual adjustment'), 200);
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_points is null or p_points = 0 or abs(p_points) > 1000000 then raise exception 'invalid_amount'; end if;

  select loyalty_points into v_bal from public.profiles where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if p_points < 0 and v_bal + p_points < 0 then raise exception 'not_enough_points'; end if;

  perform public.credit_points(p_user_id, p_points, 'Admin: ' || v_note);
  perform public.dl_audit('points_adjust', p_user_id::text,
    jsonb_build_object('points', p_points, 'note', v_note, 'balance_after', v_bal + p_points));
  return jsonb_build_object('balance', v_bal + p_points);
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Delete selected data
-- Targets: orders, chat, ai_history, messages, reviews, coupons, points,
--          products, categories, customers, settings, audit
-- Files in Storage are removed by the website through the Storage API
-- (Supabase does not allow deleting storage rows with SQL).
-- Admin accounts are never deleted.
-- ---------------------------------------------------------------------
create or replace function public.delete_selected_data(p_targets text[], p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_res jsonb := '{}'::jsonb;
  v_n integer;
  t text;
  v_allowed text[] := array['orders','chat','ai_history','messages','reviews','coupons','points',
                            'products','categories','customers','settings','audit'];
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_confirm is distinct from 'DELETE SELECTED DATA' then raise exception 'confirmation_required'; end if;
  if p_targets is null or cardinality(p_targets) = 0 then raise exception 'nothing_selected'; end if;
  foreach t in array p_targets loop
    if not (t = any (v_allowed)) then raise exception 'unknown_target: %', t; end if;
  end loop;

  if 'orders' = any (p_targets) then
    delete from public.order_cancel_otps;
    delete from public.coupon_redemptions;
    delete from public.order_items;
    delete from public.orders;           get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('orders', v_n);
  end if;

  if 'chat' = any (p_targets) then
    delete from public.chat_messages;
    delete from public.chat_threads;     get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('chat', v_n);
  end if;

  if 'ai_history' = any (p_targets) then
    delete from public.ai_messages;
    delete from public.ai_conversations; get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('ai_history', v_n);
  end if;

  if 'messages' = any (p_targets) then
    delete from public.contact_messages; get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('messages', v_n);
  end if;

  if 'reviews' = any (p_targets) then
    delete from public.reviews;          get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('reviews', v_n);
  end if;

  if 'coupons' = any (p_targets) then
    delete from public.coupon_redemptions;
    delete from public.coupons;          get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('coupons', v_n);
  end if;

  if 'points' = any (p_targets) then
    delete from public.points_history;   get diagnostics v_n = row_count;
    update public.profiles set loyalty_points = 0 where loyalty_points <> 0;
    v_res := v_res || jsonb_build_object('points', v_n);
  end if;

  if 'products' = any (p_targets) then
    update public.order_items set product_id = null where product_id is not null;
    delete from public.bundle_offer_items;
    delete from public.bundle_offers;
    delete from public.product_option_values;
    delete from public.product_option_groups;
    delete from public.product_costs;
    delete from public.product_images;
    delete from public.wishlists;
    delete from public.reviews;
    delete from public.products;         get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('products', v_n);
  end if;

  if 'categories' = any (p_targets) then
    update public.products set category_id = null where category_id is not null;
    delete from public.categories;       get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('categories', v_n);
  end if;

  if 'customers' = any (p_targets) then
    delete from auth.users u
     where u.id <> auth.uid()
       and not exists (select 1 from public.profiles p where p.id = u.id and p.role = 'admin');
    get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('customers', v_n);
  end if;

  if 'settings' = any (p_targets) then
    delete from public.settings where id = 1;
    insert into public.settings (id) values (1);   -- every column falls back to its default
    v_res := v_res || jsonb_build_object('settings', 1);
  end if;

  if 'audit' = any (p_targets) then
    delete from public.admin_audit_log;  get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('audit', v_n);
  end if;

  perform public.dl_audit('delete_data', array_to_string(p_targets, ','), v_res);
  return jsonb_build_object('success', true, 'deleted', v_res);
end;
$$;

-- ---------------------------------------------------------------------
-- 6) + 7) Guest orders
-- ---------------------------------------------------------------------
create or replace function public.dl_digits(p text)
returns text language sql immutable as $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;

create or replace function public.track_guest_order(p_order_number text, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o public.orders;
  v_items jsonb;
begin
  if length(public.dl_digits(p_phone)) < 6 then return null; end if;
  select * into o from public.orders where order_number = upper(trim(coalesce(p_order_number, '')));
  if not found then return null; end if;
  if right(public.dl_digits(o.phone), 8) <> right(public.dl_digits(p_phone), 8) then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.product_name), '[]'::jsonb)
    into v_items from public.order_items i where i.order_id = o.id;
  return to_jsonb(o) || jsonb_build_object('order_items', v_items);
end;
$$;
grant execute on function public.track_guest_order(text, text) to anon, authenticated;

create or replace function public.claim_guest_orders(p_orders jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  n integer := 0;
  c integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(coalesce(p_orders, '[]'::jsonb)) <> 'array' then return 0; end if;
  for r in select value from jsonb_array_elements(p_orders) limit 50 loop
    continue when length(public.dl_digits(r->>'phone')) < 6;
    update public.orders
       set user_id = auth.uid()
     where order_number = upper(trim(coalesce(r->>'number', '')))
       and user_id is null
       and right(public.dl_digits(phone), 8) = right(public.dl_digits(r->>'phone'), 8);
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  return n;
end;
$$;
grant execute on function public.claim_guest_orders(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 8) Chat with specialists
-- One conversation per (customer, department). Customers and admins read
-- through RLS; all writes go through the functions below.
-- ---------------------------------------------------------------------
create table if not exists public.chat_departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 60),
  slug        text unique,
  description text not null default '',
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.chat_threads (
  id                   uuid primary key default gen_random_uuid(),
  department_id        uuid not null references public.chat_departments(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  status               text not null default 'open' check (status in ('open', 'closed')),
  last_message_at      timestamptz not null default now(),
  last_message_preview text not null default '',
  unread_for_admin     integer not null default 0,
  unread_for_user      integer not null default 0,
  created_at           timestamptz not null default now(),
  unique (department_id, user_id)
);
create index if not exists chat_threads_user_idx on public.chat_threads (user_id);
create index if not exists chat_threads_last_idx on public.chat_threads (last_message_at desc);

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.chat_threads(id) on delete cascade,
  sender_id   uuid references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('user', 'admin')),
  body        text not null check (length(trim(body)) between 1 and 2000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

alter table public.chat_departments enable row level security;
alter table public.chat_threads     enable row level security;
alter table public.chat_messages    enable row level security;

drop policy if exists chat_dep_read  on public.chat_departments;
drop policy if exists chat_dep_admin on public.chat_departments;
create policy chat_dep_read  on public.chat_departments for select to anon, authenticated using (is_active or public.is_admin());
create policy chat_dep_admin on public.chat_departments for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists chat_thr_read  on public.chat_threads;
drop policy if exists chat_thr_admin on public.chat_threads;
create policy chat_thr_read  on public.chat_threads for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy chat_thr_admin on public.chat_threads for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists chat_msg_read  on public.chat_messages;
drop policy if exists chat_msg_admin on public.chat_messages;
create policy chat_msg_read on public.chat_messages for select to authenticated
  using (public.is_admin() or exists (select 1 from public.chat_threads t where t.id = chat_messages.thread_id and t.user_id = auth.uid()));
create policy chat_msg_admin on public.chat_messages for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Customer sends a message to a department (creates the conversation if needed)
create or replace function public.chat_send_user_message(p_department_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_thread uuid;
  v_status text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select coalesce(account_status, 'enabled') into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'enabled' then raise exception 'account_disabled'; end if;
  if length(v_body) = 0 or length(v_body) > 2000 then raise exception 'invalid_message'; end if;
  if not exists (select 1 from public.chat_departments where id = p_department_id and is_active) then
    raise exception 'department_unavailable';
  end if;
  if (select count(*) from public.chat_messages m join public.chat_threads t on t.id = m.thread_id
       where t.user_id = v_uid and m.sender_role = 'user' and m.created_at > now() - interval '1 minute') >= 15 then
    raise exception 'rate_limited';
  end if;

  insert into public.chat_threads (department_id, user_id)
  values (p_department_id, v_uid)
  on conflict (department_id, user_id) do update set status = 'open'
  returning id into v_thread;

  insert into public.chat_messages (thread_id, sender_id, sender_role, body)
  values (v_thread, v_uid, 'user', v_body);

  update public.chat_threads
     set last_message_at = now(), last_message_preview = left(v_body, 80),
         unread_for_admin = unread_for_admin + 1
   where id = v_thread;

  return jsonb_build_object('thread_id', v_thread);
end;
$$;

-- Admin replies in a conversation
create or replace function public.chat_send_admin_message(p_thread_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := trim(coalesce(p_body, ''));
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if length(v_body) = 0 or length(v_body) > 2000 then raise exception 'invalid_message'; end if;
  if not exists (select 1 from public.chat_threads where id = p_thread_id) then raise exception 'thread_not_found'; end if;

  insert into public.chat_messages (thread_id, sender_id, sender_role, body)
  values (p_thread_id, auth.uid(), 'admin', v_body);

  update public.chat_threads
     set last_message_at = now(), last_message_preview = left(v_body, 80),
         unread_for_user = unread_for_user + 1, unread_for_admin = 0, status = 'open'
   where id = p_thread_id;

  return jsonb_build_object('thread_id', p_thread_id);
end;
$$;

-- Mark a conversation as read (by its owner, or by an admin)
create or replace function public.chat_mark_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.chat_threads where id = p_thread_id;
  if not found then return; end if;
  if public.is_admin() then
    update public.chat_threads set unread_for_admin = 0 where id = p_thread_id and unread_for_admin <> 0;
    update public.chat_messages set read_at = now()
     where thread_id = p_thread_id and sender_role = 'user' and read_at is null;
  elsif v_owner = auth.uid() then
    update public.chat_threads set unread_for_user = 0 where id = p_thread_id and unread_for_user <> 0;
    update public.chat_messages set read_at = now()
     where thread_id = p_thread_id and sender_role = 'admin' and read_at is null;
  end if;
end;
$$;

-- Admin closes or reopens a conversation
create or replace function public.chat_set_status(p_thread_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('open', 'closed') then raise exception 'invalid_status'; end if;
  update public.chat_threads set status = p_status where id = p_thread_id;
end;
$$;

grant execute on function public.chat_send_user_message(uuid, text) to authenticated;
grant execute on function public.chat_send_admin_message(uuid, text) to authenticated;
grant execute on function public.chat_mark_read(uuid) to authenticated;
grant execute on function public.chat_set_status(uuid, text) to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_adjust_points(uuid, integer, text) to authenticated;
grant execute on function public.delete_selected_data(text[], text) to authenticated;

-- Two starter departments. Rename or delete them from Admin > Chat.
insert into public.chat_departments (name, slug, description, sort_order)
select 'General Support', 'general', 'Orders, delivery and account questions', 1
where not exists (select 1 from public.chat_departments where slug = 'general');
insert into public.chat_departments (name, slug, description, sort_order)
select 'Sports', 'sports', 'Ask our sports specialist', 2
where not exists (select 1 from public.chat_departments where slug = 'sports');

-- ---------------------------------------------------------------------
-- 9) Realtime
-- Most tables were already enabled. Add the missing ones and make sure a
-- DELETE event still carries the columns the site filters on.
-- login_attempts and order_cancel_otps are NOT added on purpose (they hold
-- security data).
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['chat_departments','chat_threads','chat_messages','admin_audit_log','product_costs','coupon_redemptions']
  loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table public.orders             replica identity full;
alter table public.order_items        replica identity full;
alter table public.points_history     replica identity full;
alter table public.wishlists          replica identity full;
alter table public.delivery_locations replica identity full;
alter table public.coupons            replica identity full;
alter table public.profiles           replica identity full;
alter table public.reviews            replica identity full;
alter table public.chat_threads       replica identity full;
alter table public.chat_messages      replica identity full;

-- ---------------------------------------------------------------------
-- 10) English-only defaults
-- ---------------------------------------------------------------------
alter table public.ai_settings alter column assistant_name set default 'AI Assistant';
update public.ai_settings set assistant_name = 'AI Assistant'
 where assistant_name is null or assistant_name ~ '[\u0600-\u06FF]';
