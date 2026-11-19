const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const DB_PATH = path.join(__dirname, 'data', 'marketplace.sqlite');
let db;
function initDatabase() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    tuning TEXT NOT NULL DEFAULT '[]',
    seller_id TEXT NOT NULL DEFAULT '',
    seller_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    channel_id TEXT NOT NULL DEFAULT '',
    message_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_listing_created ON listings(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_listing_status ON listings(status);
  CREATE INDEX IF NOT EXISTS idx_listing_brand ON listings(brand);`);
  return db;
}
const conn=()=>db || initDatabase();
const clean=s=>String(s ?? '').trim();
function validateListing(data) {
  const brand=clean(data.brand).slice(0,60), model=clean(data.model).slice(0,80);
  const price=Number(data.price);
  if (!brand || !model || brand.length < 2 || model.length < 1) throw new Error('Márka és modell megadása kötelező.');
  if (!Number.isSafeInteger(price) || price < 1 || price > 999999999999) throw new Error('Az ár 1 és 999 999 999 999 közötti egész szám lehet.');
  const description=clean(data.description).slice(0,1000);
  const phone=clean(data.phone).slice(0,60);
  const image_url=clean(data.image_url).slice(0,1000);
  if (image_url && !/^https:\/\//i.test(image_url)) throw new Error('Csak HTTPS kép URL engedélyezett.');
  let tuning=data.tuning || [];
  if (typeof tuning === 'string') { try { tuning=JSON.parse(tuning); } catch { tuning=[]; } }
  if (!Array.isArray(tuning)) tuning=[];
  tuning=tuning.map(clean).filter(Boolean).slice(0,24).map(x=>x.slice(0,60));
  return {brand,model,price,description,phone,image_url,tuning};
}
function fromRow(row) {return row ? {...row,tuning:JSON.parse(row.tuning || '[]')} : null;}
function createListing(data) {
  const d=validateListing(data);
  const now=new Date().toISOString(), id=randomUUID();
  const row={id,...d,tuning:JSON.stringify(d.tuning),seller_id:clean(data.seller_id).slice(0,64),seller_name:clean(data.seller_name).slice(0,100),status:'active',channel_id:'',message_id:'',created_at:now,updated_at:now};
  conn().prepare(`INSERT INTO listings (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
  return getListing(id);
}
function getListing(id){return fromRow(conn().prepare('SELECT * FROM listings WHERE id=?').get(id));}
function listListings(filters={}) {
  let where=['1=1'], args={};
  if(filters.status && ['active','sold','removed'].includes(filters.status)) {where.push('status=@status'); args.status=filters.status;}
  else if(!filters.all) where.push("status='active'");
  if(filters.brand) {where.push('brand=@brand');args.brand=clean(filters.brand);}
  if(filters.query) {where.push('(brand LIKE @q OR model LIKE @q OR description LIKE @q)');args.q='%'+clean(filters.query).slice(0,80).replace(/[\\%_]/g,'\\$&')+'%';}
  if(filters.minPrice !== undefined && filters.minPrice !== ''){where.push('price>=@minPrice');args.minPrice=Number(filters.minPrice)||0;}
  if(filters.maxPrice !== undefined && filters.maxPrice !== ''){where.push('price<=@maxPrice');args.maxPrice=Number(filters.maxPrice)||0;}
  const sort = filters.sort==='price_asc' ? 'price ASC' : filters.sort==='price_desc' ? 'price DESC' : 'created_at DESC';
  const limit=Math.min(Math.max(Number(filters.limit)||40,1),100), offset=Math.max(Number(filters.offset)||0,0);
  const sql=where.join(' AND ');
  const total=conn().prepare(`SELECT COUNT(*) AS n FROM listings WHERE ${sql}`).get(args).n;
  const listings=conn().prepare(`SELECT * FROM listings WHERE ${sql} ORDER BY ${sort} LIMIT @limit OFFSET @offset`).all({...args,limit,offset}).map(fromRow);
  return {listings,total,limit,offset};
}
function updateListing(id,patch) {
  const old=getListing(id); if(!old) return null;
  const d=validateListing({...old,...patch});
  const status=['active','sold','removed'].includes(patch.status) ? patch.status : old.status;
  conn().prepare(`UPDATE listings SET brand=?,model=?,price=?,description=?,phone=?,image_url=?,tuning=?,status=?,updated_at=? WHERE id=?`)
    .run(d.brand,d.model,d.price,d.description,d.phone,d.image_url,JSON.stringify(d.tuning),status,new Date().toISOString(),id);
  return getListing(id);
}
function updateMessage(id,channel_id,message_id){conn().prepare('UPDATE listings SET channel_id=?,message_id=? WHERE id=?').run(channel_id,message_id,id);}
function stats(){const x=conn().prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active, SUM(CASE WHEN status='sold' THEN 1 ELSE 0 END) sold FROM listings`).get();return {total:x.total||0,active:x.active||0,sold:x.sold||0};}
module.exports={initDatabase,createListing,getListing,listListings,updateListing,updateMessage,stats};
