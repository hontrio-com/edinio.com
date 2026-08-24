import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cheiaContului, LIMITE_RITM } from "./ritm";

/* ══════════════════════════════════════════════════════════════════════════
   RITMUL SE NUMARA INTR-UN SINGUR LOC, NU IN FIECARE INSTANTA (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Galeata cu jetoane din `client.ts` traieste in MEMORIA instantei. Dar aceeasi cheie
   de vanzator e folosita din mai multe locuri deodata — cronul pe o instanta, importul pe
   alta, un buton apasat de om pe a treia, un webhook sosit intre timp. Fiecare crede ca
   are cele 3 cereri pe secunda intregi. eMAG vede suma.

   ⚠ Iar depasirea nu se plateste doar cu un 429: documentatia lor spune ca si cererile
   INVALIDE se numara in limita. Bugetul ars e chiar cel prin care trebuie sa plece o
   mișcare de stoc dupa o vanzare.

   ══════════════════════════════════════════════════════════════════════════
   CE E DOVEDIT IN POSTGRES, SI CE PAZESTE FISIERUL ASTA
   ══════════════════════════════════════════════════════════════════════════

   Contorul insusi a fost masurat in baza, ca `service_role`, intr-o tranzactie intoarsa
   la loc (25.08.2026):

     limita 3, fereastra 1000 ms   →  1=true 2=true 3=true 4=false, asteapta=1000
     dupa ce trece fereastra       →  true, folosite=1
     `vezi_ritm_extern` de doua ori →  1, 1   (privirea NU consuma)

   Probele de aici pazesc partea care se poate strica din cod: cheia, limitele scrise si
   purtarea la plafonul zilnic.
*/

test("cheia e a CONTULUI LOR, nu a magazinului nostru", () => {
  /*
   * ⚠ Limita e a VANZATORULUI la ei. Doua magazine Edinio legate la acelasi cont eMAG
   * impart acelasi buget — numarate separat, ar fi trecut de el impreuna fara sa vada
   * nimeni. Galeata din memorie chiar asa era cheiata, pe `businessId`.
   */
  const a = cheiaContului({ username: "vanzator@example.com", tara: "ro" });
  const b = cheiaContului({ username: "vanzator@example.com", tara: "ro" });
  assert.equal(a, b, "acelasi cont trebuie sa dea aceeasi cheie");

  const altul = cheiaContului({ username: "altul@example.com", tara: "ro" });
  assert.notEqual(a, altul);
});

test("aceeasi adresa pe alta tara e alt buget", () => {
  /* ⚠ eMAG RO, BG si HU sunt platforme separate, cu limite separate. Amestecate sub o
     cheie, un import mare pe RO ar fi incetinit comenzile de pe HU degeaba. */
  const ro = cheiaContului({ username: "v@example.com", tara: "ro" });
  const hu = cheiaContului({ username: "v@example.com", tara: "hu" });
  assert.notEqual(ro, hu);
});

test("adresa de e-mail nu se scrie ca atare in tabelul de contorizare", () => {
  /*
   * ⚠ Numele de utilizator la eMAG e o adresa de e-mail. Un tabel nou de contorizare n-are
   * de ce sa devina inca un loc in care stau adresele comerciantilor.
   */
  const c = cheiaContului({ username: "vanzator@example.com", tara: "ro" });
  assert.ok(!c.includes("@"), "cheia nu are voie sa poarte adresa");
  assert.ok(!c.includes("vanzator"), "si nici bucati din ea");
  assert.match(c, /^[0-9a-f]{32}$/, "e o amprenta, si e stabila");
});

test("scrisul e insensibil la majuscule si la spatii", () => {
  /* ⚠ Acelasi cont scris altfel in doua magazine ar fi primit doua bugete. */
  const a = cheiaContului({ username: "Vanzator@Example.com ", tara: "ro" });
  const b = cheiaContului({ username: "vanzator@example.com", tara: "ro" });
  assert.equal(a, b);
});

test("limitele sunt cele din documentatia lor", () => {
  assert.equal(LIMITE_RITM.comenzi.limita, 12, "12 pe secunda pe /order*");
  assert.equal(LIMITE_RITM.restul.limita, 3, "3 pe secunda cumulat pe restul");
  assert.equal(LIMITE_RITM.eanSecunda.limita, 5);
  assert.equal(LIMITE_RITM.eanMinut.limita, 200);
  assert.equal(LIMITE_RITM.eanMinut.fereastraMs, 60_000);
  assert.equal(LIMITE_RITM.eanZi.limita, 5000);
  assert.equal(LIMITE_RITM.eanZi.fereastraMs, 86_400_000, "o zi, in milisecunde");
});

/* ── Purtarea, citita din cod ─────────────────────────────────────────────── */

function faraNote(cale: string): string {
  return readFileSync(cale, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

test("se cade DESCHIS: o baza cazuta nu opreste cererile catre eMAG", () => {
  /*
   * ⚠ Cea mai importanta hotarare din fisier, si e usor de inversat din greseala.
   *
   * Cazut inchis, un hop al bazei ar opri TOATE cererile catre eMAG ale TUTUROR
   * magazinelor — inclusiv confirmarile de comenzi si mișcarile de stoc dupa vanzari.
   * Adica un incident mult mai mare decat depasirea de care ne aparam. Iar plasa de
   * dedesubt exista deja: antetele lor si 429-ul.
   */
  const cod = faraNote("src/lib/emag/ritm.ts");
  const i = cod.indexOf("export async function ceruJeton(");
  assert.ok(i > 0, "n-am gasit `ceruJeton`");
  const corp = cod.slice(i, cod.indexOf(String.fromCharCode(10) + "}", i));

  const laEroare = corp.slice(corp.indexOf("if (error)"));
  assert.match(laEroare, /ok: true/, "la eroare de baza, cererea trebuie sa plece");

  assert.match(corp, /catch \{[\s\S]*?ok: true/, "si la exceptie, la fel");
});

test("plafonul ZILNIC nu se asteapta, se refuza", () => {
  /*
   * ⚠ Cele doua ferestre scurte se pot astepta: cel mult o secunda, sau un minut. Cea
   * zilnica nu — o asteptare de ore n-are ce cauta intr-un cron cu `maxDuration = 60`.
   *
   * ⚠ Si nici nu se trece cu vederea: lovind plafonul lor, ruta s-ar inchide pentru tot
   * restul zilei, inclusiv pentru publicarile care chiar contau.
   */
  const cod = faraNote("src/lib/emag/ritm.ts");
  const i = cod.indexOf("export async function maiAreBugetZilnicEan(");
  assert.ok(i > 0, "n-am gasit paza plafonului zilnic");
  const corp = cod.slice(i, cod.indexOf(String.fromCharCode(10) + "}", i));
  assert.ok(!/asteaptaJetonImpartit/.test(corp), "pe plafonul zilnic NU se asteapta");
  assert.match(corp, /return r\.ok;/, "se raspunde da sau nu");
});

test("clientul cere jeton pe cont INAINTE de fiecare cerere", () => {
  const cod = faraNote("src/lib/emag/client.ts");
  const i = cod.indexOf("const pornitLa = Date.now();");
  assert.ok(i > 0, "n-am gasit cronometrul");
  const inainte = cod.slice(Math.max(0, i - 900), i);

  assert.match(inainte, /asteaptaJeton\(galeata/, "galeata locala ramane: taie varfurile gratis");
  assert.match(inainte, /asteaptaJetonImpartit\(/, "si arbitrul din baza");
  assert.match(inainte, /cheiaContului\(auth\)/, "pe cheia contului lor");
});

test("cautarea dupa cod de bare isi cere si bugetul zilnic", () => {
  const cod = faraNote("src/lib/emag/client.ts");
  const i = cod.indexOf("export async function cautaDupaEan(");
  assert.ok(i > 0);
  const corp = cod.slice(i, cod.indexOf("find_by_eans?", i));

  assert.match(corp, /ean:s`, LIMITE_RITM\.eanSecunda/, "5 pe secunda");
  assert.match(corp, /ean:m`, LIMITE_RITM\.eanMinut/, "200 pe minut");
  assert.match(corp, /maiAreBugetZilnicEan\(auth\)/, "si 5000 pe zi");

  /* ⚠ La plafon plin se raspunde `trecatoare`, nu `refuz`: nu e vina produsului, si nu
     are voie sa arda o incercare din cele cinci. Iar `cautaInCatalogulLor` opreste atunci
     publicarea, in loc s-o lase sa creeze produsul pe orb in catalogul lor comun. */
  assert.match(corp, /verdict: "trecatoare"/, "plafonul atins nu arde o incercare");
});

test("randurile uitate se curata, dar nu cele active", () => {
  /*
   * ⚠ Se sterge dupa `actualizat_la`, nu dupa fereastra: randul unui magazin activ trebuie
   * sa ramana. Sters si recreat, fiecare cerere ar fi insemnat un `insert` in loc de un
   * `update` — adica exact pe hartia cea mai fierbinte din tabel.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const i = baseline.indexOf("FUNCTION public.curata_ritm_extern");
  assert.ok(i > 0, "n-am gasit curatenia in baseline");
  const corp = baseline.slice(i, i + 900);
  assert.match(corp, /actualizat_la < now\(\) - interval '7 days'/);

  /* Si chiar se cheama de undeva. */
  const cron = faraNote("src/app/api/cron/emag-sync/route.ts");
  assert.match(cron, /rpc\("curata_ritm_extern"\)/, "altfel tabelul creste la nesfarsit");
});
