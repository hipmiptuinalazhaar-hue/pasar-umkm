from pathlib import Path
import re

path = Path('js/app.js')
text = path.read_text(encoding='utf-8')

state_marker = """const DOM = {};\n"""
state_insert = """const CATALOG_PAGE_LIMIT = 24;\nconst CATALOG_PAGINATION = {\n  products: { nextCursor: null, hasNext: false, loading: false },\n  stores: { nextCursor: null, hasNext: false, loading: false }\n};\nlet catalogIntersectionObserver = null;\n\nfunction applyCatalogPagination(target, pagination) {\n  const nextCursor = String(pagination?.next_cursor || '').trim();\n  target.nextCursor = nextCursor || null;\n  target.hasNext = Boolean(pagination?.has_next && nextCursor);\n}\n\nconst DOM = {};\n"""
if text.count(state_marker) != 1:
    raise SystemExit('DOM marker tidak unik')
text = text.replace(state_marker, state_insert, 1)

old_product_fetch = """    fetch(\n      '/api/products',\n"""
new_product_fetch = """    fetch(\n      `/api/products?limit=${CATALOG_PAGE_LIMIT}`,\n"""
if text.count(old_product_fetch) != 1:
    raise SystemExit('Initial product fetch marker tidak unik')
text = text.replace(old_product_fetch, new_product_fetch, 1)

pagination_marker = """    ) {\n      const productPosts =\n"""
pagination_insert = """    ) {\n      applyCatalogPagination(\n        CATALOG_PAGINATION.products,\n        productsData.pagination\n      );\n\n      const productPosts =\n"""
# The first matching block after PRODUCTS is the intended one.
products_section = text.index('// PRODUCTS')
marker_pos = text.find(pagination_marker, products_section)
if marker_pos < 0:
    raise SystemExit('Product pagination insertion marker tidak ditemukan')
text = text[:marker_pos] + pagination_insert + text[marker_pos + len(pagination_marker):]

load_stores_pattern = re.compile(
    r"async function loadStores\(\) \{.*?\n\}\n\n/\* =========================================================\n   RESTORE AUTH SESSION",
    re.S,
)
new_load_stores = r'''async function loadStores({ append = false } = {}) {
  const state = CATALOG_PAGINATION.stores;

  if (append && (!state.hasNext || !state.nextCursor || state.loading)) {
    return [];
  }

  state.loading = true;

  try {
    const params = new URLSearchParams({
      limit: String(CATALOG_PAGE_LIMIT)
    });

    if (append && state.nextCursor) {
      params.set('cursor', state.nextCursor);
    }

    const response = await fetch(
      `/api/stores?${params.toString()}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok !== true || !Array.isArray(data.stores)) {
      throw new Error(data.error || `Stores request failed: ${response.status}`);
    }

    const normalized = data.stores
      .map(normalizePublicStore)
      .filter(store => store.id && store.name);

    if (append) {
      const seen = new Set(DATA.stores.map(store => String(store.id)));
      DATA.stores.push(...normalized.filter(store => !seen.has(String(store.id))));
    } else {
      DATA.stores = normalized;
    }

    applyCatalogPagination(state, data.pagination);
    return normalized;
  } catch (error) {
    console.error('[Pasar UMKM] Stores load error:', error);

    if (!append) {
      DATA.stores = [];
      state.nextCursor = null;
      state.hasNext = false;
      showToast('Daftar UMKM belum dapat dimuat.');
    } else {
      showToast(error.message || 'UMKM berikutnya belum dapat dimuat.');
    }

    return [];
  } finally {
    state.loading = false;
  }
}

function normalizePublicStore(store) {
  return {
    id: String(store.id || ''),
    categoryId: String(store.category_id || ''),
    category: String(store.category_name || ''),
    name: String(store.name || ''),
    slug: String(store.slug || ''),
    description: String(store.description || ''),
    logo: String(store.logo_url || ''),
    cover: String(store.cover_url || ''),
    phone: String(store.phone || ''),
    whatsapp: String(store.whatsapp || ''),
    address: String(store.address || ''),
    district: String(store.district || ''),
    city: String(store.city || ''),
    province: String(store.province || ''),
    verificationStatus: String(store.verification_status || 'pending'),
    verifiedAt: store.verified_at || null,
    productCount: Number(store.product_count || 0),
    createdAt: store.created_at || null
  };
}

function createPublicProductFeedPost(product) {
  return {
    id: `product-${product.id}`,
    store: {
      id: product.store_id,
      name: product.store_name || 'UMKM Lokal',
      avatar: product.store_logo_url || ASSETS.logo,
      location: CONFIG.CITY,
      verified: product.store_verification_status === 'verified'
    },
    caption: product.description || '',
    createdAt: product.created_at,
    commentsCount: Number(product.comments_count || 0),
    product: {
      id: product.id,
      name: product.name,
      image: product.image_url || ASSETS.logo,
      category: product.category_name || '',
      categoryId: product.category_id || '',
      price: Number(product.price || 0),
      stock: Number(product.stock || 0),
      unit: product.unit || ''
    }
  };
}

async function loadMoreProducts() {
  const state = CATALOG_PAGINATION.products;
  if (!state.hasNext || !state.nextCursor || state.loading) return;

  state.loading = true;
  const sentinel = document.querySelector('[data-catalog-sentinel]');
  const button = sentinel?.querySelector('button');
  if (button) button.disabled = true;

  try {
    const params = new URLSearchParams({
      limit: String(CATALOG_PAGE_LIMIT),
      cursor: state.nextCursor
    });

    const response = await fetch(
      `/api/products?${params.toString()}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true || !Array.isArray(data.products)) {
      throw new Error(data.error || `Products request failed: ${response.status}`);
    }

    const existing = new Set(DATA.posts.map(post => String(post.id || '')));
    for (const product of data.products) {
      const post = createPublicProductFeedPost(product);
      if (!existing.has(String(post.id))) {
        DATA.posts.push(post);
        existing.add(String(post.id));
      }
    }

    applyCatalogPagination(state, data.pagination);

    if (STATE.activeCategory) {
      const category = CATEGORIES.find(item => item.id === STATE.activeCategory) || null;
      if (category) {
        renderFeed(
          DATA.posts.filter(post => (
            normalizeText(post.product?.category) === normalizeText(category.name) ||
            normalizeText(post.product?.categoryId) === normalizeText(category.id)
          )),
          category
        );
      }
    } else if (STATE.activeNav === 'home') {
      renderFeed();
    }
  } catch (error) {
    console.error('[Pasar UMKM] Product pagination error:', error);
    showToast(error.message || 'Produk berikutnya belum dapat dimuat.');
  } finally {
    state.loading = false;
    if (button?.isConnected) button.disabled = false;
  }
}

async function loadMoreStores() {
  const state = CATALOG_PAGINATION.stores;
  if (!state.hasNext || !state.nextCursor || state.loading) return;

  const previousScroll = DOM.sheetContent?.scrollTop || 0;
  await loadStores({ append: true });
  openStores();
  requestAnimationFrame(() => {
    if (DOM.sheetContent) DOM.sheetContent.scrollTop = previousScroll;
  });
}

function createCatalogLoadMoreTemplate(category = null) {
  if (!CATALOG_PAGINATION.products.hasNext) return '';

  return `
    <section class="catalog-load-more" data-catalog-sentinel>
      <button
        type="button"
        class="btn-primary"
        data-action="catalog-load-more"
      >
        <i class="ph ph-arrow-down"></i>
        <span>${category ? 'Muat produk kategori lainnya' : 'Muat produk lainnya'}</span>
      </button>
    </section>
  `;
}

function scheduleCatalogPaginationObserver(category = null) {
  catalogIntersectionObserver?.disconnect();
  catalogIntersectionObserver = null;

  if (
    category ||
    STATE.activeNav !== 'home' ||
    !CATALOG_PAGINATION.products.hasNext ||
    !('IntersectionObserver' in window)
  ) {
    return;
  }

  const sentinel = document.querySelector('[data-catalog-sentinel]');
  if (!sentinel) return;

  catalogIntersectionObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    catalogIntersectionObserver?.disconnect();
    loadMoreProducts();
  }, { rootMargin: '700px 0px' });

  catalogIntersectionObserver.observe(sentinel);
}

/* =========================================================
   RESTORE AUTH SESSION'''
text, count = load_stores_pattern.subn(new_load_stores, text, count=1)
if count != 1:
    raise SystemExit(f'loadStores replacement count={count}')

empty_feed_old = """  if (!posts.length) {\n    DOM.feed.innerHTML =\n      createEmptyFeedTemplate(\n        category\n      );\n\n    return;\n  }\n"""
empty_feed_new = """  if (!posts.length) {\n    DOM.feed.innerHTML =\n      createEmptyFeedTemplate(\n        category\n      ) +\n      createCatalogLoadMoreTemplate(\n        category\n      );\n\n    scheduleCatalogPaginationObserver(\n      category\n    );\n    return;\n  }\n"""
if text.count(empty_feed_old) != 1:
    raise SystemExit('renderFeed empty marker tidak unik')
text = text.replace(empty_feed_old, empty_feed_new, 1)

feed_tail_old = """    ${posts\n      .map(\n        createPostTemplate\n      )\n      .join('')}\n  `;\n}\n"""
feed_tail_new = """    ${posts\n      .map(\n        createPostTemplate\n      )\n      .join('')}\n\n    ${createCatalogLoadMoreTemplate(\n      category\n    )}\n  `;\n\n  scheduleCatalogPaginationObserver(\n    category\n  );\n}\n"""
if text.count(feed_tail_old) != 1:
    raise SystemExit('renderFeed tail marker tidak unik')
text = text.replace(feed_tail_old, feed_tail_new, 1)

action_marker = """    case 'all-categories':\n      openAllCategories();\n      break;\n"""
action_insert = """    case 'all-categories':\n      openAllCategories();\n      break;\n\n    case 'catalog-load-more':\n      loadMoreProducts();\n      break;\n\n    case 'stores-load-more':\n      loadMoreStores();\n      break;\n"""
if text.count(action_marker) != 1:
    raise SystemExit('Action router marker tidak unik')
text = text.replace(action_marker, action_insert, 1)

stores_sheet_old = """      <div class=\"store-directory-list\">\n        ${html}\n      </div>\n    `,\n    'stores'\n  );\n}\n"""
stores_sheet_new = """      <div class=\"store-directory-list\">\n        ${html}\n      </div>\n\n      ${\n        CATALOG_PAGINATION.stores.hasNext\n          ? `\n              <button\n                type=\"button\"\n                class=\"menu-sheet-btn\"\n                data-action=\"stores-load-more\"\n              >\n                <i class=\"ph ph-arrow-down\"></i>\n                Muat UMKM lainnya\n              </button>\n            `\n          : ''\n      }\n    `,\n    'stores'\n  );\n}\n"""
if text.count(stores_sheet_old) != 1:
    raise SystemExit('Store sheet marker tidak unik')
text = text.replace(stores_sheet_old, stores_sheet_new, 1)

path.write_text(text, encoding='utf-8')
print('P4.7 frontend cursor pagination patch applied')
