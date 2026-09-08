const RESEND_ENDPOINT = "https://api.resend.com/emails";

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name} belum dikonfigurasi.`);
  return normalized;
}

function sender(env) {
  const email = required(env?.AUTH_FROM_EMAIL, "AUTH_FROM_EMAIL");
  const name = String(env?.AUTH_FROM_NAME || "Pasar UMKM").trim() || "Pasar UMKM";
  return `${name.replace(/[<>\r\n]/g, "")} <${email}>`;
}

function contentFor(purpose, code, expiresMinutes) {
  const registration = purpose === "register";
  const subject = registration
    ? "Kode verifikasi Pasar UMKM"
    : "Kode pemulihan akun Pasar UMKM";
  const heading = registration
    ? "Verifikasi email Anda"
    : "Pulihkan akun Anda";
  const intro = registration
    ? "Gunakan kode berikut untuk menyelesaikan pendaftaran akun Pasar UMKM."
    : "Gunakan kode berikut untuk melanjutkan penggantian kata sandi akun Pasar UMKM.";
  const warning = registration
    ? "Jika Anda tidak membuat akun ini, abaikan email ini."
    : "Jika Anda tidak meminta pemulihan akun, abaikan email ini dan jangan bagikan kode kepada siapa pun.";

  const text = [
    heading,
    "",
    intro,
    "",
    `Kode: ${code}`,
    `Berlaku ${expiresMinutes} menit.`,
    "",
    warning,
    "",
    "Pasar UMKM Lubuklinggau"
  ].join("\n");

  const html = `<!doctype html>
<html lang="id">
  <body style="margin:0;background:#f5f7f6;font-family:Arial,Helvetica,sans-serif;color:#17221d">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7f6;padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e9e6;border-radius:18px;overflow:hidden">
          <tr><td style="background:#083725;padding:24px 28px;color:#ffffff">
            <div style="font-size:12px;letter-spacing:.12em;font-weight:700;opacity:.78">PASAR UMKM LUBUKLINGGAU</div>
            <div style="font-size:24px;font-weight:800;margin-top:8px">${heading}</div>
          </td></tr>
          <tr><td style="padding:28px">
            <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#46534d">${intro}</p>
            <div style="padding:18px 16px;border:1px solid #dce7e1;border-radius:14px;text-align:center;background:#f8fbf9">
              <div style="font-size:11px;letter-spacing:.12em;font-weight:700;color:#637169">KODE VERIFIKASI</div>
              <div style="font-size:34px;letter-spacing:.22em;font-weight:800;color:#083725;margin:9px 0 6px">${code}</div>
              <div style="font-size:13px;color:#68766f">Berlaku ${expiresMinutes} menit</div>
            </div>
            <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#6b7771">${warning}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

export function assertAuthEmailConfigured(env) {
  required(env?.RESEND_API_KEY, "RESEND_API_KEY");
  required(env?.AUTH_FROM_EMAIL, "AUTH_FROM_EMAIL");
}

export async function sendAuthCode(env, { to, code, purpose, expiresMinutes = 10, idempotencyKey = "" }) {
  assertAuthEmailConfigured(env);
  const recipient = String(to || "").trim().toLowerCase();
  if (!recipient) throw new Error("Alamat email penerima tidak valid.");

  const { subject, text, html } = contentFor(purpose, code, expiresMinutes);
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
    },
    body: JSON.stringify({
      from: sender(env),
      to: [recipient],
      subject,
      text,
      html,
      tags: [{ name: "category", value: purpose === "register" ? "verify_email" : "password_reset" }]
    })
  });

  if (!response.ok) {
    const providerRequestId = response.headers.get("x-request-id") || null;
    const error = new Error("Provider email menolak permintaan.");
    error.status = response.status;
    error.providerRequestId = providerRequestId;
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  return { id: payload?.id || null };
}
