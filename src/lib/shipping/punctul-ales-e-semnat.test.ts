import test from "node:test";
import assert from "node:assert/strict";
import { semneazaPunctul, verificaPunctul, type PunctCanonic } from "./punctul-ales-e-semnat";

/*
 * ⚠ CHEIA DE PROBA SE PUNE AICI, SI E O DESCOPERIRE, NU O FORMALITATE.
 *
 * Masurat pe 15.09.2026: incarcatorul probelor NU incarca niciun `.env`, iar in procesul de test
 * `SHIPPING_QUOTE_SECRET` si `SUPABASE_SERVICE_ROLE_KEY` au amandoua lungimea ZERO. Deci toate
 * probele de token din depozit semneaza si verifica azi cu CHEIA GOALA.
 *
 * ⚠ CE NU INSEAMNA: ca ele nu dovedesc nimic. HMAC cu cheie goala e tot o functie determinista, si
 * amandoua capetele o folosesc pe aceeasi, deci regulile probate acolo (formele tokenului,
 * compararea planului, greutatea, rescrierea de mana) raman dovedite la fel de bine.
 *
 * ⚠ CE INSEAMNA: nicio proba din depozit nu poate deosebi „semnat cu secretul adevarat" de „semnat
 * cu sirul gol". Daca maine `secret()` ar intoarce mereu `""`, totul ar ramane verde. Exact gaura
 * pe care o numeste auditul extern, si pe care nicio plasa a noastra nu o prinde.
 *
 * Modulul asta e primul din depozit care REFUZA sa semneze fara cheie, si de aceea e si primul ale
 * carui probe cad intr-un mediu fara secret. Aici cheia se pune explicit: o proba a unei reguli de
 * semnare isi aduce cheia ei, nu se bizuie pe masina pe care ruleaza.
 */
process.env.SHIPPING_QUOTE_SECRET = "cheie-de-proba-punctul-ales-e-semnat";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PUNCTUL ALES E SEMNAT DE SERVER                               (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Regula pura, inainte de orice cablare. Modulul nu e inca folosit de nimeni, dinadins: temelia se
 * probeaza singura, iar drumurile (checkout, panou, lot) se leaga in loturi urmatoare, fiecare cu
 * portile lui.
 *
 * Ce apara modulul: punctul de ridicare ajungea pe comanda exact cum il trimitea browserul, iar la
 * emitere `locker_city` si `locker_county` INLOCUIESC destinatarul de pe AWB (Sameday), respectiv
 * `recipientCity` (DPD). Deci adresa de livrare era scrisa de client.
 */

const IDENT = { businessId: "b7a9c3d1-0000-4000-8000-000000000001", curier: "sameday", retea: "easybox" };
/** Ora fixa: altfel fiecare rulare ar semna alt token si nimic nu s-ar putea compara. */
const EXPIRA = 4_102_444_800_000;

const PUNCT: PunctCanonic = {
  id: "4242",
  name: "Easybox Kaufland Vitan",
  address: "Calea Vitan 236",
  city: "Bucuresti",
  county: "Bucuresti",
  postCode: "031301",
};

/**
 * Doar bucata de SEMNATURA din token.
 *
 * ⚠ SI DE CE NU SE COMPARA TOKENUL INTREG, cum am scris prima oara. Tokenul e
 * `<fisa>.<expira>.<mac>`: doua puncte diferite au fise diferite, deci tokenele difera ORICUM, in
 * partea vizibila. O afirmatie pe tokenul intreg trece si pe cod bun, si pe un cod fara despartitor,
 * adica nu masoara nimic. Bancul a prins-o: mutantul care lipea ora de ultimul camp a SCAPAT, iar
 * recitind s-a vazut ca si afirmatia vecina era la fel de goala.
 *
 * Coliziunea pe care o aparam e a MAC-ului, deci se compara MAC-ul.
 */
function mac(token: string): string {
  const bucati = token.split(".");
  assert.equal(bucati.length, 3, "forma tokenului s-a schimbat: afirmatiile de mai jos nu mai masoara MAC-ul");
  return bucati[2];
}

/* ── 1. Despartitorul: doua puncte diferite nu au voie sa semneze la fel ──── */

test("⚠⚠ campurile NU se pot rearanja intre ele fara sa cada semnatura", () => {
  /*
   * ⚠ AFIRMATIA CARE INGHEATA DESPARTITORUL.
   *
   * Sirul semnat se compune din noua campuri. Lipite fara despartitor, `city:"AB", county:"C"` si
   * `city:"A", county:"BC"` ar produce acelasi sir, deci acelasi MAC: doua puncte DIFERITE cu
   * aceeasi semnatura. Cine sterge vreodata despartitorul face proba asta sa cada.
   *
   * Nu se cere FORMA despartitorului (ce caracter e), ci PROPRIETATEA: mutarea unei litere dintr-un
   * camp in urmatorul schimba tokenul.
   */
  const a = mac(semneazaPunctul(IDENT, { ...PUNCT, city: "AB", county: "C" }, EXPIRA));
  const b = mac(semneazaPunctul(IDENT, { ...PUNCT, city: "A", county: "BC" }, EXPIRA));
  assert.notEqual(a, b, "doua puncte diferite au primit aceeasi semnatura: despartitorul a disparut");
});

test("⚠ si mutarea intre identitate si punct, la fel", () => {
  /* Aceeasi proprietate, la granita dintre `curier` si `retea`. */
  const a = semneazaPunctul({ ...IDENT, curier: "samedayx", retea: "easybox" }, PUNCT, EXPIRA);
  const b = semneazaPunctul({ ...IDENT, curier: "sameday", retea: "xeasybox" }, PUNCT, EXPIRA);
  assert.notEqual(a, b, "curierul si reteaua se pot amesteca fara sa cada semnatura");
});

test("⚠ si ora nu se poate imprumuta din ultimul camp", () => {
  /*
   * Ora sta la coada sirului semnat. Lipita de `postCode`, un cod mai lung ar putea imprumuta cifre
   * din ea, deci doua perechi diferite (punct, ora) ar produce acelasi sir.
   */
  /*
   * ⚠ NUMERELE SUNT ALESE SA PRODUCA CHIAR COLIZIUNEA, nu doar sa fie diferite.
   *
   * Lipite, `postCode` + ora dau in amandoua cazurile acelasi sir: `0313011` + `4102444800000` si
   * `031301` + `14102444800000`. Despartite, difera. O pereche oarecare de numere ar fi trecut si
   * pe cod bun, si pe mutant.
   */
  const a = mac(semneazaPunctul(IDENT, { ...PUNCT, postCode: "0313011" }, 4_102_444_800_000));
  const b = mac(semneazaPunctul(IDENT, { ...PUNCT, postCode: "031301" }, 14_102_444_800_000));
  assert.notEqual(a, b, "codul postal si ora se ating: doua perechi diferite semneaza la fel");
});

/* ── 2. Tokenul POARTA fisa, nu o cere de la apelant ──────────────────────── */

test("⚠⚠ verificarea intoarce campurile CANONICE, fara sa le ceara de nicaieri", () => {
  /*
   * ⚠ ASTA E ROSTUL INTREGULUI MODUL.
   *
   * Daca tokenul ar semna doar id-ul, verificarea ar avea nevoie de nume, adresa si oras ca sa
   * refaca MAC-ul, si le-ar lua de la browser: adica exact de la cine nu avem incredere. Asa,
   * tokenul E fisa punctului, iar ce trimite browserul pe langa el se arunca.
   */
  const t = semneazaPunctul(IDENT, PUNCT, EXPIRA);
  const v = verificaPunctul(t, IDENT);
  assert.equal(v.ok, true, "un punct semnat de noi n-a trecut");
  assert.deepEqual(v.ok === true && v.punct, PUNCT);
});

test("⚠ fisa rescrisa de mana nu mai bate", () => {
  /*
   * Fisa calatoreste in clar (verificarea trebuie sa aiba de unde o lua), dar e sub MAC. Neacoperita,
   * cine vrea alt punct ar rescrie pur si simplu orasul.
   */
  const t = semneazaPunctul(IDENT, PUNCT, EXPIRA);
  const [, expira, mac] = t.split(".");
  const altaFisa = Buffer.from(JSON.stringify({ ...PUNCT, city: "Cluj-Napoca" }), "utf8").toString("base64url");
  const v = verificaPunctul(`${altaFisa}.${expira}.${mac}`, IDENT);
  assert.equal(v.ok === false && v.motiv, "semnatura");
});

test("⚠ un camp strecurat in plus nu schimba ce se scrie pe comanda", () => {
  /*
   * Fisa se citeste PE NUME si se normalizeaza. Un camp in plus n-are voie nici sa intre in ce se
   * scrie pe comanda, nici sa schimbe sirul semnat: altfel doua fise diferite ar putea produce
   * acelasi MAC.
   */
  const t = semneazaPunctul(IDENT, PUNCT, EXPIRA);
  const v = verificaPunctul(t, IDENT);
  assert.equal(Object.keys(v.ok === true ? v.punct : {}).sort().join(","),
    "address,city,county,id,name,postCode");
});

/* ── 3. Identitatea: punctul e legat de magazin, curier si retea ──────────── */

test("⚠⚠ un punct al altui MAGAZIN nu trece", () => {
  const t = semneazaPunctul(IDENT, PUNCT, EXPIRA);
  const v = verificaPunctul(t, { ...IDENT, businessId: "b7a9c3d1-0000-4000-8000-000000000002" });
  assert.equal(v.ok === false && v.motiv, "semnatura");
});

test("⚠⚠ un punct al altui CURIER nu trece", () => {
  /* Un id de easybox intr-un AWB DPD e chiar defectul: alt nomenclator, alt spatiu de id-uri. */
  const t = semneazaPunctul(IDENT, PUNCT, EXPIRA);
  assert.equal(verificaPunctul(t, { ...IDENT, curier: "dpd" }).ok, false);
});

test("⚠⚠ un punct din alta RETEA nu trece", () => {
  /*
   * La FAN acelasi `locker_id` poate fi FANbox, PayPoint sau oficiu; la SmartShip easybox sau
   * FANbox. Fara reteaua in semnatura, un punct dintr-una ar trece drept punct din alta.
   */
  const t = semneazaPunctul(IDENT, PUNCT, EXPIRA);
  assert.equal(verificaPunctul(t, { ...IDENT, retea: "fanbox" }).ok, false);
});

/* ── 4. Formele care cad, si cu ce motiv ──────────────────────────────────── */

/**
 * Motivul refuzului, sau `null` cand verdictul a fost bun.
 *
 * ⚠ O SINGURA CHEMARE, PASTRATA INTR-O VARIABILA. Prima scriere a probei chema `verificaPunctul`
 * de DOUA ori in aceeasi expresie (`v().ok === false && v().motiv`), si asta era gresit din doua
 * pricini: TypeScript ingusteaza uniunea doar pe prima chemare, deci `tsc` cadea cu „Property
 * 'motiv' does not exist"; iar a doua chemare judeca alt rezultat decat cel despre care afirm.
 *
 * ⚠ Si proba trecea 14 din 14 cu fisierul necompilabil, fiindca incarcatorul sterge tipurile fara
 * sa le verifice. Numai `tsc` a prins-o. Vezi [[suita-verde-peste-un-fisier-care-nu-compila]].
 */
function motivul(v: ReturnType<typeof verificaPunctul>): string | null {
  return v.ok ? null : v.motiv;
}

test("⚠ tokenul lipsa, gol sau cu alt numar de bucati", () => {
  assert.equal(motivul(verificaPunctul(null, IDENT)), "lipsa");
  assert.equal(motivul(verificaPunctul("", IDENT)), "lipsa");
  const t = semneazaPunctul(IDENT, PUNCT, EXPIRA);
  assert.equal(motivul(verificaPunctul(`${t}.inca-o-bucata`, IDENT)), "forma");
});

test("⚠ un punct expirat cade pe `expirat`, nu pe `semnatura`", () => {
  /*
   * Motivul conteaza: apelantul trebuie sa poata spune omului „alege din nou punctul", nu „ceva e
   * stricat". Cu un singur boolean, cele doua ar fi avut acelasi mesaj.
   */
  const t = semneazaPunctul(IDENT, PUNCT, Date.now() - 1000);
  assert.equal(motivul(verificaPunctul(t, IDENT)), "expirat");
});

test("⚠ fisa necitibila cade pe `forma`", () => {
  const v = verificaPunctul("nu-e-base64url-valid!!!.4102444800000.mac", IDENT);
  assert.equal(v.ok === false && v.motiv, "forma");
});

test("⚠ o fisa fara id nu trece, oricat de bine ar fi semnata", () => {
  /* `id` e singurul camp fara de care punctul nu inseamna nimic la emitere. */
  const t = semneazaPunctul(IDENT, { ...PUNCT, id: "" }, EXPIRA);
  assert.equal(motivul(verificaPunctul(t, IDENT)), "forma");
});

/* ── 5. Secretul: arunca, nu cade pe sirul gol ────────────────────────────── */

test("⚠⚠ fara secret NU se semneaza cu cheie goala: se ARUNCA", () => {
  /*
   * ⚠ Cu `""`, `createHmac` merge mai departe si scoate o semnatura pe care o poate calcula
   * oricine. Nimic n-ar deosebi un punct semnat de unul inventat, si nicio proba n-ar cadea. O
   * degradare tacuta de securitate e mai rea decat o eroare zgomotoasa. Acelasi tipar ca la
   * `semnaturaCheii`.
   */
  /*
   * ⚠ TOKENUL SE SEMNEAZA CAT TIMP CHEIA MAI EXISTA, si abia apoi se sterge.
   *
   * Prima scriere a probei folosea `"x.1.y"`, un token cu ora 1: el iese pe `expirat` INAINTE sa
   * ajunga vreodata la `secret()`, deci n-avea de ce sa arunce, iar afirmatia cadea. Ar fi trecut
   * la fel de bine si peste un modul care compara tacut cu un MAC pe cheie goala.
   *
   * Cu un token VALID si neexpirat, verificarea chiar ajunge la cheie, deci se dovedeste ce trebuie:
   * fara secret nu se compara nimic, se opreste.
   */
  const tokenValid = semneazaPunctul(IDENT, PUNCT, EXPIRA);

  const a = process.env.SHIPPING_QUOTE_SECRET;
  const b = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SHIPPING_QUOTE_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.throws(() => semneazaPunctul(IDENT, PUNCT, EXPIRA), /secretul de semnare a punctelor/i);
    assert.throws(() => verificaPunctul(tokenValid, IDENT), /secretul de semnare a punctelor/i);
  } finally {
    if (a !== undefined) process.env.SHIPPING_QUOTE_SECRET = a;
    if (b !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = b;
  }
});
