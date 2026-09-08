'use strict';

(() => {
  if (window.__PUMKM_CHAT_V7_BOOTSTRAP__) return;
  window.__PUMKM_CHAT_V7_BOOTSTRAP__ = true;

  let loadPromise = null;
  let actionPromise = null;
  let commercePromise = null;

  function ensureStyle() {
    const found = document.querySelector('link[data-chat-v7-style="true"]');
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const node = document.createElement('link');
      node.rel = 'stylesheet';
      node.href = 'css/chat-experience-v7.css?v=7.0';
      node.dataset.chatV7Style = 'true';
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error('Chat V7 CSS gagal dimuat.'));
      document.head.appendChild(node);
    });
  }

  function waitReady(test, label, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const value = test();
        if (value) {
          clearInterval(timer);
          resolve(value);
        } else if (Date.now() - started > timeout) {
          clearInterval(timer);
          reject(new Error(`${label} belum siap.`));
        }
      }, 40);
    });
  }

  function ensureScript() {
    if (window.PasarChatV7?.version === '7.0') return Promise.resolve(window.PasarChatV7);
    let node = document.querySelector('script[data-chat-v7-module="true"]');
    if (!node) {
      node = document.createElement('script');
      node.src = 'js/chat-experience-v7.js?v=7.0';
      node.async = true;
      node.dataset.chatV7Module = 'true';
      document.body.appendChild(node);
    }
    node.onerror = () => {};
    return waitReady(() => window.PasarChatV7?.version === '7.0' && window.PasarChatV7, 'Chat V7');
  }

  function ensureConversationActions() {
    if (window.PasarChatConversationActions?.version === '1.0') return Promise.resolve(window.PasarChatConversationActions);
    if (actionPromise) return actionPromise;
    let node = document.querySelector('script[data-chat-v7-conversation-actions="true"]');
    if (!node) {
      node = document.createElement('script');
      node.src = 'js/chat-conversation-actions-v7.js?v=1.0';
      node.async = true;
      node.dataset.chatV7ConversationActions = 'true';
      document.body.appendChild(node);
    }
    actionPromise = waitReady(
      () => window.PasarChatConversationActions?.version === '1.0' && window.PasarChatConversationActions,
      'Aksi percakapan'
    ).catch(error => { actionPromise = null; throw error; });
    return actionPromise;
  }

  function ensureCommerceChat() {
    if (window.PasarChatCommerceV8?.version === '8.0') return Promise.resolve(window.PasarChatCommerceV8);
    if (commercePromise) return commercePromise;
    let node = document.querySelector('script[data-chat-commerce-v8="true"]');
    if (!node) {
      node = document.createElement('script');
      node.src = 'js/chat-commerce-v8.js?v=1.0';
      node.async = true;
      node.dataset.chatCommerceV8 = 'true';
      document.body.appendChild(node);
    }
    commercePromise = waitReady(
      () => window.PasarChatCommerceV8?.version === '8.0' && window.PasarChatCommerceV8,
      'Commerce Chat V8'
    ).catch(error => { commercePromise = null; throw error; });
    return commercePromise;
  }

  function ensureV7() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([ensureStyle(), ensureScript()])
      .then(async ([, module]) => {
        await Promise.all([ensureConversationActions(), ensureCommerceChat()]);
        return module;
      })
      .catch(error => { loadPromise = null; throw error; });
    return loadPromise;
  }

  const selector = [
    '[data-action="messages"]',
    '[data-social-action="message-user"]',
    '[data-social-action="open-conversation"]'
  ].join(',');

  document.addEventListener('pointerdown', event => {
    if (event.target?.closest?.(selector)) ensureV7().catch(() => null);
  }, { capture: true, passive: true });

  document.addEventListener('focusin', event => {
    if (event.target?.closest?.(selector)) ensureV7().catch(() => null);
  }, true);

  document.addEventListener('click', event => {
    const target = event.target?.closest?.(selector);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    ensureV7().then(chat => {
      if (target.matches('[data-social-action="message-user"]')) {
        return chat.openWithUser(target.dataset.userId);
      }
      if (target.matches('[data-social-action="open-conversation"]')) {
        return chat.openConversation(target.dataset.conversationId);
      }
      return chat.openList();
    }).catch(error => {
      console.error('[Pasar UMKM] Chat bootstrap error:', error);
      window.showToast?.('Pesan belum dapat dibuka.');
    });
  }, true);

  window.ensurePasarChatV7 = ensureV7;
  window.__PUMKM_CHAT_V6_DIAGNOSTICS__ = {
    version: 'retired',
    renderer: 'chat-v7-bootstrap',
    legacyThreadPollSuppressed: true,
    mutationObserver: false,
    conversationLongPress: 'chat-conversation-actions-v7',
    commerceBridge: 'chat-commerce-v8'
  };
})();