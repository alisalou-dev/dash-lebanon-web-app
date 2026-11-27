/* Password recovery route and update form. Loaded after app.js, before boot().
   Handles three situations clearly:
   1) valid link  -> "Set a new password" form
   2) expired / already-used / missing link -> explains it and lets the person request a NEW link
   3) the recovery session ends while typing -> same as (2) */
(function () {
  if (typeof ROUTES === 'undefined') return;
  if (!ROUTES.some(route => route.page === 'reset-password')) {
    ROUTES.push({
      page: 'reset-password',
      pattern: /^\/reset-password\/?$/,
      toPath: () => '/reset-password'
    });
  }

  const oldPathForRoute = window.pathForRoute;
  window.pathForRoute = function (page, data) {
    if (page === 'reset-password') return '/reset-password';
    return oldPathForRoute(page, data);
  };

  const oldPageTitle = window.pageTitle;
  window.pageTitle = function () {
    if (S?.page === 'reset-password') return 'Choose a new password | Dash Lebanon';
    return oldPageTitle();
  };

  /* ---------- helpers ---------- */
  // The link's URL part (#error=...&error_code=otp_expired) was saved by a tiny script in index.html,
  // because supabase-js removes it from the address bar while it starts.
  const CAPTURED = String(window.__dlAuthHash || '').toLowerCase();
  const linkHadError = () => /[#&?]error(_code|_description)?=/.test(CAPTURED);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function waitForSession() {            // the recovery session is created a moment after the page opens
    for (let i = 0; i < 8; i++) {
      const { data } = await sb.auth.getSession();
      if (data && data.session) return true;
      await sleep(250);
    }
    return false;
  }

  function friendlyResetError(error) {
    const m = String(error?.message || '');
    if (error?.status === 429 || /seconds|rate limit|too many/i.test(m)) return 'Please wait a minute before requesting another link.';
    return 'We could not send the email. Please try again in a moment.';
  }

  async function requestLink(email) {          // shared by the "forgot password" form and the expired-link page
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
    return error ? { ok: false, text: friendlyResetError(error) } : { ok: true, text: 'If that email is registered, a new reset link is on its way. Please also check your spam folder.' };
  }

  /* ---------- page ---------- */
  const oldRender = window.render;
  window.render = function () {
    if (S?.page !== 'reset-password') return oldRender();
    document.getElementById('site-footer')?.classList.add('hide');
    document.body.classList.remove('has-sticky-bar');
    const root = document.getElementById('app');
    if (!root) return;
    root.innerHTML = `<div class="page" style="max-width:460px"><div class="card form-card" id="reset-card"><div class="sqa sqa-lg" style="margin:36px auto"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div></div>`;
    drawResetPage();
  };

  async function drawResetPage() {
    if (linkHadError()) return drawExpired();
    if (await waitForSession()) return drawForm();
    drawExpired();
  }

  function drawForm() {
    const card = document.getElementById('reset-card');
    if (!card) return;
    card.innerHTML = `<div class="form-title">Set a new password</div>
      <p class="muted-note">Enter and confirm your new password below.</p>
      <div id="reset-msg"></div>
      <div class="fgroup"><label class="flabel" for="reset-pass">New password</label><input class="finput" id="reset-pass" type="password" autocomplete="new-password" minlength="6"></div>
      <div class="fgroup"><label class="flabel" for="reset-pass-confirm">Confirm new password</label><input class="finput" id="reset-pass-confirm" type="password" autocomplete="new-password" minlength="6"></div>
      <button class="btn btn-primary" id="reset-pass-btn" onclick="saveNewPassword()">Update password</button>`;
  }

  function drawExpired(note) {
    const card = document.getElementById('reset-card');
    if (!card) return;
    card.innerHTML = `<div class="form-title">This reset link is no longer valid</div>
      <p class="muted-note">${esc(note || 'Reset links can be used only once and they expire after a short time, so an older email will not work. Enter your email and we will send you a new link.')}</p>
      <div id="reset-msg"></div>
      <div class="fgroup"><label class="flabel" for="reset-email">Email</label><input class="finput" id="reset-email" type="email" autocomplete="email" inputmode="email"></div>
      <button class="btn btn-primary" id="reset-send-btn" onclick="sendNewResetLink()">Send me a new link</button>
      <button class="btn btn-ghost" style="margin-top:10px" onclick="nav('account')">Back to login</button>`;
    document.getElementById('reset-email')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendNewResetLink(); });
  }

  window.sendNewResetLink = async function () {
    const email = document.getElementById('reset-email')?.value.trim() || '';
    const msg = document.getElementById('reset-msg');
    const btn = document.getElementById('reset-send-btn');
    if (!/^\S+@\S+\.\S+$/.test(email)) { msg.innerHTML = '<div class="alert alert-err">Please enter a valid email address.</div>'; return; }
    dlBtnBusy(btn, true);
    const r = await requestLink(email);
    msg.innerHTML = `<div class="alert ${r.ok ? 'alert-ok' : 'alert-err'}">${esc(r.text)}</div>`;
    if (!r.ok) { dlBtnBusy(btn, false, 'Send me a new link'); return; }
    let left = 60;                              // short pause before another request (the server also limits this)
    btn.disabled = true; btn.removeAttribute('aria-busy');
    const tick = () => {
      if (!document.body.contains(btn)) return;
      if (left <= 0) { btn.disabled = false; btn.textContent = 'Send me a new link'; return; }
      btn.textContent = `Send again in ${left--}s`; setTimeout(tick, 1000);
    };
    tick();
  };

  /* "Forgot password" form on the login page */
  window.doForgot = async function () {
    const email = document.getElementById('fg-email')?.value.trim();
    if (!email) return authMsg('Please enter your email', false);
    const btn = document.getElementById('fg-btn');
    dlBtnBusy(btn, true);
    const r = await requestLink(email);
    dlBtnBusy(btn, false, 'Send reset link');
    authMsg(r.text, r.ok);
  };

  window.saveNewPassword = async function () {
    const password = document.getElementById('reset-pass')?.value || '';
    const confirm = document.getElementById('reset-pass-confirm')?.value || '';
    const msg = document.getElementById('reset-msg');
    if (password.length < 6) {
      msg.innerHTML = '<div class="alert alert-err">Password must be at least 6 characters.</div>';
      return;
    }
    if (password !== confirm) {
      msg.innerHTML = '<div class="alert alert-err">The passwords do not match.</div>';
      return;
    }
    const btn = document.getElementById('reset-pass-btn');
    dlBtnBusy(btn, true);
    const { error } = await sb.auth.updateUser({ password });
    if (error) {
      dlBtnBusy(btn, false, 'Update password');
      if (error.status === 401 || error.status === 403 || /session|expired|invalid.*token|jwt/i.test(error.message || '')) {
        return drawExpired('Your reset session has ended, so the password was not changed. Please request a new link below.');
      }
      msg.innerHTML = `<div class="alert alert-err">${esc(error.message)}</div>`;
      return;
    }
    dlBtnBusy(btn, false, 'Update password');
    let othersOut = false;
    try { const r = await sb.auth.signOut({ scope: 'others' }); othersOut = !r.error; } catch (_) {}
    try { sessionStorage.removeItem('dl_recovery'); } catch (_) {}
    if (typeof dlNotifyPasswordChanged === 'function') dlNotifyPasswordChanged();
    msg.innerHTML = '<div class="alert alert-ok">Your password was updated.' + (othersOut ? ' Your other devices were signed out.' : '') + '</div>';
    document.getElementById('reset-pass').value = '';
    document.getElementById('reset-pass-confirm').value = '';
  };
})();
