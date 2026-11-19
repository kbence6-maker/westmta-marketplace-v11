'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
test('Tulajdonos törölheti a bérbe adott autót is',()=>{
 const db=src('db.js');
 assert.match(db,/function deleteOwnListing\(uid,lid\)/);
 assert.match(db,/status!='removed'/);
 assert.match(db,/AND owner_user_id=\? AND kind='rental'/);
 assert.match(db,/status IN \('active','rented'\)/);
 assert.match(db,/deleteOwnListing,deleteCompanyListing/);
});
test('Mindkét törlési API jogosultságot ellenőriz',()=>{
 const app=src('server.js');
 assert.match(app,/app.delete\('\/api\/my\/listings\/:id',writeLimit,loginRequired/);
 assert.match(app,/app.delete\('\/api\/admin\/listings\/:id',adminRequired/);
});
test('A képek nem vágódnak le, bérbe adott jelzés és törlésgomb létezik',()=>{
 const app=src('public/app.js'),css=src('public/styles.css');
 assert.match(app,/Jelenleg bérbe adva/);
 assert.match(app,/data-delete-owned/);
 assert.match(app,/data-delete-owned/);
 assert.match(app,/Teljes méretű járműkép megnyitása/);
 assert.match(css,/\.detail-image img\{width:100%;height:100%;object-fit:contain/);
 assert.match(css,/westrent-hero-user-car\.png/);
});
test('A feltöltött fájlok gyökérből induló Railway csomagba valók',()=>{
 assert.match(src('public/index.html'),/westrent-auto-berles-20261119/);
 assert.match(src('server.js'),/westrent-auto-berles-20261119/);
});
