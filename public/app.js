const $=s=>document.querySelector(s);
const fmt=n=>new Intl.NumberFormat('hu-HU').format(n)+' $';
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let state={page:0,total:0,authenticated:false,listings:[],catalog:{},selected:null};
const fallbackSVG=`<svg viewBox="0 0 360 180" aria-label="Jármű" xmlns="http://www.w3.org/2000/svg"><ellipse cx="180" cy="152" rx="150" ry="13" fill="#7775bd" opacity=".25"/><path d="M18 117l33-15 48-56q30-12 106-9l65 26 43 39 27 15v24H21Z" fill="#707a9d" stroke="#b4bce0" stroke-width="3"/><path d="M107 52q45-12 99-7l53 21 33 37H60Z" fill="#182039" stroke="#b4bce0" stroke-width="3"/><circle cx="86" cy="141" r="29" fill="#101325" stroke="#c0c4e4" stroke-width="7"/><circle cx="282" cy="141" r="29" fill="#101325" stroke="#c0c4e4" stroke-width="7"/></svg>`;
async function api(url,options={}){const res=await fetch(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});let data;try{data=await res.json()}catch{data={}}if(!res.ok)throw Error(data.error||'Hálózati hiba');return data;}
function toast(text){$('#toast').textContent=text;$('#toast').classList.remove('hidden');setTimeout(()=>$('#toast').classList.add('hidden'),4500);}
function openModal(id){$('#'+id).classList.remove('hidden');}
function closeModal(id){$('#'+id).classList.add('hidden');}
document.querySelectorAll('[data-close]').forEach(el=>el.onclick=()=>closeModal(el.dataset.close));
document.querySelectorAll('.modal-backdrop').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)closeModal(el.id)}));
$('#explore').onclick=()=>$('#market').scrollIntoView({behavior:'smooth'});
$('#refresh').onclick=()=>loadListings();
$('#clear').onclick=()=>{$('#search').value='';$('#brandFilter').value='';$('#sort').value='newest';state.page=0;loadListings();};
let debounce;$('#search').oninput=()=>{clearTimeout(debounce);debounce=setTimeout(()=>{state.page=0;loadListings()},250)};
$('#brandFilter').onchange=$('#sort').onchange=()=>{state.page=0;loadListings()};
function card(v){return `<article class="car-card" data-id="${esc(v.id)}" tabindex="0" role="button" aria-label="${esc(v.brand+' '+v.model)} megtekintése"><div class="car-image">${v.image_url?`<img loading="lazy" src="${esc(v.image_url)}" alt="${esc(v.brand+' '+v.model)}" onerror="this.replaceWith(document.createElement('span'))">`:fallbackSVG}<div class="chip">ELADÓ</div></div><div class="car-body"><div class="car-name">${esc(v.brand)} ${esc(v.model)}</div><div class="car-meta"><span>⚙ ${v.tuning.length?v.tuning.length+' tuning':'Alap felszereltség'}</span><span>◷ ${new Date(v.created_at).toLocaleDateString('hu-HU')}</span></div><div class="car-bottom"><div class="price"><small>IRÁNYÁR</small>${fmt(v.price)}</div><span class="view">Részletek ↗</span></div></div></article>`;}
async function loadListings(){
 try{
  const q=new URLSearchParams({sort:$('#sort').value,limit:'12',offset:String(state.page*12)});
  if($('#search').value.trim())q.set('query',$('#search').value.trim());if($('#brandFilter').value)q.set('brand',$('#brandFilter').value);
  const data=await api('/api/listings?'+q);state.total=data.total;state.listings=data.listings;
  $('#resultCount').textContent=`${data.total} találat`;
  $('#cards').innerHTML=data.listings.length?data.listings.map(card).join(''):`<div class="empty">◈<strong>Még nincs találat</strong>Próbálj más szűrőket, vagy add fel az első hirdetést Discordon!</div>`;
  const pages=Math.ceil(data.total/12);$('#pagination').innerHTML=pages>1?`<button id="prev" ${state.page===0?'disabled':''}>← Előző</button><button disabled>${state.page+1} / ${pages}</button><button id="next" ${state.page>=pages-1?'disabled':''}>Következő →</button>`:'';
  if($('#prev'))$('#prev').onclick=()=>{state.page--;loadListings();$('#market').scrollIntoView()};
  if($('#next'))$('#next').onclick=()=>{state.page++;loadListings();$('#market').scrollIntoView()};
  document.querySelectorAll('.car-card').forEach(el=>{el.onclick=()=>showDetail(el.dataset.id);el.onkeydown=e=>{if(e.key==='Enter')showDetail(el.dataset.id)}});
 }catch(e){toast(e.message);$('#resultCount').textContent='Betöltési hiba';}
}
async function showDetail(id){try{const v=await api('/api/listings/'+id);state.selected=v;const discord=v.seller_id?`<a target="_blank" rel="noopener noreferrer" href="https://discord.com/users/${encodeURIComponent(v.seller_id)}">Discord profil megnyitása ↗</a>`:'Webadmin';
 $('#detailBody').innerHTML=`${v.image_url?`<img class="detail-img" src="${esc(v.image_url)}" alt="Jármű képe"/>`:`<div class="car-image detail-img">${fallbackSVG}</div>`}<div class="eyebrow">JÁRMŰ ADATLAP</div><h2>${esc(v.brand)} ${esc(v.model)}</h2><div class="detail-price">${fmt(v.price)}</div><div class="detail-label">Leírás</div><p>${esc(v.description||'Nincs megadva leírás.')}</p><div class="detail-label">Tuningok</div><div class="detail-tags">${v.tuning.length?v.tuning.map(x=>`<span>${esc(x)}</span>`).join(''):'<span>Nincs megadva</span>'}</div><div class="detail-label">Kapcsolat</div><p>Eladó: ${discord}<br/>RP telefon: <b>${esc(v.phone||'Nincs megadva')}</b></p><div class="detail-label">Feladás: ${new Date(v.created_at).toLocaleString('hu-HU')}</div>`;openModal('detailModal');}catch(e){toast(e.message)}}
function adminLogin(){return `<div class="eyebrow">VEZÉRLŐPULT</div><h2>Admin belépés</h2><p>A webes hirdetéskezeléshez add meg a saját ADMIN_PASSWORD értéked.</p><form id="loginForm"><label>Admin jelszó<input type="password" id="password" autocomplete="current-password" required/></label><button type="submit" class="primary">Bejelentkezés →</button></form>`;}
function formHtml(v={}){
 const labels=[['motor','Motor'],['turbo','Turbo'],['valto','Váltó'],['gumi','Gumi'],['fek','Fék']];
 const normal=['Gyári','Kezdő','Haladó','Profi','Verseny','Prémium'];
 const values=Object.fromEntries((v.tuning||[]).map(x=>{const p=x.indexOf(': ');return p<0?[]:[x.slice(0,p),x.slice(p+2)]}).filter(x=>x.length===2));
 const tuning=labels.map(([key,label])=>{const options=key==='turbo'?[...normal,'Állítható','Supercharger']:normal;return `<label>${label}<select name="tune_${key}" required><option value="">Válassz fokozatot</option>${options.map(x=>`<option value="${esc(x)}" ${values[label]===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`}).join('');
 return `<div class="eyebrow">ADMINISZTRÁCIÓ</div><h2>${v.id?'Hirdetés szerkesztése':'Új hirdetés'}</h2><form id="listingForm"><div class="form-grid"><label>Márka<select name="brand" id="adminBrand" required></select></label><label>Modell<select name="model" id="adminModel" required></select></label><label>Ár ($)<input name="price" type="number" min="1" max="999999999999" value="${esc(v.price||'')}" required/></label><label>RP telefonszám<input name="phone" maxlength="60" value="${esc(v.phone||'')}" required/></label></div><label>Kép HTTPS URL<input name="image_url" type="url" placeholder="https://..." value="${esc(v.image_url||'')}"/></label><label>Egyéb extrák<textarea name="description" maxlength="1000">${esc(v.description||'')}</textarea></label><div class="detail-label">⚙️ Tuningok – V11</div><div class="form-grid">${tuning}</div><div class="actions"><button class="primary" type="submit">${v.id?'Mentés':'Hirdetés létrehozása'}</button>${v.id?`<button type="button" class="outline" id="markSold">Eladva</button><button type="button" class="danger" id="removeListing">Eltávolítás</button>`:''}<button type="button" class="outline" id="adminList">Hirdetések kezelése</button><button type="button" class="outline" id="logout">Kijelentkezés</button></div></form>`;
}
async function showAdminList(){
 try{
  const data=await api('/api/listings?all=true&limit=100');
  $('#adminBody').innerHTML=`<div class="eyebrow">HIRDETÉSKEZELŐ</div><h2>Hirdetések kezelése</h2><p>Válassz egy hirdetést a szerkesztéshez. Legfeljebb a legújabb 100 jelenik meg.</p><div class="admin-list">${data.listings.map(x=>`<button class="admin-list-item" data-id="${esc(x.id)}"><b>${esc(x.brand)} ${esc(x.model)}</b><span>${fmt(x.price)} · ${esc(x.status)}</span></button>`).join('')||'Még nincs hirdetés.'}</div><button id="adminNew" class="primary">+ Új hirdetés</button>`;
  document.querySelectorAll('.admin-list-item').forEach(el=>el.onclick=async()=>{try{adminPanel(await api('/api/listings/'+el.dataset.id));}catch(e){toast(e.message)}});
  $('#adminNew').onclick=()=>adminPanel({});
 }catch(e){toast(e.message)}
}
function adminPanel(v){
 $('#adminBody').innerHTML=formHtml(v);
 const brands=Object.keys(state.catalog),brandEl=$('#adminBrand'),modelEl=$('#adminModel');
 brandEl.innerHTML='<option value="">Válassz márkát</option>'+brands.map(x=>`<option value="${esc(x)}" ${v.brand===x?'selected':''}>${esc(x)}</option>`).join('');
 const setModels=()=>{modelEl.innerHTML='<option value="">Válassz modellt</option>'+(state.catalog[brandEl.value]||[]).map(x=>`<option value="${esc(x)}" ${v.brand===brandEl.value&&v.model===x?'selected':''}>${esc(x)}</option>`).join('')};
 brandEl.onchange=()=>{v.model='';setModels()};setModels();
 $('#logout').onclick=logout;$('#adminList').onclick=showAdminList;
 $('#listingForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.tuning=[['motor','Motor'],['turbo','Turbo'],['valto','Váltó'],['gumi','Gumi'],['fek','Fék']].map(([key,label])=>`${label}: ${data['tune_'+key]}`);for(const k of Object.keys(data))if(k.startsWith('tune_'))delete data[k];data.price=Number(data.price);try{await api(v.id?'/api/listings/'+v.id:'/api/listings',{method:v.id?'PATCH':'POST',body:JSON.stringify(data)});toast('✅ Hirdetés mentve');closeModal('adminModal');loadListings();loadStats();}catch(err){toast(err.message)}};
 if(v.id){$('#markSold').onclick=()=>setStatus(v.id,'sold');$('#removeListing').onclick=()=>{if(confirm('Biztosan eltávolítod a hirdetést?'))setStatus(v.id,'removed')}};
}
async function setStatus(id,status){try{await api('/api/listings/'+id,{method:'PATCH',body:JSON.stringify({status})});toast('Állapot módosítva');closeModal('adminModal');closeModal('detailModal');loadListings();loadStats()}catch(e){toast(e.message)}}
async function logout(){await api('/api/logout',{method:'POST'});state.authenticated=false;$('#loginTop').textContent='Admin belépés';$('#adminBody').innerHTML=adminLogin();wireLogin();toast('Kijelentkeztél.');}
function wireLogin(){$('#loginForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/login',{method:'POST',body:JSON.stringify({password:$('#password').value})});state.authenticated=true;$('#loginTop').textContent='Admin panel';adminPanel({});}catch(err){toast(err.message)}};}
function showAdmin(){openModal('adminModal');if(state.authenticated)adminPanel({});else{$('#adminBody').innerHTML=adminLogin();wireLogin();}}
$('#adminNav').onclick=$('#loginTop').onclick=showAdmin;
async function loadStats(){try{const s=await api('/api/stats');$('#statActive').textContent=s.active;$('#statSold').textContent=s.sold;}catch{}}
async function init(){try{const cfg=await api('/api/config');state.authenticated=cfg.authenticated;state.catalog=cfg.catalog;$('#statBrands').textContent=Object.keys(cfg.catalog).length;$('#brandFilter').innerHTML='<option value="">Összes márka</option>'+Object.keys(cfg.catalog).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');if(state.authenticated)$('#loginTop').textContent='Admin panel';}catch(e){toast(e.message)}await Promise.all([loadListings(),loadStats()]);const id=new URLSearchParams(location.search).get('listing');if(id)showDetail(id);}
init();
