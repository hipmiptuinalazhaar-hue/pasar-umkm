let socialTableReady = false;

export async function ensureStoreSocialLinksTable(sql) {
  if (socialTableReady) return;

  const rows = await sql`
    SELECT to_regclass('public.store_social_links') IS NOT NULL AS exists
  `;

  if (!rows[0]?.exists) {
    const error = new Error(
      "[schema:not-ready] store_social_links belum tersedia. Jalankan migration database sebelum deploy Worker."
    );
    error.code = "SCHEMA_NOT_READY";
    throw error;
  }

  socialTableReady = true;
}

function cleanHandle(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

export function normalizeSocialUrl(value, platform) {
  const raw = String(value || '').trim();

  if (!raw) {
    return null;
  }

  const platformConfig = {
    instagram: {
      host: 'instagram.com',
      base: 'https://www.instagram.com/'
    },
    tiktok: {
      host: 'tiktok.com',
      base: 'https://www.tiktok.com/@'
    }
  }[platform];

  if (!platformConfig) {
    return null;
  }

  if (/^https?:\/\//i.test(raw)) {
    let parsed;

    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(`Link ${platform} tidak valid.`);
    }

    const hostname = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, '');

    if (
      hostname !== platformConfig.host &&
      !hostname.endsWith(`.${platformConfig.host}`)
    ) {
      throw new Error(`Link harus berasal dari ${platformConfig.host}.`);
    }

    return parsed.toString();
  }

  let handle = raw;

  if (platform === 'instagram') {
    handle = handle
      .replace(/^(?:www\.)?instagram\.com\//i, '');
  }

  if (platform === 'tiktok') {
    handle = handle
      .replace(/^(?:www\.)?tiktok\.com\//i, '')
      .replace(/^@/, '');
  }

  handle = cleanHandle(handle.split(/[/?#]/)[0]);

  if (!/^[A-Za-z0-9._]{1,64}$/.test(handle)) {
    throw new Error(`Username ${platform} tidak valid.`);
  }

  return `${platformConfig.base}${handle}`;
}

export async function getStoreSocialLinks(sql, storeId) {
  await ensureStoreSocialLinksTable(sql);

  const rows = await sql`
    SELECT
      instagram_url,
      tiktok_url,
      updated_at
    FROM store_social_links
    WHERE store_id = ${storeId}
    LIMIT 1
  `;

  return rows[0] || {
    instagram_url: null,
    tiktok_url: null,
    updated_at: null
  };
}

export async function upsertStoreSocialLinks(
  sql,
  storeId,
  instagramUrl,
  tiktokUrl
) {
  await ensureStoreSocialLinksTable(sql);

  const rows = await sql`
    INSERT INTO store_social_links (
      store_id,
      instagram_url,
      tiktok_url,
      updated_at
    )
    VALUES (
      ${storeId},
      ${instagramUrl},
      ${tiktokUrl},
      NOW()
    )
    ON CONFLICT (store_id)
    DO UPDATE SET
      instagram_url = EXCLUDED.instagram_url,
      tiktok_url = EXCLUDED.tiktok_url,
      updated_at = NOW()
    RETURNING
      instagram_url,
      tiktok_url,
      updated_at
  `;

  return rows[0];
}
