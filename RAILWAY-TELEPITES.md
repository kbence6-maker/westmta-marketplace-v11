# WestRent – Railway frissítés (önkiszolgáló)

1. Töltsd fel a ZIP **belsejében lévő összes fájlt** GitHub gyökérkönyvtárába a meglévők helyére; a `public` mappát és az új `tax.js` fájlt is.
2. Railway: a korábbi projektet használd, ne hozz létre újat, az adatokat tartalmazó `/data` Volume-ot ne töröld.
3. Variable-ként maradjon: `ADMIN_PASSWORD` (legalább 20 karakter), `DATA_DIR=/data`, `COMPANY_NAME=WestRent`, `PUBLIC_URL=https://westrenting.co.uk`.
4. A korábbi `REQUIRE_IC_VERIFICATION` és `BROKER_COMMISSION_PERCENT` kikapcsolható/törölhető; többé nincs sem hirdetés-, sem IC-telefonjóváhagyás.
5. Deploy után ellenőrizd: https://westrenting.co.uk/health – `"build":"westrent-auto-berles-20261119"`.
6. Böngészőben `Ctrl+Shift+R` és teszteld: magánhirdetés, bérbe adva/elérhető/törlés, tuningigény, tulajdonosi bevétel.

**FIGYELEM**: Frissítés előtt készíts biztonsági másolatot a SQLite `/data` Volume-ról. A korábban függőben lévő céges hirdetések magánhirdetésre váltanak, ha nem lettek eltávolítva. A bevételi kimutatás elfogadott bérlési kérelmek alapján készül, kézi bérbe adva státusznál 1 időegységgel számol. Mivel az oldal nincs összekötve a WestMTA szerverével, a fizetést nem tudja ellenőrizni; az összeg csak becslés.

A tuningkéréshez IC telefonszám és szöveges üzenet kell; a bevétel/adó csak a külön tulajdonosi bejelentkezés után látható. A tulajdonosi history törlése végleges, ezért készíts előtte adatbázismentést.
