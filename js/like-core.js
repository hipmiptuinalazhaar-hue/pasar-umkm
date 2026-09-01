'use strict';

/* =========================================================
   PASAR UMKM - PERSISTENT LIKE CORE
   Mengganti like lokal menjadi like server-side untuk postingan
   dan produk tanpa mengubah renderer besar app.js.
   Reels sengaja dilewati karena memakai endpoint engagement sendiri.
   ========================================================= */

(() => {
  if (
    typeof STATE === 'undefined' ||
    typeof DATA === 'undefined'
  ) {
    console.error(
      '[Pasar UMKM] Like core gagal dimuat: state aplikasi tidak tersedia.'
    );
    return;
  }

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const LIKE = {
    pending: new Set(),
    hydrationTimer: null,
    hydratedSignature: '',
    lastMediaTapPostId: '',
    lastMediaTapTime: 0
  };

  function getPost(postId) {
    if (typeof findPost === 'function') {
      return findPost(postId);
    }

    return Array.isArray(DATA.posts)
      ? DATA.posts.find(item =>
          String(item.id || '') === String(postId || '')
        )
      : null;
  }

  function resolveBackendTarget(postId) {
    const post = getPost(postId);

    if (!post || post.isReel === true) {
      return null;
    }

    if (post.product?.id) {
      const id = String(post.product.id || '').trim();

      if (!UUID_PATTERN.test(id)) {
        return null;
      }

      return {
        post,
        postId: String(postId),
        kind: 'product',
        id
      };
    }

    const id = String(
      post.backendId ||
      post.id ||
      ''
    )
      .replace(/^post-/, '')
      .trim();

    if (!UUID_PATTERN.test(id)) {
      return null;
    }

    return {
      post,
      postId: String(postId),
      kind: 'post',
      id
    };
  }

  async function api(path, options = {}) {
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

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(path, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok !== true) {
      const error = new Error(
        data.error ||
        'Like belum dapat diproses.'
      );

      error.status = response.status;
      throw error;
    }

    return data;
  }

  function currentActualCount(post, liked) {
    const base = Number(
      post.likesCount ||
      post.likes ||
      0
    );

    return Math.max(
      0,
      base + (liked ? 1 : 0)
    );
  }

  function applyLikeState(target, liked, actualCount) {
    const safeCount = Math.max(
      0,
      Number(actualCount || 0)
    );

    if (liked) {
      STATE.likedPosts.add(target.postId);
    } else {
      STATE.likedPosts.delete(target.postId);
    }

    target.post.likesCount = Math.max(
      0,
      safeCount - (liked ? 1 : 0)
    );

    if (typeof saveLocalState === 'function') {
      saveLocalState();
    }

    if (typeof refreshPostInteractionUI === 'function') {
      refreshPostInteractionUI(target.postId);
    }
  }

  async function setPersistentLike(
    postId,
    desiredLiked,
    options = {}
  ) {
    const target = resolveBackendTarget(postId);

    if (!target) {
      return;
    }

    if (!STATE.user) {
      if (typeof openLogin === 'function') {
        openLogin();
      } else if (typeof showToast === 'function') {
        showToast('Masuk terlebih dahulu untuk menyukai konten.');
      }
      return;
    }

    const pendingKey = `${target.kind}:${target.id}`;

    if (LIKE.pending.has(pendingKey)) {
      return;
    }

    const wasLiked = STATE.likedPosts.has(target.postId);
    const shouldLike = Boolean(desiredLiked);

    if (wasLiked === shouldLike && !options.forceRequest) {
      return;
    }

    const actualBefore = currentActualCount(
      target.post,
      wasLiked
    );

    const optimisticCount = Math.max(
      0,
      actualBefore +
      (shouldLike ? 1 : 0) -
      (wasLiked ? 1 : 0)
    );

    LIKE.pending.add(pendingKey);
    applyLikeState(
      target,
      shouldLike,
      optimisticCount
    );

    try {
      const data = await api(
        `/api/social/likes/${target.kind}/${encodeURIComponent(target.id)}`,
        {
          method: shouldLike
            ? 'POST'
            : 'DELETE'
        }
      );

      applyLikeState(
        target,
        Boolean(data.liked_by_me),
        Number(data.like_count || 0)
      );
    } catch (error) {
      console.error(
        '[Pasar UMKM] Persistent like error:',
        error
      );

      applyLikeState(
        target,
        wasLiked,
        actualBefore
      );

      if (
        error?.status === 401 &&
        typeof openLogin === 'function'
      ) {
        openLogin();
      } else if (
        !options.silent &&
        typeof showToast === 'function'
      ) {
        showToast(
          error?.message ||
          'Like belum dapat disimpan.'
        );
      }
    } finally {
      LIKE.pending.delete(pendingKey);
    }
  }

  async function togglePersistentLike(postId) {
    const liked = STATE.likedPosts.has(
      String(postId || '')
    );

    await setPersistentLike(
      postId,
      !liked
    );
  }

  function stateItems() {
    if (!Array.isArray(DATA.posts)) {
      return [];
    }

    const seen = new Set();
    const items = [];

    for (const post of DATA.posts) {
      const target = resolveBackendTarget(post.id);

      if (!target) {
        continue;
      }

      const key = `${target.kind}:${target.id}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      items.push({
        kind: target.kind,
        id: target.id
      });
    }

    return items;
  }

  function stateSignature(items) {
    return items
      .map(item => `${item.kind}:${item.id}`)
      .sort()
      .join('|');
  }

  async function hydratePersistentLikes(options = {}) {
    const items = stateItems();

    if (!items.length) {
      return false;
    }

    const signature = stateSignature(items);

    if (
      signature === LIKE.hydratedSignature &&
      options.force !== true
    ) {
      return true;
    }

    try {
      const data = await api(
        '/api/social/likes/state',
        {
          method: 'POST',
          body: {
            items
          }
        }
      );

      for (const item of data.items || []) {
        const post = DATA.posts.find(candidate => {
          const target = resolveBackendTarget(candidate.id);

          return Boolean(
            target &&
            target.kind === item.kind &&
            String(target.id) === String(item.id)
          );
        });

        if (!post) {
          continue;
        }

        const target = resolveBackendTarget(post.id);

        if (!target) {
          continue;
        }

        applyLikeState(
          target,
          Boolean(item.liked_by_me),
          Number(item.like_count || 0)
        );
      }

      LIKE.hydratedSignature = signature;
      return true;
    } catch (error) {
      console.error(
        '[Pasar UMKM] Like hydration error:',
        error
      );
      return false;
    }
  }

  async function waitAndHydrate() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (
        Array.isArray(DATA.posts) &&
        DATA.posts.length > 0 &&
        !STATE.loading
      ) {
        await hydratePersistentLikes({ force: true });
        return;
      }

      await new Promise(resolve =>
        setTimeout(resolve, 120)
      );
    }
  }

  function handleLikeButton(event) {
    const button = event.target.closest(
      '[data-action="like"]'
    );

    if (!button) {
      return false;
    }

    const card = button.closest(
      '.post-card[data-post-id]'
    );

    const postId = String(
      card?.dataset?.postId ||
      button.dataset.postId ||
      ''
    );

    if (!postId || !resolveBackendTarget(postId)) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    togglePersistentLike(postId);
    return true;
  }

  function handleMediaTap(event) {
    const media = event.target.closest(
      '.post-card .ig-product-media, ' +
      '.post-card .post-media:not(.video)'
    );

    if (!media) {
      return;
    }

    const card = media.closest(
      '.post-card[data-post-id]'
    );

    const postId = String(
      card?.dataset?.postId || ''
    );

    if (!postId || !resolveBackendTarget(postId)) {
      return;
    }

    const now = Date.now();
    const isDoubleTap =
      LIKE.lastMediaTapPostId === postId &&
      (now - LIKE.lastMediaTapTime) <= 320;

    LIKE.lastMediaTapPostId = postId;
    LIKE.lastMediaTapTime = now;

    if (!isDoubleTap) {
      return;
    }

    LIKE.lastMediaTapPostId = '';
    LIKE.lastMediaTapTime = 0;

    if (!STATE.likedPosts.has(postId)) {
      setPersistentLike(
        postId,
        true,
        {
          silent: true
        }
      );
    }
  }

  document.addEventListener(
    'click',
    event => {
      if (handleLikeButton(event)) {
        return;
      }

      handleMediaTap(event);
    },
    true
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) {
        hydratePersistentLikes({ force: true });
      }
    }
  );

  window.hydratePersistentLikes =
    hydratePersistentLikes;

  window.togglePersistentLike =
    togglePersistentLike;

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => setTimeout(waitAndHydrate, 0),
      { once: true }
    );
  } else {
    setTimeout(waitAndHydrate, 0);
  }
})();
