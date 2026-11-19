'use strict';
const express=require('express');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const crypto=require('node:crypto');
const path=require('node:path');
const fs=require('node:fs');
const store=require('./db');
const {getCatalog}=require('./catalog');
function cookies(req){const result={};for(const part of String(req.headers.cookie||'').split(';')){const pos=part.indexOf('=');if(pos<1)continue;try{result[part.slice(0,pos).trim()]=decodeURIComponent(part.slice(pos+1).trim())}catch{}}return result}
function isAdmin(req){const a=cookies(req).ic_admin;const rec=a&&adminSessions.get(crypto.createHash('sha256').update(a).digest('hex'));if(!rec)return false;if(rec<Date.now()){adminSessions.delete(crypto.createHash('sha256').update(a).digest('hex'));return false}return true}
const adminSessions=new Map();
function getUser(req){return store.findSession(cookies(req).ic_session)}
function loginRequired(req,res,next){const user=getUser(req);if(!user)return res.status(401).json({error:'IC fiókkal be kell jelentkezned.'});res.locals.user=user;next()}
function adminRequired(req,res,next){if(!isAdmin(req))return res.status(401).json({error:'Cégtulajdonosi bejelentkezés szükséges.'});next()}
function safeCookie(req,name,value,seconds){const secure=req.secure||req.get('x-forwarded-proto')==='https'||(process.env.PUBLIC_URL||'').startsWith('https://');return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure?'; Secure':''}`}
function sameOrigin(req,res,next){if(['GET','HEAD','OPTIONS'].includes(req.method))return next();if(req.get('sec-fetch-site')==='cross-site')return res.status(403).json({error:'Külső oldalról indított kérés tiltva.'});const origin=req.get('origin');if(origin){try{if(new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Érvénytelen kérés eredete.'})}catch{return res.status(403).json({error:'Hibás Origin fejléc.'})}}next()}
const handler=fn=>(req,res)=>{try{fn(req,res)}catch(e){console.warn('[API]',e.message);res.status(400).json({error:e.message||'Sikertelen művelet.'})}};
function startServer(){
 const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'",'https:','data:'],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:null}}}));
 app.use(express.json({limit:'48kb'}));app.use(sameOrigin);
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next()});
 const authLimit=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Túl sok próbálkozás. Próbáld később.'}});
 const writeLimit=rateLimit({windowMs:60*60*1000,limit:60,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Túl sok kérés. Próbáld később.'}});
 app.get('/health',(req,res)=>res.json({ok:true,service:'westrent',build:'foto-torles-20261119'}));
 app.get('/api/config',(req,res)=>res.json({catalog:getCatalog(),companyName:(process.env.COMPANY_NAME && process.env.COMPANY_NAME!=='IC Autóközpont' ? process.env.COMPANY_NAME : 'WestRent'),companyPhone:process.env.IC_COMPANY_PHONE||'',commission:store.DEFAULT_PCT(),admin:isAdmin(req),user:getUser(req),requiresVerification:store.needsVerify()}));
 app.get('/api/stats',(req,res)=>res.json(store.stats()));
 app.get('/api/listings',handler((req,res)=>res.json(store.listListings(req.query,false))));
 app.get('/api/listings/:id',handler((req,res)=>{const item=store.getListing(req.params.id);if(!item||item.kind!=='rental'||!['active','rented'].includes(item.status)||item.approval_status!=='approved')return res.status(404).json({error:'Nem található hirdetés.'});res.json(item)}));
 app.post('/api/auth/register',authLimit,handler((req,res)=>{const u=store.registerUser(req.body||{});const token=store.createSession(u.id);res.setHeader('Set-Cookie',safeCookie(req,'ic_session',token,604800));res.status(201).json({user:u})}));
 app.post('/api/auth/login',authLimit,handler((req,res)=>{const user=store.loginUser(req.body?.phone,req.body?.password);if(!user)return res.status(401).json({error:'Hibás IC telefonszám vagy jelszó.'});const token=store.createSession(user.id);res.setHeader('Set-Cookie',safeCookie(req,'ic_session',token,604800));res.json({user})}));
 app.post('/api/auth/logout',(req,res)=>{store.removeSession(cookies(req).ic_session);res.setHeader('Set-Cookie',safeCookie(req,'ic_session','',0));res.json({ok:true})});
 app.get('/api/me',loginRequired,(req,res)=>res.json({user:res.locals.user,listings:store.myListings(res.locals.user.id),requests:store.myRequests(res.locals.user.id),received:store.receivedRequests(res.locals.user.id)}));
 // Képek a Railway /data Volume-on: maximum 5 MB, kizárólag JPEG, PNG vagy WebP.
 // A feltöltött fájl nyilvánosan látható lesz a hirdetésen, de csak a feltöltő használhatja.
 const imageLimit=rateLimit({windowMs:60*60*1000,limit:20,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Túl sok képfeltöltés, próbáld később.'}});
 const rawImage=express.raw({type:()=>true,limit:'5mb'});
 app.post('/api/my/uploads/image',imageLimit,loginRequired,rawImage,(req,res)=>{
  let savedPath='';
  try{
   const b=req.body;
   if(!Buffer.isBuffer(b)||b.length===0||b.length>5*1024*1024)throw Error('Maximum 5 MB-os JPG, PNG vagy WebP képet tölthetsz fel.');
   const jpeg=b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
   const png=b.length>24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
   const webp=b.length>16&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
   const ext=jpeg?'jpg':png?'png':webp?'webp':null;
   if(!ext)throw Error('Érvénytelen kép. JPG, PNG vagy WebP szükséges.');
   const dir=store.getUploadDirectory();fs.mkdirSync(dir,{recursive:true});
   const filename=crypto.randomUUID()+'.'+ext;
   savedPath=path.join(dir,filename);
   fs.writeFileSync(savedPath,b,{flag:'wx',mode:0o600});
   store.saveUploadOwnership(res.locals.user.id,filename);
   res.status(201).json({image_url:'/uploads/'+filename});
  }catch(e){if(savedPath)try{fs.unlinkSync(savedPath)}catch{};console.warn('[Upload]',e.message);res.status(e.type==='entity.too.large'?413:400).json({error:e.message})}
 });
 app.use('/uploads',express.static(store.getUploadDirectory(),{dotfiles:'deny',immutable:true,maxAge:'30d',fallthrough:false}));
 app.post('/api/my/listings',writeLimit,loginRequired,handler((req,res)=>res.status(201).json(store.createOwnListing(res.locals.user.id,req.body||{}))));
 app.patch('/api/my/listings/:id',writeLimit,loginRequired,handler((req,res)=>res.json(store.updateOwnListing(res.locals.user.id,req.params.id,req.body||{}))));
 app.delete('/api/my/listings/:id',writeLimit,loginRequired,handler((req,res)=>res.json(store.deleteOwnListing(res.locals.user.id,req.params.id))));
 app.post('/api/my/requests',writeLimit,loginRequired,handler((req,res)=>res.status(201).json(store.createRequest(res.locals.user.id,req.body||{}))));
 app.patch('/api/my/received/:id',writeLimit,loginRequired,handler((req,res)=>res.json(store.reviewPrivateRequest(res.locals.user.id,req.params.id,req.body?.status))));
 // Admin: saját, külön adminjelszó; nem kérjük a játékhoz tartozó jelszót.
 app.post('/api/admin/login',authLimit,(req,res)=>{const secret=process.env.ADMIN_PASSWORD||'',provided=String(req.body?.password||'');if(secret.length<20)return res.status(503).json({error:'Legalább 20 karakteres ADMIN_PASSWORD szükséges.'});const a=crypto.createHash('sha256').update(secret).digest(),b=crypto.createHash('sha256').update(provided).digest();if(!crypto.timingSafeEqual(a,b))return res.status(401).json({error:'Helytelen tulajdonosi jelszó.'});const token=crypto.randomBytes(32).toString('hex');adminSessions.set(crypto.createHash('sha256').update(token).digest('hex'),Date.now()+12*3600*1000);res.setHeader('Set-Cookie',safeCookie(req,'ic_admin',token,43200));res.json({ok:true})});
 app.post('/api/admin/logout',(req,res)=>{const token=cookies(req).ic_admin;if(token)adminSessions.delete(crypto.createHash('sha256').update(token).digest('hex'));res.setHeader('Set-Cookie',safeCookie(req,'ic_admin','',0));res.json({ok:true})});
 app.get('/api/admin/overview',adminRequired,(req,res)=>res.json({users:store.listUsers(),pending:store.pendingBrokerages(),requests:store.allRequests(),listings:store.listListings({limit:100},true).listings,stats:store.stats()}));
 // Az admin csak valódi játékbeli egyeztetés / kódellenőrzés után hagyjon jóvá fiókot.
 app.patch('/api/admin/users/:id/verify',adminRequired,handler((req,res)=>{const user=store.verifyUser(req.params.id);if(!user)return res.status(404).json({error:'Nem található felhasználó.'});res.json(user)}));
 app.delete('/api/admin/users/:id',adminRequired,handler((req,res)=>{if(!store.deleteUnverifiedUser(req.params.id))return res.status(404).json({error:'Csak ellenőrizetlen regisztráció törölhető.'});res.json({ok:true})}));
 app.patch('/api/admin/broker/:id',adminRequired,handler((req,res)=>res.json(store.reviewBrokerage(req.params.id,req.body?.decision,req.body?.commission_pct))));
 app.patch('/api/admin/requests/:id',adminRequired,handler((req,res)=>{const r=store.reviewRequest(req.params.id,req.body?.status);if(!r)return res.status(404).json({error:'Nem található kérelem.'});res.json(r)}));
 app.patch('/api/admin/listings/:id/status',adminRequired,handler((req,res)=>{const r=store.changeStatus(req.params.id,req.body?.status);if(!r)return res.status(404).json({error:'Nem található hirdetés.'});res.json(r)}));
 app.delete('/api/admin/listings/:id',adminRequired,handler((req,res)=>res.json(store.deleteCompanyListing(req.params.id))));
 app.use(express.static(path.join(__dirname,'public'),{index:'index.html'}));
 app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
 app.use((err,req,res,next)=>{console.error('[Web]',err);if(!res.headersSent)res.status(500).json({error:'Szerverhiba.'})});
 const port=Number(process.env.PORT)||3000;
 const http=app.listen(port,'0.0.0.0',()=>console.log(`[Web] WestRent: http://0.0.0.0:${port} | 81 V11 jármű | Discord nélkül`));
 return {app,http};
}
module.exports={startServer};
