import { Client, neon } from "@neondatabase/serverless";
import { ensureFunctionalityInfrastructure } from "./functionality-store.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function jsonError(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie");

  if (!header) {
    return null;
  }

  for (const cookie of header.split(";")) {
    const [key, ...value] = cookie.trim().split("=");

    if (key === name) {
      return value.join("=") || null;
    }
  }

  return null;
}

function normalizeUuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

async function getAuthenticatedUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);

  if (!token) {
    return null;
  }

  const rows = await sql`
    SELECT
      u.id,
      u.name,
      u.email,
      u.phone,
      u.avatar_url,
      u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE
      s.token_hash = encode(
        digest(${token}, 'sha256'),
        'hex'
      )
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;

  return rows[0] || null;
}

async function requireUser(sql, request) {
  const user = await getAuthenticatedUser(sql, request);

  if (!user) {
    return {
      user: null,
      response: jsonError("Silakan masuk terlebih dahulu.", 401)
    };
  }

  return { user, response: null };
}

async function currentStore(sql, userId) {
  const rows = await sql`
    SELECT
      id,
      owner_id,
      name,
      slug,
      description,
      phone,
      whatsapp,
      address,
      district,
      city,
      province,
      verification_status,
      is_active,
      created_at,
      updated_at
    FROM stores
    WHERE owner_id = ${userId}
    ORDER BY created_at ASC
    LIMIT 1
  `;

  return rows[0] || null;
}

async function ensureCart(sql, userId) {
  const rows = await sql`
    INSERT INTO carts (user_id)
    VALUES (${userId})
    ON CONFLICT (user_id)
    DO UPDATE SET updated_at = NOW()
    RETURNING id
  `;

  return rows[0].id;
}

async function getCart(sql, userId) {
  const cartId = await ensureCart(sql, userId);

  const items = await sql`
    SELECT
      ci.id AS cart_item_id,
      ci.product_id,
      ci.quantity,
      ci.created_at,
      ci.updated_at,
      p.name,
      p.description,
      p.price,
      p.stock,
      p.unit,
      p.store_id,
      s.name AS store_name,
      s.verification_status AS store_verification_status,
      COALESCE(
        NULLIF(p.thumbnail_url, ''),
        (
          SELECT pi.image_url
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.sort_order ASC, pi.created_at ASC
          LIMIT 1
        )
      ) AS image_url
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    JOIN stores s ON s.id = p.store_id
    WHERE
      ci.cart_id = ${cartId}
      AND p.is_active = TRUE
      AND s.is_active = TRUE
    ORDER BY ci.created_at ASC
  `;

  const total = items.reduce(
    (sum, item) =>
      sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  return {
    id: cartId,
    items,
    item_count: items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    ),
    total
  };
}

async function handleCart(sql, request, url) {
  const auth = await requireUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  if (
    url.pathname === "/api/commerce/cart" &&
    request.method === "GET"
  ) {
    return json({
      ok: true,
      cart: await getCart(sql, auth.user.id)
    });
  }

  if (
    url.pathname === "/api/commerce/cart" &&
    request.method === "DELETE"
  ) {
    const cartId = await ensureCart(sql, auth.user.id);

    await sql`
      DELETE FROM cart_items
      WHERE cart_id = ${cartId}
    `;

    return json({
      ok: true,
      cart: await getCart(sql, auth.user.id)
    });
  }

  if (
    url.pathname === "/api/commerce/cart/items" &&
    request.method === "POST"
  ) {
    const body = await request.json().catch(() => null);
    const productId = normalizeUuid(body?.product_id);
    const quantity = Number(body?.quantity ?? 1);

    if (!productId) {
      return jsonError("Produk tidak valid.", 400);
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return jsonError("Jumlah produk tidak valid.", 400);
    }

    const products = await sql`
      SELECT
        p.id,
        p.stock
      FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE
        p.id = ${productId}::uuid
        AND p.is_active = TRUE
        AND s.is_active = TRUE
      LIMIT 1
    `;

    if (!products[0]) {
      return jsonError("Produk tidak ditemukan.", 404);
    }

    const stock = Number(products[0].stock || 0);

    if (stock <= 0) {
      return jsonError("Stok produk habis.", 409);
    }

    const cartId = await ensureCart(sql, auth.user.id);

    await sql`
      INSERT INTO cart_items (
        cart_id,
        product_id,
        quantity
      )
      VALUES (
        ${cartId},
        ${productId}::uuid,
        ${Math.min(quantity, stock)}
      )
      ON CONFLICT (cart_id, product_id)
      DO UPDATE SET
        quantity = LEAST(
          cart_items.quantity + EXCLUDED.quantity,
          ${stock}
        ),
        updated_at = NOW()
    `;

    return json({
      ok: true,
      cart: await getCart(sql, auth.user.id)
    }, 201);
  }

  const itemMatch = url.pathname.match(
    /^\/api\/commerce\/cart\/items\/([0-9a-f-]{36})$/i
  );

  if (!itemMatch) {
    return null;
  }

  const productId = normalizeUuid(itemMatch[1]);

  if (!productId) {
    return jsonError("Produk tidak valid.", 400);
  }

  const cartId = await ensureCart(sql, auth.user.id);

  if (request.method === "PATCH") {
    const body = await request.json().catch(() => null);
    const quantity = Number(body?.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return jsonError("Jumlah produk tidak valid.", 400);
    }

    const products = await sql`
      SELECT stock
      FROM products
      WHERE
        id = ${productId}::uuid
        AND is_active = TRUE
      LIMIT 1
    `;

    if (!products[0]) {
      return jsonError("Produk tidak ditemukan.", 404);
    }

    if (quantity > Number(products[0].stock || 0)) {
      return jsonError("Jumlah melebihi stok tersedia.", 409);
    }

    const updated = await sql`
      UPDATE cart_items
      SET
        quantity = ${quantity},
        updated_at = NOW()
      WHERE
        cart_id = ${cartId}
        AND product_id = ${productId}::uuid
      RETURNING id
    `;

    if (!updated[0]) {
      return jsonError("Item keranjang tidak ditemukan.", 404);
    }

    return json({
      ok: true,
      cart: await getCart(sql, auth.user.id)
    });
  }

  if (request.method === "DELETE") {
    await sql`
      DELETE FROM cart_items
      WHERE
        cart_id = ${cartId}
        AND product_id = ${productId}::uuid
    `;

    return json({
      ok: true,
      cart: await getCart(sql, auth.user.id)
    });
  }

  return jsonError("Metode tidak diizinkan.", 405);
}

async function contentExists(sql, kind, id) {
  if (kind === "product") {
    const rows = await sql`
      SELECT p.id
      FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE
        p.id = ${id}::uuid
        AND p.is_active = TRUE
        AND s.is_active = TRUE
      LIMIT 1
    `;

    return Boolean(rows[0]);
  }

  const rows = await sql`
    SELECT p.id
    FROM posts p
    JOIN stores s ON s.id = p.store_id
    WHERE
      p.id = ${id}::uuid
      AND p.is_active = TRUE
      AND s.is_active = TRUE
    LIMIT 1
  `;

  return Boolean(rows[0]);
}

function normalizeSavedItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const result = [];
  const seen = new Set();

  for (const item of value.slice(0, 200)) {
    const kind = item?.kind === "product" ? "product" : "post";
    const id = normalizeUuid(item?.id);

    if (!id) {
      continue;
    }

    const key = `${kind}:${id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({ kind, id });
  }

  return result;
}

async function handleSaved(sql, request, url) {
  const auth = await requireUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  if (
    url.pathname === "/api/commerce/saved" &&
    request.method === "GET"
  ) {
    const items = await sql`
      SELECT
        item_type AS kind,
        item_id AS id,
        created_at
      FROM saved_items
      WHERE user_id = ${auth.user.id}
      ORDER BY created_at DESC
      LIMIT 250
    `;

    return json({ ok: true, items });
  }

  if (
    url.pathname === "/api/commerce/saved/state" &&
    request.method === "POST"
  ) {
    const body = await request.json().catch(() => null);
    const items = normalizeSavedItems(body?.items);

    const rows = await sql`
      SELECT
        item_type AS kind,
        item_id AS id
      FROM saved_items
      WHERE user_id = ${auth.user.id}
    `;

    const saved = new Set(
      rows.map(row => `${row.kind}:${row.id}`)
    );

    return json({
      ok: true,
      items: items.map(item => ({
        ...item,
        saved: saved.has(`${item.kind}:${item.id}`)
      }))
    });
  }

  const match = url.pathname.match(
    /^\/api\/commerce\/saved\/(post|product)\/([0-9a-f-]{36})$/i
  );

  if (!match) {
    return null;
  }

  const kind = match[1].toLowerCase();
  const id = normalizeUuid(match[2]);

  if (!id) {
    return jsonError("Konten tidak valid.", 400);
  }

  if (!(await contentExists(sql, kind, id))) {
    return jsonError("Konten tidak ditemukan.", 404);
  }

  if (request.method === "POST") {
    await sql`
      INSERT INTO saved_items (
        user_id,
        item_type,
        item_id
      )
      VALUES (
        ${auth.user.id},
        ${kind},
        ${id}::uuid
      )
      ON CONFLICT DO NOTHING
    `;

    if (kind === "product") {
      await sql`
        INSERT INTO favorites (user_id, product_id)
        VALUES (${auth.user.id}, ${id}::uuid)
        ON CONFLICT DO NOTHING
      `;
    }

    return json({ ok: true, saved: true, kind, id });
  }

  if (request.method === "DELETE") {
    await sql`
      DELETE FROM saved_items
      WHERE
        user_id = ${auth.user.id}
        AND item_type = ${kind}
        AND item_id = ${id}::uuid
    `;

    if (kind === "product") {
      await sql`
        DELETE FROM favorites
        WHERE
          user_id = ${auth.user.id}
          AND product_id = ${id}::uuid
      `;
    }

    return json({ ok: true, saved: false, kind, id });
  }

  return jsonError("Metode tidak diizinkan.", 405);
}

function transactionError(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function withDbTransaction(env, work) {
  const client = new Client({ connectionString: env.DATABASE_URL });
  let inTransaction = false;

  try {
    await client.connect();
    await client.query("BEGIN");
    inTransaction = true;

    const result = await work(client);

    await client.query("COMMIT");
    inTransaction = false;
    return result;
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Database rollback failed:", rollbackError);
      }
    }

    throw error;
  } finally {
    try {
      await client.end();
    } catch (closeError) {
      console.error("Database client close failed:", closeError);
    }
  }
}

function orderNumber() {
  const stamp = Date.now().toString().slice(-10);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `PUMKM-${stamp}-${suffix}`;
}

async function getOrderItems(sql, orderId) {
  return await sql`
    SELECT
      id,
      product_id,
      product_name,
      product_price,
      quantity,
      subtotal,
      created_at
    FROM order_items
    WHERE order_id = ${orderId}
    ORDER BY created_at ASC
  `;
}

async function checkoutCart(sql, request, env) {
  const auth = await requireUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);

  if (!body) {
    return jsonError("Data checkout tidak valid.", 400);
  }

  const customerName = String(body.customer_name || auth.user.name || "").trim().slice(0, 120);
  const customerPhone = String(body.customer_phone || auth.user.phone || "").trim().slice(0, 30);
  const deliveryAddress = String(body.delivery_address || "").trim().slice(0, 1200);
  const notes = String(body.notes || "").trim().slice(0, 1000);

  if (customerName.length < 2) {
    return jsonError("Nama penerima belum valid.", 400);
  }

  if (customerPhone.length < 5) {
    return jsonError("Nomor penerima belum valid.", 400);
  }

  if (deliveryAddress.length < 5) {
    return jsonError("Alamat pengantaran belum valid.", 400);
  }

  try {
    const createdOrders = await withDbTransaction(env, async client => {
      const cartResult = await client.query(
        `
          INSERT INTO carts (user_id)
          VALUES ($1)
          ON CONFLICT (user_id)
          DO UPDATE SET updated_at = carts.updated_at
          RETURNING id
        `,
        [auth.user.id]
      );

      const cartId = cartResult.rows[0]?.id;
      if (!cartId) {
        throw transactionError("Keranjang belum dapat diproses.", 500);
      }

      const cartItemsResult = await client.query(
        `
          SELECT id, product_id, quantity, created_at
          FROM cart_items
          WHERE cart_id = $1
          ORDER BY created_at ASC, id ASC
          FOR UPDATE
        `,
        [cartId]
      );

      const cartItems = cartItemsResult.rows;
      if (!cartItems.length) {
        throw transactionError("Keranjang masih kosong.", 409);
      }

      const productIds = cartItems.map(item => item.product_id);
      const productsResult = await client.query(
        `
          SELECT
            p.id,
            p.name,
            p.price,
            p.stock,
            p.store_id,
            p.is_active,
            s.name AS store_name,
            s.owner_id,
            s.is_active AS store_active
          FROM products p
          JOIN stores s ON s.id = p.store_id
          WHERE p.id = ANY($1::uuid[])
          ORDER BY p.id ASC
          FOR UPDATE OF p
        `,
        [productIds]
      );

      const products = new Map(
        productsResult.rows.map(product => [String(product.id), product])
      );
      const groups = new Map();

      for (const cartItem of cartItems) {
        const product = products.get(String(cartItem.product_id));
        if (!product || !product.is_active || !product.store_active) {
          throw transactionError("Ada produk di keranjang yang tidak lagi tersedia.", 409);
        }

        const quantity = Number(cartItem.quantity || 0);
        const stock = Number(product.stock || 0);
        const price = Number(product.price || 0);

        if (!Number.isInteger(quantity) || quantity < 1) {
          throw transactionError("Jumlah produk di keranjang tidak valid.", 409);
        }

        if (quantity > stock) {
          throw transactionError(`Stok ${product.name || "produk"} tidak mencukupi.`, 409);
        }

        const normalized = {
          product_id: product.id,
          name: product.name,
          price,
          quantity,
          store_id: product.store_id,
          store_name: product.store_name,
          owner_id: product.owner_id
        };
        const storeId = String(product.store_id);

        if (!groups.has(storeId)) {
          groups.set(storeId, []);
        }
        groups.get(storeId).push(normalized);
      }

      const orders = [];

      for (const [storeId, items] of groups.entries()) {
        const subtotal = items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
        const number = orderNumber();

        const insertedOrder = await client.query(
          `
            INSERT INTO orders (
              order_number,
              buyer_id,
              store_id,
              status,
              subtotal,
              delivery_fee,
              total,
              customer_name,
              customer_phone,
              delivery_address,
              notes
            )
            VALUES (
              $1,
              $2::uuid,
              $3::uuid,
              'pending',
              $4,
              0,
              $4,
              $5,
              $6,
              $7,
              $8
            )
            RETURNING *
          `,
          [
            number,
            auth.user.id,
            storeId,
            subtotal,
            customerName,
            customerPhone,
            deliveryAddress,
            notes || null
          ]
        );

        const order = insertedOrder.rows[0];
        if (!order) {
          throw transactionError("Pesanan gagal dibuat.", 500);
        }

        for (const item of items) {
          const stockResult = await client.query(
            `
              UPDATE products
              SET
                stock = stock - $1,
                updated_at = NOW()
              WHERE
                id = $2::uuid
                AND is_active = TRUE
                AND stock >= $1
              RETURNING id, stock
            `,
            [item.quantity, item.product_id]
          );

          if (!stockResult.rows[0]) {
            throw transactionError(
              `Stok ${item.name || "produk"} berubah. Coba checkout kembali.`,
              409
            );
          }

          await client.query(
            `
              INSERT INTO order_items (
                order_id,
                product_id,
                product_name,
                product_price,
                quantity,
                subtotal
              )
              VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
            `,
            [
              order.id,
              item.product_id,
              String(item.name || "Produk"),
              item.price,
              item.quantity,
              item.price * item.quantity
            ]
          );
        }

        await client.query(
          `
            INSERT INTO notifications (
              user_id,
              type,
              title,
              message,
              target_type,
              target_id,
              actor_user_id,
              entity_type,
              entity_id,
              is_read,
              created_at
            )
            VALUES ($1::uuid, 'order', 'Pesanan baru', $2, 'order', $3::uuid, $4::uuid, 'order', $3::uuid, FALSE, NOW())
          `,
          [
            items[0].owner_id,
            `${auth.user.name || "Pembeli"} membuat pesanan ${order.order_number}.`,
            order.id,
            auth.user.id
          ]
        );

        orders.push(order);
      }

      await client.query(
        `DELETE FROM cart_items WHERE cart_id = $1::uuid`,
        [cartId]
      );

      return orders;
    });

    return json({
      ok: true,
      message: "Pesanan berhasil dibuat.",
      orders: createdOrders
    }, 201);
  } catch (error) {
    if (error?.code === "40001" || error?.code === "40P01") {
      return jsonError("Checkout sedang bersaing dengan transaksi lain. Silakan coba lagi.", 409);
    }

    console.error("Checkout transaction error:", error);
    return jsonError(
      error?.message || "Checkout belum dapat diproses.",
      Number.isInteger(error?.status) ? error.status : 500
    );
  }
}

async function listOrders(sql, request, url) {
  const auth = await requireUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  const scope = String(url.searchParams.get("scope") || "buyer");
  let orders = [];

  if (scope === "seller") {
    const store = await currentStore(sql, auth.user.id);

    if (!store) {
      return json({ ok: true, orders: [] });
    }

    orders = await sql`
      SELECT
        o.*,
        u.name AS buyer_name,
        u.avatar_url AS buyer_avatar_url,
        s.name AS store_name
      FROM orders o
      JOIN users u ON u.id = o.buyer_id
      JOIN stores s ON s.id = o.store_id
      WHERE o.store_id = ${store.id}
      ORDER BY o.created_at DESC
      LIMIT 100
    `;
  } else if (scope === "admin" && auth.user.role === "admin") {
    orders = await sql`
      SELECT
        o.*,
        u.name AS buyer_name,
        u.avatar_url AS buyer_avatar_url,
        s.name AS store_name
      FROM orders o
      JOIN users u ON u.id = o.buyer_id
      JOIN stores s ON s.id = o.store_id
      ORDER BY o.created_at DESC
      LIMIT 150
    `;
  } else {
    orders = await sql`
      SELECT
        o.*,
        s.name AS store_name,
        s.owner_id AS seller_user_id,
        u.name AS buyer_name
      FROM orders o
      JOIN stores s ON s.id = o.store_id
      JOIN users u ON u.id = o.buyer_id
      WHERE o.buyer_id = ${auth.user.id}
      ORDER BY o.created_at DESC
      LIMIT 100
    `;
  }

  const enriched = [];

  for (const order of orders) {
    enriched.push({
      ...order,
      items: await getOrderItems(sql, order.id)
    });
  }

  return json({
    ok: true,
    count: enriched.length,
    orders: enriched
  });
}

function canTransition(current, next, isSeller, isBuyer) {
  if (current === next) {
    return true;
  }

  if (isBuyer) {
    return current === "pending" && next === "cancelled";
  }

  if (!isSeller) {
    return false;
  }

  const allowed = {
    pending: new Set(["confirmed", "cancelled"]),
    confirmed: new Set(["processing", "cancelled"]),
    processing: new Set(["ready", "cancelled"]),
    ready: new Set(["completed"]),
    completed: new Set(),
    cancelled: new Set()
  };

  return Boolean(allowed[current]?.has(next));
}

async function updateOrderStatus(sql, request, orderId, env) {
  const auth = await requireUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const nextStatus = String(body?.status || "").trim().toLowerCase();
  const validStatuses = new Set([
    "pending",
    "confirmed",
    "processing",
    "ready",
    "completed",
    "cancelled"
  ]);

  if (!validStatuses.has(nextStatus)) {
    return jsonError("Status pesanan tidak valid.", 400);
  }

  try {
    const result = await withDbTransaction(env, async client => {
      const orderResult = await client.query(
        `
          SELECT
            o.*,
            s.owner_id AS seller_user_id,
            s.name AS store_name
          FROM orders o
          JOIN stores s ON s.id = o.store_id
          WHERE o.id = $1::uuid
          FOR UPDATE OF o
        `,
        [orderId]
      );

      const order = orderResult.rows[0];
      if (!order) {
        throw transactionError("Pesanan tidak ditemukan.", 404);
      }

      const isAdmin = auth.user.role === "admin";
      const isSeller = isAdmin || String(order.seller_user_id) === String(auth.user.id);
      const isBuyer = String(order.buyer_id) === String(auth.user.id) && !isSeller;

      if (!isSeller && !isBuyer) {
        throw transactionError("Anda tidak memiliki akses ke pesanan ini.", 403);
      }

      if (!canTransition(order.status, nextStatus, isSeller, isBuyer)) {
        throw transactionError("Perubahan status pesanan tidak diizinkan.", 403);
      }

      const itemsResult = await client.query(
        `
          SELECT
            id,
            product_id,
            product_name,
            product_price,
            quantity,
            subtotal,
            created_at
          FROM order_items
          WHERE order_id = $1::uuid
          ORDER BY product_id ASC NULLS LAST, id ASC
        `,
        [order.id]
      );
      const items = itemsResult.rows;

      if (nextStatus === "cancelled" && order.status !== "cancelled") {
        for (const item of items) {
          if (!item.product_id) continue;

          await client.query(
            `
              UPDATE products
              SET
                stock = stock + $1,
                updated_at = NOW()
              WHERE id = $2::uuid
            `,
            [Number(item.quantity || 0), item.product_id]
          );
        }
      }

      const updatedResult = await client.query(
        `
          UPDATE orders
          SET
            status = $1,
            updated_at = NOW()
          WHERE id = $2::uuid
          RETURNING *
        `,
        [nextStatus, order.id]
      );
      const updated = updatedResult.rows[0];

      const recipientId = isBuyer ? order.seller_user_id : order.buyer_id;
      if (recipientId && String(recipientId) !== String(auth.user.id)) {
        await client.query(
          `
            INSERT INTO notifications (
              user_id,
              type,
              title,
              message,
              target_type,
              target_id,
              actor_user_id,
              entity_type,
              entity_id,
              is_read,
              created_at
            )
            VALUES ($1::uuid, 'order', 'Status pesanan diperbarui', $2, 'order', $3::uuid, $4::uuid, 'order', $3::uuid, FALSE, NOW())
          `,
          [
            recipientId,
            `Pesanan ${order.order_number} sekarang berstatus ${nextStatus}.`,
            order.id,
            auth.user.id
          ]
        );
      }

      return {
        order: updated,
        items
      };
    });

    return json({
      ok: true,
      order: {
        ...result.order,
        items: result.items
      }
    });
  } catch (error) {
    if (error?.code === "40001" || error?.code === "40P01") {
      return jsonError("Status pesanan berubah bersamaan. Silakan coba lagi.", 409);
    }

    console.error("Order status transaction error:", error);
    return jsonError(
      error?.message || "Status pesanan belum dapat diperbarui.",
      Number.isInteger(error?.status) ? error.status : 500
    );
  }
}

async function handleOrders(sql, request, url, env) {
  if (
    url.pathname === "/api/commerce/checkout" &&
    request.method === "POST"
  ) {
    return await checkoutCart(sql, request, env);
  }

  if (
    url.pathname === "/api/commerce/orders" &&
    request.method === "GET"
  ) {
    return await listOrders(sql, request, url);
  }

  const match = url.pathname.match(
    /^\/api\/commerce\/orders\/([0-9a-f-]{36})\/status$/i
  );

  if (match && request.method === "PATCH") {
    const orderId = normalizeUuid(match[1]);

    if (!orderId) {
      return jsonError("Pesanan tidak valid.", 400);
    }

    return await updateOrderStatus(sql, request, orderId, env);
  }

  return null;
}

async function handleSearch(sql, request, url) {
  if (
    url.pathname !== "/api/commerce/search" ||
    request.method !== "GET"
  ) {
    return null;
  }

  const query = String(url.searchParams.get("q") || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);

  if (query.length < 2) {
    return json({
      ok: true,
      query,
      users: [],
      stores: [],
      products: [],
      posts: []
    });
  }

  const needle = `%${query}%`;

  const [users, stores, products, posts] = await Promise.all([
    sql`
      SELECT
        u.id,
        u.name,
        u.avatar_url,
        u.role,
        s.id AS store_id,
        s.name AS store_name
      FROM users u
      LEFT JOIN LATERAL (
        SELECT id, name
        FROM stores
        WHERE
          owner_id = u.id
          AND is_active = TRUE
        ORDER BY created_at ASC
        LIMIT 1
      ) s ON TRUE
      WHERE
        u.is_active = TRUE
        AND u.name ILIKE ${needle}
      ORDER BY u.name ASC
      LIMIT 12
    `,
    sql`
      SELECT
        s.id,
        s.owner_id,
        s.name,
        s.description,
        s.logo_url,
        s.district,
        s.city,
        s.province,
        s.verification_status
      FROM stores s
      WHERE
        s.is_active = TRUE
        AND (
          s.name ILIKE ${needle}
          OR COALESCE(s.description, '') ILIKE ${needle}
          OR COALESCE(s.district, '') ILIKE ${needle}
        )
      ORDER BY
        CASE WHEN s.verification_status = 'verified' THEN 0 ELSE 1 END,
        s.name ASC
      LIMIT 12
    `,
    sql`
      SELECT
        p.id,
        p.store_id,
        p.name,
        p.description,
        p.price,
        p.stock,
        p.unit,
        s.name AS store_name,
        COALESCE(
          NULLIF(p.thumbnail_url, ''),
          (
            SELECT pi.image_url
            FROM product_images pi
            WHERE pi.product_id = p.id
            ORDER BY pi.sort_order ASC, pi.created_at ASC
            LIMIT 1
          )
        ) AS image_url
      FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE
        p.is_active = TRUE
        AND s.is_active = TRUE
        AND (
          p.name ILIKE ${needle}
          OR COALESCE(p.description, '') ILIKE ${needle}
          OR s.name ILIKE ${needle}
        )
      ORDER BY p.created_at DESC
      LIMIT 16
    `,
    sql`
      SELECT
        p.id,
        p.store_id,
        p.caption,
        p.image_url,
        p.created_at,
        s.name AS store_name,
        s.owner_id AS owner_user_id
      FROM posts p
      JOIN stores s ON s.id = p.store_id
      WHERE
        p.is_active = TRUE
        AND s.is_active = TRUE
        AND (
          COALESCE(p.caption, '') ILIKE ${needle}
          OR s.name ILIKE ${needle}
        )
      ORDER BY p.created_at DESC
      LIMIT 16
    `
  ]);

  return json({
    ok: true,
    query,
    users,
    stores,
    products,
    posts
  });
}

async function handleSellerSummary(sql, request, url) {
  if (
    url.pathname !== "/api/commerce/seller/summary" ||
    request.method !== "GET"
  ) {
    return null;
  }

  const auth = await requireUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  if (auth.user.role !== "seller" && auth.user.role !== "admin") {
    return jsonError("Akun bukan penjual.", 403);
  }

  const store = await currentStore(sql, auth.user.id);

  if (!store) {
    return jsonError("UMKM belum ditemukan.", 404);
  }

  const rows = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM products p WHERE p.store_id = ${store.id} AND p.is_active = TRUE) AS product_count,
      (SELECT COUNT(*)::int FROM posts p WHERE p.store_id = ${store.id} AND p.is_active = TRUE) AS post_count,
      (SELECT COUNT(*)::int FROM orders o WHERE o.store_id = ${store.id} AND o.status IN ('pending','confirmed','processing','ready')) AS active_order_count,
      (SELECT COUNT(*)::int FROM orders o WHERE o.store_id = ${store.id} AND o.status = 'pending') AS pending_order_count,
      (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.store_id = ${store.id} AND o.status = 'completed') AS completed_revenue
  `;

  return json({
    ok: true,
    store,
    summary: rows[0] || {}
  });
}

async function handleAdmin(sql, request, url) {
  if (!url.pathname.startsWith("/api/commerce/admin")) {
    return null;
  }

  const auth = await requireUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  if (auth.user.role !== "admin") {
    return jsonError("Akses admin diperlukan.", 403);
  }

  if (
    url.pathname === "/api/commerce/admin/summary" &&
    request.method === "GET"
  ) {
    const summaryRows = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE is_active = TRUE) AS active_users,
        (SELECT COUNT(*)::int FROM stores WHERE is_active = TRUE) AS active_stores,
        (SELECT COUNT(*)::int FROM stores WHERE verification_status = 'pending' AND is_active = TRUE) AS pending_stores,
        (SELECT COUNT(*)::int FROM products WHERE is_active = TRUE) AS active_products,
        (SELECT COUNT(*)::int FROM orders) AS order_count,
        (SELECT COALESCE(SUM(total),0) FROM orders WHERE status = 'completed') AS completed_gmv
    `;

    const pendingStores = await sql`
      SELECT
        s.id,
        s.owner_id,
        s.name,
        s.description,
        s.district,
        s.city,
        s.province,
        s.verification_status,
        s.created_at,
        u.name AS owner_name
      FROM stores s
      JOIN users u ON u.id = s.owner_id
      WHERE
        s.is_active = TRUE
        AND s.verification_status = 'pending'
      ORDER BY s.created_at ASC
      LIMIT 50
    `;

    return json({
      ok: true,
      summary: summaryRows[0] || {},
      pending_stores: pendingStores
    });
  }

  const storeMatch = url.pathname.match(
    /^\/api\/commerce\/admin\/stores\/([0-9a-f-]{36})$/i
  );

  if (storeMatch && request.method === "PATCH") {
    const storeId = normalizeUuid(storeMatch[1]);
    const body = await request.json().catch(() => null);
    const status = String(body?.verification_status || "").trim().toLowerCase();

    if (!storeId) {
      return jsonError("UMKM tidak valid.", 400);
    }

    if (!["pending", "verified", "rejected"].includes(status)) {
      return jsonError("Status verifikasi tidak valid.", 400);
    }

    const rows = await sql`
      UPDATE stores
      SET
        verification_status = ${status},
        verified_at = CASE
          WHEN ${status} = 'verified' THEN NOW()
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE id = ${storeId}::uuid
      RETURNING id, owner_id, name, verification_status
    `;

    if (!rows[0]) {
      return jsonError("UMKM tidak ditemukan.", 404);
    }

    await sql`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        target_type,
        target_id,
        actor_user_id,
        entity_type,
        entity_id,
        is_read,
        created_at
      )
      VALUES (
        ${rows[0].owner_id},
        'store',
        'Status verifikasi UMKM',
        ${`Status verifikasi ${rows[0].name} sekarang ${status}.`},
        'profile',
        ${rows[0].owner_id},
        ${auth.user.id},
        'profile',
        ${rows[0].owner_id},
        FALSE,
        NOW()
      )
    `;

    return json({ ok: true, store: rows[0] });
  }

  return jsonError("Endpoint admin tidak ditemukan.", 404);
}

async function handleStories(sql, request, url) {
  if (!url.pathname.startsWith("/api/commerce/stories")) {
    return null;
  }

  if (
    url.pathname === "/api/commerce/stories" &&
    request.method === "GET"
  ) {
    const stories = await sql`
      SELECT
        st.id,
        st.user_id,
        st.store_id,
        st.image_url,
        st.caption,
        st.created_at,
        st.expires_at,
        u.name,
        u.avatar_url,
        s.name AS store_name,
        s.logo_url AS store_logo_url
      FROM stories st
      JOIN users u ON u.id = st.user_id
      LEFT JOIN stores s ON s.id = st.store_id
      WHERE
        st.is_active = TRUE
        AND st.expires_at > NOW()
        AND u.is_active = TRUE
        AND (s.id IS NULL OR s.is_active = TRUE)
      ORDER BY st.created_at DESC
      LIMIT 100
    `;

    return json({ ok: true, stories });
  }

  if (
    url.pathname === "/api/commerce/stories" &&
    request.method === "POST"
  ) {
    const auth = await requireUser(sql, request);

    if (auth.response) {
      return auth.response;
    }

    if (auth.user.role !== "seller" && auth.user.role !== "admin") {
      return jsonError("Cerita saat ini hanya dapat dibuat oleh pemilik UMKM.", 403);
    }

    const body = await request.json().catch(() => null);
    const imageUrl = String(body?.image_url || "").trim().slice(0, 2000);
    const caption = String(body?.caption || "").trim().slice(0, 500);

    if (!imageUrl && !caption) {
      return jsonError("Cerita harus memiliki foto atau teks.", 400);
    }

    if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
      return jsonError("Foto cerita tidak valid.", 400);
    }

    const store = await currentStore(sql, auth.user.id);

    if (!store && auth.user.role !== "admin") {
      return jsonError("UMKM belum ditemukan.", 404);
    }

    const rows = await sql`
      INSERT INTO stories (
        user_id,
        store_id,
        image_url,
        caption
      )
      VALUES (
        ${auth.user.id},
        ${store?.id || null},
        ${imageUrl || null},
        ${caption || null}
      )
      RETURNING *
    `;

    return json({ ok: true, story: rows[0] }, 201);
  }

  const match = url.pathname.match(
    /^\/api\/commerce\/stories\/([0-9a-f-]{36})$/i
  );

  if (match && request.method === "DELETE") {
    const auth = await requireUser(sql, request);

    if (auth.response) {
      return auth.response;
    }

    const storyId = normalizeUuid(match[1]);

    if (!storyId) {
      return jsonError("Cerita tidak valid.", 400);
    }

    const rows = await sql`
      UPDATE stories
      SET is_active = FALSE
      WHERE
        id = ${storyId}::uuid
        AND (
          user_id = ${auth.user.id}
          OR ${auth.user.role === "admin"}
        )
      RETURNING id
    `;

    if (!rows[0]) {
      return jsonError("Cerita tidak ditemukan.", 404);
    }

    return json({ ok: true });
  }

  return jsonError("Endpoint cerita tidak ditemukan.", 404);
}

export async function handleFunctionalityApi(request, env) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/commerce/")) {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureFunctionalityInfrastructure(sql);

    const adminResponse = await handleAdmin(sql, request, url);
    if (adminResponse) return adminResponse;

    const searchResponse = await handleSearch(sql, request, url);
    if (searchResponse) return searchResponse;

    const storyResponse = await handleStories(sql, request, url);
    if (storyResponse) return storyResponse;

    const sellerResponse = await handleSellerSummary(sql, request, url);
    if (sellerResponse) return sellerResponse;

    const orderResponse = await handleOrders(sql, request, url, env);
    if (orderResponse) return orderResponse;

    if (url.pathname.startsWith("/api/commerce/cart")) {
      const cartResponse = await handleCart(sql, request, url);
      if (cartResponse) return cartResponse;
    }

    if (url.pathname.startsWith("/api/commerce/saved")) {
      const savedResponse = await handleSaved(sql, request, url);
      if (savedResponse) return savedResponse;
    }

    return jsonError("Endpoint fungsi tidak ditemukan.", 404);
  } catch (error) {
    console.error("Functionality API error:", error);

    return jsonError(
      error?.message || "Fungsi aplikasi sedang mengalami gangguan.",
      500
    );
  }
}
