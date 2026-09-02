from pathlib import Path


def replace_once(path, old, new, label):
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


management = Path('src/chat-management-api.js')
replace_once(
    management,
    '''      ORDER BY dm.created_at DESC\n      LIMIT 200\n    ) recent\n    ORDER BY recent.created_at ASC\n''',
    '''      ORDER BY dm.created_at DESC, dm.id DESC\n      LIMIT 200\n    ) recent\n    ORDER BY recent.created_at ASC, recent.id ASC\n''',
    'getMessages deterministic latest window'
)

replace_once(
    management,
    '''  const messages = await sql`\n    SELECT\n      dm.id,\n      dm.sender_id,\n      dm.created_at\n    FROM direct_messages dm\n    LEFT JOIN direct_message_user_state mus\n      ON mus.message_id = dm.id AND mus.user_id = ${auth.user.id}\n    WHERE\n      dm.conversation_id = ${conversationId}::uuid\n      AND COALESCE(mus.is_hidden, FALSE) = FALSE\n      AND (${conversation.hidden_before}::timestamptz IS NULL OR dm.created_at > ${conversation.hidden_before}::timestamptz)\n    ORDER BY dm.created_at ASC\n    LIMIT 200\n  `;\n''',
    '''  const messages = await sql`\n    SELECT * FROM (\n      SELECT\n        dm.id,\n        dm.sender_id,\n        dm.created_at\n      FROM direct_messages dm\n      LEFT JOIN direct_message_user_state mus\n        ON mus.message_id = dm.id AND mus.user_id = ${auth.user.id}\n      WHERE\n        dm.conversation_id = ${conversationId}::uuid\n        AND COALESCE(mus.is_hidden, FALSE) = FALSE\n        AND (${conversation.hidden_before}::timestamptz IS NULL OR dm.created_at > ${conversation.hidden_before}::timestamptz)\n      ORDER BY dm.created_at DESC, dm.id DESC\n      LIMIT 200\n    ) recent\n    ORDER BY recent.created_at ASC, recent.id ASC\n  `;\n''',
    'messageMeta latest window'
)

rich = Path('src/chat-media-api-v2.js')
replace_once(
    rich,
    '''  const messages = await sql`\n    SELECT\n      dm.id,\n      dm.sender_id,\n      dm.message,\n      dm.message_type,\n      dm.media_url,\n      dm.media_name,\n      dm.media_duration_seconds,\n      dm.latitude,\n      dm.longitude,\n      dm.created_at,\n      dm.is_read,\n      dm.read_at\n    FROM direct_messages dm\n    LEFT JOIN direct_message_user_state mus\n      ON mus.message_id = dm.id AND mus.user_id = ${user.id}\n    LEFT JOIN direct_conversation_user_state cs\n      ON cs.conversation_id = dm.conversation_id AND cs.user_id = ${user.id}\n    WHERE\n      dm.conversation_id = ${conversationId}::uuid\n      AND COALESCE(mus.is_hidden, FALSE) = FALSE\n      AND (cs.hidden_before IS NULL OR dm.created_at > cs.hidden_before)\n    ORDER BY dm.created_at ASC, dm.id ASC\n    LIMIT 200\n  `;\n''',
    '''  const messages = await sql`\n    SELECT * FROM (\n      SELECT\n        dm.id,\n        dm.sender_id,\n        dm.message,\n        dm.message_type,\n        dm.media_url,\n        dm.media_name,\n        dm.media_duration_seconds,\n        dm.latitude,\n        dm.longitude,\n        dm.created_at,\n        dm.is_read,\n        dm.read_at\n      FROM direct_messages dm\n      LEFT JOIN direct_message_user_state mus\n        ON mus.message_id = dm.id AND mus.user_id = ${user.id}\n      LEFT JOIN direct_conversation_user_state cs\n        ON cs.conversation_id = dm.conversation_id AND cs.user_id = ${user.id}\n      WHERE\n        dm.conversation_id = ${conversationId}::uuid\n        AND COALESCE(mus.is_hidden, FALSE) = FALSE\n        AND (cs.hidden_before IS NULL OR dm.created_at > cs.hidden_before)\n      ORDER BY dm.created_at DESC, dm.id DESC\n      LIMIT 200\n    ) recent\n    ORDER BY recent.created_at ASC, recent.id ASC\n  `;\n''',
    'richMeta latest window'
)

print('P4.9 chat latest-window patch applied successfully.')
