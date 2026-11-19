// Pontosan a beküldött V11 választási lehetőségei.
const FIELDS=[['motor','Motor'],['turbo','Turbo'],['valto','Váltó'],['gumi','Gumi'],['fek','Fék']];
const NORMAL=['Gyári','Kezdő','Haladó','Profi','Verseny','Prémium'];
const TURBO=[...NORMAL,'Állítható','Supercharger'];
function options(key){return key==='turbo'?TURBO:NORMAL;}
function toList(values){return FIELDS.map(([key,label])=>`${label}: ${values[key]}`).filter(x=>!x.endsWith('undefined'));}
function fromList(list){const out={};for(const [key,label] of FIELDS){const hit=(list||[]).find(x=>typeof x==='string'&&x.startsWith(`${label}: `));if(hit)out[key]=hit.slice(label.length+2);}return out;}
module.exports={FIELDS,NORMAL,TURBO,options,toList,fromList};
