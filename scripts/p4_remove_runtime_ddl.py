from pathlib import Path
import re

FILES = {
    'src/chat-media-api.js': {
        'state_start': 'let richChatReady = false;',
        'state_end': 'function json(data, status = 200) {',
        'fn_start': 'async function ensureRichChatSchema(sql) {',
        'fn_end': 'async function currentUser(sql, request) {',
        'old_call': 'await ensureRichChatSchema(sql);',
    },
    'src/profile-media-api.js': {
        'state_start': 'let mediaTableReady = false;',
        'state_end': 'function getCookie(request, name) {',
        'fn_start': 'async function ensureProfileMediaTable(sql) {',
        'fn_end': 'async function getAuthenticatedUser(sql, request) {',
        'old_call': 'await ensureProfileMediaTable(sql);',
    },
    'src/chat-management-api.js': {
        'state_start': 'let chatSchemaReady = false;',
        'state_end': 'function json(data, status = 200) {',
        'fn_start': 'async function ensureChatSchema(sql) {',
        'fn_end': 'async function currentUser(sql, request) {',
        'old_call': 'await ensureChatSchema(sql);',
    },
}

IMPORT = 'import { ensureFunctionalityInfrastructure } from "./functionality-store.js";'

for filename, cfg in FILES.items():
    path = Path(filename)
    text = path.read_text(encoding='utf-8')

    neon_import = 'import { neon } from "@neondatabase/serverless";'
    if IMPORT not in text:
        if neon_import not in text:
            raise SystemExit(f'{filename}: neon import tidak ditemukan')
        text = text.replace(neon_import, neon_import + '\n' + IMPORT, 1)

    state_start = text.find(cfg['state_start'])
    if state_start != -1:
        state_end = text.find(cfg['state_end'], state_start)
        if state_end == -1:
            raise SystemExit(f'{filename}: state end marker tidak ditemukan')
        text = text[:state_start] + text[state_end:]

    fn_start = text.find(cfg['fn_start'])
    if fn_start != -1:
        fn_end = text.find(cfg['fn_end'], fn_start)
        if fn_end == -1:
            raise SystemExit(f'{filename}: ensure function end marker tidak ditemukan')
        text = text[:fn_start] + text[fn_end:]

    if cfg['old_call'] not in text:
        raise SystemExit(f"{filename}: call {cfg['old_call']} tidak ditemukan")
    text = text.replace(
        cfg['old_call'],
        'await ensureFunctionalityInfrastructure(sql);'
    )

    path.write_text(text, encoding='utf-8')

# Defense-in-depth audit: runtime source must not contain executable schema DDL.
ddl = re.compile(
    r'\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TRIGGER|FUNCTION|EXTENSION|VIEW|TYPE|SCHEMA)\b',
    re.IGNORECASE,
)
leftovers = []
for path in sorted(Path('src').glob('*.js')):
    text = path.read_text(encoding='utf-8')
    for match in ddl.finditer(text):
        line = text.count('\n', 0, match.start()) + 1
        excerpt = text[match.start():match.start() + 100].split('\n', 1)[0]
        leftovers.append(f'{path}:{line}: {excerpt}')

report = Path('audit/p4-runtime-ddl-leftovers.txt')
report.parent.mkdir(parents=True, exist_ok=True)
if leftovers:
    report.write_text('\n'.join(leftovers) + '\n', encoding='utf-8')
else:
    if report.exists():
        report.unlink()

print(f'Runtime DDL leftovers: {len(leftovers)}')
for item in leftovers:
    print(item)
