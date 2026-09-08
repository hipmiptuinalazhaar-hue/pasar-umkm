const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_PRODUCT_TAGS = 5;

function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) return null;
  return Math.round(number * 10_000) / 10_000;
}

export function normalizeProductTags(body) {
  const source = Array.isArray(body?.product_tags)
    ? body.product_tags
    : Array.isArray(body?.product_ids)
      ? body.product_ids.map(productId => ({ product_id: productId }))
      : [];

  if (source.length > MAX_PRODUCT_TAGS) {
    return { error: `Maksimal ${MAX_PRODUCT_TAGS} produk dapat ditandai dalam satu postingan.` };
  }

  const seen = new Set();
  const tags = [];

  for (const item of source) {
    const productId = String(
      typeof item === "string" ? item : item?.product_id || ""
    ).trim().toLowerCase();

    if (!UUID_PATTERN.test(productId)) {
      return { error: "ID produk yang ditandai tidak valid." };
    }
    if (seen.has(productId)) continue;
    seen.add(productId);

    tags.push({
      product_id: productId,
      tag_order: tags.length,
      anchor_x: normalizeCoordinate(item?.anchor_x),
      anchor_y: normalizeCoordinate(item?.anchor_y)
    });
  }

  return { tags };
}

export async function validateOwnedProducts(sql, storeId, tags) {
  if (!tags.length) return { products: [] };

  const productIds = tags.map(tag => tag.product_id);
  const rows = await sql`
    SELECT
      p.id,
      p.store_id,
      p.name,
      p.price,
      p.stock,
      p.unit,
      COALESCE(
        p.thumbnail_url,
        (
          SELECT pi.image_url
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.sort_order ASC, pi.created_at ASC
          LIMIT 1
        )
      ) AS image_url
    FROM products p
    WHERE
      p.store_id = ${storeId}::uuid
      AND p.is_active = TRUE
      AND p.id = ANY(${productIds}::uuid[])
  `;

  if (rows.length !== productIds.length) {
    return {
      error: "Produk yang ditandai harus aktif dan berasal dari UMKM Anda sendiri."
    };
  }

  const byId = new Map(rows.map(row => [String(row.id), row]));
  return {
    products: tags.map(tag => ({
      ...byId.get(tag.product_id),
      tag_order: tag.tag_order,
      anchor_x: tag.anchor_x,
      anchor_y: tag.anchor_y
    }))
  };
}

export function publicProductTag(product) {
  return {
    product_id: product.id,
    name: product.name,
    price: Number(product.price || 0),
    stock: Number(product.stock || 0),
    unit: product.unit || null,
    image_url: product.image_url || null,
    tag_order: Number(product.tag_order || 0),
    anchor_x: product.anchor_x === null ? null : Number(product.anchor_x),
    anchor_y: product.anchor_y === null ? null : Number(product.anchor_y)
  };
}

export function productTagInsertQueries(sql, postId, products) {
  return products.map(product => sql`
    INSERT INTO post_products (
      post_id,
      product_id,
      tag_order,
      anchor_x,
      anchor_y
    )
    VALUES (
      ${postId}::uuid,
      ${product.id}::uuid,
      ${product.tag_order},
      ${product.anchor_x},
      ${product.anchor_y}
    )
  `);
}
