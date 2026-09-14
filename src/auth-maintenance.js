const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let lastCleanupAt = 0;
let cleanupPromise = null;

export async function maybeCleanupAuthState(sql) {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return false;
  if (cleanupPromise) return cleanupPromise;

  lastCleanupAt = now;
  cleanupPromise = (async () => {
    try {
      await sql`DELETE FROM sessions WHERE expires_at <= NOW()`;
      await sql`
        UPDATE admin_sessions
        SET revoked_at = COALESCE(revoked_at, NOW()),
            revoke_reason = COALESCE(revoke_reason, 'expired_cleanup')
        WHERE revoked_at IS NULL
          AND (expires_at <= NOW() OR idle_expires_at <= NOW())
      `;
      await sql`
        DELETE FROM user_auth_challenges
        WHERE (consumed_at IS NOT NULL AND consumed_at < NOW() - INTERVAL '30 days')
           OR (consumed_at IS NULL AND expires_at < NOW() - INTERVAL '7 days')
      `;
      await sql`
        DELETE FROM admin_auth_challenges
        WHERE consumed_at IS NOT NULL
          AND consumed_at < NOW() - INTERVAL '30 days'
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
  expired_public_sessions_deleted: true,
  expired_admin_sessions_revoked: true,
  consumed_challenge_retention_days: 30,
  unconsumed_expired_challenge_retention_days: 7
});
