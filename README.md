# WestRent – IC autókölcsönző

**Weboldal, nem Discord bot.** A WestRent egy független, kizárólag IC autóbérlési érdeklődéseket kezelő közösségi webportál a WestMTA szerepjátékosai számára. Nem hivatalos WestMTA-oldal, nincs közvetlen MTA-szerverintegráció vagy automatikus játékbeli pénzmozgás.

## Funkciók

- A felhasználók IC névvel és IC telefonszámmal regisztrálnak, külön weboldalas jelszóval (sosem játékjelszóval). A szám aktiválását játékbeli IC kódegyeztetéssel az admin végzi.
- **Pontosan az eredeti 81 jármű** a `cars.js` fájlból, márka → modell választóval. Az Alfa Romeo és Mercedes-Benz márkák megfelelően csoportosítva; a régi tárolt megnevezések továbbra is elfogadhatók.
- Motor, turbó, váltó, gumi és fék külön választva, az eredeti fokozatokkal (turbó: Állítható és Supercharger is).
- **Saját autó bérbeadása:** magán = az IC fiók aktiválása után azonnal publikált; céges közvetítés = admin jóváhagyással, 1–50% IC jutalékkal.
- **Valódi fájlfeltöltés:** egy JPG/PNG/WebP kép a böngészőből, max. 5 MB; a kliens lehetőség szerint WebP formátumba tömöríti és eltávolítja a metaadatokat. A szerver a képet a `/data/uploads` könyvtárba menti. Korlát 15 kép / fiók / 24 óra és 20 feltöltés / IP / óra. A képek publikusak (hirdetéseken látszanak).
- Napi/heti/havi IC díj, IC kaució, extrák, bérlési kérelmek, saját profil és adminpanel.
- Külön **WestRent IC szabályzat** fül, nincs autóeladás, OOC kereskedelem vagy valós pénz.
- Szintaktikai ellenőrző és tesztek a `tests/` mappában.

## Railway telepítés, korábbi verzió frissítése

1. Készíts mentést a Railway `/data/marketplace.sqlite` adatbázisról, ha van fontos adatod. A régi tábla nem törlődik; új `ic_uploads` tábla jön létre.
2. **A meglévő privát GitHub repó** tartalmát frissítsd a ZIP-fájlban szereplő projekttel, benne a teljes `public/` mappával. `.env` és `data/` soha ne kerüljön GitHubra.
3. Railway szolgáltatásnál a **Volume mount path legyen `/data`**. Ide kerül az SQLite és a feltöltött képek is. A Volume-ot NE töröld új deploy előtt.
4. Railway → Variables: `COMPANY_NAME=WestRent`, `DATA_DIR=/data`, `NODE_ENV=production`, `ADMIN_PASSWORD=<új legalább 20 karakteres jelszó>`, `REQUIRE_IC_VERIFICATION=true`, `BROKER_COMMISSION_PERCENT=15`, `PUBLIC_URL=<a saját HTTPS Railway domained>`. A `PORT`-ot a Railway kezeli. `IC_COMPANY_PHONE` akkor adható hozzá, ha már van IC céges telefonszám.
5. Deploy → ellenőrizd a `/health` végpontot, valamint IC regisztráció, fiókaktiválás, magánhirdetés + fotó, bérlési kérelem, céges kérelem + jóváhagyás folyamatot.
6. A korábbi Discord bothoz tartozó tokeneket/csatorna ID-kat törölheted a Railway Variables-ból, erre a webes kiadásra nem kellenek.

**Biztonság:** A beszélgetésben korábban megosztott Discord-token és adminjelszó kompromittáltnak tekintendő; cseréld őket. Képet csak olyat tölts fel, amit megoszthatsz nyilvánosan. A kliens által végzett képtömörítés nem jelenti azt, hogy minden böngészőben garantált a metaadatok eltávolítása.

## Helyi futtatás

Node.js 22, `cp .env.example .env` (Windows: fájl átnevezése), beállítások kitöltése, `npm install`, majd `npm start`. Ezt követően `http://localhost:3000`.

Teszt: `npm run check`, `npm test` (az adatbázistesztekhez `better-sqlite3` natív modul telepítve kell legyen). A felhasználói UI nem mutat verziószámot.

**Megjegyzés:** A kizárólag IC tartalom nem jelenti automatikusan, hogy egy külső oldal a WestMTA szabályzata szerint engedélyezett. Az alkalmazás nem kér WestMTA bejelentkezési adatokat és nem használ nem engedélyezett API-t.
