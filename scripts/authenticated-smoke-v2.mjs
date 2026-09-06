const baseUrl = String(process.env.E2E_BASE_URL || "").trim().replace(/\/$/, "");
const expectedEnvironment = String(process.env.SMOKE_EXPECT_ENVIRONMENT || "staging").trim().toLowerCase();
const allowMutations = String(process.env.SMOKE_ALLOW_MUTATIONS || "true").toLowerCase() === "true";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15000);

const credentials = {
  buyer: {
    email: process.env.SMOKE_BUYER_EMAIL,
    password: process.env.SMOKE_BUYER_PASSWORD
  },
  seller: {
    email: process.env.SMOKE_SELLER_EMAIL,
    password: process.env.SMOKE_SELLER_PASSWORD
  },
  admin: {
    email: process.env.SMOKE_ADMIN_EMAIL,
    password: process.env.SMOKE_ADMIN_PASSWORD
  }
};

const STAGING_PRODUCT_ID = "00000000-0000-4000-8000-000000000401";
const STAGING_SELLER_ID = "00000000-0000-4000-8000-000000000202";
const PRODUCTION_HOSTS = new Set([
  "pasar-umkm.hipmiptuinalazhaar.workers.dev"
]);

function fail(message) {
  throw new Error(message);
}

if (!baseUrl) fail("E2E_BASE_URL wajib diisi.");
for (const [role, value] of Object.entries(credentials)) {
  if (!value.email || !value.password) fail(`Credential smoke ${role} belum lengkap.`);
}

const target = new URL(baseUrl);
if (allowMutations && PRODUCTION_HOSTS.has(target.hostname.toLowerCase())) {
  fail("Stateful authenticated smoke DILARANG terhadap production hostname.");
}

class CookieJar {
  constructor(name) {
    this.name = name;
    this.cookies = new Map();
  }

  absorb(headers) {
    let values = [];
    if (typeof headers.getSetCookie === "function") {
      values = headers.getSetCookie();
    } else {
      const combined = headers.get("set-cookie");
      if (combined) values = combined.split(/,(?=\s*[^;,]+=)/g);
    }

    for (const value of values) {
      const pair = String(value || "").split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const key = pair.slice(0, separator).trim();
      const val = pair.slice(separator + 1).trim();
      if (!val) this.cookies.delete(key);
      else this.cookies.set(key, val);
    }
  }

  header() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

async function request(path, { method = "GET", jar = null, body, expected = [200], headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requestHeaders = new Headers({
      Accept: "application/json",
      Origin: baseUrl,
      ...headers
    });
    if (body !== undefined) requestHeaders.set("Content-Type", "application/json");
    if (jar?.header()) requestHeaders.set("Cookie", jar.header());

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: controller.signal
    });
    if (jar) jar.absorb(response.headers);

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      fail(`${method} ${path} mengembalikan non-JSON (${response.status}).`);
    }

    if (!expected.includes(response.status)) {
      fail(`${method} ${path} => ${response.status}; expected ${expected.join("/")}; body=${text.slice(0, 600)}`);
    }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function pass(label, detail = "") {
  console.log(`PASS ${label}${detail ? ` :: ${detail}` : ""}`);
}

async function loginPublic(role, jar) {
  const { data } = await request("/api/auth/login", {
    method: "POST",
    jar,
    body: credentials[role],
    expected: [200]
  });
  assert(data?.ok === true && data?.authenticated === true, `${role} login tidak authenticated.`);
  assert(data?.user?.id, `${role} login tidak mengembalikan user id.`);
  pass(`${role} login`, data.user.role || "authenticated");
  return data.user;
}

async function logoutPublic(role, jar) {
  const { data } = await request("/api/auth/logout", {
    method: "POST",
    jar,
    expected: [200]
  });
  assert(data?.ok === true, `${role} logout gagal.`);
  const me = await request("/api/auth/me", { jar, expected: [401] });
  assert(me.data?.authenticated === false || me.data?.ok === false, `${role} session masih aktif setelah logout.`);
  pass(`${role} logout`, "session revoked");
}

async function preflight() {
  const { data } = await request("/api/health");
  assert(data?.ok === true, "Health target tidak sehat.");
  assert(data?.environment === expectedEnvironment, `Environment mismatch: ${data?.environment || "missing"}`);

  if (allowMutations) {
    assert(expectedEnvironment === "staging", "Mutation gate hanya menerima expected environment staging.");
    assert(data?.staging_database_attested === true, "Database target tidak memiliki staging attestation.");
  }

  pass("staging preflight", `${data.environment}; db-attested=${Boolean(data.staging_database_attested)}`);
}

async function runBuyerSellerCommerce(buyerJar, sellerJar, buyer, seller) {
  const profile = await request("/api/profile/me", { jar: buyerJar });
  assert(profile.data?.ok === true, "Buyer profile gagal dimuat.");
  pass("buyer profile");

  const sellerStore = await request("/api/stores/me", { jar: sellerJar });
  assert(sellerStore.data?.ok === true && sellerStore.data?.has_store === true, "Synthetic seller store tidak tersedia.");
  pass("seller store workspace", sellerStore.data.store?.name || "store");

  const sellerProducts = await request("/api/products/me", { jar: sellerJar });
  assert(sellerProducts.data?.ok === true, "Seller products gagal dimuat.");
  assert((sellerProducts.data.products || []).some(item => String(item.id) === STAGING_PRODUCT_ID), "Synthetic product tidak ditemukan di seller workspace.");
  pass("seller product workspace");

  if (!allowMutations) return null;

  const add = await request("/api/commerce/cart/items", {
    method: "POST",
    jar: buyerJar,
    body: { product_id: STAGING_PRODUCT_ID, quantity: 1 },
    expected: [200, 201]
  });
  assert(add.data?.ok === true, "Tambah cart gagal.");
  pass("buyer cart mutation", "synthetic product added");

  const cart = await request("/api/commerce/cart", { jar: buyerJar });
  assert(cart.data?.ok === true, "Cart gagal dimuat.");
  assert((cart.data.items || []).some(item => String(item.product_id) === STAGING_PRODUCT_ID), "Synthetic cart item hilang.");

  const checkout = await request("/api/commerce/checkout", {
    method: "POST",
    jar: buyerJar,
    body: {
      customer_name: "P2 Smoke Buyer",
      customer_phone: "081200000201",
      delivery_address: "P2 staging synthetic address",
      notes: `P2-E2E ${new Date().toISOString()}`
    },
    expected: [201]
  });
  const order = checkout.data?.orders?.[0];
  assert(checkout.data?.ok === true && order?.id, "Checkout staging tidak membuat order.");
  pass("checkout transaction", order.order_number || order.id);

  const buyerOrders = await request("/api/commerce/orders?scope=buyer", { jar: buyerJar });
  assert((buyerOrders.data?.orders || []).some(item => String(item.id) === String(order.id)), "Order tidak muncul pada buyer scope.");
  pass("buyer order projection");

  const sellerOrders = await request("/api/commerce/orders?scope=seller", { jar: sellerJar });
  assert((sellerOrders.data?.orders || []).some(item => String(item.id) === String(order.id)), "Order tidak muncul pada seller scope.");
  pass("seller order projection");

  for (const status of ["confirmed", "processing", "ready", "completed"]) {
    const changed = await request(`/api/commerce/orders/${order.id}/status`, {
      method: "PATCH",
      jar: sellerJar,
      body: { status },
      expected: [200]
    });
    assert(changed.data?.ok === true, `Seller transition ${status} gagal.`);
  }
  pass("seller order lifecycle", "pending→confirmed→processing→ready→completed");

  const retry = await request(`/api/commerce/orders/${order.id}/status`, {
    method: "PATCH",
    jar: sellerJar,
    body: { status: "completed" },
    expected: [200]
  });
  assert(retry.data?.ok === true && retry.data?.changed === false, "Same-status retry tidak idempotent.");
  pass("order idempotency", "same status is read-only");

  const rating = await request(`/api/ratings/order/${order.id}`, {
    method: "POST",
    jar: buyerJar,
    body: {
      store_rating: 5,
      store_review: "P2 synthetic staging review",
      products: [{ product_id: STAGING_PRODUCT_ID, rating: 5, review: "P2 synthetic product review" }]
    },
    expected: [200]
  });
  assert(rating.data?.ok === true, "Rating completed order gagal.");
  pass("rating lifecycle", "store + product");

  const ratingRead = await request(`/api/ratings/order/${order.id}`, { jar: buyerJar });
  assert(ratingRead.data?.eligible === true && Number(ratingRead.data?.store_rating?.rating) === 5, "Rating readback tidak konsisten.");

  const notifications = await request("/api/notifications", { jar: sellerJar });
  assert(notifications.data?.ok === true, "Seller notifications gagal dimuat.");
  pass("notifications", `${notifications.data.count ?? (notifications.data.notifications || []).length} visible`);

  return order;
}

async function runSocialFlow(buyerJar, sellerJar) {
  if (!allowMutations) return;

  const follow = await request(`/api/social/follow/${STAGING_SELLER_ID}`, {
    method: "POST",
    jar: buyerJar,
    expected: [200]
  });
  assert(follow.data?.ok === true && follow.data?.is_following === true, "Follow seller gagal.");

  const conversation = await request("/api/social/conversations", {
    method: "POST",
    jar: buyerJar,
    body: { target_user_id: STAGING_SELLER_ID },
    expected: [200, 201]
  });
  const conversationId = conversation.data?.conversation?.id || conversation.data?.id;
  assert(conversation.data?.ok === true && conversationId, "Conversation create gagal.");

  const send = await request(`/api/social/conversations/${conversationId}/messages`, {
    method: "POST",
    jar: buyerJar,
    body: { message: `P2 synthetic message ${new Date().toISOString()}` },
    expected: [200, 201]
  });
  assert(send.data?.ok === true, "Direct message staging gagal.");

  const unread = await request("/api/social/unread-count", { jar: sellerJar });
  assert(unread.data?.ok === true && Number(unread.data?.unread_count || 0) >= 1, "Seller unread count tidak bertambah.");

  const messages = await request(`/api/social/conversations/${conversationId}/messages`, {
    jar: sellerJar,
    expected: [200]
  });
  assert(messages.data?.ok === true && (messages.data.messages || []).length >= 1, "Seller tidak dapat membaca synthetic conversation.");
  pass("social messaging", "conversation + message + unread/read");

  const unfollow = await request(`/api/social/follow/${STAGING_SELLER_ID}`, {
    method: "DELETE",
    jar: buyerJar,
    expected: [200]
  });
  assert(unfollow.data?.ok === true && unfollow.data?.is_following === false, "Unfollow cleanup gagal.");
  pass("social follow cleanup");
}

async function runAdminFlow() {
  const jar = new CookieJar("admin");
  const login = await request("/api/admin/auth/login", {
    method: "POST",
    jar,
    body: credentials.admin,
    expected: [200]
  });
  assert(login.data?.ok === true && login.data?.authenticated === true, "Synthetic admin login gagal.");
  pass("admin login", "isolated admin auth domain");

  const me = await request("/api/admin/auth/me", { jar });
  assert(me.data?.ok === true && me.data?.authenticated === true, "Admin session read gagal.");

  const access = await request("/api/admin/access/me", { jar });
  assert(access.data?.ok === true, "Admin access context gagal.");
  assert((access.data.roles || []).some(role => (role.key || role.role_key) === "super_admin"), "Synthetic admin tidak memiliki super_admin role.");
  assert((access.data.permissions || []).some(permission => permission.key === "dashboard.view"), "RBAC dashboard.view tidak ter-resolve.");
  pass("admin RBAC", `${(access.data.permissions || []).length} permissions resolved`);

  const logout = await request("/api/admin/auth/logout", {
    method: "POST",
    jar,
    expected: [200]
  });
  assert(logout.data?.ok === true, "Admin logout gagal.");
  const after = await request("/api/admin/auth/me", { jar, expected: [401] });
  assert(after.data?.authenticated === false || after.data?.ok === false, "Admin session tetap aktif setelah logout.");
  pass("admin logout", "isolated session revoked");
}

async function main() {
  console.log(`P2 Authenticated E2E V2 target=${target.origin}`);
  await preflight();

  const buyerJar = new CookieJar("buyer");
  const sellerJar = new CookieJar("seller");
  const buyer = await loginPublic("buyer", buyerJar);
  const seller = await loginPublic("seller", sellerJar);

  assert(String(seller.id) === STAGING_SELLER_ID, "Seller fixture ID tidak sesuai staging contract.");
  await runBuyerSellerCommerce(buyerJar, sellerJar, buyer, seller);
  await runSocialFlow(buyerJar, sellerJar);
  await runAdminFlow();

  await logoutPublic("seller", sellerJar);
  await logoutPublic("buyer", buyerJar);

  console.log("\nP2 authenticated E2E V2: PASS");
}

main().catch(error => {
  console.error(`\nP2 authenticated E2E V2: FAIL :: ${error?.stack || error}`);
  process.exit(1);
});
