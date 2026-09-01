import { neon } from "@neondatabase/serverless";
import { ensureFunctionalityInfrastructure } from "./functionality-store.js";

/**
 * Menjalankan bootstrap functionality setelah bootstrap notifikasi.
 * Urutan ini penting karena functionality-store memperkaya trigger
 * komentar/reply dan pesan yang memakai kolom notifikasi tambahan.
 */
export async function ensureFullFunctionalityInfrastructure(env) {
  const sql = neon(env.DATABASE_URL);
  await ensureFunctionalityInfrastructure(sql);
}
