'use strict';

(() => {
  if (window.PasarP2SocialCommerce?.version === '1.0') return;

  const doc = document;
  const PRODUCT_CARD = '.post-card.is-product-post';
  const ENHANCED_ATTR = 'data-p2-commerce-enhanced';
  let scheduledFrame = 0;
  let enhancedCount = 0;

  function productInfo(card) {
    return card?.querySelector?.('.ig-product-info[data-product-id]') || null;
  }

  function productId(card) {
    return String(productInfo(card)?.dataset.productId || '').trim();
  }

  function productName(card) {
    return String(card?.querySelector?.('.ig-product-name')?.textContent || 'produk UMKM').trim();
  }

  function stockValue(card) {
    const text = String(card?.querySelector?.('.ig-product-stock')?.textContent || '');
    const match = text.match(/stok\s+(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function addChip(host, text, className = '') {
    const chip = doc.createElement('span');
    chip.className = `p2-commerce-chip ${className}`.trim();
    chip.textContent = text;
    host.appendChild(chip);
  }

  function buildTrustRow(card) {
    if (card.querySelector('.p2-commerce-context')) return;

    const info = productInfo(card);
    if (!info) return;

    const host = doc.createElement('div');
    host.className = 'p2-commerce-context';
    host.setAttribute('aria-label', 'Informasi produk');

    addChip(host, 'UMKM lokal', 'p2-commerce-chip--local');

    if (card.querySelector('.verified-badge')) {
      addChip(host, 'Terverifikasi', 'p2-commerce-chip--verified');
    }

    const stock = stockValue(card);
    if (stock === 0) {
      addChip(host, 'Stok habis', 'p2-commerce-chip--soldout');
    } else if (Number.isFinite(stock) && stock > 0 && stock <= 5) {
      addChip(host, `Sisa ${stock}`, 'p2-commerce-chip--low-stock');
    }

    const meta = info.querySelector('.ig-product-meta');
    if (meta?.nextSibling) info.insertBefore(host, meta.nextSibling);
    else info.prepend(host);
  }

  function enhanceMedia(card, id) {
    const media = card.querySelector('.ig-product-media');
    if (!media || !id) return;

    media.dataset.p2ProductDetail = id;
    media.dataset.action = 'product-detail';
    media.dataset.productId = id;
    media.setAttribute('role', 'button');
    media.setAttribute('tabindex', '0');
    media.setAttribute('aria-label', `Lihat detail ${productName(card)}`);
  }

  function enhanceActions(card, id) {
    if (!id) return;

    const add = card.querySelector('[data-action="add-cart"]');
    const buy = card.querySelector('[data-action="buy-now"]');
    const name = productName(card);

    if (add) {
      add.dataset.p2CommerceCta = 'cart';
      add.setAttribute('aria-label', `Tambahkan ${name} ke keranjang`);
    }

    if (buy) {
      buy.dataset.p2CommerceCta = 'buy';
      buy.setAttribute('aria-label', `Beli ${name} sekarang`);
    }
  }

  function enhanceCard(card) {
    if (!(card instanceof HTMLElement) || card.hasAttribute(ENHANCED_ATTR)) return false;

    const id = productId(card);
    if (!id) return false;

    const started = performance.now();
    enhanceMedia(card, id);
    buildTrustRow(card);
    enhanceActions(card, id);

    card.setAttribute(ENHANCED_ATTR, 'true');
    enhancedCount += 1;

    if (performance.mark) {
      const mark = `pasar-p2-card-${enhancedCount}`;
      performance.mark(mark, { detail: { duration_ms: Math.round((performance.now() - started) * 100) / 100 } });
    }

    return true;
  }

  function enhance(root = doc) {
    const cards = [];

    if (root instanceof HTMLElement && root.matches(PRODUCT_CARD)) cards.push(root);
    if (root?.querySelectorAll) cards.push(...root.querySelectorAll(`${PRODUCT_CARD}:not([${ENHANCED_ATTR}])`));

    let changed = 0;
    for (const card of cards) {
      if (enhanceCard(card)) changed += 1;
    }
    return changed;
  }

  function scheduleEnhance(root = doc) {
    if (scheduledFrame) return;
    scheduledFrame = requestAnimationFrame(() => {
      scheduledFrame = 0;
      enhance(root);
    });
  }

  function handleKeyboard(event) {
    const media = event.target?.closest?.('[data-p2-product-detail]');
    if (!media || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    media.click();
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (!mutation.addedNodes?.length) continue;
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(PRODUCT_CARD) || node.querySelector?.(PRODUCT_CARD)) {
          scheduleEnhance(node);
          return;
        }
      }
    }
  });

  doc.addEventListener('keydown', handleKeyboard, true);
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', () => scheduleEnhance(), { once: true });
  } else {
    scheduleEnhance();
  }

  window.PasarP2SocialCommerce = Object.freeze({
    version: '1.0',
    enhance,
    getDiagnostics: () => Object.freeze({ enhanced_cards: enhancedCount })
  });
})();