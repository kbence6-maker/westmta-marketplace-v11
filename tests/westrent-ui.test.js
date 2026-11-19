const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const {getCatalog,CARS,isCatalogCar}=require('../catalog');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
test('WestRent 81 eredeti jármű márka/modell szerint',()=>{
 assert.equal(CARS.length,81);
 assert.equal(Object.values(getCatalog()).flat().length,81);
 assert.ok(getCatalog()['Alfa Romeo'].includes('Giulia Quadrifoglio'));
 assert.ok(getCatalog()['Mercedes-Benz'].includes('GT63 AMG'));
 assert.ok(isCatalogCar('Audi','R8'));
 assert.ok(isCatalogCar('Mercedes','Benz C63 AMG')); // régi hirdetés kompatibilitás
});
test('Weboldalon nincs verziójelölés, de van WestRent és szabályzat',()=>{
 assert.ok(html.includes('WestRent'));
 assert.ok(!/V11|V12|V13|V14/.test(html));
 assert.ok(html.includes('page-rules'));
 assert.ok(html.includes('Kizárólag IC kereskedelem'));
});
test('Képfeltöltés és képelőnézet a felületen',()=>{
 assert.ok(html.includes('type="file"'));
 assert.ok(html.includes('id="listingImagePreview"'));
 assert.ok(js.includes("'/api/my/uploads/image'"));
 assert.ok(server.includes("'/api/my/uploads/image'"));
 assert.ok(server.includes("'/uploads'"));
});
