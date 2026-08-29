-- =========================================================
-- PASAR UMKM LUBUKLINGGAU
-- Database Schema v1.0
-- PostgreSQL / Neon
-- =========================================================


-- =========================================================
-- EXTENSIONS
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =========================================================
-- ENUM TYPES
-- =========================================================

DO $$
BEGIN
    CREATE TYPE user_role AS ENUM (
        'buyer',
        'seller',
        'admin'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
    CREATE TYPE store_verification_status AS ENUM (
        'pending',
        'verified',
        'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
    CREATE TYPE order_status AS ENUM (
        'pending',
        'confirmed',
        'processing',
        'ready',
        'completed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
    CREATE TYPE notification_type AS ENUM (
        'system',
        'order',
        'product',
        'message',
        'store'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;



-- =========================================================
-- USERS
-- =========================================================

CREATE TABLE IF NOT EXISTS users (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,

    email VARCHAR(255) NOT NULL UNIQUE,

    phone VARCHAR(30),

    password_hash TEXT NOT NULL,

    avatar_url TEXT,

    role user_role NOT NULL
        DEFAULT 'buyer',

    is_active BOOLEAN NOT NULL
        DEFAULT TRUE,

    email_verified BOOLEAN NOT NULL
        DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    last_login_at TIMESTAMPTZ

);



-- =========================================================
-- USER SESSIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS sessions (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    token_hash TEXT NOT NULL UNIQUE,

    expires_at TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    last_used_at TIMESTAMPTZ
        DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS idx_sessions_user_id
ON sessions(user_id);


CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
ON sessions(token_hash);



-- =========================================================
-- CATEGORIES
-- =========================================================

CREATE TABLE IF NOT EXISTS categories (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    name VARCHAR(80) NOT NULL UNIQUE,

    slug VARCHAR(80) NOT NULL UNIQUE,

    icon VARCHAR(80),

    sort_order INTEGER NOT NULL
        DEFAULT 0,

    is_home BOOLEAN NOT NULL
        DEFAULT FALSE,

    is_active BOOLEAN NOT NULL
        DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()

);



-- =========================================================
-- INITIAL CATEGORIES
-- Bukan data UMKM palsu.
-- Ini taxonomy resmi aplikasi.
-- =========================================================

INSERT INTO categories
(
    name,
    slug,
    icon,
    sort_order,
    is_home
)

VALUES

(
    'Kuliner',
    'kuliner',
    'fork-knife',
    1,
    TRUE
),

(
    'Fashion',
    'fashion',
    't-shirt',
    2,
    TRUE
),

(
    'Jasa',
    'jasa',
    'briefcase',
    3,
    TRUE
),

(
    'Finance',
    'finance',
    'wallet',
    4,
    TRUE
),

(
    'Kerajinan',
    'kerajinan',
    'paint-brush',
    5,
    FALSE
),

(
    'Kecantikan',
    'kecantikan',
    'sparkle',
    6,
    FALSE
),

(
    'Pertanian',
    'pertanian',
    'plant',
    7,
    FALSE
),

(
    'Otomotif',
    'otomotif',
    'car',
    8,
    FALSE
),

(
    'Elektronik',
    'elektronik',
    'device-mobile',
    9,
    FALSE
),

(
    'Rumah & Dekorasi',
    'rumah-dekorasi',
    'house-line',
    10,
    FALSE
),

(
    'Digital & Teknologi',
    'digital-teknologi',
    'laptop',
    11,
    FALSE
),

(
    'Lainnya',
    'lainnya',
    'dots-three-circle',
    12,
    FALSE
)

ON CONFLICT (slug)
DO NOTHING;



-- =========================================================
-- STORES / UMKM
-- =========================================================

CREATE TABLE IF NOT EXISTS stores (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    owner_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    category_id UUID
        REFERENCES categories(id)
        ON DELETE SET NULL,

    name VARCHAR(150) NOT NULL,

    slug VARCHAR(180) NOT NULL UNIQUE,

    description TEXT,

    logo_url TEXT,

    cover_url TEXT,

    phone VARCHAR(30),

    whatsapp VARCHAR(30),

    email VARCHAR(255),

    address TEXT,

    district VARCHAR(100),

    city VARCHAR(100)
        DEFAULT 'Lubuklinggau',

    province VARCHAR(100)
        DEFAULT 'Sumatera Selatan',

    latitude NUMERIC(10, 7),

    longitude NUMERIC(10, 7),

    verification_status
        store_verification_status
        NOT NULL
        DEFAULT 'pending',

    verified_at TIMESTAMPTZ,

    is_active BOOLEAN NOT NULL
        DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS idx_stores_owner
ON stores(owner_id);


CREATE INDEX IF NOT EXISTS idx_stores_category
ON stores(category_id);


CREATE INDEX IF NOT EXISTS idx_stores_verification
ON stores(verification_status);



-- =========================================================
-- PRODUCTS
-- =========================================================

CREATE TABLE IF NOT EXISTS products (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    store_id UUID NOT NULL
        REFERENCES stores(id)
        ON DELETE CASCADE,

    category_id UUID
        REFERENCES categories(id)
        ON DELETE SET NULL,

    name VARCHAR(180) NOT NULL,

    slug VARCHAR(220) NOT NULL,

    description TEXT,

    price NUMERIC(14, 2) NOT NULL
        CHECK (price >= 0),

    stock INTEGER NOT NULL
        DEFAULT 0
        CHECK (stock >= 0),

    unit VARCHAR(50),

    thumbnail_url TEXT,

    is_active BOOLEAN NOT NULL
        DEFAULT TRUE,

    is_featured BOOLEAN NOT NULL
        DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    UNIQUE(store_id, slug)

);


CREATE INDEX IF NOT EXISTS idx_products_store
ON products(store_id);


CREATE INDEX IF NOT EXISTS idx_products_category
ON products(category_id);


CREATE INDEX IF NOT EXISTS idx_products_created_at
ON products(created_at DESC);



-- =========================================================
-- PRODUCT IMAGES
-- =========================================================

CREATE TABLE IF NOT EXISTS product_images (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    product_id UUID NOT NULL
        REFERENCES products(id)
        ON DELETE CASCADE,

    image_url TEXT NOT NULL,

    sort_order INTEGER NOT NULL
        DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS idx_product_images_product
ON product_images(product_id);



-- =========================================================
-- POSTS / SOCIAL FEED
-- =========================================================

CREATE TABLE IF NOT EXISTS posts (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    store_id UUID NOT NULL
        REFERENCES stores(id)
        ON DELETE CASCADE,

    caption TEXT,

    image_url TEXT,

    is_active BOOLEAN NOT NULL
        DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS idx_posts_store
ON posts(store_id);


CREATE INDEX IF NOT EXISTS idx_posts_created
ON posts(created_at DESC);



-- =========================================================
-- POST PRODUCTS
-- Produk yang ditandai dalam postingan
-- =========================================================

CREATE TABLE IF NOT EXISTS post_products (

    post_id UUID NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,

    product_id UUID NOT NULL
        REFERENCES products(id)
        ON DELETE CASCADE,

    PRIMARY KEY (
        post_id,
        product_id
    )

);



-- =========================================================
-- LIKES
-- =========================================================

CREATE TABLE IF NOT EXISTS post_likes (

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    post_id UUID NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    PRIMARY KEY (
        user_id,
        post_id
    )

);



-- =========================================================
-- PRODUCT FAVORITES
-- =========================================================

CREATE TABLE IF NOT EXISTS favorites (

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    product_id UUID NOT NULL
        REFERENCES products(id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    PRIMARY KEY (
        user_id,
        product_id
    )

);



-- =========================================================
-- SHOPPING CART
-- =========================================================

CREATE TABLE IF NOT EXISTS carts (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL UNIQUE
        REFERENCES users(id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()

);



-- =========================================================
-- CART ITEMS
-- =========================================================

CREATE TABLE IF NOT EXISTS cart_items (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    cart_id UUID NOT NULL
        REFERENCES carts(id)
        ON DELETE CASCADE,

    product_id UUID NOT NULL
        REFERENCES products(id)
        ON DELETE CASCADE,

    quantity INTEGER NOT NULL
        DEFAULT 1
        CHECK (quantity > 0),

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    UNIQUE (
        cart_id,
        product_id
    )

);


CREATE INDEX IF NOT EXISTS idx_cart_items_cart
ON cart_items(cart_id);



-- =========================================================
-- ORDERS
-- =========================================================

CREATE TABLE IF NOT EXISTS orders (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    order_number VARCHAR(40)
        NOT NULL UNIQUE,

    buyer_id UUID NOT NULL
        REFERENCES users(id),

    store_id UUID NOT NULL
        REFERENCES stores(id),

    status order_status NOT NULL
        DEFAULT 'pending',

    subtotal NUMERIC(14, 2) NOT NULL
        DEFAULT 0,

    delivery_fee NUMERIC(14, 2) NOT NULL
        DEFAULT 0,

    total NUMERIC(14, 2) NOT NULL
        DEFAULT 0,

    customer_name VARCHAR(120),

    customer_phone VARCHAR(30),

    delivery_address TEXT,

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS idx_orders_buyer
ON orders(buyer_id);


CREATE INDEX IF NOT EXISTS idx_orders_store
ON orders(store_id);


CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);



-- =========================================================
-- ORDER ITEMS
-- Snapshot nama/harga disimpan agar histori pesanan
-- tidak berubah ketika produk diedit seller.
-- =========================================================

CREATE TABLE IF NOT EXISTS order_items (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    order_id UUID NOT NULL
        REFERENCES orders(id)
        ON DELETE CASCADE,

    product_id UUID
        REFERENCES products(id)
        ON DELETE SET NULL,

    product_name VARCHAR(180) NOT NULL,

    product_price NUMERIC(14, 2) NOT NULL,

    quantity INTEGER NOT NULL
        CHECK (quantity > 0),

    subtotal NUMERIC(14, 2) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS idx_order_items_order
ON order_items(order_id);



-- =========================================================
-- NOTIFICATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS notifications (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    type notification_type NOT NULL
        DEFAULT 'system',

    title VARCHAR(180) NOT NULL,

    message TEXT,

    target_type VARCHAR(50),

    target_id UUID,

    is_read BOOLEAN NOT NULL
        DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    read_at TIMESTAMPTZ

);


CREATE INDEX IF NOT EXISTS idx_notifications_user
ON notifications(user_id);


CREATE INDEX IF NOT EXISTS idx_notifications_unread
ON notifications(user_id, is_read);



-- =========================================================
-- CONVERSATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS conversations (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    buyer_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    store_id UUID NOT NULL
        REFERENCES stores(id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    UNIQUE (
        buyer_id,
        store_id
    )

);



-- =========================================================
-- MESSAGES
-- =========================================================

CREATE TABLE IF NOT EXISTS messages (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    conversation_id UUID NOT NULL
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    sender_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    message TEXT NOT NULL,

    is_read BOOLEAN NOT NULL
        DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    read_at TIMESTAMPTZ

);


CREATE INDEX IF NOT EXISTS idx_messages_conversation
ON messages(conversation_id, created_at);



-- =========================================================
-- UPDATED_AT FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION set_updated_at()

RETURNS TRIGGER AS $$

BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;

$$ LANGUAGE plpgsql;



-- =========================================================
-- UPDATED_AT TRIGGERS
-- =========================================================

DROP TRIGGER IF EXISTS users_updated_at
ON users;

CREATE TRIGGER users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();



DROP TRIGGER IF EXISTS stores_updated_at
ON stores;

CREATE TRIGGER stores_updated_at
BEFORE UPDATE ON stores
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();



DROP TRIGGER IF EXISTS products_updated_at
ON products;

CREATE TRIGGER products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();



DROP TRIGGER IF EXISTS posts_updated_at
ON posts;

CREATE TRIGGER posts_updated_at
BEFORE UPDATE ON posts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();



DROP TRIGGER IF EXISTS carts_updated_at
ON carts;

CREATE TRIGGER carts_updated_at
BEFORE UPDATE ON carts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();



DROP TRIGGER IF EXISTS cart_items_updated_at
ON cart_items;

CREATE TRIGGER cart_items_updated_at
BEFORE UPDATE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();



DROP TRIGGER IF EXISTS orders_updated_at
ON orders;

CREATE TRIGGER orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();



DROP TRIGGER IF EXISTS conversations_updated_at
ON conversations;

CREATE TRIGGER conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
