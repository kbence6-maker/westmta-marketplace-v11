const express=require('express');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const crypto=require('node:crypto');
const path=require('node:path');
const {getCatalog}=require('./catalog');
const store=require('./db');
const events=require('./events');

const sessions=new Map();
function parseCookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=').map(decodeURIComponent)).filter(a=>a.length===2));}
function isAdmin(req){const sid=parseCookies(req).mp_session; const s=sid && sessions.get(sid);if(!s) return false;if(Date.now()>s.expires){sessions.delete(sid);return false;}return true;}
function adminOnly(req,res,next){if(!isAdmin(req)) return res.status(401).json({error:'Admin bejelentkezés szükséges.'});next();}
function sameOrigin(req,res,next){if(!['POST','PATCH','PUT','DELETE'].includes(req.method)) return next(); const origin=req.get('origin');if(origin){try {const o=new URL(origin); const host=req.get('host'); if(o.host!==host) return res.status(403).json({error:'Érvénytelen kérés eredete.'});}catch{return res.status(403).json({error:'Érvénytelen origin.'});}}next();}
function startServer(){
 const app=express();app.disable('x-powered-by');
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'","https:","data:"],connectSrc:["'self'"],objectSrc:["'none'"],upgradeInsecureRequests:null}}}));
 app.use(express.json({limit:'32kb'}));app.use(sameOrigin);
 const loginLimiter=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:'draft-7',legacyHeaders:false});
 app.get('/api/config',(req,res)=>res.json({catalog:getCatalog(),authenticated:isAdmin(req),webUrl:process.env.PUBLIC_URL||'',features:{discord:!!process.env.DISCORD_TOKEN}}));
 app.get('/api/listings',(req,res)=>{const filters={...req.query};if(!isAdmin(req)){delete filters.all;if(filters.status && filters.status!=='active')delete filters.status;}res.json(store.listListings(filters));});
 app.get('/api/listings/:id',(req,res)=>{const v=store.getListing(req.params.id);if(!v || (v.status==='removed'&&!isAdmin(req)))return res.status(404).json({error:'Nem található.'});res.json(v);});
 app.get('/api/stats',(req,res)=>res.json(store.stats()));
 app.post('/api/login',loginLimiter,(req,res)=>{
   const secret=process.env.ADMIN_PASSWORD||''; const provided=String(req.body?.password||'');
   if(secret.length<20)return res.status(503).json({error:'Az ADMIN_PASSWORD nincs beállítva (legalább 20 karakter kell).'});
   const a=crypto.createHash('sha256').update(secret).digest(),b=crypto.createHash('sha256').update(provided).digest();
   if(!crypto.timingSafeEqual(a,b))return res.status(401).json({error:'Helytelen jelszó.'});
   const sid=crypto.randomBytes(32).toString('hex');sessions.set(sid,{expires:Date.now()+12*3600*1000});
   const secure=req.secure || (process.env.PUBLIC_URL||'').startsWith('https://');
   res.setHeader('Set-Cookie',`mp_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure?'; Secure':''}`);
   res.json({ok:true});
 });
 app.post('/api/logout',(req,res)=>{const sid=parseCookies(req).mp_session;if(sid)sessions.delete(sid);res.setHeader('Set-Cookie','mp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');res.json({ok:true});});
 app.post('/api/listings',adminOnly,(req,res)=>{try{const v=store.createListing({...req.body,seller_name:'Webadmin'});events.emit('listing:created',v);res.status(201).json(v);}catch(e){res.status(400).json({error:e.message});}});
 app.patch('/api/listings/:id',adminOnly,(req,res)=>{try{req.previousListing=store.getListing(req.params.id);const out=store.updateListing(req.params.id,req.body);if(!out)return res.status(404).json({error:'Nem található.'});const previous=req.previousListing;events.emit('listing:updated',{listing:out,action:out.status==='sold'&&previous?.status!=='sold'?'sold':out.status==='removed'?'removed':'updated'});res.json(out);}catch(e){res.status(400).json({error:e.message});}});
 app.use(express.static(path.join(__dirname,'public')));
 app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
 app.use((err,req,res,next)=>{console.error('[Web]',err);res.status(500).json({error:'Szerverhiba.'});});
 const port=Number(process.env.PORT)||3000;
 app.listen(port,()=>console.log(`[Web] Dashboard: http://localhost:${port}`));
 return app;
}
module.exports={startServer};
