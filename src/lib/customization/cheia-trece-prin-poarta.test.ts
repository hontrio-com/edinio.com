import test from "node:test";
import assert from "node:assert/strict";

/*
 * ⚠ MEDIUL SE PUNE INAINTE DE IMPORTURI, si de-aia importurile sunt dinamice: `fisiere-private`
 * citeste secretul la prima semnatura, iar `comanda` isi face multimea de gazde la incarcare.
 */
process.env.CUSTOMIZATION_FILE_SECRET = "secret-de-proba";
process.env.R2_PUBLIC_URL = "https://pub-alnostru.r2.dev";

const { cheieIncarcare } = await import("./fisiere-private");
const { verificaPersonalizarea } = await import("./comanda");

/**
 * O cheie semnata trebuie sa TREACA prin poarta comenzii — proba care lipsea.
 *
 * ═══ ⚠ DE CE LIPSEA, SI CE A COSTAT ═══
 *
 * Cand incarcarile au devenit private, valoarea unui camp de fisier s-a schimbat din adresa
 * absoluta in cheie semnata. TOATE probele existente foloseau in continuare adresa — deci niciuna
 * nu trecea vreodata forma noua prin poarta. Iar poarta citea terminatia cu `new URL()`, care
 * arunca pe o cheie: refuza ORICE fisier incarcat, cu „se accepta doar imagini" pe un JPG adevarat.
 *
 * `tsc` curat, lint curat, 6.292 de probe verzi, si niciun fototapet cu poza nu se putea comanda.
 *
 * ⚠ Fiecare afirmatie de aici are PERECHE: ce trebuie sa treaca si ce trebuie sa cada. O proba
 * care doar refuza ar fi trecut verde si peste codul stricat, care refuza tot.
 */

const BIZ = "11111111-1111-4111-8111-111111111111";
const ALT_BIZ = "22222222-2222-4222-8222-222222222222";
const NUME = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function produs(tip: "image" | "fisier") {
  return {
    customization: {
      enabled: true,
      fields: [{ id: "f", type: tip, label: "Fisierul de tipar", required: true, max_files: 3 }],
    },
  };
}

const mesaj = (r: unknown) => String((r as { mesaj?: string }).mesaj ?? "");

test("⚠ o cheie semnata de NOI trece prin poarta comenzii", () => {
  const cheie = cheieIncarcare(BIZ, NUME, "jpg");
  const r = verificaPersonalizarea(produs("image"), { f: [cheie] }, BIZ);
  assert.equal(r.fel, "ok", `poarta refuza chiar forma pe care o scrie ruta de incarcare: ${mesaj(r)}`);

  /* Si un PDF la campul care primeste documente. */
  const pdf = cheieIncarcare(BIZ, NUME, "pdf");
  assert.equal(verificaPersonalizarea(produs("fisier"), { f: [pdf] }, BIZ).fel, "ok");
});

test("⚠ verificarea de terminatie inca poarta informatie pe forma noua", () => {
  /*
   * Perechea negativa a celei de sus, si ea e cea care apara: cu terminatia necitibila, TOT ce e
   * mai jos ar fi „mers" — dar din alt motiv decat cel scris, iar poarta n-ar mai fi aparat nimic.
   */
  const pdf = cheieIncarcare(BIZ, NUME, "pdf");
  const r = verificaPersonalizarea(produs("image"), { f: [pdf] }, BIZ);
  assert.equal(r.fel, "eroare", "un PDF a intrat intr-un camp de imagine");
  assert.match(mesaj(r), /doar imagini/);

  const exe = cheieIncarcare(BIZ, NUME, "exe");
  assert.equal(verificaPersonalizarea(produs("fisier"), { f: [exe] }, BIZ).fel, "eroare");
});

test("⚠ o cheie a ALTUI magazin, sau una compusa de mana, se refuza", () => {
  const aAltuia = cheieIncarcare(ALT_BIZ, NUME, "jpg");
  const r1 = verificaPersonalizarea(produs("image"), { f: [aAltuia] }, BIZ);
  assert.equal(r1.fel, "eroare", "cheia altui magazin a trecut");
  assert.match(mesaj(r1), /nu e valid/);

  /*
   * ⚠ `business_id` E PUBLIC — sta in fiecare pagina de magazin. Deci cine stie prefixul poate
   * scrie o cheie care ARATA a noastra; numai semnatura o opreste.
   */
  const compusa = `products/customizations/${BIZ}/${NUME}-000000000000000000000000.jpg`;
  assert.equal(verificaPersonalizarea(produs("image"), { f: [compusa] }, BIZ).fel, "eroare");

  /* Si o cheie care iese din dosarul magazinului. */
  const cuDosar = `products/customizations/${BIZ}/../${ALT_BIZ}/${NUME}-000000000000000000000000.jpg`;
  assert.equal(verificaPersonalizarea(produs("image"), { f: [cuDosar] }, BIZ).fel, "eroare");
});

test("⚠ fereastra de desfasurare e INCHISA: nicio adresa nu mai trece, nici a noastra", () => {
  /*
   * ═══ ⚠ CE APARA RANDURILE ASTEA ═══
   *
   * O desfasurare intreaga, poarta a primit si adresa publica din depozitul NOSTRU
   * (`esteAdresaVeche`), ca paginile ramase deschise in browsere sa nu se rupa. Ramura a fost
   * scoasa pe 07.09.2026, odata cu `url` din raspunsul rutei de incarcare.
   *
   * ⚠ SI NU E O STRANGERE COSMETICA. Cat traia ramura, o adresa insemna ca poarta trebuia sa
   * ghiceasca daca gazda e a noastra — iar `r2KeyFromUrl`, ajutorul comun, primeste dinadins ORICE
   * `*.r2.dev`. Adica `https://galeata-straina.r2.dev/products/customizations/<id-ul-victimei>/x.jpg`
   * a fost, o vreme, o gaura adevarata. Fara nicio adresa, intrebarea nu se mai pune.
   *
   * ⚠ PROBA ASTA TREBUIE SA POATA CADEA: reintorsul ramurii o face rosie pe primul rand.
   */
  const aNoastra = `https://pub-alnostru.r2.dev/products/customizations/${BIZ}/${NUME}.jpg`;
  const r = verificaPersonalizarea(produs("image"), { f: [aNoastra] }, BIZ);
  assert.equal(
    r.fel, "eroare",
    "adresa publica mai trece prin poarta: fereastra de desfasurare a ramas deschisa",
  );
  assert.match(mesaj(r), /nu e valid/);

  /* Si galeata straina cu prefixul nostru, cea care trecea inainte de a se verifica gazda exact. */
  const straina = `https://galeata-straina.r2.dev/products/customizations/${BIZ}/${NUME}.jpg`;
  assert.equal(verificaPersonalizarea(produs("image"), { f: [straina] }, BIZ).fel, "eroare");

  /*
   * ⚠ PERECHEA POZITIVA, pe acelasi fisier: cheia semnata a ACELUIASI obiect trece. Fara randul
   * asta, proba ar fi trecut verde si peste o poarta care refuza tot — adica peste chiar defectul
   * din 06.09, cand `new URL()` arunca pe o cheie si niciun fototapet nu se putea comanda.
   */
  assert.equal(
    verificaPersonalizarea(produs("image"), { f: [cheieIncarcare(BIZ, NUME, "jpg")] }, BIZ).fel, "ok",
    "poarta refuza si forma noua: nu s-a inchis o fereastra, s-a inchis drumul",
  );
});

test("⚠ instantaneul scris in comanda poarta chiar cheia, nu altceva", () => {
  const cheie = cheieIncarcare(BIZ, NUME, "png");
  const r = verificaPersonalizarea(produs("image"), { f: [cheie] }, BIZ);
  assert.equal(r.fel, "ok");
  const date = (r as { date: { instantaneu: Record<string, { value: string | string[] }> } }).date;
  assert.deepEqual(date.instantaneu.f.value, [cheie], "in comanda a ajuns altceva decat cheia");
});
