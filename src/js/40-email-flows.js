/* Email flows powered by Supabase Edge Functions + Resend.
   1) order confirmation email   2) cancel-order verification code   3) password-changed alert
   Loaded after app.js and reset-flow.js. */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  async function callFn(name, body) {
    try {
      const { data, error } = await sb.functions.invoke(name, { body });
      if (data && typeof data === 'object') return data;
      const status = error && error.context && error.context.status;
      return { ok: false, error: status === 401 ? 'unauthorized' : status === 502 ? 'send_failed' : 'network' };
    } catch (_) {
      return { ok: false, error: 'network' };
    }
  }

  /* ---------- 1) order confirmation (fire and forget: never blocks or breaks checkout) ---------- */
  window.dlSendOrderEmail = function (orderId) {
    if (!orderId) return;
    callFn('send-order-confirmation', { order_id: orderId });
  };

  /* ---------- 3) password changed alert ---------- */
  window.dlNotifyPasswordChanged = function () {
    callFn('notify-password-changed', {});
  };

  /* ---------- 2) cancel order with emailed code ---------- */
  const MESSAGES = {
    unauthorized: 'Please sign in again to cancel this order.',
    not_found: 'We could not find this order.',
    not_cancellable: 'This order can no longer be cancelled.',
    send_failed: 'We could not send the email. Please try again in a moment.',
    network: 'Connection problem. Please try again.',
    invalid_code: 'Enter the 6-digit code from your email.',
    no_code: 'This code is no longer valid. Request a new one.',
    expired: 'This code expired. Request a new one.',
    too_many_attempts: 'Too many wrong attempts. Request a new code.',
    try_again: 'Please try again.',
    cancel_failed: 'Could not cancel this order. Please contact us.',
    server_error: 'Something went wrong. Please try again.'
  };
  function messageFor(r) {
    if (r.error === 'cooldown') return `Please wait ${r.retry_after || 60} seconds before requesting another code.`;
    if (r.error === 'wrong_code') return `Wrong code. ${r.attempts_left} ${r.attempts_left === 1 ? 'try' : 'tries'} left.`;
    return MESSAGES[r.error] || MESSAGES.server_error;
  }

  window.cancelOrder = function (id, createdAt) {
    if (!S.session) { toast('Please sign in first'); return; }
    const hoursSince = (Date.now() - new Date(createdAt).getTime()) / 3600000;
    const late = hoursSince > (S.settings.free_cancel_hours || 24);
    const reason = prompt(late
      ? `This order is past the free-cancellation window (${S.settings.free_cancel_hours}h). A $${S.settings.cancel_fee} fee may apply — our team will follow up. Add a reason (optional):`
      : 'Add a cancellation reason (optional):');
    if (reason === null) return;
    openCancelModal(id, reason);
  };

  function openCancelModal(orderId, reason) {
    document.getElementById('modal-root').innerHTML = `<div class="modal-ov"><div class="modal-sheet">
      <div class="modal-title">Confirm cancellation</div>
      <p class="muted-note" id="cx-info">Sending a 6-digit code to your email…</p>
      <div id="cx-msg"></div>
      <div class="fgroup"><label class="flabel" for="cx-code">Verification code</label>
        <input class="finput" id="cx-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••"
               style="letter-spacing:8px;text-align:center;font-size:1.3rem"></div>
      <button class="btn btn-danger" id="cx-confirm" disabled>Cancel order</button>
      <button class="btn btn-ghost" id="cx-resend" disabled>Resend code</button>
      <button class="btn btn-ghost" id="cx-close">Keep my order</button>
    </div></div>`;

    const $ = (x) => document.getElementById(x);
    const msg = (text, ok) => { $('cx-msg').innerHTML = text ? `<div class="alert ${ok ? 'alert-ok' : 'alert-err'}">${esc(text)}</div>` : ''; };
    let busy = false;

    $('cx-close').onclick = () => closeModal();
    $('cx-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
    $('cx-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirm(); });

    async function sendCode() {
      if (busy) return;
      busy = true;
      $('cx-resend').disabled = true;
      $('cx-confirm').disabled = true;
      msg('');
      const r = await callFn('cancel-order-otp', { action: 'send', order_id: orderId });
      busy = false;
      if (!document.getElementById('cx-code')) return; // modal was closed meanwhile
      $('cx-resend').disabled = false;
      if (r.ok) {
        $('cx-info').textContent = `We sent a 6-digit code to ${r.sent_to}. It is valid for 10 minutes.`;
        $('cx-confirm').disabled = false;
        $('cx-code').focus();
      } else {
        $('cx-info').textContent = 'We need to confirm it is really you before cancelling.';
        msg(messageFor(r), false);
        // A "cooldown" means a code was already sent less than a minute ago, so let them type it.
        if (r.error === 'cooldown') $('cx-confirm').disabled = false;
      }
    }

    async function confirm() {
      if (busy) return;
      const code = $('cx-code').value.trim();
      if (!/^\d{6}$/.test(code)) { msg(MESSAGES.invalid_code, false); return; }
      busy = true;
      const btn = $('cx-confirm');
      btn.disabled = true; btn.textContent = 'Cancelling…';
      const r = await callFn('cancel-order-otp', { action: 'verify', order_id: orderId, code, reason });
      busy = false;
      if (r.ok && r.cancelled) {
        closeModal();
        toast('Order cancelled');
        nav('orders', null, false);
        return;
      }
      btn.disabled = false; btn.textContent = 'Cancel order';
      msg(messageFor(r), false);
      if (r.error === 'not_cancellable' || r.error === 'not_found') $('cx-confirm').disabled = true;
    }

    $('cx-confirm').onclick = confirm;
    $('cx-resend').onclick = sendCode;
    sendCode();
  }
})();
