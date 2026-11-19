# WestRent frissítés – hirdetés törlése és képek

**Ez a ZIP gyökérben tartalmazza a projektfájlokat** (`index.js`, `server.js`, `db.js`, `public/`). Nincs benne `WestRent-Updated/` nevű extra mappa.

1. GitHub repository gyökerében cseréld a fájlokat. Ne hozz létre új almappát.
2. Ha a Railway-en az **Auto deploy is disabled** felirat látszik, kapcsold be, vagy a legutóbbi GitHub commitnál manuálisan telepíts.
3. Új deployment **Active** állapota után nyisd meg: `https://westrenting.co.uk/health`. Ellenőrizd a `build` mezőt: `foto-torles-20261119`.
4. Böngészőben `Ctrl+Shift+R` frissítés, majd a Saját profil / hirdetés törlése teszt.
5. Railway Volume `/data` maradjon meg. Ne töröld vagy módosítsd a meglévő adatbázist.

A hirdetés törlése **logikai törlés**: a nyilvános listából és saját aktív hirdetések közül eltűnik, a DB-ben viszont megmarad a történet a kérelmek miatt. Bérbe adott autó esetén is megengedett.

Új változó nem szükséges. A weboldalhoz csak a meglévő Railway környezeti változók kellenek.
