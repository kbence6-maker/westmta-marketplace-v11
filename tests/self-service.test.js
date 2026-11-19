'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const {taxAmount,TAX_PERCENT}=require('../tax');
test('példa adó 5%, napi díj és változó összeg pontos kerekítés',()=>{
 assert.equal(TAX_PERCENT,5);
 assert.equal(taxAmount(17500000),875000);
 assert.equal(taxAmount(50000),2500);
 assert.equal(taxAmount(50001),2500);
 assert.equal(taxAmount(50010),2501);
 assert.equal(taxAmount(1),0);
 assert.equal(taxAmount(10),1);
 assert.throws(()=>taxAmount(-1));
});
test('önkiszolgáló hirdetés és státusz, bevételi hozzáférés',()=>{
 const db=src('db.js'),sv=src('server.js'),ui=src('public/app.js');
 assert.match(db,/const publication_mode='private'/);
 assert.match(db,/status IN \('active','rented'\)/);
 assert.match(db,/function deleteOwnListing/);
 assert.match(db,/function saveIncome/);
 assert.match(sv,/app.get\('\/api\/owner\/finance',adminRequired/);
 assert.match(sv,/app.post\('\/api\/my\/tuning-requests',writeLimit,loginRequired/);
 assert.match(ui,/data-rented/);
 assert.match(ui,/data-available/);
 assert.match(ui,/data-delete-owned/);
});
