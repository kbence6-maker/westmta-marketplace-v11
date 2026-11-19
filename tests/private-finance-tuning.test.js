'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Játékosok nem látnak adót sem hirdetésben, sem publikus API-ban, sem IC szabályzatban',()=>{
 const html=src('public/index.html'),client=src('public/app.js'),server=src('server.js');
 assert.doesNotMatch(html,/listingTaxPreview/);
 assert.doesNotMatch(html,/IC díjak és adó|5%-os adó/);
 assert.doesNotMatch(client,/taxInfo\(v\.price\)|listingTaxPreview|const TAX_RATE=5/);
 assert.doesNotMatch(server,/requiresVerification:false,taxPercent:/);
 assert.match(server,/app.get\('\/api\/owner\/finance',adminRequired/);
 assert.match(client,/fin\.taxPercent/);
});

test('Egyedi tuningkérelem űrlap pontosan IC telefonszámot kér és bejelentkezés nélkül elküldhető',()=>{
 const html=src('public/index.html'),client=src('public/app.js'),server=src('server.js'),db=src('db.js');
 const section=html.match(/<section class="page" id="page-tuning"[\s\S]*?<\/section>/)?.[0];
 assert.ok(section);
 assert.deepEqual([...section.matchAll(/<input\b[^>]*name="([^"]+)"/g)].map(x=>x[1]),['phone']);
 assert.doesNotMatch(section,/<select\b|<textarea\b/);
 assert.match(client,/api\('\/api\/tuning-requests','POST',\{phone:f\.elements\.phone\.value\}\)/);
 assert.match(server,/app.post\('\/api\/tuning-requests',tuningLimit,handler/);
 assert.doesNotMatch(server,/app.post\('\/api\/tuning-requests',[^;]*loginRequired/);
 assert.match(db,/const phone=normalizePhone\(input\.phone\)/);
});

test('Csak tulajdonos törölhet egyes vagy összes bevételi és tuning előzményt',()=>{
 const client=src('public/app.js'),server=src('server.js'),db=src('db.js');
 for(const endpoint of ['/api/owner/finance','/api/owner/tuning-requests']){
  assert.ok(server.includes(`app.delete('${endpoint}',adminRequired`));
  assert.ok(server.includes(`app.delete('${endpoint}/:id',adminRequired`));
 }
 assert.match(server,/req\.body\?\.confirm!=='TORLES'/);
 for(const key of ['data-income-clear','data-tuning-clear','data-income-delete','data-tuning-delete'])assert.ok(client.includes(key));
 for(const key of ['clearIncomeHistory','clearTuningHistory','deleteIncome','deleteTuningRequest'])assert.ok(db.includes(`function ${key}`));
});
