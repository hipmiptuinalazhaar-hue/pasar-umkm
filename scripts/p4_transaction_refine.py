from pathlib import Path

path = Path('src/functionality-api.js')
text = path.read_text(encoding='utf-8')

if text.count('FOR UPDATE OF p, s') != 1:
    raise SystemExit('Expected exactly one product/store lock')
text = text.replace('FOR UPDATE OF p, s', 'FOR UPDATE OF p', 1)

if text.count('FOR UPDATE OF o, s') != 1:
    raise SystemExit('Expected exactly one order/store lock')
text = text.replace('FOR UPDATE OF o, s', 'FOR UPDATE OF o', 1)

old_ordering = '''          WHERE order_id = $1::uuid
          ORDER BY created_at ASC, id ASC
'''
new_ordering = '''          WHERE order_id = $1::uuid
          ORDER BY product_id ASC NULLS LAST, id ASC
'''
if old_ordering not in text:
    raise SystemExit('Order item locking order marker not found')
text = text.replace(old_ordering, new_ordering, 1)

checkout_start = text.index('async function checkoutCart(')
insert_start = text.index('        const insertedOrder = await client.query(', checkout_start)
insert_end = text.index('        const order = insertedOrder.rows[0];', insert_start)
old_segment = text[insert_start:insert_end]

new_segment = r'''        const insertedOrder = await client.query(
          `
            INSERT INTO orders (
              order_number,
              buyer_id,
              store_id,
              status,
              subtotal,
              delivery_fee,
              total,
              customer_name,
              customer_phone,
              delivery_address,
              notes
            )
            VALUES (
              $1,
              $2::uuid,
              $3::uuid,
              'pending',
              $4,
              0,
              $4,
              $5,
              $6,
              $7,
              $8
            )
            RETURNING *
          `,
          [
            number,
            auth.user.id,
            storeId,
            subtotal,
            customerName,
            customerPhone,
            deliveryAddress,
            notes || null
          ]
        );

'''
text = text[:insert_start] + new_segment + text[insert_end:]

order_id_line = '        const orderId = crypto.randomUUID();\n'
if order_id_line not in text:
    raise SystemExit('Manual order ID line not found')
text = text.replace(order_id_line, '', 1)

if 'FOR UPDATE OF p, s' in text or 'FOR UPDATE OF o, s' in text:
    raise SystemExit('Store row locks still present')
if 'const orderId = crypto.randomUUID();' in text:
    raise SystemExit('Manual order ID still present')

path.write_text(text, encoding='utf-8')
