import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  hub: 'legal/index.html',
  privacy: 'legal/privasi.html',
  terms: 'legal/syarat-ketentuan.html',
  seller: 'legal/kebijakan-penjual.html',
  buyer: 'legal/kebijakan-pembeli.html',
  prohibited: 'legal/produk-terlarang.html',
  complaints: 'legal/pengaduan.html',
  css: 'legal/legal.css',
  about: 'js/about-experience-v2.js',
  aboutCss: 'css/about-experience-v2.css'
};

const errors = [];
const content = {};

function fail(message) { errors.push(message); }
function must(condition, message) { if (!condition) fail(message); }
function read(key) {
  const file = path.join(root, files[key]);
  if (!fs.existsSync(file)) { fail(`missing ${files[key]}`); return ''; }
  const text = fs.readFileSync(file, 'utf8');
  content[key] = text;
  return text;
}
function has(key, token, message = `${files[key]} missing ${token}`) {
  must(content[key]?.includes(token), message);
}
function bytes(key, max) {
  const size = Buffer.byteLength(content[key] || '');
  must(size <= max, `${files[key]} ${size}B exceeds ${max}B budget`);
}

for (const key of Object.keys(files)) read(key);

for (const key of ['hub','privacy','terms','seller','buyer','prohibited','complaints']) {
  has(key, '<html lang="id">');
  has(key, 'legal.css?v=1.0');
  has(key, '© 2026 Pasar UMKM');
  must(!/(TODO|TBD|LOREM|PLACEHOLDER)/i.test(content[key]), `${files[key]} contains placeholder copy`);
  bytes(key, 18000);
}
bytes('css', 9000);
bytes('about', 13000);
bytes('aboutCss', 12000);

for (const href of [
  './privasi.html','./syarat-ketentuan.html','./kebijakan-penjual.html',
  './kebijakan-pembeli.html','./produk-terlarang.html','./pengaduan.html'
]) has('hub', href, `legal hub missing ${href}`);

has('hub', 'Capryan Agusto, orang perseorangan', 'hub must disclose the operator');
has('hub', 'Lubuklinggau, Sumatera Selatan, Indonesia');
has('hub', 'tidak menyimpan dana pengguna');
has('hub', 'Nomor registrasi atau perizinan resmi hanya akan dicantumkan setelah benar-benar diterbitkan', 'hub must not imply unissued registration');

for (const token of ['Pengendali data','Hak pengguna','Cloudflare','Neon','Cloudinary','pemrosesan lintas batas','insiden pelindungan data']) has('privacy', token);
for (const token of ['platform digital yang mempertemukan pembeli','non-kustodial','tidak menyediakan dompet pengguna','tidak menahan dana dalam escrow','hukum Republik Indonesia']) has('terms', token);
for (const token of ['status verifikasi toko','transaksi selesai','rating pembelian terverifikasi','status produk unggulan','ketersediaan stok','Tidak ada boost berbayar tersembunyi','komisi, biaya layanan']) has('seller', token);
for (const token of ['Checkout hanya memproses produk yang dipilih','tidak menyimpan saldo atau dana transaksi','automated refund ledger','Hak konsumen']) has('buyer', token);
for (const token of ['Narkotika','Senjata api','Barang palsu','database pribadi','perjudian','Transaksi palsu']) has('prohibited', token);
for (const token of ['hipmiptuinalazhaar@gmail.com','Permintaan Data Pribadi','Nomor pesanan','tidak meminta OTP/password','/support/','Chat Customer Service']) has('complaints', token);

has('about', "version === '2.0'", 'About module must preserve V2 compatibility');
has('about', "version: '2.0'", 'About module public version must remain V2 compatible');
has('about', "revision: '2.2'", 'About module must expose support-enhanced Legal & Trust revision 2.2');
has('about', 'Penyelenggara platform');
has('about', '/support/');
has('about', 'Customer Service Pasar UMKM');
has('about', '/legal/index.html');
has('about', '/legal/privasi.html');
has('about', '/legal/pengaduan.html');
has('aboutCss', '.about-v2-legal');
has('aboutCss', '.about-v2-legal-links');

const forbiddenClaims = [
  /PSE\s+(?:sudah\s+)?terdaftar/i,
  /NIB\s+(?:sudah\s+)?terbit/i,
  /terdaftar\s+resmi\s+sebagai\s+PSE/i
];
for (const [key, text] of Object.entries(content)) {
  for (const pattern of forbiddenClaims) {
    must(!pattern.test(text), `${files[key]} contains unsupported legal-registration claim: ${pattern}`);
  }
}

if (errors.length) {
  console.error('\nLegal & Trust V1 validation failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Legal & Trust V1 validation passed');
console.log(' - 1 legal hub');
console.log(' - 6 user-facing policy pages');
console.log(' - operator disclosure and in-app support channel');
console.log(' - non-custodial commerce disclosure');
console.log(' - seller ranking transparency');
console.log(' - no unsupported PSE/NIB registration claim');
