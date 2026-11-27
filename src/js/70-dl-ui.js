/* Dash Lebanon — shared UI helpers (loaded after app.js).
   1) Unified loader helpers  2) Emoji -> SVG icons  3) Per-page SEO tags
   4) Login lockout + age helpers (talk to the SQL functions in sql/01-accounts-safety.sql) */
(function () {
  'use strict';
  var SITE = 'https://www.dashlb.shop';

  /* ---------- 1) Unified loader ---------- */
  var SQ = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
  window.dlLoaderHTML = function (large) { return '<span class="sqa' + (large ? ' sqa-lg' : '') + '" aria-hidden="true">' + SQ + '</span>'; };
  // Put a button in/out of the "busy" state: disabled + loader + text.
  window.dlBtnBusy = function (btn, on, label, busyText) {
    if (!btn) return;
    if (on) {
      btn.dataset.dlLabel = btn.dataset.dlLabel || btn.textContent;
      btn.disabled = true; btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = window.dlLoaderHTML() + ' ' + (busyText || 'Processing…');
    } else {
      btn.disabled = false; btn.removeAttribute('aria-busy');
      btn.textContent = label || btn.dataset.dlLabel || '';
      delete btn.dataset.dlLabel;
    }
  };

  /* ---------- 2) Emoji -> inline SVG icons ---------- */
  function P(d) { return '<svg class="dl-ic" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; }
  function F(d) { return '<svg class="dl-ic fill" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; }
  var STAR = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z';
  var HEART = 'M12 21s-7.5-4.6-9.5-9.2C1.2 8.5 3 5 6.4 5c2 0 3.5 1.1 4.3 2.4h2.6C14.1 6.1 15.6 5 17.6 5 21 5 22.8 8.5 21.5 11.8 19.5 16.4 12 21 12 21z';
  var ICONS = {
    '\u2600': P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    '\uD83C\uDF19': P('<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>'),
    '\u2699': P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
    '\u26A0': P('<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/>'),
    '\u2705': P('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
    '\u2713': P('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    '\u2709': P('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    '\u270E': P('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'),
    '\u2715': P('<path d="M6 6l12 12M18 6L6 18"/>'),
    '\u2726': F('<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>'),
    '\u2728': F('<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>'),
    '\u274C': P('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
    '\u2B50': F('<path d="' + STAR + '"/>'),
    '\u2605': F('<path d="' + STAR + '"/>'),
    '\u2606': P('<path d="' + STAR + '"/>'),
    '\u2661': P('<path d="' + HEART + '"/>'),
    '\u2665': F('<path d="' + HEART + '"/>'),
    '\uD83C\uDF99': P('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v4"/>'),
    '\uD83C\uDF9F': P('<path d="M3 9a2 2 0 002-2h14a2 2 0 002 2v0a2 2 0 000 4v0a2 2 0 00-2 2H5a2 2 0 00-2-2v0a2 2 0 000-4z" transform="translate(0 1)"/><path d="M13 7v10" stroke-dasharray="2 2"/>'),
    '\uD83C\uDFF7': P('<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01"/>'),
    '\uD83D\uDCCA': P('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    '\uD83D\uDCCD': P('<path d="M12 22s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>'),
    '\uD83D\uDCE6': P('<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>'),
    '\uD83D\uDD0A': P('<path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>'),
    '\uD83D\uDD0C': P('<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 01-12 0zM12 17v5"/>'),
    '\uD83D\uDD0D': P('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    '\uD83D\uDD10': P('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'),
    '\uD83D\uDD12': P('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'),
    '\uD83D\uDDC2': P('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
    '\uD83D\uDECD': P('<path d="M5 8h14l1 13H4zM9 8a3 3 0 016 0"/>'),
    '\uD83D\uDED2': P('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.7 12.4a2 2 0 002 1.6h8.1a2 2 0 002-1.5L21 8H6"/>'),
    '\uD83D\uDC64': P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'),
    '\uD83D\uDCAC': P('<path d="M21 12a8 8 0 01-11.7 7L3 21l2-5.5A8 8 0 1121 12z"/>'),
    '\u2302': P('<path d="M3 11l9-8 9 8M5 10v10h14V10"/>'),
    '\u2315': P('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>')
  };
  var RE = new RegExp('(' + Object.keys(ICONS).map(function (k) { return k.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'); }).join('|') + ')\uFE0F?', 'g');
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, TITLE: 1, SVG: 1, CODE: 1, PRE: 1 };
  function iconize(root) {
    if (!root || root.nodeType === 8) return;
    var walker = document.createTreeWalker(root.nodeType === 3 ? root.parentNode : root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode; if (!p || SKIP[p.nodeName.toUpperCase()]) return NodeFilter.FILTER_REJECT;
        RE.lastIndex = 0; return RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [], n; while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (t) {
      var html = t.nodeValue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(RE, function (m, c) { return ICONS[c]; });
      var span = document.createElement('span'); span.className = 'dl-ico-wrap'; span.style.display = 'contents'; span.innerHTML = html;
      t.parentNode.replaceChild(span, t);
    });
  }
  var queued = false;
  function schedule() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; iconize(document.body); }); }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('DOMContentLoaded', schedule);

  /* ---------- 3) Per-page SEO ---------- */
  var PRIVATE = { chat: 1, cart: 1, checkout: 1, success: 1, wishlist: 1, orders: 1, 'order-detail': 1, points: 1, account: 1, admin: 1, 'admin-login': 1 };
  function setMeta(sel, attr, val) {
    var el = document.head.querySelector(sel);
    if (!el) { el = document.createElement(sel.indexOf('link') === 0 ? 'link' : 'meta'); var m = sel.match(/\[(\w+(?::\w+)?)="([^"]+)"\]/); if (m) el.setAttribute(m[1], m[2]); document.head.appendChild(el); }
    el.setAttribute(attr, val);
  }
  function clip(t, n) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; }
  window.dlSeo = function (S, path) {
    try {
      var brand = (S.settings && S.settings.store_name) || 'Dash Lebanon';
      var isPrivate = !!PRIVATE[S.page] || /^\/reset-password/.test(location.pathname);
      var desc = 'Dash Lebanon — everyday products, delivered fast across Lebanon. Cash on delivery.';
      var image = SITE + '/assets/og-image.png', canon = SITE + path;
      if (S.page === 'product') {
        var p = (S.products || []).find(function (x) { return x.id === S.data; });
        if (p) { desc = clip(p.description, 155) || ('Buy ' + p.name + ' at ' + brand + ' — delivered across Lebanon.'); if (p.cover_image) image = p.cover_image; }
      } else if (S.page === 'home' && S.cat && S.cat !== 'all' && S.cat !== 'offers') {
        var nm = (S.categories || []).find(function (c) { return c.slug === S.cat; });
        desc = 'Shop ' + (nm ? nm.name : S.cat) + ' at ' + brand + ' — quality products delivered fast across Lebanon.';
      } else if (S.page === 'home' && (S.forceGrid || S.offersOnly || S.search)) {
        desc = 'Browse all products at ' + brand + ' — home, kitchen and everyday finds with cash on delivery in Lebanon.';
      } else if (S.page === 'privacy-policy') {
        desc = 'Privacy Policy of ' + brand + ': what personal information we collect, how we use it, who we share it with, and your rights.';
      } else if (window.DL_LEGAL && window.DL_LEGAL[S.page]) {
        desc = window.DL_LEGAL[S.page].title + ' of ' + brand + ': ' + window.DL_LEGAL[S.page].intro;
      } else if (S.page === 'contact') {
        desc = 'Contact ' + brand + ' by WhatsApp, phone or the contact form. We usually reply within the hour.';
      }
      if (S.search) canon = SITE + (path || '/products'); // search never gets its own canonical
      setMeta('meta[name="description"]', 'content', desc);
      setMeta('link[rel="canonical"]', 'href', canon);
      setMeta('meta[name="robots"]', 'content', isPrivate ? 'noindex, nofollow' : 'index, follow');
      setMeta('meta[property="og:title"]', 'content', document.title);
      setMeta('meta[property="og:description"]', 'content', desc);
      setMeta('meta[property="og:url"]', 'content', canon);
      setMeta('meta[property="og:image"]', 'content', image);
      setMeta('meta[name="twitter:title"]', 'content', document.title);
      setMeta('meta[name="twitter:description"]', 'content', desc);
      setMeta('meta[name="twitter:image"]', 'content', image);
    } catch (e) { console.warn('SEO update failed', e); }
  };

  /* ---------- 4) Login lockout + age helpers ---------- */
  var norm = function (e) { return String(e || '').trim().toLowerCase(); };
  async function rpc(name, args) {
    try { var r = await sb.rpc(name, args); return r.error ? null : r.data; } catch (e) { return null; }
  }
  window.dlAuthLock = async function (email) { return (await rpc('auth_check_lock', { p_email: norm(email) })) || { locked: false, seconds_left: 0 }; };
  window.dlAuthFail = async function (email) { return (await rpc('auth_register_failure', { p_email: norm(email) })) || { locked: false, seconds_left: 0 }; };
  window.dlAuthClear = function (email) { return rpc('auth_clear_failures', { p_email: norm(email) }); };
  window.dlIsAdult = function (iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
    var b = new Date(iso + 'T00:00:00'), n = new Date(), age = n.getFullYear() - b.getFullYear();
    var m = n.getMonth() - b.getMonth(); if (m < 0 || (m === 0 && n.getDate() < b.getDate())) age--;
    return age >= 18 && age < 120;
  };
  var lockTimer = null;
  // Shows the lock message with a live countdown; stops when the time is over.
  window.dlShowLock = function (seconds) {
    clearInterval(lockTimer);
    var left = Math.max(1, Math.ceil(seconds));
    function paint() {
      var el = document.getElementById('auth-msg'); if (!el) { clearInterval(lockTimer); return; }
      var mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
      el.innerHTML = '<div class="alert alert-err">Too many failed attempts. Please try again in ' + mm + ':' + ss + '.</div>';
      if (left-- <= 0) { clearInterval(lockTimer); el.innerHTML = ''; }
    }
    paint(); lockTimer = setInterval(paint, 1000);
  };
})();

/* ---------------------------------------------------------------
   Replace colour emoji with clean line icons (SVG), everywhere.
   Plain text symbols such as ★ ♥ ✓ stay as they are.
---------------------------------------------------------------- */
(function(){
  const P={
    '🔍':'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    '📍':'<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    '🛒':'<path d="M3 4h2.4l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
    '🛍':'<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    '📦':'<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5L12 12l9-4.5M12 12v9"/>',
    '✅':'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    '❌':'<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    '⚠':'<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>',
    '🔒':'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    '🔐':'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    '✉':'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    '⭐':'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    '✨':'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    '🎁':'<rect x="3" y="9" width="18" height="11" rx="1.5"/><path d="M3 13h18M12 9v11"/><path d="M12 9c-2.5 0-4-1-4-2.5S9.5 4 12 9zM12 9c2.5 0 4-1 4-2.5S14.5 4 12 9z"/>',
    '🎟':'<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v12"/>',
    '⚙':'<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
    '📊':'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    '🏷':'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
    '🗂':'<path d="M3 6h6l2 2h10v11H3z"/>',
    '💬':'<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>',
    '🎙':'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    '🌙':'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    '☀':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19"/>',
    '🔌':'<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5"/>',
    '👤':'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'
  };
  const icon=d=>'<svg class="dl-emo" viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
  const RE=new RegExp('('+Object.keys(P).join('|')+')\\uFE0F?','g');
  const HAS=new RegExp('('+Object.keys(P).join('|')+')');
  const SKIP=new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','NOSCRIPT','OPTION','SVG']);
  function fix(text){
    const p=text.parentNode;
    if(!p||SKIP.has((p.nodeName||'').toUpperCase())||(p.closest&&p.closest('.mn-ico,[data-keep-emoji]')))return;
    const s=text.nodeValue;
    if(!HAS.test(s))return;
    const frag=document.createDocumentFragment();
    let last=0,m;RE.lastIndex=0;
    while((m=RE.exec(s))){
      if(m.index>last)frag.appendChild(document.createTextNode(s.slice(last,m.index)));
      const t=document.createElement('template');t.innerHTML=icon(P[m[1]]);
      frag.appendChild(t.content.firstChild);
      last=m.index+m[0].length;
    }
    if(last<s.length)frag.appendChild(document.createTextNode(s.slice(last)));
    p.replaceChild(frag,text);
  }
  function scan(root){
    if(!root)return;
    if(root.nodeType===3){fix(root);return}
    if(root.nodeType!==1||SKIP.has(root.nodeName.toUpperCase()))return;
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),list=[];
    while(w.nextNode())list.push(w.currentNode);
    list.forEach(fix);
  }
  function start(){
    scan(document.body);
    new MutationObserver(ms=>{
      ms.forEach(m=>{
        if(m.type==='characterData')fix(m.target);
        else m.addedNodes.forEach(n=>scan(n));
      });
    }).observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
