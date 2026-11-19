'use strict';
const Database=require('better-sqlite3');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {CARS,isCatalogCar}=require('./catalog');
const {FIELDS, options, toList, fromList}=require('./tuning');

const DATA_DIR=process.env.DATA_DIR||process.env.RAILWAY_VOLUME_MOUNT_PATH||path.join(__dirname,'data');
let db;
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const str=(x,max=200)=>String(x??'').trim().slice(0,max);
const int=(x,label,min=0,max=999999999999)=>{const n=Number(x);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`${label}: ${min}–${max} közötti egész szám kell.`);return n;};
const DEFAULT_PCT=()=>{const n=Number(process.env.BROKER_COMMISSION_PERCENT||15);return Number.isInteger(n)&&n>=1&&n<=50?n:15};
const needsVerify=()=>process.env.REQUIRE_IC_VERIFICATION!=='false';

function initDatabase(){
 fs.mkdirSync(DATA_DIR,{recursive:true});
 db=new Database(path.join(DATA_DIR,'marketplace.sqlite'));
 db.pragma('journal_mode = WAL');
 db.pragma('foreign_keys = ON');
 // Eredeti V11/V12 táblák megtartása; V13 kiegészítő oszlopokkal.
 db.exec(`
 CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,brand TEXT NOT NULL,model TEXT NOT NULL,price INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',image_url TEXT NOT NULL DEFAULT '',
  tuning TEXT NOT NULL DEFAULT '[]',seller_id TEXT NOT NULL DEFAULT '',seller_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',channel_id TEXT NOT NULL DEFAULT '',message_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,type TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',
  listing_id TEXT NOT NULL DEFAULT '',car_name TEXT NOT NULL DEFAULT '',requester_id TEXT NOT NULL DEFAULT '',
  requester_name TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',budget INTEGER NOT NULL DEFAULT 0,
  duration TEXT NOT NULL DEFAULT '',start_date TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',
  commission_pct INTEGER NOT NULL DEFAULT 0,source TEXT NOT NULL DEFAULT 'web',
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS ic_users (
  id TEXT PRIMARY KEY,ic_name TEXT NOT NULL,phone TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,verification_code TEXT NOT NULL,created_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS ic_sessions (
  token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES ic_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
 );
 CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
 CREATE INDEX IF NOT EXISTS idx_requests_date ON requests(created_at DESC);
 CREATE INDEX IF NOT EXISTS idx_ic_sessions_expire ON ic_sessions(expires_at);
 CREATE TABLE IF NOT EXISTS ic_uploads (
   filename TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES ic_users(id) ON DELETE CASCADE,
   created_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS idx_ic_uploads_owner ON ic_uploads(owner_user_id,created_at);
 `);
 const cols=new Set(db.pragma('table_info(listings)').map(x=>x.name));
 const extensions=[
  ['kind',"TEXT NOT NULL DEFAULT 'sale'"],['rent_period',"TEXT NOT NULL DEFAULT 'day'"],
  ['deposit','INTEGER NOT NULL DEFAULT 0'],['owner_user_id',"TEXT NOT NULL DEFAULT ''"],
  ['publication_mode',"TEXT NOT NULL DEFAULT 'private'"],
  ['approval_status',"TEXT NOT NULL DEFAULT 'approved'"],
  ['commission_pct','INTEGER NOT NULL DEFAULT 0']
 ];
 for(const [name,type] of extensions)if(!cols.has(name))db.exec(`ALTER TABLE listings ADD COLUMN ${name} ${type}`);
 db.exec('CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_user_id); CREATE INDEX IF NOT EXISTS idx_listings_approval ON listings(approval_status)');
 return db;
}
const conn=()=>db||initDatabase();
function publicUser(u){return u?{id:u.id,ic_name:u.ic_name,phone:u.phone,verified:!!u.verified,verification_code:u.verified?'':u.verification_code,created_at:u.created_at}:null}
function hashPassword(p){const salt=crypto.randomBytes(16).toString('hex');return `${salt}:${crypto.scryptSync(p,salt,64).toString('hex')}`}
function checkPassword(p,stored){const [salt,digest]=String(stored||'').split(':');if(!salt||!/^[a-f0-9]{128}$/.test(digest||''))return false;const received=crypto.scryptSync(p,salt,64);return crypto.timingSafeEqual(Buffer.from(digest,'hex'),received)}
function normalizePhone(s){const phone=str(s,35);if(!/^[+0-9][0-9+\- ]{4,29}$/.test(phone))throw Error('Érvényes, legalább 5 karakteres IC telefonszám szükséges.');return phone.replace(/[ \-]/g,'')}
function registerUser(input){
 const ic_name=str(input.ic_name,70),phone=normalizePhone(input.phone),password=String(input.password||'');
 if(ic_name.length<3||ic_name.length>70)throw Error('A karakter neve legalább 3 karakter legyen.');
 if(password.length<10||password.length>128)throw Error('A jelszó legalább 10, legfeljebb 128 karakter legyen.');
 if(conn().prepare('SELECT id FROM ic_users WHERE phone=?').get(phone))throw Error('Ez az IC telefonszám már regisztrálva van.');
 const uid=id(),code=crypto.randomInt(100000,999999).toString();
 conn().prepare('INSERT INTO ic_users (id,ic_name,phone,password_hash,verified,verification_code,created_at) VALUES (?,?,?,?,0,?,?)')
  .run(uid,ic_name,phone,hashPassword(password),code,now());
 return publicUser(getUser(uid));
}
const getUser=uid=>conn().prepare('SELECT * FROM ic_users WHERE id=?').get(uid)||null;
function loginUser(phone,password){let p;try{p=normalizePhone(phone)}catch{return null}const u=conn().prepare('SELECT * FROM ic_users WHERE phone=?').get(p);return u&&checkPassword(String(password||''),u.password_hash)?publicUser(u):null}
function createSession(userId){const token=crypto.randomBytes(32).toString('hex');conn().prepare('INSERT INTO ic_sessions VALUES (?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),userId,Date.now()+7*24*3600*1000);return token}
function findSession(token){if(!/^[a-f0-9]{64}$/.test(token||''))return null;const digest=crypto.createHash('sha256').update(token).digest('hex');const row=conn().prepare('SELECT user_id,expires_at FROM ic_sessions WHERE token_hash=?').get(digest);if(!row||row.expires_at<Date.now())return null;return publicUser(getUser(row.user_id))}
function removeSession(token){if(!token)return;conn().prepare('DELETE FROM ic_sessions WHERE token_hash=?').run(crypto.createHash('sha256').update(token).digest('hex'))}
function listUsers(){return conn().prepare('SELECT * FROM ic_users ORDER BY verified ASC,created_at DESC LIMIT 300').all().map(publicUser)}
function verifyUser(uid){const info=conn().prepare("UPDATE ic_users SET verified=1,verification_code='' WHERE id=?").run(uid);return info.changes?publicUser(getUser(uid)):null}
function deleteUnverifiedUser(uid){const r=conn().prepare('DELETE FROM ic_users WHERE id=? AND verified=0').run(uid);return r.changes>0}
function safeListing(r,{privateView=false}={}){if(!r)return null;const {channel_id,message_id,seller_id,...rest}=r;const data={...rest,tuning:JSON.parse(r.tuning||'[]')};if(!privateView)delete data.owner_user_id;return data}
function fullCar(input){const brand=str(input.brand,60),model=str(input.model,100);if(!isCatalogCar(brand,model))throw Error('Csak a V11 katalógusban lévő jármű választható.');return {brand,model}}
function validateListing(input){
 const car=fullCar(input);if(input.kind && input.kind!=='rental')throw Error('A portál kizárólag autóbérlésre használható.');const kind='rental';
 const publication_mode=input.publication_mode==='brokered'?'brokered':'private';
 const price=int(input.price,'Bérleti díj',1);
 const rent_period=['day','week','month'].includes(input.rent_period)?input.rent_period:'day';
 const deposit=int(input.deposit??0,'Kaució');
 const image_url=str(input.image_url,1000);
 if(image_url && !/^https:\/\/[^\s<>]+$/i.test(image_url) && !/^\/uploads\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(image_url))throw Error('Érvénytelen kép URL.');
 // V11 fokozatok, pontosan öt külön kategória. Régi rekordokban lista formátum marad.
 let src=input.tuning??[];if(typeof src==='string'){try{src=JSON.parse(src)}catch{src=[]}}
 const obj=Array.isArray(src)?fromList(src):src;
 const selected={};for(const [key] of FIELDS){const value=str(obj?.[key]||'Gyári',30);if(!options(key).includes(value))throw Error('Érvénytelen tuning: '+key);selected[key]=value}
 return {...car,kind,publication_mode,price,rent_period,deposit,image_url,
  description:str(input.description,1000),tuning:toList(selected)};
}
function getUploadDirectory(){return path.join(DATA_DIR,'uploads')}
function saveUploadOwnership(uid,filename){
 if(!getUser(uid))throw Error('Jelentkezz be a kép feltöltéséhez.');
 if(needsVerify()&&!getUser(uid).verified)throw Error('Az IC fiókod jóváhagyása szükséges a képfeltöltéshez.');
 if(!/^[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(filename))throw Error('Érvénytelen fájlnév.');
 const since=new Date(Date.now()-24*3600000).toISOString();
 const count=conn().prepare('SELECT COUNT(*) n FROM ic_uploads WHERE owner_user_id=? AND created_at>=?').get(uid,since).n;
 if(count>=15)throw Error('Maximum 15 képet tölthetsz fel 24 órán belül.');
 conn().prepare('INSERT INTO ic_uploads (filename,owner_user_id,created_at) VALUES (?,?,?)').run(filename,uid,now());
}
function assertOwnImage(uid,url){
 if(!url||!url.startsWith('/uploads/'))return;
 const filename=url.slice('/uploads/'.length);
 const record=conn().prepare('SELECT owner_user_id FROM ic_uploads WHERE filename=?').get(filename);
 if(!record||record.owner_user_id!==uid)throw Error('Csak a saját feltöltött képedet választhatod ki.');
}
function createOwnListing(uid,input){
 const user=getUser(uid);if(!user)throw Error('Nincs felhasználó.');if(needsVerify()&&!user.verified)throw Error('Előbb ellenőriztetned kell az IC telefonszámodat.');
 const d=validateListing(input);assertOwnImage(uid,d.image_url);const pending=d.publication_mode==='brokered',timestamp=now(),rid=id();
 conn().prepare(`INSERT INTO listings (id,brand,model,price,description,phone,image_url,tuning,seller_id,seller_name,status,channel_id,message_id,created_at,updated_at,kind,rent_period,deposit,owner_user_id,publication_mode,approval_status,commission_pct)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
 rid,d.brand,d.model,d.price,d.description,user.phone,d.image_url,JSON.stringify(d.tuning),'',user.ic_name,
 pending?'pending':'active','','',timestamp,timestamp,d.kind,d.rent_period,d.deposit,uid,
 d.publication_mode,pending?'pending':'approved',pending?DEFAULT_PCT():0
 );return getListing(rid,true);
}
function getListing(listingId,privateView=false){return safeListing(conn().prepare('SELECT * FROM listings WHERE id=?').get(listingId),{privateView})}
function listListings(filters={},admin=false){
 const clauses=["kind='rental'"];const params={};
 if(!admin){clauses.push("status IN ('active','rented')","approval_status='approved'")}
 else if(filters.status&&['active','pending','sold','rented','removed'].includes(filters.status)){clauses.push('status=@status');params.status=filters.status}
 if(['private','brokered'].includes(filters.mode)){clauses.push('publication_mode=@mode');params.mode=filters.mode}
 if(filters.query){clauses.push('(brand LIKE @query OR model LIKE @query)');params.query='%'+str(filters.query,60).replace(/[%_]/g,'')+'%'}
 const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
 const limit=Math.min(Math.max(Number(filters.limit)||24,1),100),offset=Math.max(Number(filters.offset)||0,0);
 const total=conn().prepare(`SELECT COUNT(*) AS n FROM listings ${where}`).get(params).n;
 const rows=conn().prepare(`SELECT * FROM listings ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`).all({...params,limit,offset});
 return {listings:rows.map(x=>safeListing(x,{privateView:admin})),total,limit,offset};
}
function myListings(uid){return conn().prepare("SELECT * FROM listings WHERE owner_user_id=? AND kind='rental' AND status!='removed' ORDER BY created_at DESC LIMIT 300").all(uid).map(x=>safeListing(x,{privateView:true}))}
function updateOwnListing(uid,lid,patch){
 const old=conn().prepare("SELECT * FROM listings WHERE id=? AND owner_user_id=? AND kind='rental'").get(lid,uid);if(!old)throw Error('Nem található a saját bérbeadási hirdetés.');
 if(patch.action==='withdraw'){
  conn().prepare("UPDATE listings SET status='removed',updated_at=? WHERE id=?").run(now(),lid);return getListing(lid,true)
 }
 if(patch.action==='rented'){
  if(old.status!=='active')throw Error('Csak aktív hirdetést lehet bérbe adottnak jelölni.');
  conn().prepare("UPDATE listings SET status='rented',updated_at=? WHERE id=?").run(now(),lid);return getListing(lid,true)
 }
 if(patch.action==='available'){
  if(old.status!=='rented'||old.approval_status!=='approved')throw Error('Csak jóváhagyott bérbe adott autó állítható elérhetőre.');
  conn().prepare("UPDATE listings SET status='active',updated_at=? WHERE id=?").run(now(),lid);return getListing(lid,true)
 }
 const d=validateListing({...old,tuning:old.tuning,...patch});assertOwnImage(uid,d.image_url);
 const needsApproval=d.publication_mode==='brokered'; // szerkesztett közvetített hirdetés újra jóváhagyandó
 conn().prepare(`UPDATE listings SET brand=?,model=?,price=?,description=?,image_url=?,tuning=?,kind=?,rent_period=?,deposit=?,publication_mode=?,approval_status=?,status=?,commission_pct=?,updated_at=? WHERE id=?`).run(
 d.brand,d.model,d.price,d.description,d.image_url,JSON.stringify(d.tuning),d.kind,d.rent_period,d.deposit,d.publication_mode,
 needsApproval?'pending':'approved',needsApproval?'pending':'active',needsApproval?DEFAULT_PCT():0,now(),lid
 );return getListing(lid,true)
}
// Hirdetés törlése: státusz 'removed', így az adatok és korábbi IC kérelmek megmaradnak.
// A bérbe adott jármű is törölhető, de a hirdetés azonnal eltűnik a nyilvános listából.
function deleteOwnListing(uid,lid){
 const result=conn().prepare("UPDATE listings SET status='removed',updated_at=? WHERE id=? AND owner_user_id=? AND kind='rental' AND status!='removed'").run(now(),lid,uid);
 if(!result.changes)throw Error('Nem található saját, törölhető hirdetés.');
 return {ok:true};
}
function deleteCompanyListing(lid){
 const result=conn().prepare("UPDATE listings SET status='removed',updated_at=? WHERE id=? AND kind='rental' AND status!='removed'").run(now(),lid);
 if(!result.changes)throw Error('Nem található törölhető hirdetés.');
 return {ok:true};
}
function pendingBrokerages(){return conn().prepare("SELECT * FROM listings WHERE kind='rental' AND publication_mode='brokered' AND approval_status='pending' ORDER BY created_at DESC").all().map(x=>safeListing(x,{privateView:true}))}
function reviewBrokerage(lid,decision,commission){const old=conn().prepare('SELECT * FROM listings WHERE id=?').get(lid);if(!old||old.kind!=='rental'||old.publication_mode!=='brokered'||old.approval_status!=='pending')throw Error('Nincs ilyen függő közvetítési kérelem.');if(!['approved','rejected'].includes(decision))throw Error('Érvénytelen döntés.');const pct=decision==='approved'?int(commission??DEFAULT_PCT(),'Jutalék',1,50):old.commission_pct;
 conn().prepare('UPDATE listings SET approval_status=?,status=?,commission_pct=?,updated_at=? WHERE id=?')
  .run(decision,decision==='approved'?'active':'removed',pct,now(),lid);return getListing(lid,true)
}
function changeStatus(lid,status){if(!['active','rented','removed'].includes(status))throw Error('Érvénytelen állapot.');const r=conn().prepare('UPDATE listings SET status=?,updated_at=? WHERE id=?').run(status,now(),lid);return r.changes?getListing(lid,true):null}
function createRequest(uid,input){
 const user=getUser(uid);if(!user)throw Error('Nincs felhasználó.');
 const type=str(input.type,20);if(type!=='rental')throw Error('Csak autóbérlési kérelem küldhető.');
 const car_name=str(input.car_name,120),duration=str(input.duration,80),start_date=str(input.start_date,30),description=str(input.description,1000),budget=int(input.budget||0,'Kereted',0);
 let listing_id='',chosenCar='';
 if(type==='rental'){
  const target=conn().prepare("SELECT * FROM listings WHERE id=? AND kind='rental' AND status='active' AND approval_status='approved'").get(str(input.listing_id,80));
  if(!target)throw Error('Ez a jármű jelenleg nem bérelhető.');listing_id=target.id;chosenCar=`${target.brand} ${target.model}`;
 }
 if(!duration)throw Error('Add meg a kívánt bérleti időtartamot.');
 const rid=id(),ts=now();
 conn().prepare(`INSERT INTO requests (id,type,status,listing_id,car_name,requester_id,requester_name,phone,budget,duration,start_date,description,commission_pct,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
 .run(rid,type,'pending',listing_id, chosenCar,user.id,user.ic_name,user.phone,budget,duration,start_date,description,0,'web',ts,ts);
 return {id:rid,status:'pending'};
}
function myRequests(uid){return conn().prepare("SELECT * FROM requests WHERE requester_id=? AND type='rental' ORDER BY created_at DESC LIMIT 200").all(uid)}
function allRequests(){return conn().prepare("SELECT requests.*, ic_users.verified AS requester_verified FROM requests LEFT JOIN ic_users ON requests.requester_id=ic_users.id WHERE requests.type='rental' ORDER BY requests.created_at DESC LIMIT 300").all()}
function receivedRequests(uid){return conn().prepare("SELECT requests.* FROM requests JOIN listings ON requests.listing_id=listings.id WHERE listings.owner_user_id=? AND listings.kind='rental' AND listings.publication_mode='private' AND requests.type='rental' ORDER BY requests.created_at DESC LIMIT 200").all(uid)}
function reviewPrivateRequest(uid,rid,status){
 if(!['approved','rejected','completed'].includes(status))throw Error('Érvénytelen kérelemállapot.');
 const row=conn().prepare("SELECT requests.id FROM requests JOIN listings ON requests.listing_id=listings.id WHERE requests.id=? AND requests.type='rental' AND listings.kind='rental' AND listings.publication_mode='private' AND listings.owner_user_id=?").get(rid,uid);
 if(!row)throw Error('Nem található saját magánbérleti kérelem.');
 return reviewRequest(rid,status);
}
function reviewRequest(rid,status){if(!['pending','approved','rejected','completed'].includes(status))throw Error('Érvénytelen állapot.');const r=conn().prepare('UPDATE requests SET status=?,updated_at=? WHERE id=?').run(status,now(),rid);return r.changes?conn().prepare('SELECT * FROM requests WHERE id=?').get(rid):null}
function stats(){const r=conn().prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='active' AND approval_status='approved' THEN 1 ELSE 0 END) active,SUM(CASE WHEN status='active' AND approval_status='approved' THEN 1 ELSE 0 END) rentals,SUM(CASE WHEN status='pending' AND publication_mode='brokered' THEN 1 ELSE 0 END) pending FROM listings WHERE kind='rental'").get();return {total:r.total||0,active:r.active||0,rentals:r.rentals||0,pending:r.pending||0,users:conn().prepare('SELECT COUNT(*) AS n FROM ic_users').get().n}}
module.exports={getUploadDirectory,saveUploadOwnership,initDatabase,registerUser,loginUser,createSession,findSession,removeSession,listUsers,getUser,verifyUser,deleteUnverifiedUser,publicUser,needsVerify,createOwnListing,getListing,listListings,myListings,updateOwnListing,pendingBrokerages,reviewBrokerage,changeStatus,deleteOwnListing,deleteCompanyListing,createRequest,myRequests,receivedRequests,reviewPrivateRequest,allRequests,reviewRequest,stats,DEFAULT_PCT};
