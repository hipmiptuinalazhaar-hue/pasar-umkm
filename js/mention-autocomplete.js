'use strict';

(() => {
  const STATE_MENTION = {
    timer: null,
    sequence: 0,
    activeTextarea: null,
    activeRange: null
  };

  function esc(value) {
    return typeof escapeHTML === 'function'
      ? escapeHTML(String(value ?? ''))
      : String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
  }

  function isCaption(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) return false;

    return [
      'postCreateCaption',
      'reelCaption'
    ].includes(textarea.id) ||
      textarea.closest('#postCreateForm, #reelCreateForm');
  }

  function wrapperFor(textarea) {
    let wrapper = textarea.closest('.mention-autocomplete');

    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'mention-autocomplete';
      textarea.parentNode?.insertBefore(wrapper, textarea);
      wrapper.appendChild(textarea);
    }

    return wrapper;
  }

  function closeSuggestions() {
    document.querySelectorAll('.mention-suggestions').forEach(node => node.remove());
    STATE_MENTION.activeRange = null;
  }

  function activeMention(textarea) {
    const caret = textarea.selectionStart ?? textarea.value.length;
    const before = textarea.value.slice(0, caret);
    const match = before.match(/(?:^|\s)@([^@\n]{0,40})$/u);

    if (!match) return null;

    const query = String(match[1] || '').trimStart();
    const atIndex = before.lastIndexOf('@');

    if (atIndex < 0) return null;

    return {
      query,
      start: atIndex,
      end: caret
    };
  }

  function displayHandle(user) {
    return String(user.name || 'pengguna')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\p{L}\p{N}_.-]/gu, '')
      .slice(0, 60) || 'pengguna';
  }

  function renderSuggestions(textarea, users, range) {
    closeSuggestions();

    if (!users.length) return;

    const wrapper = wrapperFor(textarea);
    const panel = document.createElement('div');
    panel.className = 'mention-suggestions';
    panel.setAttribute('role', 'listbox');

    panel.innerHTML = users.slice(0, 8).map(user => {
      const handle = displayHandle(user);
      const avatar = String(user.avatar_url || '').trim();

      return `
        <button
          type="button"
          class="mention-suggestion"
          data-mention-user-id="${esc(user.id || '')}"
          data-mention-handle="${esc(handle)}"
          role="option"
        >
          <span class="mention-avatar">
            ${avatar
              ? `<img src="${esc(avatar)}" alt="">`
              : '<i class="ph ph-user"></i>'}
          </span>
          <span class="mention-copy">
            <strong>${esc(user.name || 'Pengguna')}</strong>
            <span>@${esc(handle)}${user.store_name ? ` · ${esc(user.store_name)}` : ''}</span>
          </span>
        </button>
      `;
    }).join('');

    wrapper.appendChild(panel);
    STATE_MENTION.activeTextarea = textarea;
    STATE_MENTION.activeRange = range;
  }

  async function searchUsers(textarea, range) {
    const sequence = ++STATE_MENTION.sequence;
    const query = String(range.query || '').trim();

    if (!query) {
      closeSuggestions();
      return;
    }

    try {
      const response = await fetch(
        `/api/commerce/search?q=${encodeURIComponent(query)}`,
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        }
      );

      const data = await response.json().catch(() => ({}));

      if (
        sequence !== STATE_MENTION.sequence ||
        !response.ok ||
        data.ok !== true
      ) {
        return;
      }

      const current = activeMention(textarea);
      if (!current || current.start !== range.start) return;

      const selfId = String(
        typeof STATE !== 'undefined' && STATE.user?.id
          ? STATE.user.id
          : ''
      );

      const users = (data.users || []).filter(user =>
        String(user.id || '') !== selfId
      );

      renderSuggestions(textarea, users, current);
    } catch (error) {
      console.error('[Pasar UMKM] Mention search error:', error);
    }
  }

  function onInput(event) {
    const textarea = event.target;
    if (!isCaption(textarea)) return;

    const range = activeMention(textarea);
    clearTimeout(STATE_MENTION.timer);

    if (!range) {
      closeSuggestions();
      return;
    }

    if (!range.query.trim()) {
      closeSuggestions();
      return;
    }

    STATE_MENTION.timer = setTimeout(
      () => searchUsers(textarea, range),
      180
    );
  }

  function chooseMention(button) {
    const textarea = STATE_MENTION.activeTextarea;
    const range = STATE_MENTION.activeRange;

    if (!textarea || !range) return;

    const handle = String(button.dataset.mentionHandle || '').trim();
    if (!handle) return;

    const value = textarea.value;
    const before = value.slice(0, range.start);
    const after = value.slice(range.end);
    const token = `@${handle} `;

    textarea.value = `${before}${token}${after}`;
    const caret = before.length + token.length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    closeSuggestions();
  }

  document.addEventListener('input', onInput, true);

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-mention-handle]');

    if (button) {
      event.preventDefault();
      event.stopPropagation();
      chooseMention(button);
      return;
    }

    if (!event.target.closest('.mention-autocomplete')) {
      closeSuggestions();
    }
  }, true);
})();
