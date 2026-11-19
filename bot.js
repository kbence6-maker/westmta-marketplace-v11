const {Client,GatewayIntentBits,Events,SlashCommandBuilder,PermissionFlagsBits,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,LabelBuilder,FileUploadBuilder,EmbedBuilder,MessageFlags}=require('discord.js');
const {getCatalog,CARS}=require('./catalog');
const {FIELDS,options,toList}=require('./tuning');
const store=require('./db');
const events=require('./events');
const drafts=new Map();
const cmd=[
 new SlashCommandBuilder().setName('piacter').setDescription('Marketplace V11 hirdetésfeladó panel').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
 new SlashCommandBuilder().setName('hirdeteseim').setDescription('Saját aktív járműhirdetéseim')
];
const priv=(content,components=[])=>({content,components,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
const row=(...items)=>new ActionRowBuilder().addComponents(...items);
const btn=(id,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const safe=s=>String(s??'').replace(/([*_~`|>])/g,'\\$1').replace(/@/g,'@\u200b');
function panel(){return {embeds:[new EmbedBuilder().setColor(0xd4af37).setTitle('🚘 WESTMTA • MARKETPLACE V11').setDescription('A 81 járműves WestMTA katalógusból választhatsz.\n\n**01** Márka és modell\n**02** Motor, Turbo, Váltó, Gumi, Fék — külön fokozatokkal\n**03** Ár, RP telefonszám, extrák és maximum 2 kép\n\nA hirdetés azonnal megjelenik a weboldalon is.').setFooter({text:'WestMTA Marketplace • Discord + web'})],components:[row(btn('mp:new','Hirdetés feladása',ButtonStyle.Primary))]};}
function draftFor(i){const d=drafts.get(i.user.id);if(!d||d.guild!==i.guildId||d.expires<Date.now()){drafts.delete(i.user.id);return null;}d.expires=Date.now()+30*60*1000;return d;}
function brandMenu(page=0){const brands=Object.keys(getCatalog());const chunk=brands.slice(page*23,page*23+23);const opts=chunk.map(x=>({label:x.slice(0,100),value:x}));if(page>0)opts.push({label:'◀ Előző márkák',value:'__prev'});if((page+1)*23<brands.length)opts.push({label:'Következő márkák ▶',value:'__next'});return row(new StringSelectMenuBuilder().setCustomId(`mp:brand:${page}`).setPlaceholder('Válassz márkát').addOptions(opts));}
function modelMenu(brand,page=0){const list=getCatalog()[brand]||[];const chunk=list.slice(page*23,page*23+23);const opts=chunk.map(x=>({label:x.slice(0,100),value:x}));if(page>0)opts.push({label:'◀ Előző modellek',value:'__prev'});if((page+1)*23<list.length)opts.push({label:'Következő modellek ▶',value:'__next'});return row(new StringSelectMenuBuilder().setCustomId(`mp:model:${page}`).setPlaceholder('Válassz modellt').addOptions(opts));}
function tuningView(d){const complete=FIELDS.every(([key])=>d[key]);const summary=FIELDS.map(([key,label])=>`**${label}:** ${safe(d[key]||'Nincs kiválasztva')}`).join('\n');if(complete)return priv(`🚘 **${safe(d.brand+' '+d.model)}**\n⚙️ **Tuningok**\n${summary}\n\n✅ Minden tuning kiválasztva.`,[row(btn('mp:details','📝 Adatok és képek',ButtonStyle.Success),btn('mp:edit','⚙️ Módosítás'),btn('mp:cancel','Mégse',ButtonStyle.Danger))]);return priv(`🚘 **${safe(d.brand+' '+d.model)}**\n⚙️ **Válaszd ki mind az öt tuningot!**\n${summary}`,FIELDS.map(([key,label])=>row(new StringSelectMenuBuilder().setCustomId('mp:tune:'+key).setPlaceholder(`${label} – ${d[key]||'válassz'}`).addOptions(options(key).map(v=>({label:v,value:v,default:d[key]===v}))))));}
function input(id,label,style,required,maxLength){return new LabelBuilder().setLabel(label).setTextInputComponent(new TextInputBuilder().setCustomId(id).setStyle(style).setRequired(required).setMaxLength(maxLength));}
function detailsModal(){return new ModalBuilder().setCustomId('mp:modal').setTitle('Hirdetés adatai').addLabelComponents(input('price','Ár ($)',TextInputStyle.Short,true,12),input('phone','Telefonszám (játékbeli)',TextInputStyle.Short,true,40),input('extras','Egyéb extrák',TextInputStyle.Paragraph,false,800),new LabelBuilder().setLabel('Képek (maximum 2, opcionális)').setFileUploadComponent(new FileUploadBuilder().setCustomId('images').setRequired(false).setMinValues(0).setMaxValues(2)));}
function listingEmbed(v){const e=new EmbedBuilder().setColor(v.status==='sold'?0x888888:0xd4af37).setTitle('🚘 '+safe(v.brand+' '+v.model)).setDescription(v.description||'Eladó jármű a WestMTA piactéren.').addFields({name:'💰 Ár',value:Number(v.price).toLocaleString('hu-HU')+' $',inline:true},{name:'📞 RP telefon',value:safe(v.phone||'Nincs megadva'),inline:true},{name:'👤 Hirdető',value:v.seller_id?`<@${v.seller_id}>`:'Webadmin',inline:true},{name:'⚙️ Tuningok',value:v.tuning.map(safe).join('\n').slice(0,1024)||'Nincs megadva'},{name:'✨ Egyéb extrák',value:safe(v.description||'Nincs megadva').slice(0,1024)}).setFooter({text:`Azonosító: ${v.id.slice(0,8)} • ${v.status==='sold'?'ELADVA':'AKTÍV'}`}).setTimestamp(new Date(v.created_at));if(v.image_url)e.setImage(v.image_url);return e;}
async function send(client,id,payload){if(!id)return;try{const ch=await client.channels.fetch(id);if(ch?.isTextBased())return await ch.send(payload);}catch(e){console.warn('[Discord] Küldési hiba:',e.message);}}
async function publish(client,v){const msg=await send(client,process.env.LISTINGS_CHANNEL_ID||process.env.PANEL_CHANNEL_ID,{embeds:[listingEmbed(v)]});if(msg)store.updateMessage(v.id,msg.channelId,msg.id);}
async function log(client,action,v){const labels={created:'Új hirdetés',sold:'Eladva',removed:'Eltávolítva',updated:'Módosítva'};await send(client,process.env.LOG_CHANNEL_ID,{embeds:[new EmbedBuilder().setColor(0x777fa2).setTitle('📋 '+(labels[action]||action)).setDescription(`${safe(v.brand+' '+v.model)} – ${v.id.slice(0,8)}`).setTimestamp()]});}
async function sync(client,v,action){if(v.channel_id&&v.message_id){try{const ch=await client.channels.fetch(v.channel_id);const msg=await ch.messages.fetch(v.message_id);if(action==='removed')await msg.delete();else await msg.edit({embeds:[listingEmbed(v)]});}catch(e){console.warn('[Discord] Frissítés:',e.message);}}if(action==='sold')await send(client,process.env.SOLD_CHANNEL_ID,{embeds:[listingEmbed(v)]});await log(client,action,v);}
async function startBot(){const client=new Client({intents:[GatewayIntentBits.Guilds]});
 client.once(Events.ClientReady,async()=>{console.log(`[Discord] ${client.user.tag} • ${CARS.length} V11 jármű`);try{if(process.env.GUILD_ID){const guild=await client.guilds.fetch(process.env.GUILD_ID);await guild.commands.set(cmd.map(c=>c.toJSON()));}else await client.application.commands.set(cmd.map(c=>c.toJSON()));}catch(e){console.error('[Discord] Parancsregisztráció:',e.message);}if(process.env.AUTO_POST_PANEL==='true')await send(client,process.env.PANEL_CHANNEL_ID||process.env.LISTINGS_CHANNEL_ID,panel());});
 client.on(Events.InteractionCreate,async i=>{try{
  if(i.isChatInputCommand()){
   if(i.commandName==='piacter'){const ch=process.env.PANEL_CHANNEL_ID?await client.channels.fetch(process.env.PANEL_CHANNEL_ID):i.channel;if(!ch?.isTextBased())return i.reply(priv('A panelcsatorna nem található.'));await ch.send(panel());return i.reply(priv(`✅ Panel: <#${ch.id}>`));}
   if(i.commandName==='hirdeteseim'){const mine=store.listListings({status:'active',limit:100}).listings.filter(v=>v.seller_id===i.user.id).slice(0,15);return i.reply(priv(mine.length?mine.map(v=>`• **${safe(v.brand+' '+v.model)}** – ${v.price.toLocaleString('hu-HU')} $`).join('\n'):'Nincs aktív hirdetésed.'));}
  }
  if(i.isButton()){
   if(i.customId==='mp:new'){drafts.set(i.user.id,{guild:i.guildId,expires:Date.now()+30*60*1000});return i.reply(priv('🚘 **Válassz márkát!**',[brandMenu()]));}
   const d=draftFor(i);if(!d)return i.reply(priv('A feladás lejárt. Indítsd újra!'));
   if(i.customId==='mp:cancel'){drafts.delete(i.user.id);return i.update({content:'Megszakítva.',components:[]});}
   if(i.customId==='mp:edit'){for(const [key] of FIELDS)delete d[key];return i.update(tuningView(d));}
   if(i.customId==='mp:details'){if(!d.model||!FIELDS.every(([k])=>d[k]))return i.reply(priv('Előbb válaszd ki mind az öt tuningot.'));return i.showModal(detailsModal());}
  }
  if(i.isStringSelectMenu()){
   const d=draftFor(i);if(!d)return i.reply(priv('A feladás lejárt. Indítsd újra!'));
   if(i.customId.startsWith('mp:brand:')){const page=Number(i.customId.split(':')[2]);const v=i.values[0];if(v==='__next'||v==='__prev')return i.update({components:[brandMenu(page+(v==='__next'?1:-1))]});if(!getCatalog()[v])return i.reply(priv('Érvénytelen márka.'));d.brand=v;d.model=null;return i.update({content:`🚘 **${safe(v)}** – válassz modellt!`,components:[modelMenu(v)]});}
   if(i.customId.startsWith('mp:model:')){const page=Number(i.customId.split(':')[2]);const v=i.values[0];if(v==='__next'||v==='__prev')return i.update({components:[modelMenu(d.brand,page+(v==='__next'?1:-1))]});if(!getCatalog()[d.brand]?.includes(v))return i.reply(priv('Érvénytelen modell.'));d.model=v;for(const [key] of FIELDS)delete d[key];return i.update(tuningView(d));}
   if(i.customId.startsWith('mp:tune:')){const key=i.customId.slice('mp:tune:'.length);if(!FIELDS.some(([k])=>k===key)||!options(key).includes(i.values[0]))return i.reply(priv('Érvénytelen tuning.'));d[key]=i.values[0];return i.update(tuningView(d));}
  }
  if(i.isModalSubmit()&&i.customId==='mp:modal'){
   const d=draftFor(i);if(!d||!d.model||!FIELDS.every(([k])=>d[k]))return i.reply(priv('A kitöltés lejárt, indítsd újra.'));
   const raw=i.fields.getTextInputValue('price').replace(/\s/g,'');if(!/^\d{1,12}$/.test(raw)||Number(raw)<=0||!Number.isSafeInteger(Number(raw)))return i.reply(priv('Az ár pozitív egész szám legyen.'));
   const phone=i.fields.getTextInputValue('phone').trim();if(!phone)return i.reply(priv('Add meg a játékbeli telefonszámot.'));
   const files=i.fields.getUploadedFiles('images',false);const images=files?[...files.values()]:[];if(images.length>2||images.some(x=>!(x.contentType||'').startsWith('image/')))return i.reply(priv('Maximum 2 kép tölthető fel.'));
   await i.deferReply({flags:MessageFlags.Ephemeral});
   const v=store.createListing({brand:d.brand,model:d.model,price:Number(raw),phone,description:i.fields.getTextInputValue('extras')||'',image_url:images[0]?.url||'',tuning:toList(d),seller_id:i.user.id,seller_name:i.user.username});
   drafts.delete(i.user.id);await publish(client,v);await log(client,'created',v);return i.editReply(`✅ Hirdetés feladva! **${safe(d.brand+' '+d.model)}** • ${v.id.slice(0,8)}\n${images.length===2?'A második feltöltött kép jelenleg nem jelenik meg a weboldalon; az első képet tároljuk.':''}`);
  }
 }catch(err){console.error('[Discord] Interakció:',err);try{if(i.deferred||i.replied)await i.followUp(priv('❌ '+(err.message||'Hiba történt.')));else await i.reply(priv('❌ '+(err.message||'Hiba történt.')));}catch{}}});
 events.on('listing:created',async v=>{await publish(client,v);await log(client,'created',v);});events.on('listing:updated',async ({listing,action})=>sync(client,listing,action));
 await client.login(process.env.DISCORD_TOKEN);return client;
}
module.exports={startBot};
