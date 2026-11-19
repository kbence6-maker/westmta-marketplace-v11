// WestMTA V11: kizárólag a felhasználó 81 járműves eredeti listája.
const CARS = require('./cars');
function getCatalog(){
 const result={};
 for(const full of CARS){
  const split=full.indexOf(' ');
  const brand=split<0?full:full.slice(0,split);
  const model=split<0?full:full.slice(split+1);
  (result[brand]??=[]).push(model);
 }
 return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b,'hu')));
}
module.exports={getCatalog,CARS};
