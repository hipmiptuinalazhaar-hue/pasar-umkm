import { adminApi, AdminApiError } from "./api.js?v=6.0.0";

const gateView = document.getElementById("gateView");
const gateContent = document.getElementById("gateContent");
const controlView = document.getElementById("controlView");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setButtonLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    button.dataset.label = button.textContent;
    button.textContent = label || "Memproses…";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function errorText(error) {
  if (error instanceof AdminApiError) {
    if (error.code === "RATE_LIMITED") return "Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba kembali.";
    if (error.code === "AUTH_FAILED") return "Email atau password tidak valid.";
    if (error.code === "ADMIN_TEMPORARILY_LOCKED") return "Akun dikunci sementara karena terlalu banyak percobaan login.";
    if (error.code === "PASSWORD_POLICY_FAILED") return error.message;
    if (error.code === "PASSWORD_REUSE_REJECTED") return "Password baru harus berbeda dari password sementara.";
    if (error.code === "MFA_CODE_INVALID") return "Kode autentikasi tidak valid, sudah dipakai, atau telah kedaluwarsa.";
    if (error.code === "MFA_CHALLENGE_INVALID") return "Sesi verifikasi keamanan sudah berakhir. Masuk kembali untuk membuat challenge baru.";
    if (["ADMIN_MFA_CONFIG_REQUIRED", "ADMIN_MFA_CONFIG_INVALID"].includes(error.code)) return "Kunci enkripsi MFA server belum dikonfigurasi dengan benar. Akses tetap dikunci.";
    return error.message || "Permintaan tidak dapat diproses.";
  }
  return "Koneksi ke layanan admin terganggu. Coba kembali.";
}

function renderLogin(message = "") {
  gateContent.innerHTML = `
    <p class="eyebrow">Privileged Access</p>
    <h2 id="gateTitle">Masuk sebagai administrator</h2>
    <p class="gate-copy">Gunakan identitas admin internal. Akun marketplace biasa tidak dapat digunakan di sini.</p>
    <form class="form-stack" id="adminLoginForm" novalidate>
      ${message ? `<p class="form-error" role="alert">${escapeHtml(message)}</p>` : ""}
      <div class="field-group">
        <label class="field-label" for="adminEmail">Email admin</label>
        <input class="field-input" id="adminEmail" name="email" type="email" inputmode="email" autocomplete="username" maxlength="255" required>
      </div>
      <div class="field-group">
        <label class="field-label" for="adminPassword">Password</label>
        <input class="field-input" id="adminPassword" name="password" type="password" autocomplete="current-password" maxlength="72" required>
      </div>
      <button class="button button-primary button-full" id="adminLoginButton" type="submit">Masuk dengan aman</button>
    </form>
    <div class="gate-meta">
      <span class="status">Session terpisah</span><span class="status">MFA</span><span class="status">SameSite Strict</span>
    </div>
  `;

  const form = document.getElementById("adminLoginForm");
  const button = document.getElementById("adminLoginButton");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const emailInput = document.getElementById("adminEmail");
    const passwordInput = document.getElementById("adminPassword");
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) return;
    setButtonLoading(button, true, "Memverifikasi…");
    try {
      const result = await adminApi.login(email, password);
      passwordInput.value = "";
      await enterControl(result);
    } catch (error) {
      passwordInput.value = "";
      if (error instanceof AdminApiError && error.code === "PASSWORD_ROTATION_REQUIRED") {
        renderPasswordRotation(error.payload?.admin?.email || email);
        return;
      }
      if (error instanceof AdminApiError && error.code === "MFA_ENROLLMENT_REQUIRED") {
        await renderMfaEnrollment();
        return;
      }
      if (error instanceof AdminApiError && error.code === "MFA_REQUIRED") {
        renderMfaVerify();
        return;
      }
      renderLogin(errorText(error));
    } finally {
      setButtonLoading(button, false);
    }
  });
}

function renderPasswordRotation(email) {
  gateContent.innerHTML = `
    <p class="eyebrow">First Sign-In Security</p>
    <h2 id="gateTitle">Ganti password bootstrap</h2>
    <p class="gate-copy">Password sementara hanya untuk aktivasi awal. Setelah ini MFA tetap wajib.</p>
    <form class="form-stack" id="rotationForm" novalidate>
      <div class="field-group"><label class="field-label" for="rotationEmail">Email admin</label><input class="field-input" id="rotationEmail" type="email" value="${escapeHtml(email)}" autocomplete="username" readonly></div>
      <div class="field-group"><label class="field-label" for="currentPassword">Password sementara</label><input class="field-input" id="currentPassword" type="password" autocomplete="current-password" maxlength="72" required></div>
      <div class="field-group"><label class="field-label" for="newPassword">Password baru</label><input class="field-input" id="newPassword" type="password" autocomplete="new-password" minlength="14" maxlength="72" required><p class="field-hint">Minimum 14 byte, maksimum 72 byte. Gunakan password unik.</p></div>
      <div class="field-group"><label class="field-label" for="confirmPassword">Ulangi password baru</label><input class="field-input" id="confirmPassword" type="password" autocomplete="new-password" minlength="14" maxlength="72" required></div>
      <p class="form-error" id="rotationError" role="alert" hidden></p>
      <button class="button button-primary button-full" id="rotationButton" type="submit">Simpan password baru</button>
    </form>
  `;

  const form = document.getElementById("rotationForm");
  const button = document.getElementById("rotationButton");
  const errorBox = document.getElementById("rotationError");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const currentInput = document.getElementById("currentPassword");
    const nextInput = document.getElementById("newPassword");
    const confirmInput = document.getElementById("confirmPassword");
    const current = currentInput.value;
    const next = nextInput.value;
    errorBox.hidden = true;
    if (next !== confirmInput.value) {
      errorBox.textContent = "Konfirmasi password tidak sama.";
      errorBox.hidden = false;
      return;
    }
    setButtonLoading(button, true, "Mengamankan akun…");
    try {
      const result = await adminApi.rotatePassword(email, current, next);
      currentInput.value = nextInput.value = confirmInput.value = "";
      if (result.code === "MFA_ENROLLMENT_REQUIRED") await renderMfaEnrollment();
      else if (result.code === "MFA_REQUIRED") renderMfaVerify();
      else renderLogin("Password berhasil diperbarui. Silakan masuk kembali.");
    } catch (error) {
      currentInput.value = "";
      errorBox.textContent = errorText(error);
      errorBox.hidden = false;
    } finally {
      setButtonLoading(button, false);
    }
  });
}

async function copyText(value, feedbackId) {
  const feedback = document.getElementById(feedbackId);
  try {
    await navigator.clipboard.writeText(value);
    if (feedback) feedback.textContent = "Tersalin ke clipboard.";
  } catch {
    if (feedback) feedback.textContent = "Clipboard tidak tersedia. Salin manual.";
  }
}

async function renderMfaEnrollment() {
  gateContent.innerHTML = `<p class="eyebrow">MFA Enrollment</p><h2 id="gateTitle">Menyiapkan autentikator…</h2><div class="skeleton skeleton-field"></div><div class="skeleton skeleton-field"></div>`;
  let setup;
  try {
    setup = await adminApi.mfaEnrollStart();
  } catch (error) {
    gateContent.innerHTML = `<p class="eyebrow">Security Boundary</p><h2 id="gateTitle">MFA belum dapat disiapkan</h2><p class="gate-copy">${escapeHtml(errorText(error))}</p><div class="security-warning"><strong>Akses tetap dikunci.</strong><span>Tidak ada session privileged yang dibuat ketika konfigurasi MFA tidak lengkap.</span></div><button class="button button-secondary button-full" id="backToLogin" type="button">Kembali ke login</button>`;
    document.getElementById("backToLogin").addEventListener("click", () => renderLogin());
    return;
  }

  gateContent.innerHTML = `
    <p class="eyebrow">MFA Enrollment</p>
    <h2 id="gateTitle">Hubungkan aplikasi autentikator</h2>
    <p class="gate-copy">Tambahkan akun TOTP di aplikasi autentikator pilihanmu. Secret hanya ditampilkan pada tahap enrollment ini.</p>
    <div class="mfa-stack">
      <div class="mfa-secret">
        <span class="field-label">Kunci manual</span>
        <code id="mfaSecret">${escapeHtml(setup.secret)}</code>
        <div class="mfa-actions">
          <button class="button button-secondary" id="copyMfaSecret" type="button">Salin kunci</button>
          <button class="button button-secondary" id="copyOtpUri" type="button">Salin setup URI</button>
        </div>
        <span class="copy-feedback" id="mfaCopyFeedback" aria-live="polite"></span>
      </div>
      <div class="security-warning"><strong>Jangan simpan secret ini di chat atau catatan publik.</strong><span>Server menyimpan secret dalam bentuk terenkripsi AES-256-GCM.</span></div>
      <form class="form-stack" id="mfaEnrollForm">
        <div class="field-group"><label class="field-label" for="mfaEnrollCode">Kode 6 digit</label><input class="field-input" id="mfaEnrollCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required></div>
        <p class="form-error" id="mfaEnrollError" role="alert" hidden></p>
        <button class="button button-primary button-full" id="mfaEnrollButton" type="submit">Verifikasi dan aktifkan MFA</button>
      </form>
    </div>
  `;
  document.getElementById("copyMfaSecret").addEventListener("click", () => copyText(setup.secret, "mfaCopyFeedback"));
  document.getElementById("copyOtpUri").addEventListener("click", () => copyText(setup.otpauth_uri, "mfaCopyFeedback"));
  const form = document.getElementById("mfaEnrollForm");
  const button = document.getElementById("mfaEnrollButton");
  const errorBox = document.getElementById("mfaEnrollError");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const input = document.getElementById("mfaEnrollCode");
    if (!/^\d{6}$/.test(input.value.trim())) return;
    setButtonLoading(button, true, "Memverifikasi…");
    errorBox.hidden = true;
    try {
      const result = await adminApi.mfaEnrollVerify(input.value.trim());
      input.value = "";
      renderRecoveryCodes(result.recovery_codes || [], () => enterControl(result));
    } catch (error) {
      input.value = "";
      errorBox.textContent = errorText(error);
      errorBox.hidden = false;
    } finally {
      setButtonLoading(button, false);
    }
  });
}

function renderMfaVerify() {
  let method = "totp";
  gateContent.innerHTML = `
    <p class="eyebrow">Multi-Factor Authentication</p>
    <h2 id="gateTitle">Verifikasi identitas</h2>
    <p class="gate-copy">Masukkan kode TOTP. Recovery code hanya dipakai jika autentikator utama tidak tersedia dan akan langsung menjadi tidak berlaku setelah digunakan.</p>
    <div class="mfa-methods" role="group" aria-label="Metode MFA"><button class="mfa-method" data-method="totp" aria-pressed="true" type="button">Authenticator</button><button class="mfa-method" data-method="recovery" aria-pressed="false" type="button">Recovery code</button></div>
    <form class="form-stack" id="mfaVerifyForm">
      <div class="field-group"><label class="field-label" id="mfaCodeLabel" for="mfaVerifyCode">Kode 6 digit</label><input class="field-input" id="mfaVerifyCode" inputmode="numeric" autocomplete="one-time-code" maxlength="24" required></div>
      <p class="form-error" id="mfaVerifyError" role="alert" hidden></p>
      <button class="button button-primary button-full" id="mfaVerifyButton" type="submit">Verifikasi MFA</button>
    </form>
  `;
  const input = document.getElementById("mfaVerifyCode");
  const label = document.getElementById("mfaCodeLabel");
  document.querySelectorAll("[data-method]").forEach(button => button.addEventListener("click", () => {
    method = button.dataset.method;
    document.querySelectorAll("[data-method]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    input.value = "";
    input.inputMode = method === "totp" ? "numeric" : "text";
    input.autocomplete = method === "totp" ? "one-time-code" : "off";
    label.textContent = method === "totp" ? "Kode 6 digit" : "Recovery code";
  }));
  const form = document.getElementById("mfaVerifyForm");
  const errorBox = document.getElementById("mfaVerifyError");
  const submit = document.getElementById("mfaVerifyButton");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const code = input.value.trim();
    if (!code) return;
    setButtonLoading(submit, true, "Memverifikasi…");
    errorBox.hidden = true;
    try {
      const result = await adminApi.mfaVerify(code, method);
      input.value = "";
      await enterControl(result);
    } catch (error) {
      input.value = "";
      errorBox.textContent = errorText(error);
      errorBox.hidden = false;
    } finally {
      setButtonLoading(submit, false);
    }
  });
}

function downloadRecoveryCodes(codes) {
  const content = `Pasar UMKM Admin Recovery Codes\nSimpan offline. Setiap kode hanya berlaku satu kali.\n\n${codes.join("\n")}\n`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "pasar-umkm-admin-recovery-codes.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function renderRecoveryCodes(codes, onContinue) {
  gateContent.innerHTML = `
    <p class="eyebrow">Account Recovery</p>
    <h2 id="gateTitle">Simpan recovery codes</h2>
    <p class="gate-copy">Kode ini hanya ditampilkan sekali. Setiap kode hanya dapat digunakan satu kali.</p>
    <div class="security-warning"><strong>Jangan simpan bersama password.</strong><span>Simpan offline atau di password manager yang terpercaya.</span></div>
    <ul class="recovery-grid">${codes.map(code => `<li class="recovery-code">${escapeHtml(code)}</li>`).join("")}</ul>
    <div class="mfa-actions"><button class="button button-secondary" id="copyRecovery" type="button">Salin semua</button><button class="button button-secondary" id="downloadRecovery" type="button">Unduh .txt</button></div>
    <span class="copy-feedback" id="recoveryFeedback" aria-live="polite"></span>
    <label class="recovery-confirm"><input type="checkbox" id="recoverySaved"><span>Saya sudah menyimpan recovery codes di tempat aman.</span></label>
    <button class="button button-primary button-full" id="continueControl" type="button" disabled>Lanjut ke Control Center</button>
  `;
  document.getElementById("copyRecovery").addEventListener("click", () => copyText(codes.join("\n"), "recoveryFeedback"));
  document.getElementById("downloadRecovery").addEventListener("click", () => downloadRecoveryCodes(codes));
  const checkbox = document.getElementById("recoverySaved");
  const button = document.getElementById("continueControl");
  checkbox.addEventListener("change", () => { button.disabled = !checkbox.checked; });
  button.addEventListener("click", () => onContinue?.());
}

function ensureStepUpDialog() {
  let dialog = document.getElementById("stepUpDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "stepUpDialog";
  dialog.className = "stepup-dialog";
  dialog.innerHTML = `<form class="stepup-frame" id="stepUpForm" method="dialog"><div class="stepup-head"><div><p class="eyebrow">Sensitive Action</p><h2>Verifikasi ulang</h2></div><button class="icon-button" value="cancel" type="submit" aria-label="Tutup">×</button></div><p class="stepup-copy">Permission sensitif memerlukan MFA baru. Verifikasi berlaku singkat untuk mengurangi risiko session hijack.</p><div class="mfa-methods"><button class="mfa-method" data-stepup-method="totp" aria-pressed="true" type="button">Authenticator</button><button class="mfa-method" data-stepup-method="recovery" aria-pressed="false" type="button">Recovery</button></div><div class="field-group"><label class="field-label" id="stepUpCodeLabel" for="stepUpCode">Kode 6 digit</label><input class="field-input" id="stepUpCode" inputmode="numeric" autocomplete="one-time-code" maxlength="24" required></div><p class="form-error" id="stepUpError" role="alert" hidden></p><div class="stepup-actions"><button class="button button-secondary" value="cancel" type="submit">Batal</button><button class="button button-primary" id="stepUpSubmit" value="verify" type="submit">Verifikasi</button></div></form>`;
  document.body.appendChild(dialog);
  return dialog;
}

export function requestStepUp() {
  const dialog = ensureStepUpDialog();
  const form = dialog.querySelector("#stepUpForm");
  const input = dialog.querySelector("#stepUpCode");
  const errorBox = dialog.querySelector("#stepUpError");
  const submit = dialog.querySelector("#stepUpSubmit");
  const label = dialog.querySelector("#stepUpCodeLabel");
  let method = "totp";
  dialog.querySelectorAll("[data-stepup-method]").forEach(button => {
    button.onclick = () => {
      method = button.dataset.stepupMethod;
      dialog.querySelectorAll("[data-stepup-method]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
      input.value = "";
      input.inputMode = method === "totp" ? "numeric" : "text";
      input.autocomplete = method === "totp" ? "one-time-code" : "off";
      label.textContent = method === "totp" ? "Kode 6 digit" : "Recovery code";
    };
  });
  input.value = "";
  errorBox.hidden = true;
  dialog.showModal();
  queueMicrotask(() => input.focus());

  return new Promise(resolve => {
    const finish = value => {
      form.onsubmit = null;
      dialog.oncancel = null;
      if (dialog.open) dialog.close();
      resolve(value);
    };
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
    form.onsubmit = async event => {
      const submitter = event.submitter;
      if (submitter?.value !== "verify") { event.preventDefault(); finish(false); return; }
      event.preventDefault();
      if (!input.value.trim()) return;
      setButtonLoading(submit, true, "Memverifikasi…");
      errorBox.hidden = true;
      try {
        await adminApi.stepUp(input.value.trim(), method);
        input.value = "";
        finish(true);
      } catch (error) {
        input.value = "";
        errorBox.textContent = errorText(error);
        errorBox.hidden = false;
      } finally {
        setButtonLoading(submit, false);
      }
    };
  });
}

async function enterControl(sessionPayload = null) {
  gateView.hidden = true;
  controlView.hidden = false;
  controlView.innerHTML = `<div class="loading-state"><strong>Menyiapkan Control Center…</strong><p>Memuat capability admin dan data yang diizinkan.</p></div>`;
  try {
    const module = await import("./control.js?v=6.0.0");
    await module.mountControlCenter({
      root: controlView,
      initialSession: sessionPayload,
      requestStepUp,
      onSessionExpired: () => {
        controlView.hidden = true;
        gateView.hidden = false;
        renderLogin("Session admin berakhir. Silakan masuk kembali.");
      }
    });
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) {
      controlView.hidden = true;
      gateView.hidden = false;
      renderLogin("Session admin berakhir. Silakan masuk kembali.");
      return;
    }
    controlView.innerHTML = `<div class="error-state"><strong>Control Center tidak dapat dimuat.</strong><p>${escapeHtml(errorText(error))}</p></div>`;
  }
}

async function bootstrap() {
  try {
    const session = await adminApi.session();
    if (session?.authenticated) { await enterControl(session); return; }
    renderLogin();
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) { renderLogin(); return; }
    renderLogin("Layanan autentikasi belum dapat dijangkau. Coba kembali.");
  }
}

bootstrap();
