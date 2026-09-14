const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 500;
let lastCleanupAt = 0;
let cleanupPromise = null;

export async function maybeCleanupAuthState(sql) {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return false;
  if (cleanupPromise) return cleanupPromise;

  lastCleanupAt = now;
  cleanupPromise = (async () => {
    try {
      await sql`
        WITH expired AS (
          SELECT id FROM sessions
          WHERE expires_at <= NOW()
          LIMIT ${CLEANUP_BATCH_SIZE}
        )
        DELETE FROM sessions s
        USING expired e
        WHERE s.id = e.id
      `;
      await sql`
        WITH expired AS (
          SELECT id FROM admin_sessions
          WHERE revoked_at IS NULL
            AND (expires_at <= NOW() OR idle_expires_at <= NOW())
          LIMIT ${CLEANUP_BATCH_SIZE}
        )
        UPDATE admin_sessions s
        SET revoked_at = COALESCE(s.revoked_at, NOW()),
            revoke_reason = COALESCE(s.revoke_reason, 'expired_cleanup')
        FROM expired e
        WHERE s.id = e.id
      `;
      await sql`
        WITH stale AS (
          SELECT id FROM user_auth_challenges
          WHERE (consumed_at IS NOT NULL AND consumed_at < NOW() - INTERVAL '30 days')
             OR (consumed_at IS NULL AND expires_at < NOW() - INTERVAL '7 days')
          LIMIT ${CLEANUP_BATCH_SIZE}
        )
        DELETE FROM user_auth_challenges c
        USING stale s
        WHERE c.id = s.id
      `;
      await sql`
        WITH stale AS (
          SELECT id FROM admin_auth_challenges
          WHERE consumed_at IS NOT NULL
            AND consumed_at < NOW() - INTERVAL '30 days'
          LIMIT ${CLEANUP_BATCH_SIZE}
        )
        DELETE FROM admin_auth_challenges c
        USING stale s
        WHERE c.id = s.id
      `;
      return true;
    } catch (error) {
      console.warn('Auth maintenance cleanup unavailable:', error?.code || error?.message || 'unknown');
      lastCleanupAt = 0;
      return false;
    } finally {
      cleanupPromise = null;
    }
  })();

  return cleanupPromise;
}

export const authMaintenancePolicy = Object.freeze({
  cleanup_interval_ms: CLEANUP_INTERVAL_MS,
  cleanup_batch_size: CLEANUP_BATCH_SIZE,
  expired_public_sessions_deleted: true,
  expired_admin_sessions_revoked: true,
  consumed_challenge_retention_days: 30,
  unconsumed_expired_challenge_retention_days: 7
});
