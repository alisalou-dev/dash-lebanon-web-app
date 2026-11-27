/* =====================================================================
   Phase 11
   - orders that stay visible with or without an account (guest tracking)
   - admin: make/remove admin, delete user, add/remove points, activity log
   - admin: "Delete data" with a checklist
   - realtime chat with specialists (customer page + admin inbox)
   - one realtime layer for every table
   All user-visible text is English.
===================================================================== */
(function () {
  'use strict';

  var V3 = {
    chat: { deps: [], threads: [], thread: null, msgs: [], depId: null },
    ac: { deps: [], threads: [], people: {}, cur: null, msgs: [], dep: 'all' },
    guestTimer: null, pendingRender: false, userQ: ''
  };
  var $ = function (id) { return document.getElementById(id); };
  var DB_HINT = 'Database update needed: run sql/04-admin-chat-realtime.sql in Supabase first';

  /* ---------------------------------------------------------------
     Helpers
  --------------------------------------------------------------- */
  var ERR = {
    not_admin: 'Admin access is required',
    cannot_change_own_role: 'You cannot change your own role',
    cannot_delete_self: 'You cannot delete your own account',
    not_enough_points: 'This customer does not have that many points',
    invalid_amount: 'Enter a valid amount',
    user_not_found: 'User not found',
    confirmation_required: 'Confirmation is required',
    nothing_selected: 'Select at least one item',
    account_disabled: 'This account is disabled',
    rate_limited: 'You are sending messages too fast. Please wait a moment',
    invalid_message: 'The message is empty or too long',
    department_unavailable: 'This department is not available',
    thread_not_found: 'Conversation not found',
    not_authenticated: 'Please sign in first'
  };
  function errText(err) {
    var m = String((err && err.message) || err || '');
    for (var k in ERR) if (m.indexOf(k) !== -1) return ERR[k];
    if (err && (err.code === 'PGRST202' || err.code === '42P01' || err.code === 'PGRST205' || /Could not find the (function|table)|schema cache|does not exist/i.test(m))) return DB_HINT;
    return m || 'Something went wrong';
  }
  async function rpc(name, args) {
    var r = await sb.rpc(name, args);
    if (r.error) r.message = errText(r.error);
    return r;
  }
  function fullName(p) {
    p = p || {};
    return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username || p.email || 'Customer';
  }
  function timeAgo(iso) {
    if (!iso) return '';
    var d = new Date(iso), s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + ' min';
    if (s < 86400) return Math.floor(s / 3600) + ' h';
    return d.toLocaleDateString();
  }
  function clock(iso) {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function debounce(fn, ms) {
    var t = null;
    return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
  }
  function busy(scope) {
    var a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && scope && scope.contains(a));
  }
  window.aiErrEn = function (s) {
    if (!s) return s;
    s = String(s);
    if (!/[\u0600-\u06FF]/.test(s)) return s;
    if (/غير متاح|غير مُعدّ/.test(s)) return 'Sorry, the AI assistant is unavailable right now. Please try again later.';
    if (/كبير|انتظر/.test(s)) return 'Too many messages. Please wait a moment and try again.';
    if (/فارغة/.test(s)) return 'The message is empty.';
    if (/طويلة/.test(s)) return 'The message is too long.';
    if (/جلسة/.test(s)) return 'Invalid session.';
    return 'Sorry, something went wrong. Please try again.';
  };

  /* ---- small modal helpers (no browser confirm / prompt) ---- */
  var confirmRes = null;
  window.__v3c = function (ok) {
    var r = confirmRes; confirmRes = null; $('modal-root').innerHTML = '';
    if (r) r(!!ok);
  };
  function modal(inner, width) {
    $('modal-root').innerHTML = '<div class="modal-ov" onclick="closeModal(event)"><div class="modal-sheet" style="max-width:' + (width || 480) + 'px" onclick="event.stopPropagation()">' + inner + '</div></div>';
  }
  function confirmBox(o) {
    return new Promise(function (resolve) {
      confirmRes = resolve;
      var typed = o.typed ? '<div class="fgroup" style="margin-top:12px"><label class="flabel">Type <strong>' + esc(o.typed) + '</strong> to confirm</label><input class="finput" id="v3c-typed" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' : '';
      modal('<div class="modal-title">' + esc(o.title) + '</div><div class="muted-note" style="font-size:.9rem;line-height:1.65">' + (o.html || esc(o.text || '')) + '</div>' + typed +
        '<div class="v3-actions"><button class="btn btn-ghost" onclick="__v3c(false)">Cancel</button><button class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" id="v3c-ok" ' + (o.typed ? 'disabled' : '') + ' onclick="__v3c(true)">' + esc(o.label || 'Confirm') + '</button></div>');
      if (o.typed) {
        var inp = $('v3c-typed');
        inp.addEventListener('input', function () { $('v3c-ok').disabled = inp.value.trim() !== o.typed; });
      }
    });
  }

  /* ---------------------------------------------------------------
     1) Orders that stay visible with or without an account
  --------------------------------------------------------------- */
  var GKEY = 'dl_guest_orders';
  function gGet() { try { return JSON.parse(localStorage.getItem(GKEY) || '[]') || []; } catch (e) { return []; } }
  function gSet(a) { try { localStorage.setItem(GKEY, JSON.stringify(a.slice(0, 30))); } catch (e) { /* storage full or blocked */ } }
  function gSave(o) {
    if (!o || !o.number) return;
    var a = gGet().filter(function (x) { return x.number !== o.number; });
    a.unshift({ number: o.number, phone: o.phone || '', id: o.id || '', at: Date.now() });
    gSet(a);
  }
  window.dlSaveGuestOrder = gSave;

  // Remember every order placed without an account (checkout page and AI assistant both use place_order)
  var _rpc = sb.rpc.bind(sb);
  sb.rpc = function (name, args, opts) {
    var q = _rpc(name, args, opts);
    if (name !== 'place_order') return q;
    return Promise.resolve(q).then(function (r) {
      try {
        var d = r && r.data;
        if (!r.error && d && d.order_number && !S.session) gSave({ number: d.order_number, id: d.id, phone: (args && args.p_info && args.p_info.phone) || '' });
      } catch (e) { /* ignore */ }
      return r;
    });
  };

  async function gFetchAll() {
    var list = gGet();
    if (!list.length) return [];
    var res = await Promise.all(list.map(function (g) {
      return _rpc('track_guest_order', { p_order_number: g.number, p_phone: g.phone })
        .then(function (r) { return r.error ? null : r.data; }).catch(function () { return null; });
    }));
    return res.filter(Boolean).map(function (o) { o._guest = true; return o; });
  }
  function byDate(a, b) { return new Date(b.created_at) - new Date(a.created_at); }
  var LOAD_HTML = '<div class="page"><div class="sqa sqa-lg" style="margin:60px auto;display:block"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>';

  function trackFormHTML(open) {
    return '<details class="card form-card v3-track"' + (open ? ' open' : '') + '><summary>Track an order with its number</summary>' +
      '<div class="muted-note" style="margin:8px 0 12px">Enter the order number and the phone number you used when ordering.</div>' +
      '<div class="frow2"><div class="fgroup"><label class="flabel">Order number</label><input class="finput" id="trk-num" placeholder="DL-000000-ABC123" autocapitalize="characters"></div>' +
      '<div class="fgroup"><label class="flabel">Phone number</label><input class="finput" id="trk-phone" type="tel" placeholder="Phone used for the order"></div></div>' +
      '<button class="btn btn-primary btn-sm" onclick="v3TrackOrder()">Track order</button></details>';
  }
  window.v3TrackOrder = async function () {
    var num = ($('trk-num').value || '').trim(), ph = ($('trk-phone').value || '').trim();
    if (!num || ph.replace(/\D/g, '').length < 6) { toast('Enter the order number and your phone number'); return; }
    var r = await rpc('track_guest_order', { p_order_number: num, p_phone: ph });
    if (r.error) { toast(r.message); return; }
    if (!r.data) { toast('No order found. Check the order number and phone number'); return; }
    gSave({ number: r.data.order_number, id: r.data.id, phone: ph });
    toast('Order found');
    window.pOrders();
  };

  function drawOrders(orders) {
    var empty = '<div class="empty-box"><div class="empty-ico">▤</div><div class="empty-ttl">No orders yet</div><div class="empty-sub">Orders you place will show up here, even without an account.</div></div><div style="text-align:center;margin-bottom:18px"><button class="btn btn-primary btn-sm" onclick="resetHome()">Browse products</button></div>';
    var rows = orders.map(function (o) {
      var n = (o.order_items || []).length;
      return '<div class="card order-row-v2"><button class="order-row-main" onclick="nav(\'order-detail\',\'' + esc(o.id) + '\')"><div class="order-icon">▤</div><div class="order-row-copy"><strong>' + esc(o.order_number) + '</strong><span>' + n + ' item' + (n !== 1 ? 's' : '') + ' · ' + fmt(o.total) + '</span><small>' + (o.created_at ? new Date(o.created_at).toLocaleDateString() : '') + '</small></div><span class="state-pill ' + (o.status === 'delivered' ? 'is-on' : o.status === 'cancelled' ? 'is-off' : 'is-live') + '"><i></i>' + esc(dlStatusLabel(o.status)) + '</span></button><button class="btn btn-ghost btn-sm order-invoice-btn" onclick="printCustomerInvoice(\'' + esc(o.id) + '\')">Invoice</button></div>';
    }).join('');
    app().innerHTML = '<div class="page"><button class="back-link" onclick="goBack()">← Back</button><div class="page-heading-v2"><div><div class="eyebrow-mini">' + (S.session ? 'Account' : 'Guest') + '</div><div class="section-title">My Orders</div></div></div>' +
      (S.session ? '' : '<div class="muted-note" style="margin:6px 0 12px">You are not signed in. Orders placed on this device are shown here. <a href="/login" onclick="event.preventDefault();nav(\'account\')" style="color:var(--primary);font-weight:700">Sign in</a> to keep them in your account.</div>') +
      trackFormHTML(!orders.length) +
      (orders.length ? '<div class="customer-order-list">' + rows + '</div>' : empty) + '</div>';
  }

  async function loadOrders() {
    var orders = [];
    if (S.session) {
      var r = await sb.from('orders').select('*, order_items(*)').eq('user_id', S.session.user.id).order('created_at', { ascending: false });
      orders = r.data || [];
      var ids = {}; orders.forEach(function (o) { ids[o.id] = 1; });
      (await gFetchAll()).forEach(function (o) { if (!ids[o.id]) orders.push(o); });
    } else {
      orders = await gFetchAll();
    }
    orders.sort(byDate);
    window._customerOrders = orders;
    window._guestCache = {};
    orders.forEach(function (o) { if (o._guest) window._guestCache[o.id] = o; });
    S.currentOrder = orders[0] || null;
    return orders;
  }
  window.pOrders = async function () {
    clearInterval(V3.guestTimer);
    app().innerHTML = LOAD_HTML;
    var orders = await loadOrders();
    if (S.page !== 'orders') return;
    drawOrders(orders);
    // Guests have no realtime access to orders, so refresh quietly every 30 seconds
    if (!S.session && gGet().length) {
      V3.guestTimer = setInterval(async function () {
        if (S.page !== 'orders') { clearInterval(V3.guestTimer); return; }
        if (busy(app())) return;
        var fresh = await loadOrders();
        if (S.page === 'orders' && JSON.stringify(fresh.map(function (o) { return o.status; })) !== JSON.stringify(orders.map(function (o) { return o.status; }))) { orders = fresh; drawOrders(fresh); }
      }, 30000);
    }
  };
  var softOrders = debounce(async function () {
    if (S.page !== 'orders' || busy(app())) return;
    drawOrders(await loadOrders());
  }, 300);

  window.pOrderDetail = async function () {
    app().innerHTML = LOAD_HTML;
    var o = null;
    if (S.session) {
      var r = await sb.from('orders').select('*, order_items(*)').eq('id', S.data).eq('user_id', S.session.user.id).maybeSingle();
      o = r.data;
    }
    if (!o) {
      var g = gGet().filter(function (x) { return x.id === S.data; })[0];
      if (g) {
        var rr = await _rpc('track_guest_order', { p_order_number: g.number, p_phone: g.phone });
        if (rr.data) { o = rr.data; o._guest = true; }
      }
      if (!o && window._guestCache && window._guestCache[S.data]) o = window._guestCache[S.data];
    }
    if (!o) { toast('Order not found'); nav('orders', null, false); return; }
    S.currentOrder = o;
    window._customerOrders = [o].concat((window._customerOrders || []).filter(function (x) { return x.id !== o.id; }));
    var steps = ['pending', 'confirmed', 'processing', 'shipping', 'delivered'];
    var cur = steps.indexOf(o.status), cancelled = o.status === 'cancelled', canCancel = !cancelled && o.status !== 'delivered';
    var items = o.order_items || [];
    var cancelArea = !canCancel ? '' : (o._guest
      ? '<div class="alert" style="margin-top:12px">To cancel or change this order, please contact us.</div><a class="btn btn-ghost" data-whatsapp-link href="#" target="_blank" rel="noopener">Contact us on WhatsApp</a>'
      : '<button class="btn btn-danger" onclick="cancelOrder(\'' + esc(o.id) + '\',\'' + esc(o.created_at) + '\')">Cancel order</button>');
    app().innerHTML = '<div class="page"><button class="back-link" onclick="goBack()">← Back</button><div class="section-head"><div><div class="eyebrow-mini">Order</div><div class="section-title">' + esc(o.order_number) + '</div></div><span class="state-pill ' + (o.status === 'delivered' ? 'is-on' : cancelled ? 'is-off' : 'is-live') + '"><i></i>' + esc(dlStatusLabel(o.status)) + '</span></div>' +
      (!cancelled ? '<div class="card tracking-card-v2"><div class="track-steps">' + steps.map(function (s, i) { return '<div class="track-step"><div class="track-dot ' + (i <= cur ? 'done' : '') + '">' + (i <= cur ? '✓' : i + 1) + '</div><div class="track-lbl">' + s + '</div></div>'; }).join('') + '</div></div>' : '<div class="alert alert-err">This order was cancelled.' + (o.cancel_reason ? ' Reason: ' + esc(o.cancel_reason) : '') + '</div>') +
      '<div class="card form-card order-summary-v2"><div class="invoice-toolbar"><div class="form-title">Order summary</div><button class="btn btn-primary btn-sm" onclick="printCustomerInvoice(\'' + esc(o.id) + '\')">Print invoice</button></div>' +
      items.map(function (i) { return '<div class="summary-row"><span>' + esc(i.product_name) + (i.is_bundle ? ' (' + esc(i.bundle_label) + ')' : '') + ' × ' + i.quantity + '</span><span>' + fmt(i.unit_price * i.quantity) + '</span></div>'; }).join('') +
      '<div class="summary-row"><span>Subtotal</span><span>' + fmt(o.subtotal) + '</span></div>' +
      (o.discount_amount > 0 ? '<div class="summary-row invoice-discount-row"><span>Discount' + (o.coupon_code ? ' · ' + esc(o.coupon_code) : '') + '</span><span>-' + fmt(o.discount_amount) + '</span></div>' : '') +
      '<div class="summary-row"><span>Delivery</span><span>' + fmt(o.delivery_fee) + '</span></div><div class="summary-row total"><span>Total</span><span>' + fmt(o.total) + '</span></div></div>' +
      '<div class="card form-card"><div class="form-title">Delivery details</div><div class="detail-list-v2"><div><span>Name</span><strong>' + esc(o.full_name) + '</strong></div><div><span>Phone</span><strong>' + esc(o.phone) + '</strong></div><div><span>Address</span><strong>' + esc(o.city || '') + (o.district ? ', ' + esc(o.district) : '') + ' — ' + esc(o.full_address || '') + '</strong></div>' + (o.floor ? '<div><span>Floor</span><strong>' + esc(o.floor) + '</strong></div>' : '') + '</div></div>' + cancelArea + '</div>';
    if (window.applySettingsToChrome) { try { var st = S.settings || {}; var wa = st.whatsapp_number ? 'https://wa.me/' + st.whatsapp_number.replace(/\D/g, '') + '?text=' + encodeURIComponent('Hello, I have a question about order ' + o.order_number + '.') : ''; if (wa) document.querySelectorAll('[data-whatsapp-link]').forEach(function (a) { a.href = wa; }); } catch (e) { /* ignore */ } }
  };

  // Attach orders placed in this browser to the account after sign-in
  var _lp = window.loadProfileAndWishlist;
  window.loadProfileAndWishlist = async function () {
    await _lp();
    try {
      if (S.session && S.profile && (S.profile.account_status || 'enabled') === 'enabled') {
        var g = gGet();
        if (g.length) {
          var r = await _rpc('claim_guest_orders', { p_orders: g.map(function (x) { return { number: x.number, phone: x.phone }; }) });
          if (!r.error) { gSet([]); if (r.data > 0) toast('Your earlier orders were added to your account'); }
        }
      }
    } catch (e) { /* ignore */ }
  };

  /* ---------------------------------------------------------------
     2) Admin shell: new sections
  --------------------------------------------------------------- */
  window.dlAdminShell = function () {
    return '<div class="admin-shell v2-admin-shell"><aside class="admin-sidebar v2-admin-sidebar">' +
      '<div class="admin-brand-panel"><div class="admin-brand-kicker">Control center</div><div class="admin-brand-title">' + esc((S.settings && S.settings.store_name) || 'Store') + ' <span>Workspace</span></div></div>' +
      '<div class="admin-sidebar-title">Manage</div>' +
      dlAdminNav('overview', 'Overview', '◈') + dlAdminNav('orders', 'Orders', '▤') + dlAdminNav('products', 'Products', '◇') +
      dlAdminNav('categories', 'Categories', '⌘') + dlAdminNav('reviews', 'Reviews', '★') + dlAdminNav('messages', 'Messages', '✉') +
      dlAdminNav('chat', 'Chat <span class="adm-badge hide" id="adm-chat-badge"></span>', '☷') + dlAdminNav('users', 'Customers', '◯') +
      '<div class="admin-sidebar-title" style="margin-top:14px">Growth</div>' + dlAdminNav('coupons', 'Coupons & Offers', '%') +
      '<div class="admin-sidebar-title" style="margin-top:14px">Configuration</div>' +
      dlAdminNav('settings', 'Store Settings', '⚙') + dlAdminNav('ai', 'AI Assistant', '✦') + dlAdminNav('audit', 'Activity log', '⌁') +
      '<div class="admin-sidebar-status"><span class="status-dot"></span> Secure admin session</div></aside>' +
      '<main class="admin-main v2-admin-main" id="admin-main">' + skeletonAdminBlock() + '</main></div>';
  };
  var _lasV3 = window.loadAdminSection;
  window.loadAdminSection = async function (id) {
    var main = $('admin-main');
    if (id === 'chat') return renderAdminChat(main);
    if (id === 'audit') return renderAdminAudit(main);
    return _lasV3(id);
  };
  var _asl = window.adminSectionLabel;
  window.adminSectionLabel = function (s) { return ({ chat: 'Chat', audit: 'Activity log' })[s] || _asl(s); };
  async function adminChatBadge() {
    var el = $('adm-chat-badge'); if (!el || !S.isAdmin) return;
    var r = await sb.from('chat_threads').select('unread_for_admin').gt('unread_for_admin', 0);
    var n = (r.data || []).reduce(function (s, t) { return s + (t.unread_for_admin || 0); }, 0);
    el.textContent = n > 99 ? '99+' : n; el.classList.toggle('hide', !n);
  }
  var _pAdminV3 = window.pAdmin;
  window.pAdmin = function () { _pAdminV3(); adminChatBadge(); };

  /* ---------------------------------------------------------------
     3) Admin: customers (role, points, delete, disable)
  --------------------------------------------------------------- */
  var statusLabel = function (s) { return s === 'banned' ? 'Blocked' : s === 'disabled' ? 'Disabled' : 'Active'; };
  function usersTableHTML() {
    var q = (V3.userQ || '').toLowerCase().trim(), me = S.session && S.session.user.id;
    var all = window._adminUsers || [];
    var list = q ? all.filter(function (u) { return [u.first_name, u.last_name, u.username, u.email, u.phone].join(' ').toLowerCase().indexOf(q) !== -1; }) : all;
    if (!list.length) return '<div class="empty-box"><div class="empty-ico">◯</div><div class="empty-ttl">' + (q ? 'No matches' : 'No users') + '</div><div class="empty-sub">' + (q ? 'Try a different search.' : 'Registered customers will appear here.') + '</div></div>';
    return '<div class="card admin-table-wrap v2-table-card"><table class="admin-table v2-table"><thead><tr><th>Customer</th><th>Contact</th><th>Role</th><th>Points</th><th>Access</th><th>Joined</th><th></th></tr></thead><tbody>' + list.map(function (u) {
      var st = u.account_status || 'enabled', self = u.id === me, isAdm = u.role === 'admin';
      var nm = fullName(u);
      return '<tr data-uid="' + esc(u.id) + '"><td data-label="Customer"><div class="user-cell"><div class="user-avatar">' + esc((u.first_name || u.email || 'U').slice(0, 1).toUpperCase()) + '</div><div><strong>' + esc(nm) + (self ? ' <span class="muted-note">(you)</span>' : '') + '</strong><div class="muted-note">@' + esc(u.username || '—') + '</div></div></div></td>' +
        '<td data-label="Contact"><div>' + esc(u.email || '—') + '</div><div class="muted-note">' + esc(u.phone || '') + '</div></td>' +
        '<td data-label="Role"><span class="status-badge ' + (isAdm ? 'st-admin' : 'st-user') + '">' + (isAdm ? 'Admin' : 'Customer') + '</span></td>' +
        '<td data-label="Points"><strong>' + (u.loyalty_points || 0) + '</strong></td>' +
        '<td data-label="Access"><span class="state-pill ' + (st === 'enabled' ? 'is-on' : 'is-off') + '"><i></i>' + statusLabel(st) + '</span></td>' +
        '<td data-label="Joined">' + (u.created_at ? new Date(u.created_at).toLocaleDateString() : '—') + '</td>' +
        '<td data-label="" class="actions-cell">' +
        (self ? '<span class="muted-note">This is you</span>' :
          '<button class="btn btn-ghost btn-sm" data-act="role">' + (isAdm ? 'Remove admin' : 'Make admin') + '</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="points">Points</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="toggle">' + (st === 'enabled' ? 'Disable' : 'Enable') + '</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="reset">Reset password</button>' +
          '<button class="btn btn-ghost btn-sm danger-outline" data-act="delete">Delete</button>') +
        '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function bindUsers() {
    var box = $('users-list'); if (!box) return;
    box.onclick = function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var tr = b.closest('[data-uid]'); if (!tr) return;
      userAction(b.dataset.act, tr.dataset.uid);
    };
  }
  window.drawAdminUsers = function (main) {
    main = main || $('admin-main'); if (!main) return;
    var n = (window._adminUsers || []).length;
    main.innerHTML = '<div class="admin-head"><div><div class="admin-title">Customers</div><div class="admin-kicker">' + n + ' account' + (n === 1 ? '' : 's') + ' in your store</div></div>' +
      '<div class="admin-head-actions"><input class="finput" id="users-q" type="search" placeholder="Search name, email or phone" value="' + esc(V3.userQ) + '" style="min-width:230px"></div></div><div id="users-list">' + usersTableHTML() + '</div>';
    $('users-q').addEventListener('input', function (e) { V3.userQ = e.target.value; $('users-list').innerHTML = usersTableHTML(); bindUsers(); });
    bindUsers();
  };
  window.renderAdminUsers = async function (main) {
    main = main || $('admin-main');
    main.innerHTML = '<div class="admin-head"><div><div class="admin-title">Customers</div><div class="admin-kicker">Loading accounts…</div></div></div>' + skeletonAdminBlock();
    var r = await sb.rpc('admin_list_users');
    if (r.error) { main.innerHTML = adminErrorBlock('Could not load users: ' + errText(r.error)); return; }
    window._adminUsers = r.data || [];
    window.drawAdminUsers(main);
  };
  var reloadUsers = debounce(async function () {
    if (S.page !== 'admin' || S.adminSection !== 'users') return;
    var main = $('admin-main'); if (!main || busy(main)) return;
    var r = await sb.rpc('admin_list_users');
    if (!r.error) { window._adminUsers = r.data || []; var box = $('users-list'); if (box) { box.innerHTML = usersTableHTML(); bindUsers(); var k = main.querySelector('.admin-kicker'); if (k) k.textContent = window._adminUsers.length + ' accounts in your store'; } }
  }, 400);

  function findUser(id) { return (window._adminUsers || []).filter(function (u) { return u.id === id; })[0]; }
  function redrawUsers() { var box = $('users-list'); if (box) { box.innerHTML = usersTableHTML(); bindUsers(); } }

  async function userAction(act, id) {
    var u = findUser(id); if (!u) return;
    var nm = fullName(u);
    if (act === 'role') {
      var make = u.role !== 'admin';
      var ok = await confirmBox({ title: make ? 'Make ' + nm + ' an admin?' : 'Remove admin access?', text: make ? 'This person will be able to manage orders, products, customers and settings. The change applies to their open session immediately.' : nm + ' will lose access to the admin dashboard immediately.', label: make ? 'Make admin' : 'Remove admin', danger: !make });
      if (!ok) return;
      var r = await rpc('admin_set_role', { p_user_id: id, p_role: make ? 'admin' : 'customer' });
      if (r.error) { toast(r.message); return; }
      u.role = make ? 'admin' : 'customer'; redrawUsers(); toast(make ? nm + ' is now an admin' : 'Admin access removed');
    } else if (act === 'points') {
      pointsModal(u);
    } else if (act === 'toggle') {
      var next = (u.account_status || 'enabled') === 'enabled' ? 'disabled' : 'enabled';
      var ok2 = await confirmBox({ title: next === 'disabled' ? 'Disable this account?' : 'Enable this account?', text: next === 'disabled' ? nm + ' will be signed out and will not be able to use the account.' : nm + ' will be able to sign in again.', label: next === 'disabled' ? 'Disable' : 'Enable', danger: next === 'disabled' });
      if (!ok2) return;
      var r2 = await rpc('admin_set_account_status', { p_user_id: id, p_status: next });
      if (r2.error) { toast(r2.message); return; }
      u.account_status = next; redrawUsers(); toast(next === 'enabled' ? 'Account enabled' : 'Account disabled');
    } else if (act === 'reset') {
      if (!u.email) { toast('This user has no email address available'); return; }
      var ok3 = await confirmBox({ title: 'Send a password reset email?', html: 'A reset link will be sent to <strong>' + esc(u.email) + '</strong>.', label: 'Send email' });
      if (!ok3) return;
      var r3 = await sb.auth.resetPasswordForEmail(u.email, { redirectTo: location.origin + location.pathname });
      toast(r3.error ? 'Could not send reset: ' + r3.error.message : 'Password reset email sent');
    } else if (act === 'delete') {
      var ok4 = await confirmBox({ title: 'Delete this user?', html: '<strong>' + esc(nm) + '</strong> (' + esc(u.email || 'no email') + ') will be deleted permanently, together with their wishlist, addresses, points and chats. Their past orders are kept without an account link.', label: 'Delete user', danger: true, typed: 'DELETE' });
      if (!ok4) return;
      var r4 = await rpc('admin_delete_user', { p_user_id: id });
      if (r4.error) { toast(r4.message); return; }
      window._adminUsers = (window._adminUsers || []).filter(function (x) { return x.id !== id; });
      redrawUsers(); toast('User deleted');
    }
  }
  function pointsModal(u) {
    modal('<div class="modal-title">Points for ' + esc(fullName(u)) + '</div><div class="muted-note" style="margin-bottom:12px">Current balance: <strong>' + (u.loyalty_points || 0) + '</strong> points</div>' +
      '<div class="fgroup"><label class="flabel">Points to add (positive) or remove (negative)</label><input class="finput" id="pt-amt" type="number" step="1" placeholder="e.g. 100 or -50" inputmode="numeric"></div>' +
      '<div class="v3-chips"><button class="pill" data-q="100">+100</button><button class="pill" data-q="500">+500</button><button class="pill" data-q="-100">-100</button><button class="pill" data-q="-500">-500</button></div>' +
      '<div class="fgroup"><label class="flabel">Reason (shown in the customer history)</label><input class="finput" id="pt-note" maxlength="120" placeholder="e.g. Welcome gift"></div>' +
      '<div class="alert alert-err hide" id="pt-err"></div>' +
      '<div class="v3-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="pt-go">Apply</button></div>');
    document.querySelectorAll('.v3-chips [data-q]').forEach(function (b) { b.onclick = function () { $('pt-amt').value = b.dataset.q; }; });
    $('pt-go').onclick = async function () {
      var amt = parseInt($('pt-amt').value, 10), err = $('pt-err');
      if (!amt) { err.textContent = 'Enter a number other than zero.'; err.classList.remove('hide'); return; }
      $('pt-go').disabled = true;
      var r = await rpc('admin_adjust_points', { p_user_id: u.id, p_points: amt, p_note: $('pt-note').value });
      if (r.error) { err.textContent = r.message; err.classList.remove('hide'); $('pt-go').disabled = false; return; }
      u.loyalty_points = r.data.balance; closeModal(); redrawUsers();
      toast((amt > 0 ? '+' : '') + amt + ' points. New balance: ' + r.data.balance);
    };
    setTimeout(function () { var i = $('pt-amt'); if (i) i.focus(); }, 50);
  }

  /* ---------------------------------------------------------------
     4) Admin: activity log
  --------------------------------------------------------------- */
  var ACT = { role_change: 'Role changed', delete_user: 'User deleted', points_adjust: 'Points adjusted', delete_data: 'Data deleted' };
  function detailText(a, d) {
    d = d || {};
    if (a === 'role_change') return d.from + ' → ' + d.to;
    if (a === 'delete_user') return d.email || '';
    if (a === 'points_adjust') return (d.points > 0 ? '+' : '') + d.points + ' points' + (d.note ? ' · ' + d.note : '') + ' (balance ' + d.balance_after + ')';
    if (a === 'delete_data') return Object.keys(d).map(function (k) { return k + ': ' + d[k]; }).join(', ');
    return JSON.stringify(d);
  }
  window.renderAdminAudit = async function (main) {
    main.innerHTML = '<div class="admin-head"><div><div class="admin-title">Activity log</div><div class="admin-kicker">Who changed what, newest first</div></div></div>' + skeletonAdminBlock();
    var r = await sb.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(150);
    if (r.error) { main.innerHTML = adminErrorBlock('Could not load the log: ' + errText(r.error)); return; }
    var users = {}; try { var ur = await sb.rpc('admin_list_users'); (ur.data || []).forEach(function (u) { users[u.id] = u; }); } catch (e) { /* optional */ }
    var rows = r.data || [];
    main.innerHTML = '<div class="admin-head"><div><div class="admin-title">Activity log</div><div class="admin-kicker">' + rows.length + ' recent action' + (rows.length === 1 ? '' : 's') + '</div></div></div>' +
      (!rows.length ? '<div class="empty-box"><div class="empty-ico">⌁</div><div class="empty-ttl">Nothing yet</div><div class="empty-sub">Role changes, deleted users, point changes and data deletions are recorded here.</div></div>' :
        '<div class="card admin-table-wrap v2-table-card"><table class="admin-table v2-table"><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>' + rows.map(function (x) {
          var tu = users[x.target]; var tgt = tu ? fullName(tu) + ' (' + (tu.email || '') + ')' : (x.target && x.target.length > 30 ? x.target.slice(0, 8) + '…' : x.target || '');
          return '<tr><td data-label="When">' + esc(new Date(x.created_at).toLocaleString()) + '</td><td data-label="Admin">' + esc(x.admin_label || '—') + '</td><td data-label="Action"><span class="status-badge st-user">' + esc(ACT[x.action] || x.action) + '</span></td><td data-label="Target">' + esc(tgt) + '</td><td data-label="Details">' + esc(detailText(x.action, x.details)) + '</td></tr>';
        }).join('') + '</tbody></table></div>');
  };

  /* ---------------------------------------------------------------
     5) Admin: "Delete data" with a checklist
  --------------------------------------------------------------- */
  var DD = [
    { k: 'orders', t: 'orders', n: 'Orders', d: 'All orders, order items and coupon usage' },
    { k: 'products', t: 'products', n: 'Products', d: 'Products, images list, options, costs and bundle offers' },
    { k: 'categories', t: 'categories', n: 'Categories', d: 'Product categories' },
    { k: 'customers', t: 'profiles', f: ['role', 'customer'], n: 'Customer accounts', d: 'Every customer account. Admin accounts are never deleted' },
    { k: 'messages', t: 'contact_messages', n: 'Contact messages', d: 'Messages from the contact form' },
    { k: 'reviews', t: 'reviews', n: 'Reviews', d: 'Customer product reviews' },
    { k: 'coupons', t: 'coupons', n: 'Coupons', d: 'Coupons and redemptions' },
    { k: 'points', t: 'points_history', n: 'Points', d: 'Points history. Every balance is set to 0' },
    { k: 'chat', t: 'chat_threads', n: 'Specialist chats', d: 'All specialist conversations' },
    { k: 'ai_history', t: 'ai_conversations', n: 'AI assistant chats', d: 'Saved AI assistant conversations' },
    { k: 'audit', t: 'admin_audit_log', n: 'Activity log', d: 'The admin activity log' },
    { k: 'settings', t: null, n: 'Store settings', d: 'Reset name, texts, rates and links to their defaults' },
    { k: 'files', t: null, n: 'Uploaded files', d: 'Images, videos, logo and voice messages in Storage' }
  ];
  var BUCKETS = ['product-images', 'product-videos', 'store-assets', 'contact-voice'];

  window.deleteAllSystemData = async function () {
    if (!S.isAdmin || !S.session) { toast('Admin access is required'); return; }
    modal('<div class="modal-title">Delete data</div><div class="muted-note" style="margin-bottom:10px">Choose exactly what to delete. This cannot be undone.</div>' +
      '<div class="v3-actions" style="justify-content:flex-start;margin:0 0 8px"><button class="btn btn-ghost btn-sm" id="dd-all">Select all</button><button class="btn btn-ghost btn-sm" id="dd-none">Clear</button></div>' +
      '<div class="v3-dd" id="dd-list">' + DD.map(function (x) { return '<label class="v3-dd-row"><input type="checkbox" value="' + x.k + '"><span><strong>' + esc(x.n) + ' <em id="dd-n-' + x.k + '"></em></strong><small>' + esc(x.d) + '</small></span></label>'; }).join('') + '</div>' +
      '<div class="fgroup" style="margin-top:12px"><label class="flabel">Type <strong>DELETE</strong> to enable the button</label><input class="finput" id="dd-typed" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
      '<div class="alert alert-err hide" id="dd-err"></div>' +
      '<div class="v3-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" id="dd-go" disabled>Delete selected</button></div>', 560);
    var upd = function () {
      var any = document.querySelectorAll('#dd-list input:checked').length > 0;
      $('dd-go').disabled = !(any && $('dd-typed').value.trim() === 'DELETE');
    };
    $('dd-typed').addEventListener('input', upd);
    $('dd-list').addEventListener('change', upd);
    $('dd-all').onclick = function () { document.querySelectorAll('#dd-list input').forEach(function (c) { c.checked = true; }); upd(); };
    $('dd-none').onclick = function () { document.querySelectorAll('#dd-list input').forEach(function (c) { c.checked = false; }); upd(); };
    $('dd-go').onclick = runDelete;
    // counts
    DD.forEach(async function (x) {
      if (!x.t) return;
      var q = sb.from(x.t).select('*', { count: 'exact', head: true });
      if (x.f) q = q.eq(x.f[0], x.f[1]);
      var r = await q, el = $('dd-n-' + x.k);
      if (el) el.textContent = r.error ? '' : '(' + (r.count || 0) + ')';
    });
  };

  function storagePath(url) {
    var m = String(url || '').match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/);
    return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null;
  }
  async function collectFiles() {
    var set = {};
    function add(bucket, path) { if (bucket && path) { (set[bucket] = set[bucket] || {})[path] = 1; } }
    function addUrl(u) { var p = storagePath(u); if (p) add(p.bucket, p.path); }
    try { (await sb.from('product_images').select('url')).data.forEach(function (x) { addUrl(x.url); }); } catch (e) { /* ignore */ }
    try { (await sb.from('products').select('cover_image,video_url')).data.forEach(function (x) { addUrl(x.cover_image); addUrl(x.video_url); }); } catch (e) { /* ignore */ }
    try { var s = (await sb.from('settings').select('logo_url,favicon_url').eq('id', 1).maybeSingle()).data || {}; addUrl(s.logo_url); addUrl(s.favicon_url); } catch (e) { /* ignore */ }
    try { (await sb.from('contact_messages').select('voice_path')).data.forEach(function (x) { if (x.voice_path) add('contact-voice', x.voice_path); }); } catch (e) { /* ignore */ }
    for (var b = 0; b < BUCKETS.length; b++) {
      (function (bucket) {
        async function walk(prefix) {
          var r = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
          if (r.error || !r.data) return;
          for (var i = 0; i < r.data.length; i++) {
            var it = r.data[i], p = (prefix ? prefix + '/' : '') + it.name;
            if (it.id) add(bucket, p); else await walk(p);
          }
        }
        set.__walk = (set.__walk || []).concat([walk('')]);
      })(BUCKETS[b]);
    }
    try { await Promise.all(set.__walk || []); } catch (e) { /* ignore */ }
    delete set.__walk;
    return set;
  }
  async function removeFiles(set) {
    var n = 0;
    for (var bucket in set) {
      var paths = Object.keys(set[bucket]);
      for (var i = 0; i < paths.length; i += 100) {
        var chunk = paths.slice(i, i + 100);
        var r = await sb.storage.from(bucket).remove(chunk);
        if (!r.error) n += (r.data || chunk).length;
      }
    }
    return n;
  }
  async function runDelete() {
    var picked = Array.prototype.map.call(document.querySelectorAll('#dd-list input:checked'), function (c) { return c.value; });
    var err = $('dd-err'), btn = $('dd-go');
    var wantFiles = picked.indexOf('files') !== -1;
    var targets = picked.filter(function (k) { return k !== 'files'; });
    btn.disabled = true; btn.textContent = 'Deleting…'; err.classList.add('hide');
    var files = null;
    if (wantFiles) files = await collectFiles();      // read file names first (they come from the rows we may delete)
    var summary = [];
    if (targets.length) {
      var r = await rpc('delete_selected_data', { p_targets: targets, p_confirm: 'DELETE SELECTED DATA' });
      if (r.error) { err.textContent = r.message; err.classList.remove('hide'); btn.disabled = false; btn.textContent = 'Delete selected'; return; }
      var d = (r.data && r.data.deleted) || {};
      Object.keys(d).forEach(function (k) { summary.push(k + ': ' + d[k]); });
    }
    if (wantFiles) { var n = await removeFiles(files); summary.push('files: ' + n); }
    // reload what the page keeps in memory, never leave it empty
    window._adminOrders = []; window._adminProducts = []; window._adminCats = [];
    if (picked.indexOf('orders') !== -1) { localStorage.removeItem(GKEY); }
    if (picked.indexOf('products') !== -1 || picked.indexOf('categories') !== -1) { S.cart = []; saveCart(); updateCartBadge(); }
    try {
      var s = await sb.from('settings').select('*').eq('id', 1).maybeSingle(); if (s.data) S.settings = s.data;
      var c = await sb.from('categories').select('*').eq('is_active', true).order('sort_order'); S.categories = c.data || [];
      var p = await sb.from('products').select('*, product_images(id,url,sort_order)').eq('is_active', true).order('created_at', { ascending: false }); S.products = p.data || [];
      applySettingsToChrome();
    } catch (e) { /* ignore */ }
    closeModal();
    toast('Deleted — ' + (summary.join(', ') || 'done'));
    if (S.page === 'admin') { var main = $('admin-main'); if (main) loadAdminSection(S.adminSection || 'overview'); }
  }

  /* ---------------------------------------------------------------
     6) Chat — customer side
  --------------------------------------------------------------- */
  var ROUTES_REF = typeof ROUTES !== 'undefined' ? ROUTES : null;
  if (ROUTES_REF) ROUTES_REF.push({ page: 'chat', pattern: /^\/chat$/, toPath: function () { return '/chat'; } });
  var _ppt = window.pageTitle;
  window.pageTitle = function () { return S.page === 'chat' ? 'Chat | ' + ((S.settings && S.settings.store_name) || 'Dash Lebanon') : _ppt(); };
  var _pfr = window.pathForRoute;
  window.pathForRoute = function (page, data) { return page === 'chat' ? '/chat' : _pfr(page, data); };
  var _render = window.render;
  window.render = function () {
    if (S.page !== 'chat') V3.chat.depId = null;
    if (S.page === 'chat') {
      showFooterCart(false); document.body.classList.remove('has-sticky-bar');
      window.pChat();
      document.title = pageTitle(); if (window.dlSeo) dlSeo(S, location.pathname);
      document.body.classList.remove('is-admin');
      if (typeof updateMobileNav === 'function') updateMobileNav();
      return;
    }
    var r = _render();
    document.body.classList.toggle('is-admin', S.page === 'admin' || S.page === 'admin-login');
    if (typeof updateMobileNav === 'function') updateMobileNav();
    return r;
  };

  function chatBadge() {
    var n = V3.chat.threads.reduce(function (s, t) { return s + (t.unread_for_user || 0); }, 0);
    document.querySelectorAll('[data-mnav="chat"]').forEach(function (el) { el.classList.toggle('has-dot', n > 0); });
    return n;
  }
  async function loadChatData() {
    var uid = S.session && S.session.user.id;
    var res = await Promise.all([
      sb.from('chat_departments').select('*').eq('is_active', true).order('sort_order'),
      uid ? sb.from('chat_threads').select('*').eq('user_id', uid) : Promise.resolve({ data: [] })
    ]);
    V3.chat.deps = (res[0] && res[0].data) || [];
    V3.chat.threads = (res[1] && res[1].data) || [];
    V3.chat.dbError = res[0] && res[0].error ? errText(res[0].error) : '';
    chatBadge();
  }
  window.pChat = async function () {
    if (!S.session) { app().innerHTML = authRequiredHTML('chat with our specialists'); return; }
    var c = V3.chat;
    app().innerHTML = LOAD_HTML;
    await loadChatData();
    if (S.page !== 'chat') return;
    if (c.depId) return openConv(c.depId); else drawChatHome();
  };
  function drawChatHome() {
    var c = V3.chat;
    var cards = c.deps.map(function (d) {
      var t = c.threads.filter(function (x) { return x.department_id === d.id; })[0];
      return '<button class="card cht-dep" onclick="v3ChatOpen(\'' + esc(d.id) + '\')"><div class="cht-dep-ico">☷</div><div class="cht-dep-txt"><strong>' + esc(d.name) + '</strong><span>' + esc(d.description || 'Chat with our specialist') + '</span>' + (t && t.last_message_preview ? '<small>' + esc(t.last_message_preview) + ' · ' + timeAgo(t.last_message_at) + '</small>' : '') + '</div>' + (t && t.unread_for_user ? '<span class="adm-badge">' + t.unread_for_user + '</span>' : '<span class="cht-go">›</span>') + '</button>';
    }).join('');
    app().innerHTML = '<div class="page" style="max-width:720px"><button class="back-link" onclick="goBack()">← Back</button><div class="page-heading-v2"><div><div class="eyebrow-mini">Support</div><div class="section-title">Chat with a specialist</div></div></div>' +
      '<div class="muted-note" style="margin:6px 0 14px">Pick a department and write to us. Replies appear here instantly.</div>' +
      (c.dbError ? '<div class="alert alert-err">' + esc(c.dbError) + '</div>' : '') +
      (cards ? '<div class="cht-deps">' + cards + '</div>' : (c.dbError ? '' : '<div class="empty-box"><div class="empty-ico">☷</div><div class="empty-ttl">No departments yet</div><div class="empty-sub">Please check back soon.</div></div>')) +
      '<div class="card cht-ai"><div><strong>Need a quick answer?</strong><div class="muted-note">Ask our AI assistant about products, delivery and orders.</div></div><button class="btn btn-ghost btn-sm" onclick="toggleAiPanel()">Ask the AI assistant</button></div></div>';
  }
  window.v3ChatOpen = function (id) { V3.chat.depId = id; openConv(id); };
  window.v3ChatBack = function () { V3.chat.depId = null; V3.chat.thread = null; drawChatHome(); };
  async function openConv(depId) {
    var c = V3.chat;
    c.depId = depId;
    c.thread = c.threads.filter(function (t) { return t.department_id === depId; })[0] || null;
    c.msgs = [];
    if (c.thread) {
      var r = await sb.from('chat_messages').select('*').eq('thread_id', c.thread.id).order('created_at');
      c.msgs = r.data || [];
      if (c.thread.unread_for_user) { c.thread.unread_for_user = 0; chatBadge(); sb.rpc('chat_mark_read', { p_thread_id: c.thread.id }); }
    }
    drawConv();
  }
  function msgsHTML(list, mine) {
    if (!list.length) return '<div class="cht-empty">No messages yet. Say hello and we will reply here.</div>';
    return list.map(function (m) {
      var me = m.sender_role === mine;
      return '<div class="cht-msg ' + (me ? 'me' : 'them') + '"><div class="cht-bubble">' + esc(m.body) + '</div><small>' + (me ? '' : (mine === 'user' ? 'Specialist · ' : '')) + clock(m.created_at) + '</small></div>';
    }).join('');
  }
  function drawConv() {
    var c = V3.chat, dep = c.deps.filter(function (d) { return d.id === c.depId; })[0] || { name: 'Chat' };
    app().innerHTML = '<div class="page cht-page"><button class="back-link" onclick="v3ChatBack()">← All departments</button><div class="card cht-conv"><div class="cht-head"><strong>' + esc(dep.name) + '</strong><span class="muted-note">Replies appear here instantly</span></div><div class="cht-msgs" id="cht-msgs">' + msgsHTML(c.msgs, 'user') + '</div>' +
      '<div class="cht-form"><textarea class="ftextarea cht-in" id="cht-in" rows="1" maxlength="2000" placeholder="Write a message"></textarea><button class="btn btn-primary cht-send" id="cht-send" aria-label="Send">Send</button></div></div></div>';
    window.scrollTo(0, 0);
    var box = $('cht-msgs'); box.scrollTop = box.scrollHeight;
    var ta = $('cht-in');
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.v3ChatSend(); } });
    $('cht-send').onclick = window.v3ChatSend;
  }
  window.v3ChatSend = async function () {
    var c = V3.chat, ta = $('cht-in'); if (!ta) return;
    var body = ta.value.trim(); if (!body) return;
    ta.value = '';
    c.msgs.push({ id: 'tmp' + Date.now(), sender_role: 'user', body: body, created_at: new Date().toISOString() });
    var box = $('cht-msgs'); if (box) { box.innerHTML = msgsHTML(c.msgs, 'user'); box.scrollTop = box.scrollHeight; }
    var r = await rpc('chat_send_user_message', { p_department_id: c.depId, p_body: body });
    if (r.error) { c.msgs.pop(); if (box) box.innerHTML = msgsHTML(c.msgs, 'user'); ta.value = body; toast(r.message); return; }
    await loadChatData();
    var tid = r.data && r.data.thread_id;
    c.thread = c.threads.filter(function (t) { return t.id === tid; })[0] || c.thread;
    refreshConv();
  };
  var refreshConv = debounce(async function () {
    var c = V3.chat; if (S.page !== 'chat' || !c.depId || !c.thread) return;
    var r = await sb.from('chat_messages').select('*').eq('thread_id', c.thread.id).order('created_at');
    if (r.error) return;
    c.msgs = r.data || [];
    var box = $('cht-msgs'); if (box) { box.innerHTML = msgsHTML(c.msgs, 'user'); box.scrollTop = box.scrollHeight; }
    if (c.thread.unread_for_user) { c.thread.unread_for_user = 0; chatBadge(); sb.rpc('chat_mark_read', { p_thread_id: c.thread.id }); }
  }, 150);

  /* ---------------------------------------------------------------
     7) Chat — admin inbox
  --------------------------------------------------------------- */
  window.renderAdminChat = async function (main) {
    main.innerHTML = '<div class="admin-head"><div><div class="admin-title">Chat</div><div class="admin-kicker">Conversations with customers, live</div></div><div class="admin-head-actions"><button class="btn btn-ghost btn-sm" onclick="v3Departments()">Manage departments</button></div></div>' + skeletonAdminBlock();
    var ac = V3.ac;
    var res = await Promise.all([sb.from('chat_departments').select('*').order('sort_order'), sb.from('chat_threads').select('*').order('last_message_at', { ascending: false }).limit(200)]);
    if (res[0].error || res[1].error) { main.innerHTML = adminErrorBlock('Could not load chat: ' + errText(res[0].error || res[1].error)); return; }
    ac.deps = res[0].data || []; ac.threads = res[1].data || [];
    await loadPeople();
    main.innerHTML = '<div class="admin-head"><div><div class="admin-title">Chat</div><div class="admin-kicker">Conversations with customers, live</div></div><div class="admin-head-actions"><button class="btn btn-ghost btn-sm" onclick="v3Departments()">Manage departments</button></div></div>' +
      '<div class="aic-wrap" id="ac-wrap"><div class="card aic-list"><div class="aic-search"><select class="fselect" id="ac-dep"><option value="all">All departments</option>' + ac.deps.map(function (d) { return '<option value="' + esc(d.id) + '"' + (ac.dep === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') + '</select></div><div class="aic-rows" id="ac-rows"></div></div>' +
      '<div class="card aic-view" id="ac-view"><div class="aic-empty">Select a conversation to read and reply.</div></div></div>';
    $('ac-dep').onchange = function (e) { ac.dep = e.target.value; drawAcRows(); };
    drawAcRows();
    if (ac.cur) openAcThread(ac.cur.id, true);
    adminChatBadge();
  };
  async function loadPeople() {
    var ids = V3.ac.threads.map(function (t) { return t.user_id; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (!ids.length) return;
    var r = await sb.from('profiles').select('id,first_name,last_name,username,phone').in('id', ids);
    (r.data || []).forEach(function (p) { V3.ac.people[p.id] = p; });
  }
  function drawAcRows() {
    var ac = V3.ac, box = $('ac-rows'); if (!box) return;
    var list = ac.threads.filter(function (t) { return ac.dep === 'all' || t.department_id === ac.dep; });
    box.innerHTML = list.length ? list.map(function (t) {
      var p = ac.people[t.user_id], d = ac.deps.filter(function (x) { return x.id === t.department_id; })[0];
      return '<button class="aic-row ' + (ac.cur && ac.cur.id === t.id ? 'on' : '') + '" data-tid="' + esc(t.id) + '"><span class="aic-avatar">' + esc(fullName(p).slice(0, 1).toUpperCase()) + '</span><span class="aic-row-txt"><b>' + esc(fullName(p)) + (t.unread_for_admin ? ' <span class="adm-badge">' + t.unread_for_admin + '</span>' : '') + '</b><span class="aic-title">' + esc(t.last_message_preview || '') + '</span><small>' + esc(d ? d.name : '') + ' · ' + timeAgo(t.last_message_at) + (t.status === 'closed' ? ' · closed' : '') + '</small></span></button>';
    }).join('') : '<div class="aic-empty">No conversations yet.</div>';
    box.onclick = function (e) { var b = e.target.closest('[data-tid]'); if (b) openAcThread(b.dataset.tid); };
  }
  async function openAcThread(id, silent) {
    var ac = V3.ac, t = ac.threads.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    ac.cur = t;
    var r = await sb.from('chat_messages').select('*').eq('thread_id', id).order('created_at');
    ac.msgs = r.data || [];
    if (t.unread_for_admin) { t.unread_for_admin = 0; sb.rpc('chat_mark_read', { p_thread_id: id }).then(adminChatBadge); }
    drawAcRows(); drawAcView();
    var w = $('ac-wrap'); if (w && !silent) w.classList.add('show-view');
  }
  function drawAcView() {
    var ac = V3.ac, t = ac.cur, v = $('ac-view'); if (!v || !t) return;
    var p = ac.people[t.user_id], d = ac.deps.filter(function (x) { return x.id === t.department_id; })[0];
    v.innerHTML = '<div class="aic-view-head"><button class="btn btn-ghost btn-sm aic-back" onclick="document.getElementById(\'ac-wrap\').classList.remove(\'show-view\')">← Back</button><div style="flex:1;min-width:0"><strong>' + esc(fullName(p)) + '</strong><div class="muted-note">' + esc(d ? d.name : '') + (p && p.phone ? ' · ' + esc(p.phone) : '') + '</div></div><button class="btn btn-ghost btn-sm" id="ac-status">' + (t.status === 'closed' ? 'Reopen' : 'Close') + '</button></div>' +
      '<div class="cht-msgs cht-msgs-admin" id="ac-msgs">' + msgsHTML(ac.msgs, 'admin') + '</div>' +
      '<div class="cht-form"><textarea class="ftextarea cht-in" id="ac-in" rows="1" maxlength="2000" placeholder="Write a reply"></textarea><button class="btn btn-primary cht-send" id="ac-send">Send</button></div>';
    var box = $('ac-msgs'); box.scrollTop = box.scrollHeight;
    $('ac-in').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); acSend(); } });
    $('ac-send').onclick = acSend;
    $('ac-status').onclick = async function () {
      var next = t.status === 'closed' ? 'open' : 'closed';
      var r = await rpc('chat_set_status', { p_thread_id: t.id, p_status: next });
      if (r.error) { toast(r.message); return; }
      t.status = next; drawAcRows(); drawAcView();
    };
  }
  async function acSend() {
    var ac = V3.ac, ta = $('ac-in'); if (!ta || !ac.cur) return;
    var body = ta.value.trim(); if (!body) return;
    ta.value = '';
    ac.msgs.push({ id: 'tmp' + Date.now(), sender_role: 'admin', body: body, created_at: new Date().toISOString() });
    var box = $('ac-msgs'); if (box) { box.innerHTML = msgsHTML(ac.msgs, 'admin'); box.scrollTop = box.scrollHeight; }
    var r = await rpc('chat_send_admin_message', { p_thread_id: ac.cur.id, p_body: body });
    if (r.error) { ac.msgs.pop(); if (box) box.innerHTML = msgsHTML(ac.msgs, 'admin'); ta.value = body; toast(r.message); return; }
    refreshAc();
  }
  var refreshAc = debounce(async function () {
    var ac = V3.ac;
    if (S.page !== 'admin' || S.adminSection !== 'chat') { adminChatBadge(); return; }
    var r = await sb.from('chat_threads').select('*').order('last_message_at', { ascending: false }).limit(200);
    if (r.error) return;
    ac.threads = r.data || []; await loadPeople();
    if (ac.cur) {
      var t = ac.threads.filter(function (x) { return x.id === ac.cur.id; })[0];
      if (t) {
        ac.cur = t;
        var m = await sb.from('chat_messages').select('*').eq('thread_id', t.id).order('created_at');
        ac.msgs = m.data || [];
        if (t.unread_for_admin) { t.unread_for_admin = 0; sb.rpc('chat_mark_read', { p_thread_id: t.id }).then(adminChatBadge); }
        var box = $('ac-msgs'); if (box) { var keep = $('ac-in') ? $('ac-in').value : ''; box.innerHTML = msgsHTML(ac.msgs, 'admin'); box.scrollTop = box.scrollHeight; if ($('ac-in')) $('ac-in').value = keep; }
      }
    }
    drawAcRows(); adminChatBadge();
  }, 250);

  window.v3Departments = function () {
    var ac = V3.ac;
    var rows = ac.deps.map(function (d) {
      return '<div class="v3-dep-row" data-id="' + esc(d.id) + '"><input class="finput" data-f="name" value="' + esc(d.name) + '" maxlength="60" aria-label="Department name"><input class="finput" data-f="description" value="' + esc(d.description || '') + '" placeholder="Short description" aria-label="Description"><label class="v3-check"><input type="checkbox" data-f="is_active" ' + (d.is_active ? 'checked' : '') + '> Active</label><button class="btn btn-ghost btn-sm" data-a="save">Save</button><button class="btn btn-ghost btn-sm danger-outline" data-a="del">Delete</button></div>';
    }).join('');
    modal('<div class="modal-title">Departments</div><div class="muted-note" style="margin-bottom:10px">Customers choose a department before they chat. Deleting a department also deletes its conversations.</div><div id="dep-rows">' + (rows || '<div class="muted-note">No departments yet.</div>') + '</div>' +
      '<div class="v3-dep-row v3-dep-new"><input class="finput" id="dep-new-name" placeholder="New department name (e.g. Sports)" maxlength="60"><input class="finput" id="dep-new-desc" placeholder="Short description"><button class="btn btn-primary btn-sm" id="dep-add">Add</button></div><div class="v3-actions"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>', 720);
    function slugOf(n) { return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('dept-' + Date.now().toString(36)); }
    $('dep-add').onclick = async function () {
      var name = $('dep-new-name').value.trim(); if (!name) { toast('Enter a department name'); return; }
      var row = { name: name, slug: slugOf(name), description: $('dep-new-desc').value.trim(), sort_order: ac.deps.length + 1 };
      var r = await sb.from('chat_departments').insert(row).select().single();
      if (r.error && r.error.code === '23505') { row.slug += '-' + Math.random().toString(36).slice(2, 5); r = await sb.from('chat_departments').insert(row).select().single(); }
      if (r.error) { toast(errText(r.error)); return; }
      ac.deps.push(r.data); toast('Department added'); window.v3Departments();
    };
    $('dep-rows').onclick = async function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      var row = b.closest('[data-id]'), id = row.dataset.id;
      if (b.dataset.a === 'save') {
        var patch = { name: row.querySelector('[data-f=name]').value.trim(), description: row.querySelector('[data-f=description]').value.trim(), is_active: row.querySelector('[data-f=is_active]').checked };
        if (!patch.name) { toast('The name cannot be empty'); return; }
        var r = await sb.from('chat_departments').update(patch).eq('id', id);
        if (r.error) { toast(errText(r.error)); return; }
        var d = ac.deps.filter(function (x) { return x.id === id; })[0]; if (d) Object.assign(d, patch);
        toast('Saved');
      } else {
        var ok = await confirmBox({ title: 'Delete this department?', text: 'All conversations in it will be deleted too.', label: 'Delete', danger: true });
        if (!ok) { window.v3Departments(); return; }
        var r2 = await sb.from('chat_departments').delete().eq('id', id);
        if (r2.error) { toast(errText(r2.error)); return; }
        ac.deps = ac.deps.filter(function (x) { return x.id !== id; }); ac.threads = ac.threads.filter(function (x) { return x.department_id !== id; });
        toast('Department deleted'); window.v3Departments();
        if (S.page === 'admin' && S.adminSection === 'chat') loadAdminSection('chat');
      }
    };
  };

  /* ---------------------------------------------------------------
     8) Realtime — one layer for every table
        public data  -> catalog and settings refresh quietly
        your own data -> orders, points, profile (role!), wishlist, address, coupons, chat
        admin data    -> the open admin section refreshes by itself
  --------------------------------------------------------------- */
  var chans = [];
  function stopRt() { chans.forEach(function (c) { try { sb.removeChannel(c); } catch (e) { /* ignore */ } }); chans = []; }
  function on(ch, table, cb, filter) {
    var cfg = { event: '*', schema: 'public', table: table };
    if (filter) cfg.filter = filter;
    ch.on('postgres_changes', cfg, cb);
  }
  function sub(ch, name) {
    ch.subscribe(function (status, error) { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('Realtime ' + name + ':', status, error || ''); });
    chans.push(ch);
  }

  // --- soft re-render (keeps scroll position, never interrupts typing) ---
  function softRender() {
    var p = S.page;
    if (p === 'checkout') {
      if (S.cart.some(function (i) { var pr = S.products.find(function (x) { return x.id === i.product_id; }); return pr && pr.stock_quantity != null && cartProductQty(i.product_id) > Number(pr.stock_quantity); })) toast('Stock changed while you were shopping. Please review your cart.');
      return;
    }
    if (p === 'admin') { if (S.adminSection === 'products' && !busy($('admin-main'))) renderAdminProducts($('admin-main')); return; }
    if (['home', 'product', 'cart'].indexOf(p) === -1) return;
    if (busy(app())) { V3.pendingRender = true; return; }
    var y = window.scrollY;
    document.body.classList.add('v3-soft');
    if (p === 'product') pProduct(); else render();
    window.scrollTo(0, y);
    setTimeout(function () { document.body.classList.remove('v3-soft'); }, 450);
  }
  document.addEventListener('focusout', function () {
    if (!V3.pendingRender) return;
    setTimeout(function () { if (!busy(app())) { V3.pendingRender = false; softRender(); } }, 250);
  });
  var refreshCatalog = debounce(async function () {
    var res = await Promise.all([
      sb.from('settings').select('*').eq('id', 1).maybeSingle(),
      sb.from('categories').select('*').eq('is_active', true).order('sort_order'),
      sb.from('products').select('*, product_images(id,url,sort_order)').eq('is_active', true).order('created_at', { ascending: false })
    ]);
    if (res[0].data) S.settings = res[0].data;
    if (!res[1].error) S.categories = res[1].data || [];
    if (!res[2].error) S.products = res[2].data || [];
    try { applySettingsToChrome(); } catch (e) { /* ignore */ }
    softRender();
  }, 350);

  var reloadWishlist = debounce(async function () {
    if (!S.session) return;
    var r = await sb.from('wishlists').select('product_id').eq('user_id', S.session.user.id);
    if (!r.error) { S.wishlist = (r.data || []).map(function (w) { return w.product_id; }); if (S.page === 'wishlist') pWishlist(); else softRender(); }
  }, 300);
  var reloadAddress = debounce(async function () {
    if (!S.session) return;
    var r = await sb.from('delivery_locations').select('user_id,city,district,full_address,latitude,longitude,source,confirmed_at,updated_at').eq('user_id', S.session.user.id).maybeSingle();
    if (!r.error) { S.deliveryLocation = r.data || null; if (S.page === 'account' && S.session) renderAccountLoggedIn(); }
  }, 300);
  var rerenderPoints = debounce(function () { if (S.page === 'points') pPoints(); }, 300);

  function onMyProfile(payload) {
    if (payload.eventType === 'DELETE') {
      sb.auth.signOut().catch(function () { /* ignore */ });
      toast('This account was deleted'); return;
    }
    var n = payload.new; if (!n || !S.session || n.id !== S.session.user.id) return;
    var old = S.profile || {};
    S.profile = Object.assign({}, old, n);
    var st = n.account_status || 'enabled';
    if (st !== 'enabled') {
      sb.auth.signOut().catch(function () { /* ignore */ });
      S.session = null; S.profile = null; S.wishlist = []; S.deliveryLocation = null; S.isAdmin = false;
      updateChromeAuth(); renderAdminNavVisibility();
      toast(st === 'banned' ? 'This account is blocked.' : 'This account is disabled.');
      resetHome(); return;
    }
    var nowAdmin = n.role === 'admin';
    if (nowAdmin !== S.isAdmin) {
      S.isAdmin = nowAdmin;
      renderAdminNavVisibility(); updateChromeAuth();
      toast(nowAdmin ? 'You are now an admin' : 'Your admin access was removed');
      if (!nowAdmin && (S.page === 'admin' || S.page === 'admin-login')) nav('home');
      setTimeout(window.initRealtimeUpdates, 0);     // admin channels on/off
    }
    if (old.loyalty_points !== n.loyalty_points && old.loyalty_points != null) {
      toast('Your points: ' + n.loyalty_points);
      if (S.page === 'points') pPoints(); else if (S.page === 'account') renderAccountLoggedIn();
    }
  }
  function onUserOrder(payload) {
    var n = payload.new, o = payload.old;
    if (payload.eventType === 'UPDATE' && n && o && o.status && n.status !== o.status) toast('Order ' + n.order_number + ' is now ' + dlStatusLabel(n.status));
    if (S.page === 'orders') softOrders();
    else if (S.page === 'order-detail') window.pOrderDetail();
  }
  function onChatMsgUser(payload) {
    var m = payload.new; if (!m || payload.eventType !== 'INSERT') return;
    var c = V3.chat;
    if (S.page === 'chat' && c.thread && c.thread.id === m.thread_id) { refreshConv(); return; }
    if (m.sender_role === 'admin') { toast('New reply from support'); loadChatData().then(function () { if (S.page === 'chat' && !c.depId) drawChatHome(); }); }
  }
  function onChatThreadUser() {
    loadChatData().then(function () { if (S.page === 'chat' && !V3.chat.depId) drawChatHome(); });
  }

  // --- admin ---
  var SECTION_OF = { orders: ['orders', 'overview'], profiles: ['users', 'overview'], reviews: ['reviews'], contact_messages: ['messages', 'overview'], coupons: ['coupons'], coupon_redemptions: ['coupons'], product_costs: ['products'], admin_audit_log: ['audit'], points_history: ['users'] };
  var adminRefresh = debounce(function (secs) {
    if (S.page !== 'admin') return;
    var sec = S.adminSection, main = $('admin-main');
    if (!main || secs.indexOf(sec) === -1 || busy(main)) return;
    if (sec === 'users') { reloadUsers(); return; }
    loadAdminSection(sec);
  }, 500);
  function onAdminChange(table, payload) {
    if (payload.eventType === 'INSERT') {
      if (table === 'orders') toast('A new order has arrived');
      else if (table === 'contact_messages') toast('New contact message');
      else if (table === 'reviews') toast('New review waiting for moderation');
      else if (table === 'profiles') toast('A new customer registered');
    }
    if (table === 'chat_messages' && payload.eventType === 'INSERT' && payload.new && payload.new.sender_role === 'user' && !(S.page === 'admin' && S.adminSection === 'chat')) toast('New chat message');
    if (table === 'chat_messages' || table === 'chat_threads') { refreshAc(); return; }
    var secs = SECTION_OF[table]; if (secs) adminRefresh(secs);
  }

  window.initRealtimeUpdates = function () {
    stopRt();
    // public catalog + settings
    var pub = sb.channel('dl-public');
    ['products', 'product_images', 'categories', 'settings', 'bundle_offers', 'bundle_offer_items', 'product_option_groups', 'product_option_values', 'ai_voice_config'].forEach(function (t) { on(pub, t, refreshCatalog); });
    sub(pub, 'public');
    if (!S.session) return;
    // my own data
    var uid = S.session.user.id, me = sb.channel('dl-user-' + uid);
    on(me, 'orders', onUserOrder, 'user_id=eq.' + uid);
    on(me, 'profiles', onMyProfile, 'id=eq.' + uid);
    on(me, 'points_history', rerenderPoints, 'user_id=eq.' + uid);
    on(me, 'coupons', rerenderPoints, 'owner_id=eq.' + uid);
    on(me, 'wishlists', reloadWishlist, 'user_id=eq.' + uid);
    on(me, 'delivery_locations', reloadAddress, 'user_id=eq.' + uid);
    on(me, 'chat_threads', onChatThreadUser, 'user_id=eq.' + uid);
    on(me, 'chat_messages', onChatMsgUser);
    sub(me, 'user');
    if (!S.isAdmin) return;
    // everything an admin looks at
    var ad = sb.channel('dl-admin');
    ['orders', 'profiles', 'reviews', 'contact_messages', 'coupons', 'coupon_redemptions', 'product_costs', 'admin_audit_log', 'points_history', 'chat_threads', 'chat_messages'].forEach(function (t) {
      on(ad, t, function (p) { onAdminChange(t, p); });
    });
    sub(ad, 'admin');
  };
  window.onLiveOrderChange = function () { /* replaced by the realtime layer above */ };
  window.onLiveProductChange = refreshCatalog;
  window.refreshLiveProducts = function () { refreshCatalog(); };

  // initial unread badge for signed-in customers
  window.addEventListener('load', function () { setTimeout(function () { if (S.session) loadChatData(); }, 1500); });
})();
