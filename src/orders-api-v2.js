import { Client, neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ORDER_STATUS_LABELS = Object.freeze({
  pending: "menunggu konfirmasi",
  confirmed: "dikonfirmasi",
  processing: "diproses",
  ready: "siap",
  completed: "selesai",
  cancelled: "dibatalkan"
});

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

  if (!header) return null;

  for (const cookie of header.split(";")) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return value.join("=") || null;
  }

  return null;
}

function normalizeUuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

async function getAuthenticatedUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

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
      s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
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
    SELECT id, owner_id, name
    FROM stores
    WHERE owner_id = ${userId}
    ORDER BY created_at ASC
    LIMIT 1
  `;

  return rows[0] || null;
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
        console.error("Orders V2 rollback failed:", rollbackError);
      }
    }

    throw error;
  } finally {
    try {
      await client.end();
    } catch (closeError) {
      console.error("Orders V2 client close failed:", closeError);
    }
  }
}

function orderNumber() {
  const stamp = Date.now().toString().slice(-10);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `PUMKM-${stamp}-${suffix}`;
}

async function checkoutCart(sql, request, env) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Data checkout tidak valid.", 400);

  const customerName = String(body.customer_name || auth.user.name || "")
    .trim()
    .slice(0, 120);
  const customerPhone = String(body.customer_phone || auth.user.phone || "")
    .trim()
    .slice(0, 30);
  const deliveryAddress = String(body.delivery_address || "")
    .trim()
    .slice(0, 1200);
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
          SELECT id
          FROM carts
          WHERE user_id = $1::uuid
          FOR UPDATE
        `,
        [auth.user.id]
      );

      const cartId = cartResult.rows[0]?.id;
      if (!cartId) {
        throw transactionError("Keranjang masih kosong.", 409);
      }

      const cartItemsResult = await client.query(
        `
          SELECT id, product_id, quantity, created_at
          FROM cart_items
          WHERE cart_id = $1::uuid
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
          throw transactionError(
            "Ada produk di keranjang yang tidak lagi tersedia.",
            409
          );
        }

        const quantity = Number(cartItem.quantity || 0);
        const stock = Number(product.stock || 0);
        const price = Number(product.price || 0);

        if (!Number.isInteger(quantity) || quantity < 1) {
          throw transactionError("Jumlah produk di keranjang tidak valid.", 409);
        }
        if (quantity > stock) {
          throw transactionError(
            `Stok ${product.name || "produk"} tidak mencukupi.`,
            409
          );
        }

        const storeId = String(product.store_id);
        const normalized = {
          product_id: product.id,
          name: product.name,
          price,
          quantity,
          store_id: product.store_id,
          store_name: product.store_name,
          owner_id: product.owner_id
        };

        if (!groups.has(storeId)) groups.set(storeId, []);
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
              SET stock = stock - $1, updated_at = NOW()
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
            VALUES (
              $1::uuid,
              'order',
              'Pesanan baru',
              $2,
              'order',
              $3::uuid,
              $4::uuid,
              'order',
              $3::uuid,
              FALSE,
              NOW()
            )
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
        "DELETE FROM cart_items WHERE cart_id = $1::uuid",
        [cartId]
      );

      return orders;
    });

    return json(
      {
        ok: true,
        message: "Pesanan berhasil dibuat.",
        orders: createdOrders
      },
      201
    );
  } catch (error) {
    if (error?.code === "40001" || error?.code === "40P01") {
      return jsonError(
        "Checkout sedang bersaing dengan transaksi lain. Silakan coba lagi.",
        409
      );
    }

    console.error("Orders V2 checkout transaction error:", error);
    return jsonError(
      error?.message || "Checkout belum dapat diproses.",
      Number.isInteger(error?.status) ? error.status : 500
    );
  }
}

async function loadOrderItemsBatch(sql, orderIds) {
  if (!orderIds.length) return new Map();

  const rows = await sql`
    SELECT
      order_id,
      id,
      product_id,
      product_name,
      product_price,
      quantity,
      subtotal,
      created_at
    FROM order_items
    WHERE order_id = ANY(${orderIds}::uuid[])
    ORDER BY order_id ASC, created_at ASC, id ASC
  `;

  const grouped = new Map(orderIds.map(id => [String(id), []]));

  for (const row of rows) {
    const key = String(row.order_id);
    const items = grouped.get(key) || [];
    const { order_id: _orderId, ...item } = row;
    items.push(item);
    grouped.set(key, items);
  }

  return grouped;
}

async function listOrders(sql, request, url) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const scope = String(url.searchParams.get("scope") || "buyer");
  let orders = [];

  if (scope === "seller") {
    const store = await currentStore(sql, auth.user.id);

    if (!store) {
      return json({ ok: true, count: 0, orders: [] });
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

  const itemsByOrder = await loadOrderItemsBatch(
    sql,
    orders.map(order => order.id)
  );

  const enriched = orders.map(order => ({
    ...order,
    items: itemsByOrder.get(String(order.id)) || []
  }));

  return json({
    ok: true,
    count: enriched.length,
    orders: enriched
  });
}

function canTransition(current, next, isSeller, isBuyer) {
  if (isBuyer) {
    return current === "pending" && next === "cancelled";
  }

  if (!isSeller) return false;

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

async function loadOrderItemsForUpdate(client, orderId) {
  const result = await client.query(
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
    [orderId]
  );

  return result.rows;
}

async function restockCancelledOrder(client, orderId) {
  await client.query(
    `
      WITH restock AS (
        SELECT
          product_id,
          SUM(quantity)::int AS quantity
        FROM order_items
        WHERE order_id = $1::uuid
          AND product_id IS NOT NULL
        GROUP BY product_id
      )
      UPDATE products p
      SET
        stock = p.stock + restock.quantity,
        updated_at = NOW()
      FROM restock
      WHERE p.id = restock.product_id
    `,
    [orderId]
  );
}

async function updateOrderStatus(sql, request, orderId, env) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const nextStatus = String(body?.status || "").trim().toLowerCase();
  const validStatuses = new Set(Object.keys(ORDER_STATUS_LABELS));

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
      const isSeller =
        isAdmin || String(order.seller_user_id) === String(auth.user.id);
      const isBuyer =
        String(order.buyer_id) === String(auth.user.id) && !isSeller;

      if (!isSeller && !isBuyer) {
        throw transactionError("Anda tidak memiliki akses ke pesanan ini.", 403);
      }

      const items = await loadOrderItemsForUpdate(client, order.id);

      // Idempotency boundary: retries of an already-applied status are read-only.
      // No updated_at mutation, stock restoration, or duplicate notification.
      if (order.status === nextStatus) {
        return {
          order,
          items,
          changed: false
        };
      }

      if (!canTransition(order.status, nextStatus, isSeller, isBuyer)) {
        throw transactionError("Perubahan status pesanan tidak diizinkan.", 403);
      }

      if (nextStatus === "cancelled") {
        await restockCancelledOrder(client, order.id);
      }

      const updatedResult = await client.query(
        `
          UPDATE orders
          SET status = $1, updated_at = NOW()
          WHERE id = $2::uuid
          RETURNING *
        `,
        [nextStatus, order.id]
      );
      const updated = updatedResult.rows[0];

      if (!updated) {
        throw transactionError("Status pesanan gagal diperbarui.", 500);
      }

      const recipientId = isBuyer
        ? order.seller_user_id
        : order.buyer_id;

      if (recipientId && String(recipientId) !== String(auth.user.id)) {
        const statusLabel = ORDER_STATUS_LABELS[nextStatus] || nextStatus;

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
            VALUES (
              $1::uuid,
              'order',
              'Status pesanan diperbarui',
              $2,
              'order',
              $3::uuid,
              $4::uuid,
              'order',
              $3::uuid,
              FALSE,
              NOW()
            )
          `,
          [
            recipientId,
            `Pesanan ${order.order_number} sekarang ${statusLabel}.`,
            order.id,
            auth.user.id
          ]
        );
      }

      return {
        order: updated,
        items,
        changed: true
      };
    });

    return json({
      ok: true,
      changed: result.changed,
      order: {
        ...result.order,
        items: result.items
      }
    });
  } catch (error) {
    if (error?.code === "40001" || error?.code === "40P01") {
      return jsonError(
        "Status pesanan berubah bersamaan. Silakan coba lagi.",
        409
      );
    }

    console.error("Orders V2 status transaction error:", error);
    return jsonError(
      error?.message || "Status pesanan belum dapat diperbarui.",
      Number.isInteger(error?.status) ? error.status : 500
    );
  }
}

export async function handleOrdersApiV2(request, env) {
  const url = new URL(request.url);

  const isCheckout =
    url.pathname === "/api/commerce/checkout" &&
    request.method === "POST";
  const isOrderList =
    url.pathname === "/api/commerce/orders" &&
    request.method === "GET";
  const statusMatch = url.pathname.match(
    /^\/api\/commerce\/orders\/([0-9a-f-]{36})\/status$/i
  );
  const isStatusUpdate = Boolean(statusMatch) && request.method === "PATCH";

  if (!isCheckout && !isOrderList && !isStatusUpdate) {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);

    if (isCheckout) {
      return await checkoutCart(sql, request, env);
    }

    if (isOrderList) {
      return await listOrders(sql, request, url);
    }

    const orderId = normalizeUuid(statusMatch[1]);
    if (!orderId) {
      return jsonError("Pesanan tidak valid.", 400);
    }

    return await updateOrderStatus(sql, request, orderId, env);
  } catch (error) {
    console.error("Orders V2 route error:", error);
    return jsonError(
      error?.message || "Layanan pesanan sedang mengalami gangguan.",
      Number.isInteger(error?.status) ? error.status : 500
    );
  }
}
