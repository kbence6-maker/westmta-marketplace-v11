// Eredeti 81 jármű változtatás nélkül a cars.js fájlból.
const CARS = require('./cars');
function splitCar(full){
  if(full.startsWith('Alfa Romeo '))return {brand:'Alfa Romeo',model:full.slice('Alfa Romeo '.length)};
  if(full.startsWith('Mercedes-Benz '))return {brand:'Mercedes-Benz',model:full.slice('Mercedes-Benz '.length)};
  if(full.startsWith('Mercedes Benz '))return {brand:'Mercedes-Benz',model:full.slice('Mercedes Benz '.length)};
  const pos=full.indexOf(' ');
  return pos<0?{brand:full,model:''}:{brand:full.slice(0,pos),model:full.slice(pos+1)};
}
function getCatalog(){
  const result={};
  for(const full of CARS){const {brand,model}=splitCar(full);(result[brand]??=[]).push(model)}
  return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b,'hu')));
}
function isCatalogCar(brand,model){return (getCatalog()[brand]||[]).includes(model)||CARS.includes(`${brand} ${model}`)}
module.exports={getCatalog,CARS,splitCar,isCatalogCar};
