from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, got {count}")
    return text.replace(old, new, 1)


commerce_path = Path("js/commerce-experience-v2.js")
commerce = commerce_path.read_text(encoding="utf-8")

commerce = replace_once(
    commerce,
    "if (window.PasarCommerce?.version === '2.0') {",
    "if (window.PasarCommerce?.version === '2.1') {",
    "commerce top version",
)
commerce = replace_once(
    commerce,
    "    onboardingDraft: {},\n    productSearch: ''\n  };",
    "    onboardingDraft: {},\n    productSearch: '',\n    pending: new Set()\n  };",
    "commerce pending state",
)

old_request = """  async function request(path, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {})
    };

    const config = {
      method: options.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers
    };

    if (options.formData) {
      config.body = options.formData;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(path, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok !== true) {
      const error = new Error(
        data.error || data.message || 'Permintaan belum dapat diproses.'
      );
      error.status = response.status;
      throw error;
    }

    return data;
  }
"""
new_request = """  async function request(path, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {})
    };
    const controller = new AbortController();
    const timeoutMs = Number(
      options.timeoutMs || (options.formData ? 45000 : 15000)
    );
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    const config = {
      method: options.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers,
      signal: controller.signal
    };

    if (options.formData) {
      config.body = options.formData;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(path, config);
    } catch (cause) {
      const timedOut = cause?.name === 'AbortError';
      const error = new Error(
        timedOut
          ? 'Koneksi terlalu lama. Coba kembali.'
          : 'Koneksi terputus. Periksa internet lalu coba lagi.'
      );
      error.code = timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR';
      error.cause = cause;
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      if (typeof restoreAuthSession === 'function') {
        await restoreAuthSession().catch(() => null);
      } else if (typeof STATE !== 'undefined') {
        STATE.user = null;
      }
      if (typeof renderSidebar === 'function') renderSidebar();
      if (typeof updateNavigation === 'function') updateNavigation();
      const error = new Error('Sesi berakhir. Silakan masuk kembali.');
      error.status = 401;
      error.code = 'SESSION_EXPIRED';
      window.setTimeout(() => {
        if (typeof openLogin === 'function') openLogin();
      }, 0);
      throw error;
    }

    if (!response.ok || data.ok !== true) {
      const error = new Error(
        data.error || data.message || 'Permintaan belum dapat diproses.'
      );
      error.status = response.status;
      error.code = data.code || 'REQUEST_FAILED';
      throw error;
    }

    return data;
  }

  async function withActionLock(key, task) {
    if (COMMERCE.pending.has(key)) return false;
    COMMERCE.pending.add(key);
    try {
      return await task();
    } finally {
      COMMERCE.pending.delete(key);
    }
  }
"""
commerce = replace_once(commerce, old_request, new_request, "commerce request")

old_cart_update = """  async function updateCartQuantity(productId, quantity) {
    try {
      let data;
      if (quantity <= 0) {
        data = await request(
          `/api/commerce/cart/items/${encodeURIComponent(productId)}`,
          { method: 'DELETE' }
        );
      } else {
        data = await request(
          `/api/commerce/cart/items/${encodeURIComponent(productId)}`,
          { method: 'PATCH', body: { quantity } }
        );
      }

      syncCart(data.cart);
      await renderCartPage();
    } catch (error) {
      toast(error.message || 'Keranjang belum dapat diperbarui.');
    }
  }
"""
new_cart_update = """  async function updateCartQuantity(productId, quantity) {
    return withActionLock(`cart:${productId}`, async () => {
      try {
        let data;
        if (quantity <= 0) {
          data = await request(
            `/api/commerce/cart/items/${encodeURIComponent(productId)}`,
            { method: 'DELETE' }
          );
        } else {
          data = await request(
            `/api/commerce/cart/items/${encodeURIComponent(productId)}`,
            { method: 'PATCH', body: { quantity } }
          );
        }

        syncCart(data.cart);
        await renderCartPage();
        return true;
      } catch (error) {
        if (error.status === 409) {
          await loadCart().then(() => renderCartPage()).catch(() => null);
        }
        toast(error.message || 'Keranjang belum dapat diperbarui.');
        return false;
      }
    });
  }
"""
commerce = replace_once(commerce, old_cart_update, new_cart_update, "cart quantity lock")

old_clear = """  async function clearCart() {
    try {
      const data = await request('/api/commerce/cart', { method: 'DELETE' });
      syncCart(data.cart);
      toast('Keranjang dikosongkan.');
      await renderCartPage();
    } catch (error) {
      toast(error.message || 'Keranjang belum dapat dikosongkan.');
    }
  }
"""
new_clear = """  async function clearCart() {
    return withActionLock('cart-clear', async () => {
      try {
        const data = await request('/api/commerce/cart', { method: 'DELETE' });
        syncCart(data.cart);
        toast('Keranjang dikosongkan.');
        await renderCartPage();
        return true;
      } catch (error) {
        toast(error.message || 'Keranjang belum dapat dikosongkan.');
        return false;
      }
    });
  }
"""
commerce = replace_once(commerce, old_clear, new_clear, "clear cart lock")

commerce = replace_once(
    commerce,
    "      const cart = COMMERCE.cart?.items?.length ? COMMERCE.cart : await loadCart();",
    "      const cart = await loadCart();",
    "fresh checkout cart",
)

old_checkout = """  async function submitCheckout(form) {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const submit = document.querySelector('[form="commerceCheckoutForm"]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Memproses...';
    }

    const values = new FormData(form);

    try {
      const data = await request('/api/commerce/checkout', {
        method: 'POST',
        body: {
          customer_name: values.get('customer_name'),
          customer_phone: values.get('customer_phone'),
          delivery_address: values.get('delivery_address'),
          notes: values.get('notes')
        }
      });

      syncCart({ items: [], item_count: 0, total: 0 });
      window.refreshNotificationBadge?.();

      await go('checkout-success', {
        count: Number(data.orders?.length || 1),
        orders: data.orders || []
      }, { replace: true });
    } catch (error) {
      toast(error.message || 'Checkout belum dapat diproses.');
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Buat Pesanan';
      }
    }
  }
"""
new_checkout = """  async function submitCheckout(form) {
    if (!form.checkValidity()) {
      form.reportValidity();
      return false;
    }

    return withActionLock('checkout-submit', async () => {
      const submit = document.querySelector('[form="commerceCheckoutForm"]');
      if (submit) {
        submit.disabled = true;
        submit.setAttribute('aria-busy', 'true');
        submit.textContent = 'Memproses...';
      }

      const values = new FormData(form);

      try {
        const data = await request('/api/commerce/checkout', {
          method: 'POST',
          body: {
            customer_name: values.get('customer_name'),
            customer_phone: values.get('customer_phone'),
            delivery_address: values.get('delivery_address'),
            notes: values.get('notes')
          }
        });

        syncCart({ items: [], item_count: 0, total: 0 });
        window.refreshNotificationBadge?.();

        await go('checkout-success', {
          count: Number(data.orders?.length || 1),
          orders: data.orders || []
        }, { replace: true });
        return true;
      } catch (error) {
        if (['REQUEST_TIMEOUT', 'NETWORK_ERROR'].includes(error.code)) {
          try {
            const latest = await loadCart();
            if (!(latest.items || []).length) {
              toast('Koneksi terputus setelah checkout. Periksa Pesanan Saya sebelum mencoba lagi.');
              await go('buyer-orders', {}, { replace: true });
              return false;
            }
          } catch {}
        }

        toast(error.message || 'Checkout belum dapat diproses.');
        if (submit) {
          submit.disabled = false;
          submit.removeAttribute('aria-busy');
          submit.textContent = 'Buat Pesanan';
        }
        return false;
      }
    });
  }
"""
commerce = replace_once(commerce, old_checkout, new_checkout, "checkout lock and reconciliation")

old_order = """  async function updateOrderStatus(orderId, status, scope) {
    try {
      await request(`/api/commerce/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        body: { status }
      });
      toast('Status pesanan diperbarui.');
      window.refreshNotificationBadge?.();

      const data = await request(`/api/commerce/orders?scope=${scope}`);
      const orders = Array.isArray(data.orders) ? data.orders : [];
      if (scope === 'seller') COMMERCE.sellerOrders = orders;
      else COMMERCE.buyerOrders = orders;

      await renderOrderDetail({ orderId, scope });
    } catch (error) {
      toast(error.message || 'Status pesanan belum dapat diubah.');
    }
  }
"""
new_order = """  async function updateOrderStatus(orderId, status, scope) {
    return withActionLock(`order:${orderId}`, async () => {
      try {
        await request(`/api/commerce/orders/${encodeURIComponent(orderId)}/status`, {
          method: 'PATCH',
          body: { status }
        });
        toast('Status pesanan diperbarui.');
        window.refreshNotificationBadge?.();

        const data = await request(`/api/commerce/orders?scope=${scope}`);
        const orders = Array.isArray(data.orders) ? data.orders : [];
        if (scope === 'seller') COMMERCE.sellerOrders = orders;
        else COMMERCE.buyerOrders = orders;

        await renderOrderDetail({ orderId, scope });
        return true;
      } catch (error) {
        if ([403, 409].includes(error.status)) {
          await request(`/api/commerce/orders?scope=${scope}`)
            .then(data => {
              const orders = Array.isArray(data.orders) ? data.orders : [];
              if (scope === 'seller') COMMERCE.sellerOrders = orders;
              else COMMERCE.buyerOrders = orders;
            })
            .catch(() => null);
        }
        toast(error.message || 'Status pesanan belum dapat diubah.');
        return false;
      }
    });
  }
"""
commerce = replace_once(commerce, old_order, new_order, "order transition lock")

old_delete = """  async function deleteProduct(productId) {
    try {
      await request(`/api/products/${encodeURIComponent(productId)}`, { method: 'DELETE' });
      if (typeof closeBottomSheet === 'function') closeBottomSheet();
      toast('Produk berhasil dihapus.');
      await loadProducts();
      await go('products', {}, { replace: true });
    } catch (error) {
      toast(error.message || 'Produk belum dapat dihapus.');
    }
  }
"""
new_delete = """  async function deleteProduct(productId) {
    return withActionLock(`delete-product:${productId}`, async () => {
      try {
        await request(`/api/products/${encodeURIComponent(productId)}`, { method: 'DELETE' });
        if (typeof closeBottomSheet === 'function') closeBottomSheet();
        toast('Produk berhasil dihapus.');
        await loadProducts();
        await go('products', {}, { replace: true });
        return true;
      } catch (error) {
        toast(error.message || 'Produk belum dapat dihapus.');
        return false;
      }
    });
  }
"""
commerce = replace_once(commerce, old_delete, new_delete, "product delete lock")

old_add = """  async function addCart(productId, silent = false) {
    if (!requireLogin('Masuk untuk menambahkan produk ke keranjang.')) return false;

    try {
      const data = await request('/api/commerce/cart/items', {
        method: 'POST',
        body: { product_id: productId, quantity: 1 }
      });
      syncCart(data.cart);
      if (!silent) toast('Ditambahkan ke keranjang.');
      return true;
    } catch (error) {
      toast(error.message || 'Produk belum dapat dimasukkan ke keranjang.');
      return false;
    }
  }
"""
new_add = """  async function addCart(productId, silent = false) {
    if (!requireLogin('Masuk untuk menambahkan produk ke keranjang.')) return false;

    return withActionLock(`add-cart:${productId}`, async () => {
      try {
        const data = await request('/api/commerce/cart/items', {
          method: 'POST',
          body: { product_id: productId, quantity: 1 }
        });
        syncCart(data.cart);
        if (!silent) toast('Ditambahkan ke keranjang.');
        return true;
      } catch (error) {
        toast(error.message || 'Produk belum dapat dimasukkan ke keranjang.');
        return false;
      }
    });
  }
"""
commerce = replace_once(commerce, old_add, new_add, "add cart lock")

commerce = replace_once(commerce, "    version: '2.0',", "    version: '2.1',", "commerce public version")
commerce_path.write_text(commerce, encoding="utf-8")

api_path = Path("src/functionality-api.js")
api = api_path.read_text(encoding="utf-8")
old_product_query = """    const products = await sql`
      SELECT stock
      FROM products
      WHERE
        id = ${productId}::uuid
        AND is_active = TRUE
      LIMIT 1
    `;
"""
new_product_query = """    const products = await sql`
      SELECT p.stock
      FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE
        p.id = ${productId}::uuid
        AND p.is_active = TRUE
        AND s.is_active = TRUE
      LIMIT 1
    `;
"""
api = replace_once(api, old_product_query, new_product_query, "cart PATCH store activity")
api_path.write_text(api, encoding="utf-8")

carrier_path = Path("js/profile-saved.js")
carrier = carrier_path.read_text(encoding="utf-8")
carrier = carrier.replace("window.PasarCommerce?.version === '2.0'", "window.PasarCommerce?.version === '2.1'")
carrier = replace_once(carrier, "script.src = 'js/commerce-experience-v2.js?v=2.0';", "script.src = 'js/commerce-experience-v2.js?v=2.1';", "commerce lazy script cache")
carrier_path.write_text(carrier, encoding="utf-8")

index_path = Path("index.html")
index = index_path.read_text(encoding="utf-8")
index = replace_once(index, "js/profile-saved.js?v=2.1", "js/profile-saved.js?v=2.2", "carrier cache boundary")
index_path.write_text(index, encoding="utf-8")
