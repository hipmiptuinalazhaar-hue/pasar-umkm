from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, got {count}")
    return text.replace(old, new, 1)


path = Path("js/commerce-experience-v2.js")
text = path.read_text(encoding="utf-8")

text = replace_once(
    text,
    """    } catch (error) {
      toast(error.message || 'Keranjang belum dapat dimuat.');
    }
  }

  async function updateCartQuantity""",
    """    } catch (error) {
      const message = error.message || 'Keranjang belum dapat dimuat.';
      toast(message);
      mountPage({
        title: 'Keranjang',
        eyebrow: 'Belanja',
        back: false,
        nav: 'cart',
        body: emptyState(
          'warning-circle',
          'Keranjang belum dapat dimuat',
          message,
          '<button type="button" class="commerce-primary" data-commerce-action="route" data-commerce-route="cart">Coba Lagi</button>'
        )
      });
    }
  }

  async function updateCartQuantity""",
    "cart recoverable error state",
)

text = replace_once(
    text,
    """    } catch (error) {
      toast(error.message || 'Checkout belum dapat dimuat.');
    }
  }

  async function submitCheckout""",
    """    } catch (error) {
      const message = error.message || 'Checkout belum dapat dimuat.';
      toast(message);
      mountPage({
        title: 'Checkout',
        eyebrow: 'Konfirmasi pesanan',
        nav: 'cart',
        hideNav: true,
        body: emptyState(
          'warning-circle',
          'Checkout belum dapat dimuat',
          message,
          '<button type="button" class="commerce-primary" data-commerce-action="route" data-commerce-route="checkout">Coba Lagi</button>'
        )
      });
    }
  }

  async function submitCheckout""",
    "checkout recoverable error state",
)

text = replace_once(
    text,
    """    } catch (error) {
      toast(error.message || 'Pesanan belum dapat dimuat.');
    }
  }

  function findOrder""",
    """    } catch (error) {
      const message = error.message || 'Pesanan belum dapat dimuat.';
      toast(message);
      mountPage({
        title: scope === 'seller' ? 'Pesanan Masuk' : 'Pesanan Saya',
        eyebrow: scope === 'seller' ? 'Seller Center' : 'Transaksi',
        nav: 'account',
        body: emptyState(
          'warning-circle',
          'Pesanan belum dapat dimuat',
          message,
          `<button type="button" class="commerce-primary" data-commerce-action="route" data-commerce-route="${scope === 'seller' ? 'seller-orders' : 'buyer-orders'}">Coba Lagi</button>`
        )
      });
    }
  }

  function findOrder""",
    "orders recoverable error state",
)

text = replace_once(
    text,
    """    if (action === 'onboarding-next') return continueOnboarding(Number(target.dataset.onboardingStep || 1));
  }
""",
    """    if (action === 'onboarding-next') {
      const step = Number(target.dataset.onboardingStep || 1);
      return withActionLock(`onboarding:${step}`, () => continueOnboarding(step));
    }
  }
""",
    "onboarding single-flight lock",
)

text = replace_once(
    text,
    """    if (form.id === 'commerceStoreForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      submitStoreProfile(form);
      return;
    }

    if (form.id === 'commerceProductForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      submitProduct(form);
    }
""",
    """    if (form.id === 'commerceStoreForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      withActionLock('store-submit', () => submitStoreProfile(form));
      return;
    }

    if (form.id === 'commerceProductForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      withActionLock('product-submit', () => submitProduct(form));
    }
""",
    "seller form single-flight locks",
)

path.write_text(text, encoding="utf-8")
