import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeazaDefinitia } from "./definitie";
import { campurileDeIncarcare, semneazaPermisul, verificaPermisul, VALABILITATE_MS } from "./permis-incarcare";
import { MB_DOCUMENT, MB_IMAGINE } from "./definitie";

/**
 * ═══ PERMISUL DE INCARCARE ═══
 *
 * `/api/upload-customization` e cel mai expus capat din proiect: public, neautentificat, primeste
 * pana la 40 MB pe fisier si scrie in depozitul platit — din care nimic nu se sterge singur.
 * Tot ce cerea era un `business_id` care sa fie UUID valid si un magazin publicat, iar id-ul ala e
 * in HTML-ul fiecarui magazin.
 */

process.env.CUSTOMIZATION_FILE_SECRET ??= "secret-de-proba-pentru-permise";

const BIZ = "11111111-1111-4111-8111-111111111111";
const PRODUS = "33333333-3333-4333-8333-333333333333";

const sursa = (r: string) => readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

test("⚠ numai campurile care CHIAR primesc fisiere ajung in permis", () => {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "gravura", type: "text", label: "Gravura", required: true },
      { id: "poza", type: "image", label: "Poza", required: true },
      { id: "tipar", type: "fisier", label: "Fisier de tipar", required: false },
      { id: "culoare", type: "color", label: "Culoare", required: false },
    ],
  })!;
  /*
   * ⚠ AFIRMATIA CARE MARGINESTE USA. Cu toate campurile inauntru, un produs cu un singur camp de
   * text ar fi ramas o cale de incarcare — adica exact ce se inchide aici.
   */
  assert.deepEqual(campurileDeIncarcare(d), { poza: "i", tipar: "d" });

  /* ⚠ Si un produs FARA campuri de fisier nu capata niciun permis: n-ar avea ce deschide. */
  const faraFisiere = normalizeazaDefinitia({
    enabled: true, fields: [{ id: "t", type: "text", label: "T", required: false }],
  })!;
  assert.deepEqual(campurileDeIncarcare(faraFisiere), {});
  assert.equal(semneazaPermisul(BIZ, PRODUS, campurileDeIncarcare(faraFisiere)), null);
  assert.deepEqual(campurileDeIncarcare(null), {});
});

test("⚠ LIMITA PUSA DE COMERCIANT intra in permis, si numai daca coboara plafonul", () => {
  /*
   * ═══ ⚠ CE ERA INAINTE ═══
   *
   * `max_file_size_mb` se putea pune in Admin si se respecta numai in browser. Serverul stia doar
   * plafoanele globale, deci cine trimitea cererea de mana cerea link pentru 8 MB pe un camp de 2.
   * De aici incolo limita calatoreste SEMNATA, si nu poate fi aleasa de cel pe care il margineste.
   *
   * ⚠ SI SE PASTREAZA FORMA SCURTA cand nu e nimic de spus. Nu de dragul octetilor: forma scurta e
   * chiar cea pe care o poarta permisele deja emise, iar ele traiesc 12 ore.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "logo", type: "image", label: "Logo", required: true, max_file_size_mb: 2 },
      { id: "poza", type: "image", label: "Poza", required: true },
      { id: "tipar", type: "fisier", label: "Tipar", required: false, max_file_size_mb: 5 },
    ],
  })!;
  assert.deepEqual(campurileDeIncarcare(d), {
    logo: { t: "i", m: 2 * 1024 * 1024 },
    poza: "i",
    tipar: { t: "d", m: 5 * 1024 * 1024 },
  });

  /*
   * ⚠ O limita EGALA cu plafonul global nu se scrie: n-ar margini nimic, si ar umfla degeaba fiecare
   * permis al platformei.
   */
  const catPlafonul = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "poza", type: "image", label: "Poza", required: false, max_file_size_mb: MB_IMAGINE }],
  })!;
  assert.deepEqual(campurileDeIncarcare(catPlafonul), { poza: "i" });
});

test("⚠ PLAFONUL IESE DIN PERMIS gata impletit cu cel global", () => {
  /*
   * ⚠ APELANTUL NU MAI ALEGE INTRE DOUA NUMERE. Lasat sa compare singur limita campului cu cea
   * globala, fiecare din cele doua rute ar fi avut ocazia sa greseasca, si una din ele chiar a
   * gresit odata: `documente=1` venea de la client.
   */
  const p = semneazaPermisul(BIZ, PRODUS, {
    mic: { t: "i", m: 2 * 1024 * 1024 },
    poza: "i",
    tipar: "d",
  })!;

  const mic = verificaPermisul(p, "mic");
  assert.ok(mic.ok && mic.maxOcteti === 2 * 1024 * 1024, "limita campului nu iese din permis");

  const poza = verificaPermisul(p, "poza");
  assert.ok(poza.ok && poza.maxOcteti === MB_IMAGINE * 1024 * 1024, "campul fara limita a pierdut plafonul global");

  const tipar = verificaPermisul(p, "tipar");
  assert.ok(tipar.ok && tipar.maxOcteti === MB_DOCUMENT * 1024 * 1024, "documentul n-a primit plafonul lui");
});

test("⚠ un permis nu poate RIDICA plafonul global, oricat ar scrie in el", () => {
  /*
   * Permisele le semnam noi, deci in mod obisnuit nu poate aparea un asemenea numar. Dar
   * definitiile sunt vechi de luni, iar daca vreodata secretul se scurge, permisul n-are voie sa
   * fie o cheie catre un depozit fara plafon. `Math.min` de la verificare e ce se cere aici.
   */
  const umflat = semneazaPermisul(BIZ, PRODUS, { poza: { t: "i", m: 900 * 1024 * 1024 } })!;
  const v = verificaPermisul(umflat, "poza");
  assert.ok(v.ok && v.maxOcteti === MB_IMAGINE * 1024 * 1024, "permisul a ridicat plafonul platformei");

  /* ⚠ Si un numar fara noima cade pe plafon, nu pe zero: zero ar fi refuzat ORICE fisier. */
  for (const m of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const ciudat = semneazaPermisul(BIZ, PRODUS, { poza: { t: "i", m } })!;
    const r = verificaPermisul(ciudat, "poza");
    assert.ok(r.ok && r.maxOcteti === MB_IMAGINE * 1024 * 1024, `m=${m} n-a cazut pe plafonul global`);
  }
});

test("⚠ PERMISELE DE FORMA VECHE se citesc mai departe, 12 ore dupa desfasurare", () => {
  /*
   * ═══ ⚠ DE CE E O PROBA ═══
   *
   * Permisul traieste 12 ore. In clipa desfasurarii, fiecare fila deschisa poarta unul de forma
   * veche, cu sirul scurt. O verificare care ar fi cerut forma noua ar fi rupt incarcarile pentru o
   * jumatate de zi, pe un camp de obicei OBLIGATORIU, adica pe comenzi.
   *
   * Permisul de mai jos e compus DE MANA in forma veche, nu prin `campurileDeIncarcare`: altfel
   * proba s-ar fi mutat odata cu codul si n-ar mai fi aparat nimic.
   */
  const vechi = semneazaPermisul(BIZ, PRODUS, { poza: "i", tipar: "d" })!;
  const v = verificaPermisul(vechi, "poza");
  assert.ok(v.ok, "un permis de forma veche nu mai trece");
  assert.ok(v.ok && v.document === false);
  assert.ok(v.ok && v.maxOcteti === MB_IMAGINE * 1024 * 1024, "forma veche n-a cazut pe plafonul global");
});

test("⚠ un permis al nostru trece, si spune al CUI e", () => {
  const p = semneazaPermisul(BIZ, PRODUS, { poza: "i", tipar: "d" })!;
  const v = verificaPermisul(p, "poza");
  assert.equal(v.ok, true);
  assert.ok(v.ok && v.businessId === BIZ, "magazinul nu iese din permis");
  assert.ok(v.ok && v.productId === PRODUS, "produsul nu iese din permis");
  assert.ok(v.ok && v.document === false, "un camp de imagine s-a citit ca document");

  /*
   * ⚠ FELUL CAMPULUI IESE DIN PERMIS, si asta inchide gaura pe care ruta si-o marturisea singura:
   * `documente=1` venea de la client, deci plafonul de 40 MB al documentelor se cerea si de pe un
   * camp de imagine, unde el e 10.
   */
  const doc = verificaPermisul(p, "tipar");
  assert.ok(doc.ok && doc.document === true, "campul de fisier nu s-a citit ca document");
});

test("⚠ NIMIC nesemnat de noi nu trece — si nimic nesemnat nu se citeste macar", () => {
  const bun = semneazaPermisul(BIZ, PRODUS, { poza: "i" })!;
  const [expira, sarcina, mac] = bun.split(".");

  assert.equal(verificaPermisul(null, "poza").ok, false);
  assert.equal(verificaPermisul("", "poza").ok, false);
  assert.equal(verificaPermisul("nu-e-un-permis", "poza").ok, false);
  assert.equal(verificaPermisul(`${expira}.${sarcina}`, "poza").ok, false, "un permis ciuntit a trecut");
  assert.equal(verificaPermisul(`${expira}.${sarcina}.${mac}x`, "poza").ok, false, "o semnatura lungita a trecut");

  /*
   * ⚠ SARCINA SCHIMBATA CADE, si asta e tot rostul semnaturii: altfel cine avea un permis de pe
   * pagina propriului produs si-l rescria pe al altui magazin, si scria pe factura aceluia.
   */
  const altul = Buffer.from(JSON.stringify({ b: "alt-magazin", p: PRODUS, c: { poza: "i" } }), "utf8").toString("base64url");
  assert.equal(verificaPermisul(`${expira}.${altul}.${mac}`, "poza").ok, false, "sarcina schimbata a trecut");

  /*
   * ⚠ SI CU O DATA DIN VIITOR TOT NU TRECE. Un permis inventat, cu expirare peste un an, e chiar
   * incercarea cea mai la indemana — semnatura se verifica INAINTE de expirare, tocmai ca sa nu
   * ajunga nicicand un JSON ales de altcineva sa fie DESPACHETAT de noi.
   */
  const viitor = String(Date.now() + 365 * 24 * 3600_000);
  assert.equal(verificaPermisul(`${viitor}.${altul}.${mac}`, "poza").ok, false);
  assert.equal(verificaPermisul(`${viitor}.${sarcina}.${mac}`, "poza").ok, false);
});

test("⚠ permisul leaga CAMPUL, nu doar magazinul", () => {
  /*
   * Fara asta, permisul luat de pe pagina oricarui produs cu un camp de fisier ar fi fost o cheie
   * catre tot depozitul magazinului — si felul campului n-ar mai fi insemnat nimic.
   */
  const p = semneazaPermisul(BIZ, PRODUS, { poza: "i" })!;
  const v = verificaPermisul(p, "tipar");
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.motiv === "camp", `motivul gresit: ${!v.ok ? v.motiv : "-"}`);
  assert.equal(verificaPermisul(p, "").ok, false, "un camp gol a trecut");
});

test("⚠ EXPIRAREA are motiv propriu — omul nevinovat nu trebuie sa citeasca „nepermis”", () => {
  /*
   * O fila lasata deschisa peste noapte nu e un abuz. Cu un singur „nu" pentru toate, celui care
   * si-a facut timp sa caute pozele i s-ar fi spus ca fisierul lui e nevalid — la un camp
   * OBLIGATORIU, adica exact comanda pierduta pe care restul rutei o apara.
   */
  const vechi = semneazaPermisul(BIZ, PRODUS, { poza: "i" }, Date.now() - 1)!;
  const v = verificaPermisul(vechi, "poza");
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.motiv === "expirat", `motivul gresit: ${!v.ok ? v.motiv : "-"}`);

  /* ⚠ Iar unul emis acum e valabil — altfel proba ar fi cerut doar refuzuri. */
  assert.equal(verificaPermisul(semneazaPermisul(BIZ, PRODUS, { poza: "i" })!, "poza").ok, true);
  /*
   * ⚠ SI FEREASTRA E CEA SCRISA, nu una intamplatoare: masurata la marginea ei. O valabilitate
   * taiata din greseala la o ora ar fi picat peste omul care lasa fila deschisa, si nimic n-ar fi
   * scartait — permisele proaspete ar fi trecut mai departe.
   */
  const laLimita = semneazaPermisul(BIZ, PRODUS, { poza: "i" }, Date.now() + VALABILITATE_MS - 5_000)!;
  assert.equal(verificaPermisul(laLimita, "poza").ok, true, "fereastra e mai stramta decat scrie");
  assert.equal(VALABILITATE_MS, 12 * 3600_000);
});

test("⚠ ordinea campurilor din definitie nu schimba permisul", () => {
  /*
   * Ordinea o poate muta comerciantul dintr-un drag-and-drop. O semnatura care depinde de ea ar fi
   * fost valabila si nevalabila pe rand, fara nicio schimbare de inteles — si nimeni n-ar fi legat
   * „nu merge incarcarea" de „am mutat ieri un camp".
   */
  const acum = Date.now() + 10_000;
  const a = semneazaPermisul(BIZ, PRODUS, { poza: "i", tipar: "d" }, acum);
  const b = semneazaPermisul(BIZ, PRODUS, { tipar: "d", poza: "i" }, acum);
  assert.equal(a, b, "aceleasi campuri in alta ordine au dat alt permis");
});

test("⚠ ruta nu mai intreaba baza daca magazinul e publicat", () => {
  /*
   * ═══ ⚠ CE S-A HOTARAT, SI DE CE NU „FAIL CLOSED" ═══
   *
   * Ruta intreba baza si, la eroare de baza, lasa incarcarea sa treaca. Auditul cerea sa devina
   * „fail closed"; ar fi fost mai rau decat gaura — o clipire a bazei ar fi oprit ATUNCI toate
   * comenzile personalizate din platforma.
   *
   * Permisul face intrebarea inutila: se emite cand se randeaza pagina produsului, iar pagina aia
   * nu se randeaza pentru un magazin nepublicat. Deci ruta nu mai cade nici intr-un fel, nici in
   * celalalt — si a mai scapat si de o interogare de pe drumul cel mai fierbinte.
   */
  const ruta = sursa("src/app/api/upload-customization/route.ts");
  assert.equal(/is_published/.test(ruta), false, "ruta intreaba iar baza despre publicare");
  assert.equal(/fail open/i.test(ruta.replace(/AICI STATEA[\s\S]*?\*\//, "")), false, "a ramas o cadere deschisa");
  assert.match(ruta, /verificaPermisul\(permis, campId\)/, "ruta nu verifica permisul");
  /* ⚠ Si `business_id` nu mai vine de la client: era in HTML-ul fiecarui magazin. */
  assert.equal(/business_id"\)/.test(ruta), false, "ruta ia iar magazinul de la client");
  /* ⚠ SI PE RUTA DE FINALIZARE, cea care da cheia buna: permisul se cere si acolo. */
  const fin = sursa("src/app/api/upload-customization/finalizeaza/route.ts");
  assert.match(fin, /verificaPermisul\(permis, campId\)/, "finalizarea nu verifica permisul");
});
