'use strict';

(() => {
  if (window.PasarAuthSecurityV2?.version === '1.0') return;

  const flow = {
    mode: 'login',
    register: { name: '', email: '', challengeId: '', maskedEmail: '', resendAt: 0 },
    recovery: { email: '', resetToken: '', resendAt: 0 },
    preferredEmail: ''
  };

  let countdownTimer = 0;

  function ensureStyle() {
    if (document.querySelector('link[data-auth-security-v2-style="true"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/auth-security-v2.css?v=1.0';
    link.dataset.authSecurityV2Style = 'true';
    document.head.appendChild(link);
  }

  function esc(value) {
    const raw = String(value ?? '');
    if (typeof escapeHTML === 'function') return escapeHTML(raw);
    const node = document.createElement('div');
    node.textContent = raw;
    return node.innerHTML;
  }

  function logo() {
    try { return String(ASSETS?.logo || 'assets/logo.webp'); }
    catch { return 'assets/logo.webp'; }
  }

  function setMessage(type, message) {
    const node = document.getElementById('authV2Message');
    if (!node) return;
    const icon = type === 'success' ? 'ph-check-circle' : type === 'info' ? 'ph-info' : 'ph-warning-circle';
    node.className = `auth-v2-message is-${type}`;
    node.innerHTML = `<i class="ph ${icon}" aria-hidden="true"></i><span></span>`;
    node.querySelector('span').textContent = String(message || '');
    node.hidden = !message;
  }

  function clearMessage() {
    const node = document.getElementById('authV2Message');
    if (node) { node.hidden = true; node.textContent = ''; }
  }

  function shell({ title, subtitle, body, tabs = false, back = '', security = true }) {
    return `
      <div id="authV2Shell" class="auth-v2-shell">
        ${back ? `<button type="button" class="auth-v2-back" data-auth-v2-action="${esc(back)}"><i class="ph ph-arrow-left"></i><span>Kembali</span></button>` : ''}
        <section class="auth-v2-brand">
          <div class="auth-v2-mark"><img src="${esc(logo())}" alt="" aria-hidden="true"></div>
          <div class="auth-v2-heading">
            <span class="auth-v2-eyebrow">Pasar UMKM Lubuklinggau</span>
            <h2 id="sheetTitle">${esc(title)}</h2>
            <p>${esc(subtitle)}</p>
          </div>
        </section>
        ${tabs ? `
          <div class="auth-v2-tabs" role="tablist" aria-label="Autentikasi">
            <button type="button" class="auth-v2-tab ${flow.mode === 'login' ? 'is-active' : ''}" data-auth-v2-mode="login" role="tab" aria-selected="${flow.mode === 'login'}">Masuk</button>
            <button type="button" class="auth-v2-tab ${flow.mode === 'register' ? 'is-active' : ''}" data-auth-v2-mode="register" role="tab" aria-selected="${flow.mode === 'register'}">Daftar</button>
          </div>` : ''}
        <div id="authV2Message" class="auth-v2-message" aria-live="polite" hidden></div>
        ${body}
        ${security ? `<div class="auth-v2-security"><i class="ph ph-shield-check" aria-hidden="true"></i><span>Kode verifikasi berlaku terbatas. Session menggunakan cookie HttpOnly + Secure dan data sensitif tidak dikirim kembali ke browser.</span></div>` : ''}
      </div>`;
  }

  function passwordField(id, name, label, autocomplete = 'current-password', placeholder = 'Masukkan kata sandi', withMeter = false) {
    return `
      <div class="auth-v2-field">
        <label class="auth-v2-label" for="${id}">${label}</label>
        <div class="auth-v2-input-wrap">
          <i class="ph ph-lock-key auth-v2-input-icon" aria-hidden="true"></i>
          <input id="${id}" class="auth-v2-input" name="${name}" type="password" autocomplete="${autocomplete}" placeholder="${placeholder}" minlength="8" maxlength="128" required>
          <button type="button" class="auth-v2-toggle" data-auth-v2-toggle="${id}" aria-label="Tampilkan kata sandi"><i class="ph ph-eye"></i></button>
        </div>
        ${withMeter ? `<div class="auth-v2-password-meter" data-auth-v2-meter data-score="0"><span></span><span></span><span></span><span></span></div><p class="auth-v2-hint">Gunakan kata sandi panjang dan unik. Minimal 8 karakter.</p>` : ''}
      </div>`;
  }

  function loginBody() {
    return `
      <form id="authV2LoginForm" class="auth-v2-form">
        <div class="auth-v2-field">
          <label class="auth-v2-label" for="authV2LoginEmail">Email</label>
          <div class="auth-v2-input-wrap">
            <i class="ph ph-envelope-simple auth-v2-input-icon" aria-hidden="true"></i>
            <input id="authV2LoginEmail" class="auth-v2-input" name="email" type="email" inputmode="email" autocomplete="email" maxlength="255" placeholder="nama@email.com" value="${esc(flow.preferredEmail)}" required>
          </div>
        </div>
        <div class="auth-v2-field">
          <div class="auth-v2-label-row"><label class="auth-v2-label" for="authV2LoginPassword">Kata sandi</label><button type="button" class="auth-v2-link" data-auth-v2-action="forgot">Lupa kata sandi?</button></div>
          <div class="auth-v2-input-wrap">
            <i class="ph ph-lock-key auth-v2-input-icon" aria-hidden="true"></i>
            <input id="authV2LoginPassword" class="auth-v2-input" name="password" type="password" autocomplete="current-password" maxlength="128" placeholder="Masukkan kata sandi" required>
            <button type="button" class="auth-v2-toggle" data-auth-v2-toggle="authV2LoginPassword" aria-label="Tampilkan kata sandi"><i class="ph ph-eye"></i></button>
          </div>
        </div>
        <button type="submit" class="auth-v2-submit"><i class="ph ph-sign-in"></i><span>Masuk</span></button>
      </form>`;
  }

  function registerBody() {
    return `
      <form id="authV2RegisterForm" class="auth-v2-form">
        <div class="auth-v2-field">
          <label class="auth-v2-label" for="authV2RegisterName">Nama lengkap</label>
          <div class="auth-v2-input-wrap"><i class="ph ph-user auth-v2-input-icon"></i><input id="authV2RegisterName" class="auth-v2-input" name="name" type="text" autocomplete="name" minlength="2" maxlength="100" placeholder="Nama lengkap" value="${esc(flow.register.name)}" required></div>
        </div>
        <div class="auth-v2-field">
          <label class="auth-v2-label" for="authV2RegisterEmail">Email aktif</label>
          <div class="auth-v2-input-wrap"><i class="ph ph-envelope-simple auth-v2-input-icon"></i><input id="authV2RegisterEmail" class="auth-v2-input" name="email" type="email" inputmode="email" autocomplete="email" maxlength="255" placeholder="nama@email.com" value="${esc(flow.register.email)}" required></div>
          <p class="auth-v2-hint">Kami akan mengirim kode 6 digit untuk memastikan email benar-benar milik Anda.</p>
        </div>
        ${passwordField('authV2RegisterPassword', 'password', 'Kata sandi', 'new-password', 'Minimal 8 karakter', true)}
        <button type="submit" class="auth-v2-submit"><i class="ph ph-envelope-simple-open"></i><span>Kirim kode verifikasi</span></button>
      </form>`;
  }

  function otpBody(kind) {
    const registration = kind === 'register-verify';
    const masked = registration ? flow.register.maskedEmail : flow.recovery.email;
    return `
      <div class="auth-v2-otp-card">
        <div class="auth-v2-otp-icon"><i class="ph ph-envelope-simple-open"></i></div>
        <strong>Kode 6 digit dikirim ke ${esc(masked || 'email Anda')}</strong>
        <p>${registration ? 'Masukkan kode untuk mengaktifkan akun. Jangan bagikan kode ini kepada siapa pun.' : 'Masukkan kode pemulihan untuk membuktikan kepemilikan akun.'}</p>
      </div>
      <form id="${registration ? 'authV2RegisterVerifyForm' : 'authV2RecoveryVerifyForm'}" class="auth-v2-form">
        <div class="auth-v2-field">
          <label class="auth-v2-label" for="authV2Otp">Kode verifikasi</label>
          <input id="authV2Otp" class="auth-v2-otp" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" aria-describedby="authV2OtpHint" required>
          <p id="authV2OtpHint" class="auth-v2-hint">Kode hanya berlaku dalam waktu terbatas.</p>
        </div>
        <button type="submit" class="auth-v2-submit"><i class="ph ph-check-circle"></i><span>Verifikasi kode</span></button>
      </form>
      <div class="auth-v2-resend-row"><span>Tidak menerima kode?</span><button type="button" class="auth-v2-resend" data-auth-v2-action="${registration ? 'register-resend' : 'recovery-resend'}">Kirim ulang</button></div>`;
  }

  function forgotBody() {
    return `
      <form id="authV2ForgotForm" class="auth-v2-form">
        <div class="auth-v2-field">
          <label class="auth-v2-label" for="authV2RecoveryEmail">Email akun</label>
          <div class="auth-v2-input-wrap"><i class="ph ph-envelope-simple auth-v2-input-icon"></i><input id="authV2RecoveryEmail" class="auth-v2-input" name="email" type="email" inputmode="email" autocomplete="email" maxlength="255" placeholder="nama@email.com" value="${esc(flow.recovery.email || flow.preferredEmail)}" required></div>
          <p class="auth-v2-hint">Untuk melindungi privasi, sistem tidak akan mengungkap apakah suatu email terdaftar atau tidak.</p>
        </div>
        <button type="submit" class="auth-v2-submit"><i class="ph ph-paper-plane-tilt"></i><span>Kirim kode pemulihan</span></button>
      </form>`;
  }

  function resetBody() {
    return `
      <form id="authV2ResetForm" class="auth-v2-form">
        ${passwordField('authV2NewPassword', 'password', 'Kata sandi baru', 'new-password', 'Minimal 8 karakter', true)}
        ${passwordField('authV2ConfirmPassword', 'confirm_password', 'Ulangi kata sandi baru', 'new-password', 'Ulangi kata sandi')}
        <button type="submit" class="auth-v2-submit"><i class="ph ph-lock-key-open"></i><span>Ganti kata sandi</span></button>
      </form>`;
  }

  function render(mode = 'login', options = {}) {
    ensureStyle();
    clearInterval(countdownTimer);
    countdownTimer = 0;
    flow.mode = mode;

    let html = '';
    if (mode === 'register') html = shell({ title: 'Buat akun dengan aman', subtitle: 'Satu akun untuk belanja, bersosial, dan mengelola UMKM.', body: registerBody(), tabs: true });
    else if (mode === 'register-verify') html = shell({ title: 'Verifikasi email', subtitle: 'Satu langkah lagi sebelum akun aktif.', body: otpBody(mode), back: 'register' });
    else if (mode === 'forgot') html = shell({ title: 'Pulihkan akun', subtitle: 'Kami akan mengirim kode pemulihan ke email akun.', body: forgotBody(), back: 'login' });
    else if (mode === 'recovery-verify') html = shell({ title: 'Masukkan kode pemulihan', subtitle: 'Kode hanya dapat digunakan sekali.', body: otpBody(mode), back: 'forgot' });
    else if (mode === 'reset') html = shell({ title: 'Buat kata sandi baru', subtitle: 'Semua session lama akan dicabut setelah kata sandi diubah.', body: resetBody(), back: 'forgot' });
    else html = shell({ title: 'Selamat datang kembali', subtitle: 'Masuk untuk melanjutkan aktivitas di Pasar UMKM.', body: loginBody(), tabs: true });

    if (typeof closeSideMenu === 'function') closeSideMenu();
    if (typeof openBottomSheet !== 'function') return;
    openBottomSheet(html, 'login');
    bind();
    if (options.message) setMessage(options.messageType || 'success', options.message);
    requestAnimationFrame(() => document.querySelector('#authV2Shell .auth-v2-input, #authV2Otp')?.focus());
    if (mode === 'register-verify') startCountdown('register');
    if (mode === 'recovery-verify') startCountdown('recovery');
  }

  function setLoading(button, loading, label = 'Memproses...') {
    if (!button) return;
    if (loading) {
      button.disabled = true;
      button.dataset.authV2Html = button.innerHTML;
      button.innerHTML = `<span class="auth-v2-spinner" aria-hidden="true"></span><span>${esc(label)}</span>`;
    } else {
      button.disabled = false;
      if (button.dataset.authV2Html) { button.innerHTML = button.dataset.authV2Html; delete button.dataset.authV2Html; }
    }
  }

  async function request(endpoint, body) {
    const response = await fetch(endpoint, {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
      const error = new Error(data.error || data.message || `Permintaan gagal (${response.status}).`);
      error.status = response.status;
      error.retryAfter = Number(data.retry_after || response.headers.get('Retry-After') || 0);
      throw error;
    }
    return data;
  }

  function togglePassword(button) {
    const input = document.getElementById(button.dataset.authV2Toggle || '');
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.querySelector('i').className = show ? 'ph ph-eye-slash' : 'ph ph-eye';
    button.setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
    input.focus();
  }

  function passwordScore(value) {
    const password = String(value || '');
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[A-Za-z]/.test(password) && /\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password) || password.length >= 16) score += 1;
    return score;
  }

  function updateMeter(input) {
    const meter = input.closest('.auth-v2-field')?.querySelector('[data-auth-v2-meter]');
    if (meter) meter.dataset.score = String(passwordScore(input.value));
  }

  function cleanOtp(input) {
    input.value = String(input.value || '').replace(/\D/g, '').slice(0, 6);
  }

  function secondsLeft(scope) {
    const state = scope === 'register' ? flow.register : flow.recovery;
    return Math.max(0, Math.ceil((Number(state.resendAt || 0) - Date.now()) / 1000));
  }

  function startCountdown(scope) {
    const update = () => {
      const action = scope === 'register' ? 'register-resend' : 'recovery-resend';
      const button = document.querySelector(`[data-auth-v2-action="${action}"]`);
      if (!button) return;
      const left = secondsLeft(scope);
      button.disabled = left > 0;
      button.textContent = left > 0 ? `Kirim ulang dalam 00:${String(left).padStart(2, '0')}` : 'Kirim ulang kode';
    };
    update();
    clearInterval(countdownTimer);
    countdownTimer = window.setInterval(update, 1000);
  }

  function completeSession(user, message) {
    if (!user) throw new Error('Data akun tidak diterima.');
    try { STATE.user = user; } catch {}
    try { renderAccount(); } catch {}
    try { renderSidebar(); } catch {}
    try { renderStories(); } catch {}
    try { updateNavigation(); } catch {}
    try { showToast(message || 'Berhasil masuk.'); } catch {}
    try { openAccount(); } catch { if (typeof closeBottomSheet === 'function') closeBottomSheet(); }
  }

  async function submitLogin(form) {
    if (!form.checkValidity()) return form.reportValidity();
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const button = form.querySelector('.auth-v2-submit');
    clearMessage(); setLoading(button, true, 'Masuk...');
    try {
      const result = await request('/api/auth/login', { email, password });
      flow.preferredEmail = email;
      completeSession(result.user, result.message || 'Login berhasil.');
    } catch (error) {
      setMessage('error', error.message || 'Email atau kata sandi salah.');
    } finally { setLoading(button, false); }
  }

  async function submitRegister(form) {
    if (!form.checkValidity()) return form.reportValidity();
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const email = String(data.get('email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const button = form.querySelector('.auth-v2-submit');
    clearMessage(); setLoading(button, true, 'Mengirim kode...');
    try {
      const result = await request('/api/auth/register', { name, email, password });
      if (result.verification_required !== true || !result.challenge_id) throw new Error('Server belum mengaktifkan verifikasi email.');
      flow.register = {
        name,
        email,
        challengeId: String(result.challenge_id),
        maskedEmail: String(result.masked_email || email),
        resendAt: Date.now() + Number(result.resend_after || 60) * 1000
      };
      flow.preferredEmail = email;
      render('register-verify', { message: result.message || 'Kode verifikasi telah dikirim.', messageType: 'success' });
    } catch (error) {
      setMessage('error', error.message || 'Pendaftaran belum dapat diproses.');
    } finally { setLoading(button, false); }
  }

  async function submitRegisterVerify(form) {
    if (!form.checkValidity()) return form.reportValidity();
    const code = String(new FormData(form).get('code') || '').replace(/\D/g, '').slice(0, 6);
    const button = form.querySelector('.auth-v2-submit');
    clearMessage(); setLoading(button, true, 'Memverifikasi...');
    try {
      const result = await request('/api/auth/register/verify', { challenge_id: flow.register.challengeId, code });
      flow.register.challengeId = '';
      completeSession(result.user, result.message || 'Akun berhasil diverifikasi.');
    } catch (error) {
      setMessage('error', error.message || 'Kode verifikasi tidak valid.');
      document.getElementById('authV2Otp')?.focus();
    } finally { setLoading(button, false); }
  }

  async function resendRegistration(button) {
    if (!flow.register.challengeId || secondsLeft('register') > 0) return;
    clearMessage(); setLoading(button, true, 'Mengirim...');
    try {
      const result = await request('/api/auth/register/resend', { challenge_id: flow.register.challengeId });
      flow.register.maskedEmail = String(result.masked_email || flow.register.maskedEmail);
      flow.register.resendAt = Date.now() + Number(result.resend_after || 60) * 1000;
      setMessage('success', result.message || 'Kode baru telah dikirim.');
    } catch (error) {
      if (error.retryAfter) flow.register.resendAt = Date.now() + error.retryAfter * 1000;
      setMessage('error', error.message || 'Kode belum dapat dikirim ulang.');
    } finally { setLoading(button, false); startCountdown('register'); }
  }

  async function submitForgot(form) {
    if (!form.checkValidity()) return form.reportValidity();
    const email = String(new FormData(form).get('email') || '').trim().toLowerCase();
    const button = form.querySelector('.auth-v2-submit');
    clearMessage(); setLoading(button, true, 'Mengirim kode...');
    try {
      const result = await request('/api/auth/password/forgot', { email });
      flow.recovery = { email, resetToken: '', resendAt: Date.now() + Number(result.resend_after || 60) * 1000 };
      flow.preferredEmail = email;
      render('recovery-verify', { message: result.message, messageType: 'info' });
    } catch (error) {
      setMessage('error', error.message || 'Pemulihan akun belum dapat diproses.');
    } finally { setLoading(button, false); }
  }

  async function resendRecovery(button) {
    if (!flow.recovery.email || secondsLeft('recovery') > 0) return;
    clearMessage(); setLoading(button, true, 'Mengirim...');
    try {
      const result = await request('/api/auth/password/forgot', { email: flow.recovery.email });
      flow.recovery.resendAt = Date.now() + Number(result.resend_after || 60) * 1000;
      setMessage('info', result.message);
    } catch (error) {
      if (error.retryAfter) flow.recovery.resendAt = Date.now() + error.retryAfter * 1000;
      setMessage('error', error.message || 'Kode belum dapat dikirim ulang.');
    } finally { setLoading(button, false); startCountdown('recovery'); }
  }

  async function submitRecoveryVerify(form) {
    if (!form.checkValidity()) return form.reportValidity();
    const code = String(new FormData(form).get('code') || '').replace(/\D/g, '').slice(0, 6);
    const button = form.querySelector('.auth-v2-submit');
    clearMessage(); setLoading(button, true, 'Memverifikasi...');
    try {
      const result = await request('/api/auth/password/verify', { email: flow.recovery.email, code });
      if (!result.reset_token) throw new Error('Token pemulihan tidak diterima.');
      flow.recovery.resetToken = String(result.reset_token);
      render('reset', { message: result.message || 'Kode berhasil diverifikasi.', messageType: 'success' });
    } catch (error) {
      setMessage('error', error.message || 'Kode pemulihan tidak valid.');
    } finally { setLoading(button, false); }
  }

  async function submitReset(form) {
    if (!form.checkValidity()) return form.reportValidity();
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    const confirm = String(data.get('confirm_password') || '');
    if (password !== confirm) { setMessage('error', 'Kata sandi baru dan konfirmasi tidak sama.'); return; }
    const button = form.querySelector('.auth-v2-submit');
    clearMessage(); setLoading(button, true, 'Mengganti kata sandi...');
    try {
      const result = await request('/api/auth/password/reset', { email: flow.recovery.email, reset_token: flow.recovery.resetToken, password });
      flow.preferredEmail = flow.recovery.email;
      flow.recovery.resetToken = '';
      render('login', { message: result.message || 'Kata sandi berhasil diperbarui.', messageType: 'success' });
    } catch (error) {
      setMessage('error', error.message || 'Kata sandi belum dapat diperbarui.');
    } finally { setLoading(button, false); }
  }

  function bind() {
    const root = document.getElementById('authV2Shell');
    if (!root) return;

    root.querySelectorAll('[data-auth-v2-mode]').forEach(button => button.addEventListener('click', () => render(button.dataset.authV2Mode || 'login')));
    root.querySelectorAll('[data-auth-v2-toggle]').forEach(button => button.addEventListener('click', () => togglePassword(button)));
    root.querySelectorAll('[data-auth-v2-meter]').forEach(meter => {
      const input = meter.closest('.auth-v2-field')?.querySelector('input[type="password"]');
      if (input) { input.addEventListener('input', () => updateMeter(input)); updateMeter(input); }
    });

    const otp = root.querySelector('#authV2Otp');
    otp?.addEventListener('input', () => cleanOtp(otp));
    otp?.addEventListener('paste', () => setTimeout(() => cleanOtp(otp), 0));

    root.querySelector('[data-auth-v2-action="login"]')?.addEventListener('click', () => render('login'));
    root.querySelector('[data-auth-v2-action="register"]')?.addEventListener('click', () => render('register'));
    root.querySelector('[data-auth-v2-action="forgot"]')?.addEventListener('click', () => render('forgot'));
    root.querySelector('[data-auth-v2-action="register-resend"]')?.addEventListener('click', event => resendRegistration(event.currentTarget));
    root.querySelector('[data-auth-v2-action="recovery-resend"]')?.addEventListener('click', event => resendRecovery(event.currentTarget));

    root.querySelector('#authV2LoginForm')?.addEventListener('submit', event => { event.preventDefault(); submitLogin(event.currentTarget); });
    root.querySelector('#authV2RegisterForm')?.addEventListener('submit', event => { event.preventDefault(); submitRegister(event.currentTarget); });
    root.querySelector('#authV2RegisterVerifyForm')?.addEventListener('submit', event => { event.preventDefault(); submitRegisterVerify(event.currentTarget); });
    root.querySelector('#authV2ForgotForm')?.addEventListener('submit', event => { event.preventDefault(); submitForgot(event.currentTarget); });
    root.querySelector('#authV2RecoveryVerifyForm')?.addEventListener('submit', event => { event.preventDefault(); submitRecoveryVerify(event.currentTarget); });
    root.querySelector('#authV2ResetForm')?.addEventListener('submit', event => { event.preventDefault(); submitReset(event.currentTarget); });
  }

  const v2OpenLogin = () => {
    try { if (STATE?.user) { openAccount(); return; } } catch {}
    render('login');
  };
  const v2RenderAuthSheet = mode => render(mode === 'register' ? 'register' : 'login');

  ensureStyle();
  try { openLogin = v2OpenLogin; } catch {}
  try { renderAuthSheet = v2RenderAuthSheet; } catch {}
  window.openLogin = v2OpenLogin;
  window.renderAuthSheet = v2RenderAuthSheet;

  window.PasarAuthSecurityV2 = Object.freeze({
    version: '1.0',
    open: v2OpenLogin,
    render,
    state: () => ({ mode: flow.mode })
  });
})();
