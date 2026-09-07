import { neon } from "@neondatabase/serverless";
import { normalizeStoreCommerceSettings, publicCommerceOptions } from "./commerce-fulfillment-helpers.js";
import { handleCartCheckoutV2Api } from "./cart-checkout-v2-api.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store"}})}
function error(message,status=400){return json({ok:false,error:message},status)}
function cookie(request,name){const header=request.headers.get('Cookie');if(!header)return null;for(const item of header.split(';')){const [key,...value]=item.trim().split('=');if(key===name)return value.join('=')||null}return null}
function uuid(value){const id=String(value||'').trim().toLowerCase();return UUID_PATTERN.test(id)?id:null}

async function user(sql,request){const token=cookie(request,SESSION_COOKIE);if(!token)return null;const rows=await sql`
  SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id
  WHERE s.token_hash=encode(digest(${token},'sha256'),'hex') AND s.expires_at>NOW() AND u.is_active=TRUE LIMIT 1
`;return rows[0]||null}

export async function handleCheckoutCommercePreferenceApi(request,env){
  const url=new URL(request.url);

  // Cart + Checkout V2 lives behind the established commerce boundary so the
  // Worker routing order remains deterministic: preferences/V2 -> fulfillment -> Orders V2.
  const v2Response=await handleCartCheckoutV2Api(request,env);
  if(v2Response)return v2Response;

  if(url.pathname!=='/api/commerce/checkout/preferences')return null;
  if(request.method!=='PUT')return error('Metode tidak diizinkan.',405);
  try{
    const sql=neon(env.DATABASE_URL);
    const auth=await user(sql,request);if(!auth)return error('Silakan masuk terlebih dahulu.',401);
    const body=await request.json().catch(()=>null);
    const preferences=Array.isArray(body?.preferences)?body.preferences.slice(0,20):[];
    if(!preferences.length)return error('Pilihan checkout belum tersedia.',400);

    const cartStores=await sql`
      SELECT DISTINCT p.store_id
      FROM carts c JOIN cart_items ci ON ci.cart_id=c.id JOIN products p ON p.id=ci.product_id JOIN stores s ON s.id=p.store_id
      WHERE c.user_id=${auth.id} AND p.is_active=TRUE AND s.is_active=TRUE
    `;
    const allowedStores=new Set(cartStores.map(row=>String(row.store_id)));
    if(!allowedStores.size)return error('Keranjang masih kosong.',409);

    const saved=[];
    const seen=new Set();
    for(const item of preferences){
      const storeId=uuid(item?.store_id);
      if(!storeId||!allowedStores.has(storeId))return error('Pilihan checkout memuat toko yang tidak ada di keranjang.',400);
      if(seen.has(storeId))return error('Pilihan checkout memuat toko yang sama lebih dari sekali.',400);
      seen.add(storeId);
      const rows=await sql`SELECT * FROM store_commerce_settings WHERE store_id=${storeId}::uuid LIMIT 1`;
      const settings=normalizeStoreCommerceSettings({store_id:storeId,...(rows[0]||{})});
      const options=publicCommerceOptions(settings);
      const fulfillment=String(item?.fulfillment_method||'').trim().toLowerCase();
      const payment=String(item?.payment_method||'').trim().toLowerCase();
      if(!options.fulfillment_methods.includes(fulfillment))return error('Metode pemenuhan tidak tersedia di salah satu UMKM.',409);
      if(!options.payment_methods.includes(payment))return error('Metode pembayaran tidak tersedia di salah satu UMKM.',409);
      if(fulfillment==='pickup'&&payment==='cod')return error('COD tidak digunakan untuk ambil di toko.',400);
      if(fulfillment!=='pickup'&&payment==='pay_at_store')return error('Bayar di toko hanya tersedia untuk ambil di toko.',400);
      const district=String(item?.delivery_district||'').trim().slice(0,100)||null;
      const city=String(item?.delivery_city||'Lubuklinggau').trim().slice(0,100)||'Lubuklinggau';
      await sql`
        INSERT INTO checkout_commerce_preferences(buyer_id,store_id,fulfillment_method,payment_method,delivery_district,delivery_city,updated_at)
        VALUES(${auth.id},${storeId}::uuid,${fulfillment},${payment},${district},${city},NOW())
        ON CONFLICT(buyer_id,store_id) DO UPDATE SET
          fulfillment_method=EXCLUDED.fulfillment_method,
          payment_method=EXCLUDED.payment_method,
          delivery_district=EXCLUDED.delivery_district,
          delivery_city=EXCLUDED.delivery_city,
          updated_at=NOW()
      `;
      saved.push({store_id:storeId,fulfillment_method:fulfillment,payment_method:payment});
    }

    await sql`DELETE FROM checkout_commerce_preferences WHERE buyer_id=${auth.id} AND updated_at<NOW()-INTERVAL '60 minutes'`;
    return json({ok:true,count:saved.length,preferences:saved});
  }catch(err){console.error('P8 checkout preferences error:',err);return error(err?.message||'Pilihan checkout belum dapat disimpan.',500)}
}
