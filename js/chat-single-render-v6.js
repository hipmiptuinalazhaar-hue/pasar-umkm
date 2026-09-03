'use strict';

/* Chat V6 compatibility bootstrap. Rendering ownership moved to Chat V7. */
(() => {
  if (window.__PUMKM_CHAT_V7_BOOTSTRAP__) return;
  window.__PUMKM_CHAT_V7_BOOTSTRAP__ = true;

  let loadPromise = null;

  function ensureStyle() {
    const existing = document.querySelector('link[data-chat-v7-style="true"]');
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/chat-experience-v7.css?v=7.0';
      link.dataset.chatV7Style = 'true';
      link.onload = () => resolve(link);
      link.onerror = () => reject(new Error('Chat V7 stylesheet gagal dimuat.'));
      document.head.appendChild(link);
    });
  }

  function ensureScript() {
    if (window.PasarChatV7?.version === '7.0') {
      return Promise.resolve(window.PasarChatV7);
    }

    const existing = document.querySelector('script[data-chat-v7-module="true"]');
    if (existing) {
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = window.setInterval(() => {
          if (window.PasarChatV7?.version === '7.0') {
            clearInterval(timer);
            resolve(window.PasarChatV7);
          } else if (Date.now() - started > 5000) {
            clearInterval(timer);
            reject(new Error('Chat V7 belum siap.'));
          }
        }, 40);
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/chat-experience-v7.js?v=7.0';
      script.async = true;
      script.dataset.chatV7Module = 'true';
      script.onload = () => {
        if (window.PasarChatV7?.version === '7.0') resolve(window.PasarChatV7);
        else reject(new Error('Chat V7 tidak terinisialisasi.'));
      };
      script.onerror = () => reject(new Error('Chat V7 module gagal dimuat.'));
      document.body.appendChild(script);
    });
  }

  function ensureV7() {
    if (window.PasarChatV7?.version === '7.0') {
      return Promise.resolve(window.PasarChatV7);
    }
    if (loadPromise) return loadPromise;

    loadPromise = Promise.all([ensureStyle(), ensureScript()])
      .then(([, module]) => module)
      .catch(error => {
        loadPromise = null;
        throw error;
      });

    return loadPromise;
  }

  const intentSelector = [
    '[data-action="messages"]',
    '[data-social-action="message-user"]',
    '[data-social-action="open-conversation"]'
  ].join(',');

  document.addEventListener('pointerdown', event => {
    if (event.target?.closest?.(intentSelector)) {
      ensureV7().catch(() => null);
    }
  }, { capture: true, passive: true });

  document.addEventListener('click', event => {
    const target = event.target?.closest?.(intentSelector);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    ensureV7()
      .then(chat => {
        if (target.matches('[data-social-action="message-user"]')) {
          return chat.openWithUser(target.dataset.userId);
        }
        if (target.matches('[data-social-action="open-conversation"]')) {
          return chat.openConversation(target.dataset.conversationId);
        }
        return chat.openList();
      })
      .catch(error => {
        console.error('[Pasar UMKM] Chat V7 bootstrap error:', error);
        if (typeof showToast === 'function') showToast('Pesan belum dapat dibuka.');
      });
  }, true);

  window.ensurePasarChatV7 = ensureV7;
  window.__PUMKM_CHAT_V6_DIAGNOSTICS__ = {
    version: 'retired',
    renderer: 'chat-v7-bootstrap',
    legacyThreadPollSuppressed: true,
    mutationObserver: false
  };
})();
