import { adminApi, AdminApiError } from "./api.js?v=5.0.0";

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
      <span class="status">Session terpisah</span>
      <span class="status">HttpOnly</span>
      <span class="status">SameSite Strict</span>
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
      if (error instanceof AdminApiError && ["MFA_ENROLLMENT_REQUIRED", "MFA_REQUIRED"].includes(error.code)) {
        renderMfaGate(error.code);
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
    <p class="gate-copy">Password sementara hanya untuk aktivasi awal. Buat password admin baru sebelum tahap keamanan berikutnya.</p>
    <form class="form-stack" id="rotationForm" novalidate>
      <div class="field-group">
        <label class="field-label" for="rotationEmail">Email admin</label>
        <input class="field-input" id="rotationEmail" type="email" value="${escapeHtml(email)}" autocomplete="username" readonly>
      </div>
      <div class="field-group">
        <label class="field-label" for="currentPassword">Password sementara</label>
        <input class="field-input" id="currentPassword" type="password" autocomplete="current-password" maxlength="72" required>
      </div>
      <div class="field-group">
        <label class="field-label" for="newPassword">Password baru</label>
        <input class="field-input" id="newPassword" type="password" autocomplete="new-password" minlength="14" maxlength="72" required>
        <p class="field-hint">Minimum 14 byte, maksimum 72 byte. Gunakan password unik yang tidak dipakai di akun lain.</p>
      </div>
      <div class="field-group">
        <label class="field-label" for="confirmPassword">Ulangi password baru</label>
        <input class="field-input" id="confirmPassword" type="password" autocomplete="new-password" minlength="14" maxlength="72" required>
      </div>
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
    const confirm = confirmInput.value;

    errorBox.hidden = true;
    if (next !== confirm) {
      errorBox.textContent = "Konfirmasi password tidak sama.";
      errorBox.hidden = false;
      return;
    }

    setButtonLoading(button, true, "Mengamankan akun…");
    try {
      const result = await adminApi.rotatePassword(email, current, next);
      currentInput.value = "";
      nextInput.value = "";
      confirmInput.value = "";
      if (["MFA_ENROLLMENT_REQUIRED", "MFA_REQUIRED"].includes(result.code)) {
        renderMfaGate(result.code, true);
      } else {
        renderLogin("Password berhasil diperbarui. Silakan masuk kembali.");
      }
    } catch (error) {
      currentInput.value = "";
      errorBox.textContent = errorText(error);
      errorBox.hidden = false;
    } finally {
      setButtonLoading(button, false);
    }
  });
}

function renderMfaGate(code, passwordRotated = false) {
  gateContent.innerHTML = `
    <p class="eyebrow">Security Boundary</p>
    <h2 id="gateTitle">Verifikasi multifaktor diperlukan</h2>
    <p class="gate-copy">${passwordRotated ? "Password baru sudah tersimpan. " : ""}Akun admin tetap dikunci sampai MFA benar-benar terdaftar dan terverifikasi.</p>
    <div class="gate-security">
      <strong>Akses privileged belum diberikan.</strong>
      <span>Control Center tidak membuat session admin tanpa MFA. Tidak ada bypass sementara.</span>
    </div>
    <div class="gate-meta">
      <span class="status status-warning">${escapeHtml(code)}</span>
      <span class="status">Fail closed</span>
    </div>
    <button class="button button-secondary button-full" id="backToLogin" type="button">Kembali ke login</button>
  `;
  document.getElementById("backToLogin").addEventListener("click", () => renderLogin());
}

async function enterControl(sessionPayload = null) {
  gateView.hidden = true;
  controlView.hidden = false;
  controlView.innerHTML = `<div class="loading-state"><strong>Menyiapkan Control Center…</strong><p>Memuat capability admin dan data yang diizinkan.</p></div>`;

  try {
    const module = await import("./control.js?v=5.0.0");
    await module.mountControlCenter({
      root: controlView,
      initialSession: sessionPayload,
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
    if (session?.authenticated) {
      await enterControl(session);
      return;
    }
    renderLogin();
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) {
      renderLogin();
      return;
    }
    renderLogin("Layanan autentikasi belum dapat dijangkau. Coba kembali.");
  }
}

bootstrap();
