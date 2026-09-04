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
    showNotice(host, "Recovery codes tersalin. Simpan di tempat aman.", "success");
  } catch {
    showNotice(host, "Clipboard tidak tersedia. Salin recovery codes secara manual.", "error");
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
    <div class="security-warning"><strong>Recovery codes baru hanya ditampilkan sekarang.</strong><span>Kode lama sudah dicabut. Setiap kode baru hanya berlaku satu kali.</span></div>
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
  const state = session.revoked ? "Revoked" : session.current ? "Current" : "Active";
  return `
    <li class="security-row">
      <div class="security-row-main">
        <strong>${state} session</strong>
        <span>Dibuat ${formatDate(session.created_at)} · terakhir dipakai ${formatDate(session.last_used_at)}</span>
        <div class="security-event-meta"><span>${escapeHtml(session.auth_method || "password")}</span><span>${session.mfa_verified ? "MFA verified" : "No MFA"}</span><span>${session.step_up_fresh ? "Step-up fresh" : "Step-up stale"}</span></div>
      </div>
      <div class="security-row-actions">${session.revoked ? `<span class="security-stat">${escapeHtml(session.revoke_reason || "revoked")}</span>` : `<button class="button button-secondary" type="button" data-revoke-session="${escapeHtml(session.id)}" data-current="${session.current}">${session.current ? "Akhiri session ini" : "Cabut session"}</button>`}</div>
    </li>
  `;
}

function eventRow(event) {
  return `
    <li class="security-row">
      <div class="security-row-main"><strong>${escapeHtml(event.action)}</strong><span>${escapeHtml(event.reason_code || "—")} · ${formatDate(event.created_at)}</span></div>
      <div class="security-row-actions"><span class="security-stat">${escapeHtml(event.outcome)}</span></div>
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
    <header class="view-header"><div><p class="eyebrow">Account Security</p><h1 class="view-title">Security</h1><p class="view-description">Kelola MFA, recovery, session aktif, dan jejak keamanan untuk identitas admin ini.</p></div></header>
    <div class="security-grid">
      <section class="security-card">
        <div class="security-card-head"><div><h2>Multi-factor authentication</h2><p>TOTP terenkripsi dan recovery codes sekali pakai.</p></div><span class="security-stat">${mfa.totp_active ? "TOTP active" : "TOTP inactive"}</span></div>
        <ul class="security-list">
          <li class="security-row"><div class="security-row-main"><strong>Recovery codes</strong><span>${Number(mfa.recovery_codes_remaining || 0)} kode belum digunakan.</span></div><div class="security-row-actions"><button class="button button-secondary" id="regenerateRecovery" type="button">Regenerate</button></div></li>
          <li class="security-row"><div class="security-row-main"><strong>Sensitive-action step-up</strong><span>Verifikasi MFA baru berlaku singkat sebelum permission sensitif dijalankan.</span></div><div class="security-row-actions"><span class="security-stat">${mfa.step_up_fresh ? "Fresh" : "Required on demand"}</span></div></li>
        </ul>
      </section>
      <section class="security-card">
        <div class="security-card-head"><div><h2>Sessions</h2><p>Maksimum 50 session 30 hari terakhir. IP dan User-Agent mentah tidak ditampilkan.</p></div><button class="button button-secondary" id="revokeAllSessions" type="button">Cabut semua session</button></div>
        <ul class="security-list" id="securitySessions">${sessions.map(sessionRow).join("") || `<li class="security-row"><div class="security-row-main"><strong>Tidak ada session.</strong></div></li>`}</ul>
      </section>
      <section class="security-card">
        <div class="security-card-head"><div><h2>Security events</h2><p>30 event autentikasi terbaru tanpa mengekspos risk-hash mentah.</p></div></div>
        <ul class="security-list">${events.map(eventRow).join("") || `<li class="security-row"><div class="security-row-main"><strong>Belum ada event.</strong></div></li>`}</ul>
      </section>
    </div>
  `;

  context.host.querySelector("#regenerateRecovery")?.addEventListener("click", async event => {
    const confirmed = await context.confirmAction({
      title: "Buat ulang recovery codes?",
      copy: "Semua recovery code lama akan langsung tidak berlaku. Kode baru hanya akan ditampilkan sekali.",
      confirmLabel: "Regenerate codes",
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
      showNotice(context.host, error?.message || "Recovery codes gagal dibuat ulang.", "error");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  context.host.querySelector("#revokeAllSessions")?.addEventListener("click", async event => {
    const confirmed = await context.confirmAction({
      title: "Cabut semua session?",
      copy: "Semua session admin termasuk session ini akan langsung tidak berlaku.",
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
      showNotice(context.host, error?.message || "Session gagal dicabut.", "error");
    }
  });

  context.host.querySelectorAll("[data-revoke-session]").forEach(button => button.addEventListener("click", async () => {
    const isCurrent = button.dataset.current === "true";
    const confirmed = await context.confirmAction({
      title: isCurrent ? "Akhiri session ini?" : "Cabut session?",
      copy: isCurrent ? "Kamu akan kembali ke halaman login." : "Session lain akan langsung kehilangan akses.",
      confirmLabel: "Cabut session",
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
      showNotice(context.host, error?.message || "Session gagal dicabut.", "error");
    }
  }));
}
