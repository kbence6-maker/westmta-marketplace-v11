# WestRent – önkiszolgáló IC autókölcsönző

Csak játékbeli (IC $) autóbérlésekhez. Nem hivatalos WestMTA-integráció, és nem kapcsolódik a szerver telefonszolgáltatásához vagy pénzrendszeréhez.

## Funkciók

- Minden regisztrált játékos azonnal magánhirdetést adhat fel a 81 V11 járművel, öt tuninggal, saját képpel (max. 5 MB), napi/heti/havi díjjal és kaucióval.
- A játékos saját hirdetését bármikor **Elérhető / Bérbe adva** állapotra állíthatja, szerkesztheti vagy törölheti; a bérbe adott autó látható marad.
- Bérlés egyeztetése: időtartam, indulási dátum, IC telefonszám a profilból, üzenet. Az autó hirdetője látja a megkereséseket, nincs jóváhagyási lépés.
- Egyedi tuningkérelem: kizárólag IC telefonszám. Nem szükséges regisztráció, autóválasztás vagy leírás. A beküldést a rendszer IP-címenként óránként 5 alkalomra korlátozza; csak a cégtulajdonos látja a megkereséseket.
- Csak tulajdonosi jelszóval elérhető **Tulajdonosi bevételek**: kézzel felvitt tényleges IC befizetések, becsült 5% adó, nettó összeg; bevételi history és tuningmegkeresések egyesével vagy tömegesen törölhetők. A játékosok nem látják az adót sem a hirdetéseken, sem a hirdetésfeladási űrlapon, sem a nyilvános API-n keresztül.
- A beküldött példa alapján a kalkulált adó **5%** (17 500 000 $ után 875 000 $). Ez becslés; a játék levonásai eltérhetnek.
- A már meglévő IC-fiókok, hirdetések, képek és korábbi kérelmek megmaradnak ugyanazon SQLite adatbázisban. Régi, függő céges közvetítések magánhirdetésként automatikusan publikálódnak, kivéve a korábban törölteket.

## Adatvédelem és működés

Az IC telefonszám nincs ellenőrizve a WestMTA-val. A webes fiókjelszó teljesen különálló, és nem szabad WestMTA-fiókjelszót használni. **Jelszó nélküli IC telefonszám-azonosság igazolása nem történik; az első regisztráló magához kötheti a megadott számot.**

A tulajdonosi bevételek nem láthatók a publikus API-ban: az `/api/owner/finance` kizárólag a külön, 20+ karakteres `ADMIN_PASSWORD` belépés után érhető el. Ez a változónév a kompatibilitás miatt maradt így, a felületen csak „Cégtulajdonos” látható. A tulajdonosi belépés 12 órás, szervermemóriában tárolt munkamenet.

A pénzmozgásokat a rendszer **nem érzékeli automatikusan**. A kézzel bevitt bevétel az adó előtti IC bruttó összeg. A rendszer annak 5%-át levonva számolja a becsült nettót. Az eredmények egész dollárra vannak kerekítve.

## Railway

1. ZIP **tartalmát** másold a GitHub repository gyökerébe. Ne egy plusz almappát tölts fel.
2. A Railway-en maradjon meg a meglévő `/data` Volume (és készíts biztonsági mentést a frissítés előtt).
3. Variables: `DATA_DIR=/data`, `COMPANY_NAME=WestRent`, `PUBLIC_URL=https://westrenting.co.uk`, `ADMIN_PASSWORD=<új erős jelszó>`.
4. A `REQUIRE_IC_VERIFICATION` és `BROKER_COMMISSION_PERCENT` már nem szükséges; a régi értékük nem befolyásolja az önkiszolgáló működést.
5. GitHub commit után állítsd be az Auto Deploy-t, vagy kézzel telepítsd az új commitot.
6. `/health` végponton a `westrent-privat-tuning-history-20261119` buildet keresd. Böngészőben utána `Ctrl+Shift+R`.

Kódszintaxis ellenőrzés: `npm run check`.
Teszt: `npm test` (telepített függőségek szükségesek).

## Fontos: előzmények törlése

A Tulajdonosi bevételek felületen egyesével és egyben törölhetők a kézzel rögzített bevételek, valamint a beérkezett tuningmegkeresések. **Végleges törlés**: a bevételi összesítők újraszámolódnak; előtte érdemes az adatbázisról mentést készíteni. Az IC fiókok és autóhirdetések nem törlődnek ettől.
