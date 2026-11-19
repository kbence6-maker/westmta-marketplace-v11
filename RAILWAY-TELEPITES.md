# WestRent Railway – gyors telepítés

1. Mentsd le a meglévő `/data/marketplace.sqlite` adatbázist (ha van adat).
2. A **meglévő** privát GitHub-repositoryban cseréld a forrásfájlokat a WestRent csomagjára. A `.env` és a `data` könyvtár nem tölthető fel.
3. Railway → szolgáltatás → Volume → mount path: **`/data`**. A fotók `/data/uploads` alá kerülnek. A Volume maradjon minden deploynál.
4. Railway → Variables → `COMPANY_NAME=WestRent`; `DATA_DIR=/data`; `NODE_ENV=production`; `REQUIRE_IC_VERIFICATION=true`; `BROKER_COMMISSION_PERCENT=15`; `ADMIN_PASSWORD` új, erős, minimum 20 karakteres jelszó; `PUBLIC_URL` = saját Railway HTTPS-cím. `IC_COMPANY_PHONE` opcionális.
5. Deploy. Healthcheck `/health`. Kattints: IC regisztráció → cégtulajdonosi IC ellenőrzés → autó bérbeadása → márka/modell → kép kiválasztása → hirdetés → bérlési kérelem → céges közvetítés jóváhagyása.
6. A korábbi Discord-token és csatorna-ID-k NEM szükségesek. A korábban megosztott titkokat cseréld le.

Ha a képek újraindulás után eltűnnek, akkor a `/data` Volume csatolása hiányzik/hibás. A csomag nem tartalmaz bejelentkezési titkokat.


## Megjelenés és cégtulajdonosi szerep
- A webes gombok és üzenetek Cégtulajdonos megnevezést használnak (a régi belső `/api/admin/...` útvonalak és az `ADMIN_PASSWORD` Railway változó kompatibilitási okból megmaradnak).
- A nyitóképet a `public/westrent-hero.webp` fájl tartalmazza.
- A hivatalos WestMTA szerver szabályzat linkje: https://rules.westmta.com/server
- A hirdetések és az SQLite-adatbázis nem változik; a meglévő Railway `/data` Volume-ot meg kell tartani.
