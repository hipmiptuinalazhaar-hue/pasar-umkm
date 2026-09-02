import { neon } from "@neondatabase/serverless";

let notificationInfrastructureReady = false;
let notificationInfrastructurePromise = null;

function schemaError(missing) {
  const error = new Error(
    `[schema:not-ready] Infrastruktur notifikasi belum siap: ${missing.join(", ")}. ` +
    "Jalankan migration database sebelum deploy Worker."
  );
  error.code = "SCHEMA_NOT_READY";
  return error;
}

/**
 * P0 hardening:
 * Worker tidak boleh menjalankan CREATE/ALTER/INDEX/TRIGGER ketika menerima request.
 * Fungsi ini hanya memverifikasi bahwa migration production sudah diterapkan.
 */
export async function ensureNotificationInfrastructure(env) {
  if (notificationInfrastructureReady) return;
  if (notificationInfrastructurePromise) return notificationInfrastructurePromise;

  notificationInfrastructurePromise = (async () => {
    const sql = neon(env.DATABASE_URL);

    const rows = await sql`
      SELECT
        to_regclass('public.notifications') IS NOT NULL AS notifications,
        to_regclass('public.user_follows') IS NOT NULL AS user_follows,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'notifications'
            AND column_name = 'actor_user_id'
        ) AS actor_user_id,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'notifications'
            AND column_name = 'entity_type'
        ) AS entity_type,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'notifications'
            AND column_name = 'entity_id'
        ) AS entity_id
    `;

    const state = rows[0] || {};
    const missing = [];

    if (!state.notifications) missing.push("notifications");
    if (!state.user_follows) missing.push("user_follows");
    if (!state.actor_user_id) missing.push("notifications.actor_user_id");
    if (!state.entity_type) missing.push("notifications.entity_type");
    if (!state.entity_id) missing.push("notifications.entity_id");

    if (missing.length) {
      throw schemaError(missing);
    }

    notificationInfrastructureReady = true;
  })();

  try {
    await notificationInfrastructurePromise;
  } finally {
    notificationInfrastructurePromise = null;
  }
}
