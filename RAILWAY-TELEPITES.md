# WestRent – Railway frissítés (önkiszolgáló)

1. Töltsd fel a ZIP **belsejében lévő összes fájlt** GitHub gyökérkönyvtárába a meglévők helyére; a `public` mappát és az új `tax.js` fájlt is.
2. Railway: a korábbi projektet használd, ne hozz létre újat, az adatokat tartalmazó `/data` Volume-ot ne töröld.
3. Variable-ként maradjon: `ADMIN_PASSWORD` (legalább 20 karakter), `DATA_DIR=/data`, `COMPANY_NAME=WestRent`, `PUBLIC_URL=https://westrenting.co.uk`.
4. A korábbi `REQUIRE_IC_VERIFICATION` és `BROKER_COMMISSION_PERCENT` kikapcsolható/törölhető; többé nincs sem hirdetés-, sem IC-telefonjóváhagyás.
5. Deploy után ellenőrizd: https://westrenting.co.uk/health – `"build":"westrent-onkiszolgalo-20261119"`.
6. Böngészőben `Ctrl+Shift+R` és teszteld: magánhirdetés, bérbe adva/elérhető/törlés, tuningigény, tulajdonosi bevétel.

**FIGYELEM**: Frissítés előtt készíts biztonsági másolatot a SQLite `/data` Volume-ról. A korábban függőben lévő céges hirdetések magánhirdetésre váltanak, ha nem lettek eltávolítva. A játékbeli bevételeket kézzel kell rögzíteni; az oldal a WestMTA szerverével nincs összekötve.
