from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# ------------------------------------------------------------------
# P4.3: tombstone deleted comment parents without offering actions.
# ------------------------------------------------------------------
app_path = Path("js/app.js")
app = app_path.read_text(encoding="utf-8")

old_avatar = """      const avatar =
        comment.user_avatar ||
        ASSETS.logo;


      const canDeleteComment =
        Boolean(
          STATE.user &&
"""
new_avatar = """      const isDeleted =
        Boolean(
          comment.is_deleted
        );

      const avatar =
        isDeleted
          ? ASSETS.logo
          : comment.user_avatar ||
            ASSETS.logo;


      const canDeleteComment =
        Boolean(
          !isDeleted &&
          STATE.user &&
"""
app = replace_once(app, old_avatar, new_avatar, "comment tombstone state")

old_name = """      const commentName =
        String(
          comment.user_name ||
          'Pengguna'
        );
"""
new_name = """      const commentName =
        isDeleted
          ? 'Komentar dihapus'
          : String(
              comment.user_name ||
              'Pengguna'
            );
"""
app = replace_once(app, old_name, new_name, "comment tombstone name")

old_reply_actions = """  ${
    STATE.user
      ? `
          <div class=\"post-comment-actions\">
"""
new_reply_actions = """  ${
    STATE.user && !isDeleted
      ? `
          <div class=\"post-comment-actions\">
"""
app = replace_once(app, old_reply_actions, new_reply_actions, "comment tombstone actions")

app_path.write_text(app, encoding="utf-8")


# ------------------------------------------------------------------
# P4.4: bind uploads to a conversation and cleanup unused uploads.
# ------------------------------------------------------------------
chat_path = Path("js/chat-media-experience.js")
chat = chat_path.read_text(encoding="utf-8")

old_upload = """  async function uploadFile(file, kind) {
    if (!file || MEDIA.uploading) return null;
    MEDIA.uploading = true;

    try {
      const form = new FormData();
      form.append('file', file, file.name || (kind === 'audio' ? 'voice.webm' : 'chat.jpg'));
      form.append('kind', kind);

      const response = await fetch('/api/chat/media/upload', {
        method: 'POST',
        credentials: 'include',
        body: form
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || 'Media gagal diunggah.');
      }

      return data.media || null;
    } finally {
      MEDIA.uploading = false;
    }
  }

  async function sendRich(payload) {
    const conversationId = MEDIA.conversationId || await resolveConversationId();
    if (!conversationId) throw new Error('Percakapan belum tersedia.');

    const data = await jsonRequest(
      `/api/chat/conversations/${encodeURIComponent(conversationId)}/rich-message`,
      { method: 'POST', body: payload }
    );

    appendOptimisticMessage(data.message);
    scheduleRichSync();
    window.refreshSocialUnreadBadge?.();
    return data.message;
  }
"""
new_upload = """  async function uploadFile(file, kind) {
    if (!file || MEDIA.uploading) return null;

    const conversationId = MEDIA.conversationId || await resolveConversationId();
    if (!conversationId) throw new Error('Percakapan belum tersedia.');

    MEDIA.uploading = true;

    try {
      const form = new FormData();
      form.append('file', file, file.name || (kind === 'audio' ? 'voice.webm' : 'chat.jpg'));
      form.append('kind', kind);
      form.append('conversation_id', conversationId);

      const response = await fetch('/api/chat/media/upload', {
        method: 'POST',
        credentials: 'include',
        body: form
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || 'Media gagal diunggah.');
      }

      return data.media
        ? { ...data.media, conversation_id: conversationId }
        : null;
    } finally {
      MEDIA.uploading = false;
    }
  }

  async function cleanupUploadedMedia(media) {
    const conversationId = String(media?.conversation_id || '').trim();
    const mediaUrl = String(media?.url || '').trim();
    if (!conversationId || !mediaUrl) return;

    try {
      await jsonRequest('/api/chat/media/cleanup', {
        method: 'POST',
        body: {
          conversation_id: conversationId,
          media_url: mediaUrl
        }
      });
    } catch (error) {
      if (error?.status !== 409) {
        console.error('[Pasar UMKM] Unused chat media cleanup error:', error);
      }
    }
  }

  async function sendRich(payload, fixedConversationId = '') {
    const conversationId =
      String(fixedConversationId || '').trim() ||
      MEDIA.conversationId ||
      await resolveConversationId();
    if (!conversationId) throw new Error('Percakapan belum tersedia.');

    const data = await jsonRequest(
      `/api/chat/conversations/${encodeURIComponent(conversationId)}/rich-message`,
      { method: 'POST', body: payload }
    );

    appendOptimisticMessage(data.message);
    scheduleRichSync();
    window.refreshSocialUnreadBadge?.();
    return data.message;
  }
"""
chat = replace_once(chat, old_upload, new_upload, "conversation-bound media upload")

old_image = """  async function handleImage(file) {
    if (!file) return;

    try {
      toast('Mengunggah foto...');
      const media = await uploadFile(file, 'image');
      if (!media?.url) throw new Error('Foto gagal diunggah.');

      await sendRich({
        type: 'image',
        media_url: media.url,
        media_name: media.original_filename || file.name || 'Foto'
      });
      toast('Foto terkirim.');
    } catch (error) {
      toast(error.message || 'Foto belum dapat dikirim.');
    }
  }
"""
new_image = """  async function handleImage(file) {
    if (!file) return;

    let media = null;

    try {
      toast('Mengunggah foto...');
      media = await uploadFile(file, 'image');
      if (!media?.url) throw new Error('Foto gagal diunggah.');

      await sendRich({
        type: 'image',
        media_url: media.url,
        media_name: media.original_filename || file.name || 'Foto'
      }, media.conversation_id);
      toast('Foto terkirim.');
    } catch (error) {
      if (media?.url) await cleanupUploadedMedia(media);
      toast(error.message || 'Foto belum dapat dikirim.');
    }
  }
"""
chat = replace_once(chat, old_image, new_image, "image cleanup")

old_voice = """        try {
          toast('Mengirim voice note...');
          const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
          const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
          const media = await uploadFile(file, 'audio');
          if (!media?.url) throw new Error('Voice note gagal diunggah.');

          await sendRich({
            type: 'audio',
            media_url: media.url,
            media_name: file.name,
            duration_seconds: durationSeconds
          });
          toast('Voice note terkirim.');
        } catch (error) {
          toast(error.message || 'Voice note belum dapat dikirim.');
        }
"""
new_voice = """        let media = null;

        try {
          toast('Mengirim voice note...');
          const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
          const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
          media = await uploadFile(file, 'audio');
          if (!media?.url) throw new Error('Voice note gagal diunggah.');

          await sendRich({
            type: 'audio',
            media_url: media.url,
            media_name: file.name,
            duration_seconds: durationSeconds
          }, media.conversation_id);
          toast('Voice note terkirim.');
        } catch (error) {
          if (media?.url) await cleanupUploadedMedia(media);
          toast(error.message || 'Voice note belum dapat dikirim.');
        }
"""
chat = replace_once(chat, old_voice, new_voice, "voice cleanup")

chat_path.write_text(chat, encoding="utf-8")
