/* Dash Lebanon — points -> personal one-time coupon (UI).
   Needs: sql/03-points-coupons.sql (redeem_points_for_coupon + coupons.owner_id).
   If the SQL is not applied yet, the section simply does not appear. */
(function () {
  'use strict';
  var ERR = {
    not_enough_points: 'You do not have enough points.',
    invalid_amount: 'Please choose a valid amount of points.',
    account_disabled: 'This account cannot redeem points.',
    too_many_open_coupons: 'You already have 10 unused coupons. Use one first.',
    not_authenticated: 'Please log in first.'
  };
  function rules() {
    var s = S.settings || {};
    if (!('points_redeem_per_dollar' in s)) return null;           // SQL not applied -> feature hidden
    return { rate: +s.points_redeem_per_dollar || 100, min: +s.points_min_redeem || 500, days: +s.points_coupon_days || 30 };
  }
  function money(n) { return '$' + (Math.round(n * 100) / 100).toString(); }

  window.dlPointsExtras = async function (pts) {
    var r = rules(); if (!r) return;
    drawRedeem(pts, r); drawCoupons();
    var c = window.__dlNewCoupon; window.__dlNewCoupon = null;
    var m = document.getElementById('rd-msg');
    if (c && m) {
      m.innerHTML = '<div class="cp-new"><div class="muted-note">Your ' + money(c.value) + ' coupon is ready</div>' +
        '<div class="cp-code">' + esc(c.code) + '</div>' +
        '<div class="cp-meta">One use only · valid until ' + new Date(c.expires_at).toLocaleDateString() + '</div>' +
        '<div style="display:flex;gap:8px;justify-content:center;margin-top:10px">' +
        '<button class="cp-btn" data-copy="' + esc(c.code) + '">Copy</button>' +
        '<button class="cp-btn" data-share="' + esc(c.code) + '" data-val="' + esc(String(c.value)) + '">Share</button></div></div>';
      bindCopyShare(m);
    }
  };

  function drawRedeem(pts, r) {
    var box = document.getElementById('pts-redeem'); if (!box) return;
    var steps = [r.min, r.min * 2, r.min * 4].filter(function (n) { return n % r.rate === 0; });
    var can = pts >= r.min;
    box.innerHTML = '<div class="card" style="padding:18px;margin-bottom:14px">' +
      '<div class="form-title">Turn points into a coupon</div>' +
      '<div class="muted-note">' + r.rate + ' points = $1. Minimum ' + r.min + ' points. The code works <b>once</b>, for whoever uses it first, and expires after ' + r.days + ' days.</div>' +
      '<div class="rd-chips" id="rd-chips">' + steps.map(function (n) {
        return '<button class="rd-chip" data-pts="' + n + '"' + (pts < n ? ' disabled' : '') + '>' + money(n / r.rate) + '<small>' + n + ' pts</small></button>';
      }).join('') + '</div>' +
      '<button class="btn btn-primary" id="rd-go" disabled>' + (can ? 'Choose an amount' : 'Not enough points yet') + '</button>' +
      '<div id="rd-msg" style="margin-top:10px"></div></div>';
    var chosen = 0, go = document.getElementById('rd-go');
    box.querySelectorAll('.rd-chip').forEach(function (b) {
      b.onclick = function () {
        chosen = +b.dataset.pts;
        box.querySelectorAll('.rd-chip').forEach(function (x) { x.classList.toggle('on', x === b); });
        go.disabled = false; go.textContent = 'Generate ' + money(chosen / r.rate) + ' coupon';
      };
    });
    go.onclick = async function () {
      if (!chosen) return;
      if (!window.confirm('Spend ' + chosen + ' points to create a ' + money(chosen / r.rate) + ' coupon?')) return;
      dlBtnBusy(go, true, null, 'Generating…');
      var res = await sb.rpc('redeem_points_for_coupon', { p_points: chosen });
      var msg = document.getElementById('rd-msg');
      if (res.error) {
        dlBtnBusy(go, false, 'Generate coupon');
        var key = Object.keys(ERR).find(function (k) { return (res.error.message || '').indexOf(k) >= 0; });
        if (msg) msg.innerHTML = '<div class="alert alert-err">' + esc(ERR[key] || 'Could not create the coupon. Please try again.') + '</div>';
        return;
      }
      var c = res.data;
      await loadProfileAndWishlist();                                // refresh the balance
      window.__dlNewCoupon = c; toast('Coupon created');
      if (typeof pPoints === 'function') pPoints();                  // redraw the page: balance, rank, list
      return;
    };
  }

  function status(c) {
    if (c.used_count >= (c.max_uses || 1)) return ['Used', 'cp-off'];
    if (!c.is_active) return ['Disabled', 'cp-off'];
    if (c.expires_at && new Date(c.expires_at) < new Date()) return ['Expired', 'cp-off'];
    return ['Available', 'cp-ok'];
  }
  async function drawCoupons() {
    var box = document.getElementById('pts-coupons'); if (!box || !S.session) return;
    var res = await sb.from('coupons').select('code,discount_value,expires_at,used_count,max_uses,is_active,created_at')
      .eq('owner_id', S.session.user.id).order('created_at', { ascending: false }).limit(20);
    if (res.error || !res.data || !res.data.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="card" style="padding:18px;margin-bottom:14px"><div class="form-title">My coupons</div>' +
      res.data.map(function (c) {
        var st = status(c), live = st[0] === 'Available';
        return '<div class="cp-row"><div class="cp-main"><div class="cp-code">' + esc(c.code) + '</div>' +
          '<div class="cp-meta">' + money(+c.discount_value) + ' off · ' + (live ? 'until ' + new Date(c.expires_at).toLocaleDateString() : 'created ' + new Date(c.created_at).toLocaleDateString()) + '</div></div>' +
          '<span class="cp-badge ' + st[1] + '">' + st[0] + '</span>' +
          (live ? '<button class="cp-btn" data-copy="' + esc(c.code) + '">Copy</button><button class="cp-btn" data-share="' + esc(c.code) + '" data-val="' + esc(String(c.discount_value)) + '">Share</button>' : '') + '</div>';
      }).join('') + '</div>';
    bindCopyShare(box);
  }
  function bindCopyShare(root) {
    root.querySelectorAll('[data-copy]').forEach(function (b) {
      b.onclick = function () { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy).then(function () { toast('Code copied'); }, function () { toast(b.dataset.copy); }); };
    });
    root.querySelectorAll('[data-share]').forEach(function (b) {
      b.onclick = function () {
        var text = 'Use code ' + b.dataset.share + ' at Dash Lebanon for ' + money(+b.dataset.val) + ' off. Works once, first come first served. ' + location.origin;
        if (navigator.share) navigator.share({ text: text }).catch(function () {});
        else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast('Message copied'); });
      };
    });
  }
})();
