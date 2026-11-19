'use strict';
const Database=require('better-sqlite3');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {CARS,isCatalogCar}=require('./catalog');
const {FIELDS, options, toList, fromList}=require('./tuning');
const {TAX_PERCENT,taxAmount}=require('./tax');

const DATA_DIR=process.env.DATA_DIR||process.env.RAILWAY_VOLUME_MOUNT_PATH||path.join(__dirname,'data');
let db;
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const str=(x,max=200)=>String(x??'').trim().slice(0,max);
const int=(x,label,min=0,max=999999999999)=>{const n=Number(x);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`${label}: ${min}–${max} közötti egész szám kell.`);return n;};
const DEFAULT_PCT=()=>{const n=Number(process.env.BROKER_COMMISSION_PERCENT||15);return Number.isInteger(n)&&n>=1&&n<=50?n:15};
const needsVerify=()=>false; // Önkiszolgáló IC felület: nincs kötelező jóváhagyás

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
 CREATE TABLE IF NOT EXISTS tuning_requests (
   id TEXT PRIMARY KEY,user_id TEXT NOT NULL,ic_name TEXT NOT NULL,phone TEXT NOT NULL,
   brand TEXT NOT NULL,model TEXT NOT NULL,tuning TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',
   created_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS owner_income (
   id TEXT PRIMARY KEY,description TEXT NOT NULL,gross INTEGER NOT NULL,tax INTEGER NOT NULL,created_at TEXT NOT NULL
 );
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
 // Visszafelé kompatibilis bővítés az eddigi hirdetések és bérlési kérelmek megtartásával.
 const reqCols=new Set(db.pragma('table_info(requests)').map(x=>x.name));
 if(!reqCols.has('rental_units'))db.exec('ALTER TABLE requests ADD COLUMN rental_units INTEGER NOT NULL DEFAULT 1');
 if(!reqCols.has('hidden_by_requester'))db.exec('ALTER TABLE requests ADD COLUMN hidden_by_requester INTEGER NOT NULL DEFAULT 0');
 const incomeCols=new Set(db.pragma('table_info(owner_income)').map(x=>x.name));
 if(!incomeCols.has('source_request_id'))db.exec("ALTER TABLE owner_income ADD COLUMN source_request_id TEXT NOT NULL DEFAULT ''");
 if(!incomeCols.has('source_type'))db.exec("ALTER TABLE owner_income ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual'");
 db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_income_request_unique ON owner_income(source_request_id) WHERE source_request_id!=''");
 // Meglévő közvetítések átvétele: a nem törölt, függő céges autók magánhirdetésként jelennek meg.
 db.prepare("UPDATE listings SET publication_mode='private',approval_status='approved',commission_pct=0,status=CASE WHEN status='pending' THEN 'active' ELSE status END,updated_at=? WHERE kind='rental' AND publication_mode='brokered'").run(now());
 return db;
}
const conn=()=>db||initDatabase();
function publicUser(u){return u?{id:u.id,ic_name:u.ic_name,phone:u.phone,verified:!!u.verified,created_at:u.created_at}:null}
function hashPassword(p){const salt=crypto.randomBytes(16).toString('hex');return `${salt}:${crypto.scryptSync(p,salt,64).toString('hex')}`}
function checkPassword(p,stored){const [salt,digest]=String(stored||'').split(':');if(!salt||!/^[a-f0-9]{128}$/.test(digest||''))return false;const received=crypto.scryptSync(p,salt,64);return crypto.timingSafeEqual(Buffer.from(digest,'hex'),received)}
function normalizePhone(s){const phone=str(s,35);if(!/^[+0-9][0-9+\- ]{4,29}$/.test(phone))throw Error('Érvényes, legalább 5 karakteres IC telefonszám szükséges.');return phone.replace(/[ \-]/g,'')}
function registerUser(input){
 const ic_name=str(input.ic_name,70),phone=normalizePhone(input.phone),password=String(input.password||'');
 if(ic_name.length<3||ic_name.length>70)throw Error('A karakter neve legalább 3 karakter legyen.');
 if(password.length<10||password.length>128)throw Error('A jelszó legalább 10, legfeljebb 128 karakter legyen.');
 if(conn().prepare('SELECT id FROM ic_users WHERE phone=?').get(phone))throw Error('Ez az IC telefonszám már regisztrálva van.');
 const uid=id(),code='';
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
 const publication_mode='private';
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
 const user=getUser(uid);if(!user)throw Error('Nincs felhasználó.');
 const d=validateListing(input);assertOwnImage(uid,d.image_url);const timestamp=now(),rid=id();
 conn().prepare(`INSERT INTO listings (id,brand,model,price,description,phone,image_url,tuning,seller_id,seller_name,status,channel_id,message_id,created_at,updated_at,kind,rent_period,deposit,owner_user_id,publication_mode,approval_status,commission_pct)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
 rid,d.brand,d.model,d.price,d.description,user.phone,d.image_url,JSON.stringify(d.tuning),'',user.ic_name,
 'active','','',timestamp,timestamp,d.kind,d.rent_period,d.deposit,uid,
 'private','approved',0
 );return getListing(rid,true);
}
function getListing(listingId,privateView=false){return safeListing(conn().prepare('SELECT * FROM listings WHERE id=?').get(listingId),{privateView})}
function listListings(filters={},admin=false){
 const clauses=["kind='rental'"];const params={};
 if(!admin){clauses.push("status IN ('active','rented')","approval_status='approved'");if(['active','rented'].includes(filters.status)){clauses.push('status=@status');params.status=filters.status}}
 else if(filters.status&&['active','pending','sold','rented','removed'].includes(filters.status)){clauses.push('status=@status');params.status=filters.status}

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
  return conn().transaction(()=>{
   if(old.status!=='active')throw Error('Csak aktív hirdetést lehet bérbe adottnak jelölni.');
   const ts=now();
   const result=conn().prepare("UPDATE listings SET status='rented',updated_at=? WHERE id=? AND status='active'").run(ts,lid);
   if(result.changes!==1)throw Error('A hirdetés állapota időközben megváltozott.');
   // Kérelem nélküli, kézzel jelölt bérlés: egyetlen meghirdetett időegység alapján számolunk.
   conn().prepare("INSERT INTO owner_income (id,description,gross,tax,created_at,source_type) VALUES (?,?,?,?,?,?)")
    .run(id(),str(`${old.brand} ${old.model} · kézi bérbeadás · 1 ${({day:'nap',week:'hét',month:'hónap'})[old.rent_period]||'nap'}`,120),old.price,taxAmount(old.price),ts,'manual_rented');
   conn().prepare("UPDATE requests SET status='rejected',updated_at=? WHERE listing_id=? AND status='pending'").run(ts,lid);
   return getListing(lid,true);
  })();
 }
 if(patch.action==='available'){
  if(old.status!=='rented')throw Error('Csak bérbe adott autó állítható elérhetőre.');
  conn().prepare("UPDATE listings SET status='active',updated_at=? WHERE id=?").run(now(),lid);return getListing(lid,true)
 }
 const d=validateListing({...old,tuning:old.tuning,...patch});assertOwnImage(uid,d.image_url);
 conn().prepare(`UPDATE listings SET brand=?,model=?,price=?,description=?,image_url=?,tuning=?,kind=?,rent_period=?,deposit=?,publication_mode=?,approval_status=?,status=?,commission_pct=?,updated_at=? WHERE id=?`).run(
 d.brand,d.model,d.price,d.description,d.image_url,JSON.stringify(d.tuning),d.kind,d.rent_period,d.deposit,d.publication_mode,
 'approved',old.status==='rented'?'rented':'active',0,now(),lid
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
 if(str(input.type,20)!=='rental')throw Error('Csak autóbérlési kérelem küldhető.');
 const target=conn().prepare("SELECT * FROM listings WHERE id=? AND kind='rental' AND status='active' AND approval_status='approved'").get(str(input.listing_id,80));
 if(!target)throw Error('Ez a jármű jelenleg nem bérelhető.');
 const units=int(input.units,'Bérlési időtartam',1,365);
 const period=({day:'nap',week:'hét',month:'hónap'})[target.rent_period]||'nap';
 const duration=`${units} ${period}`;
 const start_date=str(input.start_date,30),description=str(input.description,1000);
 const rid=id(),ts=now();
 conn().prepare(`INSERT INTO requests (id,type,status,listing_id,car_name,requester_id,requester_name,phone,budget,duration,start_date,description,commission_pct,source,created_at,updated_at,rental_units) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
 .run(rid,'rental','pending',target.id,`${target.brand} ${target.model}`,user.id,user.ic_name,user.phone,0,duration,start_date,description,0,'web',ts,ts,units);
 return {id:rid,status:'pending'};
}
function myRequests(uid){return conn().prepare("SELECT * FROM requests WHERE requester_id=? AND type='rental' AND hidden_by_requester=0 ORDER BY created_at DESC LIMIT 200").all(uid)}
// Törlés a saját előzményekből: nem törli a másik fél adatait vagy a pénzügyi naplót.
// Ha a kérés még függő, vissza is vonjuk, nehogy a bérbeadó később elfogadhassa.
function deleteMyRequest(uid,rid){
 const row=conn().prepare("SELECT id,status FROM requests WHERE id=? AND requester_id=? AND type='rental' AND hidden_by_requester=0").get(rid,uid);
 if(!row)throw Error('Nem található a saját bérlési kérelmed.');
 conn().prepare("UPDATE requests SET hidden_by_requester=1,status=CASE WHEN status='pending' THEN 'cancelled' ELSE status END,updated_at=? WHERE id=?").run(now(),rid);
 return {ok:true};
}
function allRequests(){return conn().prepare("SELECT requests.*, ic_users.verified AS requester_verified FROM requests LEFT JOIN ic_users ON requests.requester_id=ic_users.id WHERE requests.type='rental' ORDER BY requests.created_at DESC LIMIT 300").all()}
function receivedRequests(uid){return conn().prepare("SELECT requests.* FROM requests JOIN listings ON requests.listing_id=listings.id WHERE listings.owner_user_id=? AND listings.kind='rental' AND listings.publication_mode='private' AND requests.type='rental' ORDER BY requests.created_at DESC LIMIT 200").all(uid)}
// Elfogadás után tranzakción belül lefoglaljuk az autót, az összes többi függő kérést lezárjuk,
// és csak a tulajdonosi felülethez egy várható összeget naplózunk. Nem valós IC pénzátutalás!
function reviewPrivateRequest(uid,rid,status){
 if(!['approved','rejected'].includes(status))throw Error('Csak elfogadás vagy elutasítás választható.');
 return conn().transaction(()=>{
   const r=conn().prepare(`SELECT requests.*, listings.owner_user_id, listings.status AS car_status,
       listings.price AS unit_price, listings.rent_period, listings.brand, listings.model
     FROM requests JOIN listings ON requests.listing_id=listings.id
     WHERE requests.id=? AND requests.type='rental' AND listings.kind='rental'
       AND listings.publication_mode='private' AND listings.owner_user_id=?`).get(rid,uid);
   if(!r)throw Error('Nem található saját magánbérleti kérelem.');
   if(r.status!=='pending')throw Error('Ezt a kérelmet már elbírálták vagy visszavonták.');
   if(status==='approved' && r.car_status!=='active')throw Error('Az autó már nem elérhető.');
   const time=now();
   conn().prepare('UPDATE requests SET status=?,updated_at=? WHERE id=?').run(status,time,rid);
   if(status==='approved'){
     conn().prepare("UPDATE listings SET status='rented',updated_at=? WHERE id=? AND status='active'").run(time,r.listing_id);
     conn().prepare("UPDATE requests SET status='rejected',updated_at=? WHERE listing_id=? AND id!=? AND status='pending'").run(time,r.listing_id,rid);
     const units=int(r.rental_units||1,'Bérleti egységek',1,365);
     const gross=units*r.unit_price;
     if(!Number.isSafeInteger(gross)||gross>999999999999)throw Error('Túl nagy bérleti összeg.');
     const period=({day:'nap',week:'hét',month:'hónap'})[r.rent_period]||'nap';
     const desc=`${r.brand} ${r.model} · ${units} ${period} · ${r.requester_name}`;
     conn().prepare("INSERT OR IGNORE INTO owner_income (id,description,gross,tax,created_at,source_request_id,source_type) VALUES (?,?,?,?,?,?,?)")
      .run(id(),str(desc,120),gross,taxAmount(gross),time,rid,'accepted_rental');
   }
   return conn().prepare('SELECT * FROM requests WHERE id=?').get(rid);
 })();
}
// A korábbi tulajdonosi API megtartása kompatibilitásra; automatikus foglalásra csak a fenti útvonal használható.
function reviewRequest(rid,status){
 if(!['pending','approved','rejected','completed'].includes(status))throw Error('Érvénytelen állapot.');
 const r=conn().prepare('UPDATE requests SET status=?,updated_at=? WHERE id=?').run(status,now(),rid);
 return r.changes?conn().prepare('SELECT * FROM requests WHERE id=?').get(rid):null;
}
function stats(){const r=conn().prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active,SUM(CASE WHEN status='rented' THEN 1 ELSE 0 END) rented FROM listings WHERE kind='rental' AND status IN ('active','rented')").get();return {total:r.total||0,active:r.active||0,rentals:r.active||0,rented:r.rented||0,users:conn().prepare('SELECT COUNT(*) AS n FROM ic_users').get().n}}

// A befizetés példájából származó 5%: egész dollárra kerekítve.
function saveIncome(input){
 const description=str(input.description,120);if(!description)throw Error('Add meg, miből származott a bevétel.');
 const gross=int(input.gross,'Bevétel',1,999999999999),tax=taxAmount(gross),created_at=now(),rid=id();
 conn().prepare('INSERT INTO owner_income (id,description,gross,tax,created_at) VALUES (?,?,?,?,?)').run(rid,description,gross,tax,created_at);
 return {id:rid,description,gross,tax,net:gross-tax,created_at};
}
function incomeReport(){
 const rows=conn().prepare('SELECT * FROM owner_income ORDER BY created_at DESC LIMIT 500').all();
 const sum=conn().prepare('SELECT COALESCE(SUM(gross),0) gross, COALESCE(SUM(tax),0) tax, COUNT(*) count FROM owner_income').get();
 return {rows,summary:{gross:sum.gross,tax:sum.tax,net:sum.gross-sum.tax,count:sum.count},taxPercent:TAX_PERCENT};
}
function deleteIncome(id){return conn().prepare('DELETE FROM owner_income WHERE id=?').run(str(id,80)).changes>0}
function clearIncomeHistory(){return conn().prepare('DELETE FROM owner_income').run().changes}
function deleteTuningRequest(id){return conn().prepare('DELETE FROM tuning_requests WHERE id=?').run(str(id,80)).changes>0}
function clearTuningHistory(){return conn().prepare('DELETE FROM tuning_requests').run().changes}
function createTuningRequest(input){
 // Csak a játékbeli telefonszám szükséges, az igény később IC módon egyeztethető.
 const phone=normalizePhone(input.phone);
 const notes=str(input.notes,1000);if(!notes)throw Error('Írd le, milyen tuningot szeretnél.');
 const rid=id(),created_at=now();
 conn().prepare('INSERT INTO tuning_requests (id,user_id,ic_name,phone,brand,model,tuning,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
 .run(rid,'','',phone,'','','[]',notes,created_at);
 return {id:rid,created_at};
}
function myTuningRequests(uid){return conn().prepare('SELECT id,brand,model,tuning,notes,created_at FROM tuning_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(uid).map(x=>({...x,tuning:JSON.parse(x.tuning)}))}
function ownerTuningRequests(){return conn().prepare('SELECT * FROM tuning_requests ORDER BY created_at DESC LIMIT 300').all().map(x=>({...x,tuning:JSON.parse(x.tuning)}))}

module.exports={getUploadDirectory,saveUploadOwnership,initDatabase,registerUser,loginUser,createSession,findSession,removeSession,listUsers,getUser,verifyUser,deleteUnverifiedUser,publicUser,needsVerify,createOwnListing,getListing,listListings,myListings,updateOwnListing,pendingBrokerages,reviewBrokerage,changeStatus,deleteOwnListing,deleteCompanyListing,createRequest,myRequests,deleteMyRequest,receivedRequests,reviewPrivateRequest,allRequests,reviewRequest,stats,DEFAULT_PCT,taxAmount,saveIncome,incomeReport,deleteIncome,clearIncomeHistory,createTuningRequest,deleteTuningRequest,clearTuningHistory,myTuningRequests,ownerTuningRequests};
