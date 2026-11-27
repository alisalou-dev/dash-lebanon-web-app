-- =====================================================================
-- Dash Lebanon — phase 13: privacy self-service (run ONCE in Supabase > SQL Editor)
--   1. export_my_data()     the signed-in customer downloads a JSON copy of their data
--   2. delete_my_account()  the signed-in customer deletes their own account
-- Nothing destructive happens to anyone else; nothing is dropped. Safe to re-run.
-- =====================================================================

-- Helper: remove internal / technical fields (admin links, tokens, urls...) from exported rows
create or replace function public.dl_clean_json(p jsonb)
returns jsonb
language sql
immutable
as $$
  select case jsonb_typeof(p)
    when 'object' then coalesce((
      select jsonb_object_agg(k, v) from jsonb_each(p) as e(k, v)
      where k !~* '(admin|internal|token|secret|password|hash|url|link|staff)'
        and not (jsonb_typeof(v) = 'string' and (v #>> '{}') ~* '(netlify\.app|/admin)')
    ), '{}'::jsonb)
    when 'array' then coalesce((
      select jsonb_agg(public.dl_clean_json(x)) from jsonb_array_elements(p) as a(x)
    ), '[]'::jsonb)
    else p
  end;
$$;

-- Helper: rows of one table that belong to the current user (only if the table has a user_id column)
create or replace function public.dl_my_rows(p_table text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = 'user_id'
  ) then
    return '[]'::jsonb;
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.user_id = $1', p_table)
    into v using auth.uid();
  return v;
end;
$$;
revoke all on function public.dl_my_rows(text) from public, anon;

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_orders jsonb;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select to_jsonb(p) - 'role' into v_profile from public.profiles p where p.id = v_uid;

  select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object(
           'items', coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id = o.id), '[]'::jsonb))), '[]'::jsonb)
    into v_orders
    from public.orders o where o.user_id = v_uid;

  return public.dl_clean_json(jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object('id', v_uid, 'email', (select email from auth.users where id = v_uid)),
    'profile', coalesce(v_profile, '{}'::jsonb),
    'orders', v_orders,
    'wishlist', public.dl_my_rows('wishlists'),
    'reviews', public.dl_my_rows('reviews'),
    'delivery_location', public.dl_my_rows('delivery_locations'),
    'points_history', public.dl_my_rows('points_history'),
    'contact_messages', public.dl_my_rows('contact_messages'),
    'chat_threads', public.dl_my_rows('chat_threads')
  ));
end;
$$;
grant execute on function public.export_my_data() to authenticated;

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  -- an admin must be demoted first (stops the last admin deleting themselves by accident)
  if public.is_admin() then raise exception 'admin_cannot_self_delete'; end if;

  -- same effect as admin_delete_user: foreign keys remove wishlist, addresses, points, chats;
  -- past orders stay without a link to the account
  delete from auth.users where id = v_uid;
  return jsonb_build_object('deleted', true);
end;
$$;
grant execute on function public.delete_my_account() to authenticated;

-- make the API see the new functions right away
notify pgrst, 'reload schema';
