import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  alegeGestiunea,
  gestiuneaECeruta,
  pastreazaGestiunea,
  stareOblio,
  type ListaGestiuni,
} from "./oblio-stare";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  PROBE CARE CHEAMA FUNCTIILE, NU CARE CITESC SURSA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA FISIERUL ASTA, SI DE CE ARATA ALTFEL DECAT `oblio-gestiune.test.ts`.

  Prima plasa pentru gestiune cauta TEXT in sursa (`assert.match(cod, /…/)`). Pusa
  la incercare cu mutatii, a lasat sa treaca VERZI sase din noua — printre care:

    - spread-ul `...(gestiune && !esteServiciu ? …)` scos din obiectul de produs si
      lasat mort intr-o variabila: 6/6 verzi, cu campul lipsa de pe fiecare linie
    - `management` sters de pe toate liniile dupa ce au fost construite: 6/6 verzi
    - un singur `return;` sters dupa `toast.error`, deci salvarea nu se mai oprea:
      6/6 verzi
    - conditia inconjurata cu `if (false && …)`: 6/6 verzi

  Adica exact defectul pentru care s-a scris plasa se putea intoarce fara ca vreo
  proba sa clipeasca. O proba care se uita la forma confirma ca SCRIE ceva, nu ca
  ceva SE INTAMPLA.

  De aceea hotararile au fost scoase in `oblio-stare.ts`, ca functii curate, si
  probele de aici le CHEAMA. O mutatie in ele nu mai are unde sa se ascunda: nu se
  compara siruri, se compara rezultate.
*/

const CU_STOCURI: ListaGestiuni = [
  { name: "Depozit central", tip: "Cantitativ-valoric" },
  { name: "Magazin", tip: "Global-valoric" },
];
const O_SINGURA: ListaGestiuni = [{ name: "Depozit", tip: "Cantitativ-valoric" }];
const FARA_STOCURI: ListaGestiuni = [];
const NESTIUT: ListaGestiuni = null;

const BAZA = {
  clientId: "cont@exemplu.ro",
  cif: "RO12345678",
  seriesInvoice: "DRA",
  enabled: true,
  management: "",
  gestiuni: NESTIUT,
};

// ─── stareOblio ───────────────────────────────────────────────────────────────

test("CAZUL VETDEPO: cont cu stocuri, fara gestiune — NU e activ", () => {
  /*
    ⚠ ASTA E MINCIUNA REPARATA. `complet` nu numara gestiunea, asa ca pentru
    fix configuratia asta se aprindea caseta verde „Oblio activ — facturile se
    pot emite din pagina Comenzi", pentru un cont caruia Oblio ii refuzase deja
    patru facturi la rand cu „nu are Gestiune".
  */
  const s = stareOblio({ ...BAZA, gestiuni: CU_STOCURI, management: "" });
  assert.equal(s.lipsesteGestiunea, true, "nu vede ca lipseste gestiunea");
  assert.equal(s.activ, false, "⚠ caseta verde minte: spune activ pentru un cont care va fi refuzat");
  assert.equal(s.complet, false, "se socoteste complet desi ii lipseste un camp obligatoriu");
  assert.equal(s.poateSalva, false, "lasa salvarea sa plece cu o configuratie sigur refuzata");
});

test("gestiunea aleasa face contul cu stocuri activ", () => {
  const s = stareOblio({ ...BAZA, gestiuni: CU_STOCURI, management: "Depozit central" });
  assert.equal(s.lipsesteGestiunea, false);
  assert.equal(s.activ, true);
  assert.equal(s.poateSalva, true);
});

test("spatiile goale nu tin loc de gestiune aleasa", () => {
  // ⚠ `!""` si `!" "` sunt lucruri diferite in JS. Fara `trim()`, un camp cu un
  // spatiu ar trece drept ales si ar pleca asa spre Oblio.
  const s = stareOblio({ ...BAZA, gestiuni: CU_STOCURI, management: "   " });
  assert.equal(s.lipsesteGestiunea, true, "un camp cu spatii trece drept gestiune aleasa");
  assert.equal(s.activ, false);
});

test("contul FARA stocuri se poarta exact ca inainte de toata reparatia", () => {
  /*
    ⚠ CEA MAI IMPORTANTA PROBA DE NEREGRESIE. Doua din cele trei magazine cu
    Oblio n-au gestiuni. Pentru ele nimic nu trebuie sa se schimbe: fara camp,
    fara cerinta, fara casete noi.
  */
  const s = stareOblio({ ...BAZA, gestiuni: FARA_STOCURI, management: "" });
  assert.equal(s.lipsesteGestiunea, false, "cere gestiune unui cont care n-are gestiuni");
  assert.equal(s.complet, true);
  assert.equal(s.activ, true);
  assert.equal(s.poateSalva, true);
});

test("gestiuni NESTIUTE nu acuza si nu blocheaza", () => {
  /*
    Pagina abia s-a deschis, sau nomenclatorul a picat. Nu stim daca contul are
    stocuri. Nu-l oprim din salvat pentru un camp care poate nici nu i se aplica —
    plasa pentru cazul asta e pe server (`pastreazaGestiunea`), nu aici.
  */
  const s = stareOblio({ ...BAZA, gestiuni: NESTIUT, management: "" });
  assert.equal(s.lipsesteGestiunea, false);
  assert.equal(s.poateSalva, true);
});

test("comutatorul stins: complet, dar nu activ — si salvarea TOT pleaca", () => {
  /*
    ⚠ Avertisment, nu oprire. Poate omul chiar vrea sa pregateasca datele si sa
    porneasca mai tarziu. Daca proba asta cade fiindca `poateSalva` a devenit
    fals, cineva a transformat un avertisment in zid.
  */
  const s = stareOblio({ ...BAZA, gestiuni: FARA_STOCURI, enabled: false });
  assert.equal(s.complet, true);
  assert.equal(s.activ, false, "se socoteste activ cu comutatorul stins");
  assert.equal(s.poateSalva, true, "comutatorul stins nu are voie sa opreasca salvarea");
});

test("fara seria de factura nimic nu e complet", () => {
  const s = stareOblio({ ...BAZA, gestiuni: FARA_STOCURI, seriesInvoice: "" });
  assert.equal(s.complet, false);
  assert.equal(s.activ, false);
});

// ─── gestiuneaECeruta ─────────────────────────────────────────────────────────

test("gestiuneaECeruta deosebeste cele trei intelesuri", () => {
  assert.equal(gestiuneaECeruta(NESTIUT), false, "nestiut citit drept cont cu stocuri");
  assert.equal(gestiuneaECeruta(FARA_STOCURI), false, "lista goala citita drept cont cu stocuri");
  assert.equal(gestiuneaECeruta(CU_STOCURI), true);
});

// ─── alegeGestiunea ───────────────────────────────────────────────────────────

test("o lista goala NU sterge gestiunea aleasa", () => {
  /*
    ⚠ DEFECTUL EXACT. Randul vechi era
        else if (!result.management.some(m => m.name === management)) setManagement("");
    Un nomenclator cazut se intorcea ca lista goala (`catch(() => [])`), nu se
    regasea nimic in ea, si alegerea salvata pierea in tacere. Urmatoarea salvare
    pleca fara gestiune, si factura era refuzata.
  */
  assert.equal(alegeGestiunea(FARA_STOCURI, "Depozit central"), "Depozit central");
});

test("gestiuni nestiute NU sterg gestiunea aleasa", () => {
  assert.equal(alegeGestiunea(NESTIUT, "Depozit central"), "Depozit central");
});

test("o singura gestiune se pune singura", () => {
  assert.equal(alegeGestiunea(O_SINGURA, ""), "Depozit");
});

test("alegerea care mai exista in lista noua se pastreaza", () => {
  assert.equal(alegeGestiunea(CU_STOCURI, "Magazin"), "Magazin");
});

test("alegerea care NU mai exista se goleste, ca sa aleaga omul", () => {
  // Firma schimbata, alt nomenclator. A tine un nume care nu mai exista ar
  // trimite spre Oblio o gestiune inexistenta — refuz sigur, fara sa stie nimeni.
  assert.equal(alegeGestiunea(CU_STOCURI, "Depozit vechi"), "");
});

// ─── pastreazaGestiunea (plasa de pe server) ──────────────────────────────────

test("SERVER: o resalvare fara gestiune NU o sterge pe cea salvata", () => {
  /*
    ⚠ CAZUL MASURAT IN PRODUCTIE. Campul era deja desfasurat, si VetDepo a salvat
    la 10:19:40 UTC tot fara gestiune: formularul n-o trimitea, fiindca nu citise
    nomenclatorul, iar serverul scria peste ce era.
  */
  const rezultat = pastreazaGestiunea(
    { cif: "RO1", management: undefined },
    { management: "Depozit central" },
  );
  assert.equal(rezultat.management, "Depozit central", "⚠ resalvarea sterge gestiunea salvata");
  assert.equal(rezultat.cif, "RO1", "a stricat restul configului");
});

test("SERVER: o gestiune trimisa o inlocuieste pe cea veche", () => {
  const r = pastreazaGestiunea({ management: "Magazin" }, { management: "Depozit central" });
  assert.equal(r.management, "Magazin", "nu se mai poate schimba gestiunea");
});

test("SERVER: fara gestiune veche nu inventeaza nimic", () => {
  assert.equal(pastreazaGestiunea({ management: undefined }, null).management, undefined);
  assert.equal(pastreazaGestiunea({ management: undefined }, {}).management, undefined);
  assert.equal(pastreazaGestiunea({ management: "" }, { management: "  " }).management, "");
});

test("SERVER: obiectul primit nu se modifica pe loc", () => {
  // O functie care isi muta argumentul ar strica apelantul in feluri greu de vazut.
  const nou = { management: undefined as string | undefined, cif: "RO1" };
  pastreazaGestiunea(nou, { management: "Depozit" });
  assert.equal(nou.management, undefined, "a modificat obiectul primit");
});
