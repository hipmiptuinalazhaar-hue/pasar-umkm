'use strict';

(() => {
  if (window.PasarAuthSecurityV2?.version === '1.2-manual-recovery') return;

  const flow = { mode: 'login', preferredEmail: '' };

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

  function shell({ title, subtitle, body, tabs = false, back = '' }) {
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
        <div class="auth-v2-security"><i class="ph ph-shield-check" aria-hidden="true"></i><span>Session menggunakan cookie HttpOnly + Secure. Kata sandi disimpan dalam bentuk hash dan tidak dikirim kembali ke browser.</span></div>
      </div>`;
  }

  function passwordField(id, name, label, autocomplete = 'current-password', placeholder = 'Masukkan kata sandi', withMeter = false) {
    return `
      <div class="auth-v2-field">
        <label class="auth-v2-label" for="${id}">${label}</label>
        <div class="auth-v2-input-wrap">
          <i class="ph ph-lock-key auth-v2-input-icon" aria-hidden="true"></i>
          <input id="${id}" class="auth-v2-input" name="${name}" type="password" autocomplete="${autocomplete}" placeholder="${placeholder}" minlength="8" maxlength="72" required>
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
            <input id="authV2LoginPassword" class="auth-v2-input" name="password" type="password" autocomplete="current-password" maxlength="72" placeholder="Masukkan kata sandi" required>
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
          <div class="auth-v2-input-wrap"><i class="ph ph-user auth-v2-input-icon"></i><input id="authV2RegisterName" class="auth-v2-input" name="name" type="text" autocomplete="name" minlength="2" maxlength="100" placeholder="Nama lengkap" required></div>
        </div>
        <div class="auth-v2-field">
          <label class="auth-v2-label" for="authV2RegisterEmail">Email</label>
          <div class="auth-v2-input-wrap"><i class="ph ph-envelope-simple auth-v2-input-icon"></i><input id="authV2RegisterEmail" class="auth-v2-input" name="email" type="email" inputmode="email" autocomplete="email" maxlength="255" placeholder="nama@email.com" required></div>
          <p class="auth-v2-hint">Pastikan alamat email yang Anda masukkan benar.</p>
        </div>
        ${passwordField('authV2RegisterPassword', 'password', 'Kata sandi', 'new-password', 'Minimal 8 karakter', true)}
        <button type="submit" class="auth-v2-submit"><i class="ph ph-user-plus"></i><span>Daftar sekarang</span></button>
      </form>`;
  }

  function forgotBody() {
    return `
      <form id="authV2ForgotForm" class="auth-v2-form">
        <div class="auth-v2-field">
          <label class="auth-v2-label" for="authV2RecoveryEmail">Email akun</label>
          <div class="auth-v2-input-wrap"><i class="ph ph-envelope-simple auth-v2-input-icon"></i><input id="authV2RecoveryEmail" class="auth-v2-input" name="email" type="email" inputmode="email" autocomplete="email" maxlength="255" placeholder="nama@email.com" value="${esc(flow.preferredEmail)}" required></div>
          <p class="auth-v2-hint">Permintaan akan masuk ke Customer Service. Admin akan memverifikasi identitas Anda sebelum mereset kata sandi. Demi privasi, sistem tidak mengungkap apakah email terdaftar.</p>
        </div>
        <button type="submit" class="auth-v2-submit"><i class="ph ph-headset"></i><span>Kirim permintaan reset</span></button>
      </form>`;
  }

  function render(mode = 'login', options = {}) {
    ensureStyle();
    flow.mode = ['register', 'forgot'].includes(mode) ? mode : 'login';
    let html;
    if (flow.mode === 'register') html = shell({ title: 'Buat akun', subtitle: 'Daftar langsung untuk mulai menggunakan Pasar UMKM.', body: registerBody(), tabs: true });
    else if (flow.mode === 'forgot') html = shell({ title: 'Lupa kata sandi', subtitle: 'Kirim permintaan pemulihan akun ke Customer Service.', body: forgotBody(), back: 'login' });
    else html = shell({ title: 'Selamat datang kembali', subtitle: 'Masuk untuk melanjutkan aktivitas di Pasar UMKM.', body: loginBody(), tabs: true });

    if (typeof closeSideMenu === 'function') closeSideMenu();
    if (typeof openBottomSheet !== 'function') return;
    openBottomSheet(html, 'login');
    bind();
    if (options.message) setMessage(options.messageType || 'success', options.message);
    requestAnimationFrame(() => document.querySelector('#authV2Shell .auth-v2-input')?.focus());
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
    clearMessage(); setLoading(button, true, 'Membuat akun...');
    try {
      const result = await request('/api/auth/register', { name, email, password });
      flow.preferredEmail = email;
      completeSession(result.user, result.message || 'Akun berhasil dibuat.');
    } catch (error) {
      setMessage('error', error.message || 'Pendaftaran belum dapat diproses.');
    } finally { setLoading(button, false); }
  }

  async function submitForgot(form) {
    if (!form.checkValidity()) return form.reportValidity();
    const email = String(new FormData(form).get('email') || '').trim().toLowerCase();
    const button = form.querySelector('.auth-v2-submit');
    clearMessage(); setLoading(button, true, 'Mengirim permintaan...');
    try {
      const result = await request('/api/auth/password/forgot', { email });
      flow.preferredEmail = email;
      render('login', {
        messageType: 'success',
        message: result.message || 'Permintaan pemulihan akun sudah diteruskan ke Customer Service.'
      });
    } catch (error) {
      setMessage('error', error.message || 'Permintaan pemulihan belum dapat diproses.');
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
    root.querySelector('[data-auth-v2-action="forgot"]')?.addEventListener('click', () => render('forgot'));
    root.querySelector('[data-auth-v2-action="login"]')?.addEventListener('click', () => render('login'));
    root.querySelector('#authV2LoginForm')?.addEventListener('submit', event => { event.preventDefault(); submitLogin(event.currentTarget); });
    root.querySelector('#authV2RegisterForm')?.addEventListener('submit', event => { event.preventDefault(); submitRegister(event.currentTarget); });
    root.querySelector('#authV2ForgotForm')?.addEventListener('submit', event => { event.preventDefault(); submitForgot(event.currentTarget); });
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
    version: '1.2-manual-recovery',
    open: v2OpenLogin,
    render,
    state: () => ({ mode: flow.mode })
  });
})();
