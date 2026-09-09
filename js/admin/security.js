import { adminApi, AdminApiError } from "./api.js?v=6.0.0";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function showNotice(host, message, tone = "info") {
  let notice = host.querySelector("#securityNotice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "securityNotice";
    host.querySelector(".view-header")?.insertAdjacentElement("afterend", notice);
  }
  notice.className = `view-notice view-notice-${tone}`;
  notice.setAttribute("role", tone === "error" ? "alert" : "status");
  notice.textContent = message;
}

async function copyCodes(codes, host) {
  try {
    await navigator.clipboard.writeText(codes.join("\n"));
    showNotice(host, "Recovery code tersalin. Simpan di tempat aman.", "success");
  } catch {
    showNotice(host, "Clipboard tidak tersedia. Salin recovery code secara manual.", "error");
  }
}

function downloadCodes(codes) {
  const text = `Pasar UMKM Admin Recovery Codes\nSetiap kode hanya berlaku satu kali.\n\n${codes.join("\n")}\n`;
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "pasar-umkm-admin-recovery-codes.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function recoveryDisplay(host, codes) {
  const block = document.createElement("section");
  block.className = "security-card";
  block.innerHTML = `
    <div class="security-warning"><strong>Recovery code baru hanya ditampilkan sekarang.</strong><span>Kode lama sudah dicabut. Setiap kode baru hanya berlaku satu kali.</span></div>
    <ul class="recovery-grid">${codes.map(code => `<li class="recovery-code">${escapeHtml(code)}</li>`).join("")}</ul>
    <div class="mfa-actions"><button class="button button-secondary" id="securityCopyRecovery" type="button">Salin semua</button><button class="button button-secondary" id="securityDownloadRecovery" type="button">Unduh .txt</button></div>
  `;
  host.querySelector(".security-grid")?.prepend(block);
  block.querySelector("#securityCopyRecovery").addEventListener("click", () => copyCodes(codes, host));
  block.querySelector("#securityDownloadRecovery").addEventListener("click", () => downloadCodes(codes));
}

async function withStepUp(context, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) {
      context.onSessionExpired();
      return null;
    }
    if (error instanceof AdminApiError && error.code === "ADMIN_STEP_UP_REQUIRED") {
      const verified = await context.requestStepUp();
      if (!verified) return null;
      return operation();
    }
    throw error;
  }
}

function sessionRow(session) {
  const state = session.revoked ? "Dicabut" : session.current ? "Sesi saat ini" : "Aktif";
  return `
    <li class="security-row">
      <div class="security-row-main">
        <strong>${state}</strong>
        <span>Dibuat ${formatDate(session.created_at)} · terakhir digunakan ${formatDate(session.last_used_at)}</span>
        <div class="security-event-meta"><span>Metode: ${escapeHtml(session.auth_method || "password")}</span><span>${session.mfa_verified ? "MFA terverifikasi" : "Tanpa MFA"}</span><span>${session.step_up_fresh ? "Step-up masih fresh" : "Step-up perlu diperbarui"}</span></div>
      </div>
      <div class="security-row-actions">${session.revoked ? `<span class="security-stat">${escapeHtml(session.revoke_reason || "dicabut")}</span>` : `<button class="button button-secondary" type="button" data-revoke-session="${escapeHtml(session.id)}" data-current="${session.current}">${session.current ? "Akhiri sesi ini" : "Cabut sesi"}</button>`}</div>
    </li>
  `;
}

function eventRow(event) {
  const outcomeLabel = event.outcome === "success" ? "Berhasil" : event.outcome === "failure" ? "Gagal" : event.outcome === "denied" ? "Ditolak" : event.outcome;
  return `
    <li class="security-row">
      <div class="security-row-main"><strong>${escapeHtml(event.action)}</strong><span>${escapeHtml(event.reason_code || "—")} · ${formatDate(event.created_at)}</span></div>
      <div class="security-row-actions"><span class="security-stat">${escapeHtml(outcomeLabel)}</span></div>
    </li>
  `;
}

export async function renderSecurity(context) {
  const [mfa, sessionsPayload, eventsPayload] = await Promise.all([
    adminApi.mfaStatus(),
    adminApi.securitySessions(),
    adminApi.securityEvents()
  ]);
  const sessions = sessionsPayload.sessions || [];
  const events = eventsPayload.events || [];

  context.host.innerHTML = `
    <header class="view-header"><div><p class="eyebrow">Keamanan akun admin</p><h1 class="view-title">Keamanan</h1><p class="view-description">Kelola MFA, recovery code, sesi aktif, dan jejak keamanan untuk identitas administrator ini.</p></div></header>
    <div class="security-grid">
      <section class="security-card">
        <div class="security-card-head"><div><h2>Autentikasi multi-faktor</h2><p>TOTP terenkripsi dan recovery code sekali pakai untuk melindungi akses administratif.</p></div><span class="security-stat">${mfa.totp_active ? "TOTP aktif" : "TOTP nonaktif"}</span></div>
        <ul class="security-list">
          <li class="security-row"><div class="security-row-main"><strong>Recovery code</strong><span>${Number(mfa.recovery_codes_remaining || 0)} kode belum digunakan.</span></div><div class="security-row-actions"><button class="button button-secondary" id="regenerateRecovery" type="button">Buat ulang</button></div></li>
          <li class="security-row"><div class="security-row-main"><strong>Step-up untuk tindakan sensitif</strong><span>Verifikasi MFA baru berlaku singkat sebelum permission sensitif dijalankan.</span></div><div class="security-row-actions"><span class="security-stat">${mfa.step_up_fresh ? "Masih fresh" : "Diminta saat diperlukan"}</span></div></li>
        </ul>
      </section>
      <section class="security-card">
        <div class="security-card-head"><div><h2>Sesi administrator</h2><p>Maksimum 50 sesi dalam 30 hari terakhir. IP dan User-Agent mentah tidak ditampilkan.</p></div><button class="button button-secondary" id="revokeAllSessions" type="button">Cabut semua sesi</button></div>
        <ul class="security-list" id="securitySessions">${sessions.map(sessionRow).join("") || `<li class="security-row"><div class="security-row-main"><strong>Tidak ada sesi.</strong></div></li>`}</ul>
      </section>
      <section class="security-card">
        <div class="security-card-head"><div><h2>Peristiwa keamanan</h2><p>30 event autentikasi terbaru tanpa mengekspos risk-hash mentah.</p></div></div>
        <ul class="security-list">${events.map(eventRow).join("") || `<li class="security-row"><div class="security-row-main"><strong>Belum ada event.</strong></div></li>`}</ul>
      </section>
    </div>
  `;

  context.host.querySelector("#regenerateRecovery")?.addEventListener("click", async event => {
    const confirmed = await context.confirmAction({
      title: "Buat ulang recovery code?",
      copy: "Semua recovery code lama akan langsung tidak berlaku. Kode baru hanya akan ditampilkan sekali.",
      confirmLabel: "Buat ulang kode",
      tone: "danger",
      requireReason: false
    });
    if (confirmed === null) return;
    const button = event.currentTarget;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Memverifikasi…";
    try {
      const result = await withStepUp(context, () => adminApi.regenerateRecoveryCodes());
      if (result?.recovery_codes) recoveryDisplay(context.host, result.recovery_codes);
    } catch (error) {
      showNotice(context.host, error?.message || "Recovery code gagal dibuat ulang.", "error");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  context.host.querySelector("#revokeAllSessions")?.addEventListener("click", async event => {
    const confirmed = await context.confirmAction({
      title: "Cabut semua sesi?",
      copy: "Semua sesi admin termasuk sesi ini akan langsung tidak berlaku.",
      confirmLabel: "Cabut semua",
      tone: "danger",
      requireReason: false
    });
    if (confirmed === null) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await adminApi.revokeAll();
      context.onSessionExpired();
    } catch (error) {
      button.disabled = false;
      showNotice(context.host, error?.message || "Sesi gagal dicabut.", "error");
    }
  });

  context.host.querySelectorAll("[data-revoke-session]").forEach(button => button.addEventListener("click", async () => {
    const isCurrent = button.dataset.current === "true";
    const confirmed = await context.confirmAction({
      title: isCurrent ? "Akhiri sesi ini?" : "Cabut sesi?",
      copy: isCurrent ? "Kamu akan kembali ke halaman login." : "Sesi lain akan langsung kehilangan akses.",
      confirmLabel: "Cabut sesi",
      tone: "danger",
      requireReason: false
    });
    if (confirmed === null) return;
    button.disabled = true;
    try {
      const result = await withStepUp(context, () => adminApi.revokeSecuritySession(button.dataset.revokeSession));
      if (result?.current) context.onSessionExpired();
      else if (result) await context.refresh();
    } catch (error) {
      button.disabled = false;
      showNotice(context.host, error?.message || "Sesi gagal dicabut.", "error");
    }
  }));
}
