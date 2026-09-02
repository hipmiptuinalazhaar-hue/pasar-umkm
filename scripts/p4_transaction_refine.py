from pathlib import Path

path = Path('src/functionality-api.js')
text = path.read_text(encoding='utf-8')

old_cart = r'''      const cartResult = await client.query(
        `
          INSERT INTO carts (user_id)
          VALUES ($1)
          ON CONFLICT (user_id)
          DO UPDATE SET updated_at = carts.updated_at
          RETURNING id
        `,
        [auth.user.id]
      );

      const cartId = cartResult.rows[0]?.id;
      if (!cartId) {
        throw transactionError("Keranjang belum dapat diproses.", 500);
      }
'''

new_cart = r'''      const cartResult = await client.query(
        `
          SELECT id
          FROM carts
          WHERE user_id = $1::uuid
          FOR UPDATE
        `,
        [auth.user.id]
      );

      const cartId = cartResult.rows[0]?.id;
      if (!cartId) {
        throw transactionError("Keranjang masih kosong.", 409);
      }
'''

if text.count(old_cart) != 1:
    raise SystemExit('Expected exactly one checkout cart lock block')

text = text.replace(old_cart, new_cart, 1)

required = [
    'FOR UPDATE OF p',
    'FOR UPDATE OF o',
    'ORDER BY product_id ASC NULLS LAST, id ASC',
    'await client.query("BEGIN")',
    'await client.query("COMMIT")',
    'await client.query("ROLLBACK")',
]
for marker in required:
    if marker not in text:
        raise SystemExit(f'Required transaction marker missing: {marker}')

for forbidden in [
    'FOR UPDATE OF p, s',
    'FOR UPDATE OF o, s',
    'const orderId = crypto.randomUUID();',
    'DO UPDATE SET updated_at = carts.updated_at',
]:
    if forbidden in text:
        raise SystemExit(f'Forbidden transaction marker remains: {forbidden}')

path.write_text(text, encoding='utf-8')
