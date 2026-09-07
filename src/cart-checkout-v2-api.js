import { Client, neon } from "@neondatabase/serverless";

const SESSION_COOKIE="__Host-pasar_umkm_session";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SELECTED=100;
const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const error=(message,status=400,code="REQUEST_INVALID")=>json({ok:false,error:message,code},status);
const text=(value,max)=>{const v=String(value??'').trim();return v?v.slice(0,max):null};
const required=(value,min,max)=>{const v=String(value??'').trim().slice(0,max);return v.length>=min?v:null};
const uuid=value=>{const v=String(value||'').trim().toLowerCase();return UUID.test(v)?v:null};
function cookie(request,name){const h=request.headers.get('Cookie');if(!h)return null;for(const item of h.split(';')){const [key,...parts]=item.trim().split('=');if(key===name)return parts.join('=')||null}return null}
function coord(value,kind){if(value===null||value===undefined||value==='')return null;const n=Number(value);const ok=Number.isFinite(n)&&(kind==='lat'?n>=-90&&n<=90:n>=-180&&n<=180);return ok?Number(n.toFixed(6)):NaN}
function accuracy(value){if(value===null||value===undefined||value==='')return null;const n=Math.round(Number(value));return Number.isInteger(n)&&n>=0&&n<=100000?n:NaN}
async function authUser(sql,request){const token=cookie(request,SESSION_COOKIE);if(!token)return null;const rows=await sql`SELECT u.id,u.name,u.email,u.phone,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=encode(digest(${token},'sha256'),'hex') AND s.expires_at>NOW() AND u.is_active=TRUE LIMIT 1`;return rows[0]||null}
async function requireUser(sql,request){const user=await authUser(sql,request);return user?{user,response:null}:{user:null,response:error('Silakan masuk terlebih dahulu.',401,'AUTH_REQUIRED')}}

function addressInput(body,user={}){
  const recipient=required(body?.recipient_name??user.name,2,120);
  const phone=required(body?.phone??user.phone,5,30);
  const address=required(body?.address_text,5,1200);
  const latitude=coord(body?.latitude,'lat'),longitude=coord(body?.longitude,'lng'),accuracyM=accuracy(body?.accuracy_m);
  if(!recipient)throw Object.assign(new Error('Nama penerima belum valid.'),{status:400});
  if(!phone)throw Object.assign(new Error('Nomor penerima belum valid.'),{status:400});
  if(!address)throw Object.assign(new Error('Alamat belum valid.'),{status:400});
  if(Number.isNaN(latitude)||Number.isNaN(longitude)||(latitude===null)!==(longitude===null))throw Object.assign(new Error('Koordinat lokasi tidak valid.'),{status:400});
  if(Number.isNaN(accuracyM))throw Object.assign(new Error('Akurasi lokasi tidak valid.'),{status:400});
  return {label:text(body?.label,60)||'Rumah',recipient_name:recipient,phone,address_text:address,district:text(body?.district,100),city:text(body?.city,100)||'Lubuklinggau',province:text(body?.province,100)||'Sumatera Selatan',postal_code:text(body?.postal_code,20),landmark:text(body?.landmark,240),latitude,longitude,accuracy_m:accuracyM,is_default:body?.is_default!==false};
}

async function addressBook(request,env,url){
  if(!url.pathname.startsWith('/api/commerce/address-book'))return null;
  const sql=neon(env.DATABASE_URL),auth=await requireUser(sql,request);if(auth.response)return auth.response;
  const match=url.pathname.match(/^\/api\/commerce\/address-book\/([0-9a-f-]{36})$/i),id=match?uuid(match[1]):null;
  try{
    if(url.pathname==='/api/commerce/address-book'&&request.method==='GET'){
      const addresses=await sql`SELECT id,label,recipient_name,phone,address_text,district,city,province,postal_code,landmark,latitude,longitude,accuracy_m,is_default,created_at,updated_at FROM user_addresses WHERE user_id=${auth.user.id} ORDER BY is_default DESC,updated_at DESC,created_at DESC LIMIT 30`;
      return json({ok:true,count:addresses.length,addresses,default_address:addresses.find(item=>item.is_default)||addresses[0]||null});
    }
    if(url.pathname==='/api/commerce/address-book'&&request.method==='POST'){
      const body=await request.json().catch(()=>null);if(!body||typeof body!=='object')return error('Data alamat tidak valid.');
      const input=addressInput(body,auth.user);const count=await sql`SELECT COUNT(*)::int AS count FROM user_addresses WHERE user_id=${auth.user.id}`;const makeDefault=input.is_default||Number(count[0]?.count||0)===0;
      if(makeDefault)await sql`UPDATE user_addresses SET is_default=FALSE,updated_at=NOW() WHERE user_id=${auth.user.id} AND is_default=TRUE`;
      const rows=await sql`INSERT INTO user_addresses(user_id,label,recipient_name,phone,address_text,district,city,province,postal_code,landmark,latitude,longitude,accuracy_m,is_default,updated_at) VALUES(${auth.user.id},${input.label},${input.recipient_name},${input.phone},${input.address_text},${input.district},${input.city},${input.province},${input.postal_code},${input.landmark},${input.latitude},${input.longitude},${input.accuracy_m},${makeDefault},NOW()) RETURNING *`;
      return json({ok:true,address:rows[0]},201);
    }
    if(id&&request.method==='PATCH'){
      const owns=await sql`SELECT id FROM user_addresses WHERE id=${id}::uuid AND user_id=${auth.user.id} LIMIT 1`;if(!owns[0])return error('Alamat tidak ditemukan.',404,'ADDRESS_NOT_FOUND');
      const body=await request.json().catch(()=>null);if(!body||typeof body!=='object')return error('Data alamat tidak valid.');const input=addressInput(body,auth.user);
      if(input.is_default)await sql`UPDATE user_addresses SET is_default=FALSE,updated_at=NOW() WHERE user_id=${auth.user.id} AND id<>${id}::uuid AND is_default=TRUE`;
      const rows=await sql`UPDATE user_addresses SET label=${input.label},recipient_name=${input.recipient_name},phone=${input.phone},address_text=${input.address_text},district=${input.district},city=${input.city},province=${input.province},postal_code=${input.postal_code},landmark=${input.landmark},latitude=${input.latitude},longitude=${input.longitude},accuracy_m=${input.accuracy_m},is_default=${input.is_default},updated_at=NOW() WHERE id=${id}::uuid AND user_id=${auth.user.id} RETURNING *`;
      return json({ok:true,address:rows[0]});
    }
    if(id&&request.method==='DELETE'){
      const rows=await sql`DELETE FROM user_addresses WHERE id=${id}::uuid AND user_id=${auth.user.id} RETURNING id,is_default`;if(!rows[0])return error('Alamat tidak ditemukan.',404,'ADDRESS_NOT_FOUND');
      if(rows[0].is_default)await sql`UPDATE user_addresses SET is_default=TRUE,updated_at=NOW() WHERE id=(SELECT id FROM user_addresses WHERE user_id=${auth.user.id} ORDER BY updated_at DESC,created_at DESC LIMIT 1)`;
      return json({ok:true,deleted:true});
    }
    return error('Metode tidak diizinkan.',405,'METHOD_NOT_ALLOWED');
  }catch(cause){console.error('Cart Checkout V2 address error:',cause);return error(cause?.message||'Alamat belum dapat diproses.',Number.isInteger(cause?.status)?cause.status:500,'ADDRESS_ERROR')}
}

function orderNumber(){return`PUMKM-${Date.now().toString().slice(-10)}-${crypto.randomUUID().replace(/-/g,'').slice(0,6).toUpperCase()}`}
function txError(message,status=409,code='CHECKOUT_CONFLICT'){return Object.assign(new Error(message),{status,checkoutCode:code})}

async function selectiveCheckout(request,env,url){
  if(url.pathname!=='/api/commerce/checkout-v2')return null;
  if(request.method!=='POST')return error('Metode tidak diizinkan.',405,'METHOD_NOT_ALLOWED');
  const sql=neon(env.DATABASE_URL),auth=await requireUser(sql,request);if(auth.response)return auth.response;
  const body=await request.json().catch(()=>null);if(!body||typeof body!=='object')return error('Data checkout tidak valid.');
  const raw=Array.isArray(body.selected_product_ids)?body.selected_product_ids:[];const rawUnique=new Set(raw.map(value=>String(value||'').trim().toLowerCase()));const selected=[...new Set(raw.map(uuid).filter(Boolean))].slice(0,MAX_SELECTED);
  if(!selected.length)return error('Pilih minimal satu produk untuk checkout.',400,'NO_ITEMS_SELECTED');
  if(selected.length!==rawUnique.size||rawUnique.size>MAX_SELECTED)return error('Daftar produk checkout memuat ID yang tidak valid.',400,'INVALID_SELECTION');
  const customerName=required(body.customer_name??auth.user.name,2,120),customerPhone=required(body.customer_phone??auth.user.phone,5,30),typedAddress=text(body.delivery_address,1200),landmark=text(body.delivery_landmark,240);
  const latitude=coord(body.delivery_latitude,'lat'),longitude=coord(body.delivery_longitude,'lng'),accuracyM=accuracy(body.delivery_accuracy_m);const hasGps=latitude!==null&&longitude!==null;
  const notesByStore=body.notes_by_store&&typeof body.notes_by_store==='object'&&!Array.isArray(body.notes_by_store)?body.notes_by_store:{};
  if(!customerName)return error('Nama penerima belum valid.');if(!customerPhone)return error('Nomor penerima belum valid.');
  if(Number.isNaN(latitude)||Number.isNaN(longitude)||(latitude===null)!==(longitude===null))return error('Titik lokasi pengantaran tidak valid.');if(Number.isNaN(accuracyM))return error('Akurasi lokasi tidak valid.');
  const effectiveAddress=typedAddress||(hasGps?`Titik GPS: ${latitude}, ${longitude}`:null);

  const client=new Client({connectionString:env.DATABASE_URL});let active=false;
  try{
    await client.connect();await client.query('BEGIN');active=true;
    const cartResult=await client.query('SELECT id FROM carts WHERE user_id=$1::uuid FOR UPDATE',[auth.user.id]);const cartId=cartResult.rows[0]?.id;if(!cartId)throw txError('Keranjang masih kosong.',409,'CART_EMPTY');
    const itemResult=await client.query('SELECT id,product_id,quantity,created_at FROM cart_items WHERE cart_id=$1::uuid AND product_id=ANY($2::uuid[]) ORDER BY created_at ASC,id ASC FOR UPDATE',[cartId,selected]);if(itemResult.rows.length!==selected.length)throw txError('Ada produk pilihan yang sudah berubah atau tidak lagi ada di keranjang.',409,'SELECTION_STALE');
    const productResult=await client.query(`SELECT p.id,p.name,p.price,p.stock,p.store_id,p.is_active,s.name AS store_name,s.owner_id,s.is_active AS store_active FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=ANY($1::uuid[]) ORDER BY p.id ASC FOR UPDATE OF p`,[selected]);const products=new Map(productResult.rows.map(row=>[String(row.id),row]));const groups=new Map();
    for(const cartItem of itemResult.rows){const product=products.get(String(cartItem.product_id));if(!product||!product.is_active||!product.store_active)throw txError('Ada produk pilihan yang tidak lagi tersedia.',409,'PRODUCT_UNAVAILABLE');const quantity=Number(cartItem.quantity||0),stock=Number(product.stock||0),price=Number(product.price||0);if(!Number.isInteger(quantity)||quantity<1)throw txError('Jumlah produk di keranjang tidak valid.');if(quantity>stock)throw txError(`Stok ${product.name||'produk'} tidak mencukupi.`,409,'STOCK_CHANGED');const storeId=String(product.store_id);if(!groups.has(storeId))groups.set(storeId,[]);groups.get(storeId).push({product_id:product.id,name:product.name,price,quantity,owner_id:product.owner_id})}
    const storeIds=[...groups.keys()];const prefResult=await client.query(`SELECT buyer_id,store_id,fulfillment_method,payment_method,delivery_district,delivery_city FROM checkout_commerce_preferences WHERE buyer_id=$1::uuid AND store_id=ANY($2::uuid[]) AND updated_at>NOW()-INTERVAL '60 minutes' FOR UPDATE`,[auth.user.id,storeIds]);if(prefResult.rows.length!==storeIds.length)throw txError('Pilihan pengiriman atau pembayaran berubah. Periksa checkout kembali.',409,'PREFERENCE_REQUIRED');const prefs=new Map(prefResult.rows.map(row=>[String(row.store_id),row]));const needsDelivery=prefResult.rows.some(row=>row.fulfillment_method!=='pickup');if(needsDelivery&&!effectiveAddress)throw txError('Pesanan yang diantar membutuhkan alamat atau titik lokasi.',400,'ADDRESS_REQUIRED');
    const orders=[];
    for(const [storeId,items] of groups){const pref=prefs.get(storeId),subtotal=items.reduce((sum,item)=>sum+item.price*item.quantity,0),delivery=pref.fulfillment_method!=='pickup',orderNote=text(notesByStore[storeId],500);const inserted=await client.query(`INSERT INTO orders(order_number,buyer_id,store_id,status,subtotal,delivery_fee,total,customer_name,customer_phone,delivery_address,notes,delivery_latitude,delivery_longitude,delivery_accuracy_m,delivery_landmark) VALUES($1,$2::uuid,$3::uuid,'pending',$4,0,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[orderNumber(),auth.user.id,storeId,subtotal,customerName,customerPhone,delivery?effectiveAddress:'Ambil di toko',orderNote,delivery?latitude:null,delivery?longitude:null,delivery?accuracyM:null,delivery?landmark:null]);const order=inserted.rows[0];if(!order)throw txError('Pesanan gagal dibuat.',500,'ORDER_CREATE_FAILED');
      for(const item of items){const stock=await client.query('UPDATE products SET stock=stock-$1,updated_at=NOW() WHERE id=$2::uuid AND is_active=TRUE AND stock>=$1 RETURNING id,stock',[item.quantity,item.product_id]);if(!stock.rows[0])throw txError(`Stok ${item.name||'produk'} berubah. Periksa checkout kembali.`,409,'STOCK_CHANGED');await client.query('INSERT INTO order_items(order_id,product_id,product_name,product_price,quantity,subtotal) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6)',[order.id,item.product_id,String(item.name||'Produk'),item.price,item.quantity,item.price*item.quantity])}
      await client.query(`INSERT INTO notifications(user_id,type,title,message,target_type,target_id,actor_user_id,entity_type,entity_id,is_read,created_at) VALUES($1::uuid,'order','Pesanan baru',$2,'order',$3::uuid,$4::uuid,'order',$3::uuid,FALSE,NOW())`,[items[0].owner_id,`${auth.user.name||'Pembeli'} membuat pesanan ${order.order_number}.`,order.id,auth.user.id]);orders.push(order)}
    await client.query('DELETE FROM cart_items WHERE cart_id=$1::uuid AND product_id=ANY($2::uuid[])',[cartId,selected]);await client.query('COMMIT');active=false;return json({ok:true,message:'Pesanan berhasil dibuat.',count:orders.length,orders,checked_out_product_ids:selected},201);
  }catch(cause){if(active){try{await client.query('ROLLBACK')}catch(rollbackError){console.error('Cart Checkout V2 rollback failed:',rollbackError)}}if(cause?.code==='40001'||cause?.code==='40P01')return error('Checkout sedang diproses bersamaan. Silakan coba lagi.',409,'CHECKOUT_RETRY');console.error('Cart Checkout V2 transaction error:',cause);return error(cause?.message||'Checkout belum dapat diproses.',Number.isInteger(cause?.status)?cause.status:500,cause?.checkoutCode||'CHECKOUT_ERROR')}
  finally{try{await client.end()}catch(closeError){console.error('Cart Checkout V2 client close failed:',closeError)}}
}

export async function handleCartCheckoutV2Api(request,env){const url=new URL(request.url);const address=await addressBook(request,env,url);if(address)return address;return selectiveCheckout(request,env,url)}
