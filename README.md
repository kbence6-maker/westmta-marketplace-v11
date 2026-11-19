# WestMTA Marketplace – V11 integrált (2.2)

A beküldött **V11 cars.js** pontosan **81 járművet** tartalmaz. A panel és a webes admin az eredeti V11 öt tuningkategóriáját használja:
- Motor, Váltó, Gumi, Fék: Gyári, Kezdő, Haladó, Profi, Verseny, Prémium
- Turbo: ugyanezek + Állítható, Supercharger

A Discordos feladás a V11-hez hasonlóan márka → modell → 5 külön tuning → ár, RP-telefonszám, extrák, opcionális 0–2 kép útvonalon halad. Az első kép URL-jét a weboldal elmenti; a második képet jelenleg nem tárolja, ezért az nem jelenik meg a hirdetésben. A webes admin a V11 szerinti tuningmezőkkel dolgozik. A Discord és a web ugyanazt a SQLite-adatbázist használja.

## Átállás a működő Marketplace 2.1-ről
1. Állítsd le a régi botot a CMD-ben a `Ctrl+C` paranccsal.
2. **Készíts biztonsági másolatot a teljes régi `marketplace-2.0` mappáról**, különösen a `data/marketplace.sqlite` fájlról.
3. Az új ZIP-et csomagold ki egy új mappába. A **saját** korábbi `.env` fájlodat másold ide (a ZIP nem tartalmaz tokent vagy jelszót). A korábban nyilvánosságra került bot tokenedet előtte a Developer Portalon reseteld.
4. Ha meg szeretnéd tartani a régi hirdetéseket: másold át a korábbi `data` mappát az új projektbe, miközben egyik szerver sem fut. Ne töröld a régi adatbázist.
5. Az új mappában CMD: `npm install`, majd `node index.js`.
6. A dashboard továbbra is http://localhost:3000, a bot főpanelje a `/piacter` paranccsal küldhető ki.

## Csatornák
A meglévő `.env` változókat használja: `PANEL_CHANNEL_ID`, `LISTINGS_CHANNEL_ID`, `SOLD_CHANNEL_ID`, `LOG_CHANNEL_ID`. Az `AUTO_POST_PANEL=true` új panelt is létrehozhat indításkor. Opcionális csatornák kihagyhatók.

## Fontos
Ez új, külön mappába telepíthető verzió; nem írja felül automatikusan a régi fájlokat. A Node.js és Discord telepítés miatt az éles Discord-interakciók helyi tesztelése szükséges. A képfeltöltés Discord.js 14.28+ verziót igényel.
