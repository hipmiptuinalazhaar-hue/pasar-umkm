from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# Remove the legacy message-action implementation now shadowed by the hardened handler.
chat_management_path = Path("src/chat-management-api.js")
text = chat_management_path.read_text(encoding="utf-8")

fn_start = text.find("async function messageAction(sql, request, messageId) {")
if fn_start == -1:
    raise SystemExit("legacy messageAction function not found")
fn_end = text.find("\nexport async function handleChatManagementApi", fn_start)
if fn_end == -1:
    raise SystemExit("chat management export marker not found")
text = text[:fn_start] + text[fn_end + 1:]

route_block = '''    const messageActionMatch = url.pathname.match(
      /^\\/api\\/chat\\/messages\\/([0-9a-f-]{36})\\/action$/i
    );
    if (messageActionMatch && request.method === "POST") {
      const messageId = uuid(messageActionMatch[1]);
      if (!messageId) return error("Pesan tidak valid.", 400);
      return await messageAction(sql, request, messageId);
    }

'''
if text.count(route_block) != 1:
    raise SystemExit(f"legacy message action route count={text.count(route_block)}")
text = text.replace(route_block, "", 1)

for forbidden in [
    "async function messageAction(",
    "messageActionMatch",
    "return await messageAction(",
]:
    if forbidden in text:
        raise SystemExit(f"legacy message-action marker remains: {forbidden}")

chat_management_path.write_text(text, encoding="utf-8")


# Preserve HTTP status on client errors so cleanup can distinguish an already-referenced asset (409).
client_path = Path("js/chat-media-experience.js")
client = client_path.read_text(encoding="utf-8")
old_error = '''    if (!response.ok || data.ok !== true) {
      throw new Error(data.error || 'Aksi chat belum dapat diproses.');
    }

    return data;
'''
new_error = '''    if (!response.ok || data.ok !== true) {
      const error = new Error(data.error || 'Aksi chat belum dapat diproses.');
      error.status = response.status;
      throw error;
    }

    return data;
'''
client = replace_once(client, old_error, new_error, "chat media json status")

old_camera = "cameraInput.accept = 'image/*';"
new_camera = "cameraInput.accept = 'image/jpeg,image/png,image/webp';"
client = replace_once(client, old_camera, new_camera, "camera accepted formats")

client_path.write_text(client, encoding="utf-8")
