'use strict';
// A felhasználó által megadott IC befizetésből számított becsült adókulcs.
const TAX_PERCENT=5;
function taxAmount(amount){
 if(!Number.isSafeInteger(amount)||amount<0)throw Error('Érvényes, nem negatív egész IC összeg szükséges.');
 // Egész dolláros, felfelé kerekített 0,5 szabály; nincs lebegőpontos szorzási hiba.
 return Number((BigInt(amount)*BigInt(TAX_PERCENT)+50n)/100n);
}
module.exports={TAX_PERCENT,taxAmount};
