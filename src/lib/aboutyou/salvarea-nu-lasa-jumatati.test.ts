import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O SALVARE RESPINSA NU ARE VOIE SA LASE JUMATATE DIN EA (28.08.2026, seara)
   ══════════════════════════════════════════════════════════════════════════

   `saveAboutYouListing` scria randul de listare INTAI, si abia dupa aceea verifica
   SKU-urile. Deci o salvare respinsa lasa in urma exact jumatatea care apucase sa treaca:

       omul schimba si categoria (in `campuri`), si un SKU care se ciocneste
       randul de listare se scrie cu categoria noua ✅
       verificarea SKU-ului respinge -> „nu s-a salvat" ❌
       dar categoria E SALVATA, iar variantele au ramas cele vechi

   Comerciantul citeste „nu s-a salvat", inchide editorul, si de-atunci datele locale spun
   altceva decat cele de la ei — chiar starea de care fugim de zile intregi.

   ⚠ JUMATATEA DE DINAINTE se inchide printr-o ORDINE, nu printr-o tranzactie mai mare.
   Verificarile n-aveau nevoie de randul scris: singurul lucru pentru care il foloseau era
   excluderea listarii curente din cautarea de coliziuni, iar aia se face pe CHEIA DE STIL,
   care exista dinainte. Mutate inaintea oricarei scrieri, o salvare RESPINSA nu atinge nimic.

   ⚠ JUMATATEA DE DUPA — o salvare ACCEPTATA care se rupe la mijloc — cere insa chiar o
   tranzactie: randul de listare si variantele pleaca acum intr-un singur RPC. Masurat pe
   productie: cu campurile listarii deja scrise si variantele picand pe un tip gresit,
   brandul si `hs_code` au ramas cele dinainte, si cantitatea la fel.
*/

const sursa = readFileSync("src/lib/actions/aboutyou.actions.ts", "utf8");

/** Bucata cu `saveAboutYouListing`, de la semnatura pana la urmatoarea functie exportata. */
function corpulSalvarii(): string {
  const i = sursa.indexOf("export async function saveAboutYouListing");
  assert.notEqual(i, -1, "n-am gasit saveAboutYouListing");
  const j = sursa.indexOf("\nexport async function ", i + 10);
  assert.notEqual(j, -1, "n-am gasit sfarsitul functiei");
  return sursa.slice(i, j);
}

const corp = corpulSalvarii();

/** Pozitia primei potriviri, cu un mesaj limpede daca lipseste. */
function unde(model: RegExp, ce: string): number {
  const m = corp.search(model);
  assert.notEqual(m, -1, `n-am gasit ${ce}`);
  return m;
}

/*
 * Singura scriere din toata salvarea: un RPC care face randul de listare si variantele in aceeasi
 * tranzactie. Tot ce e verificare trebuie sa fie inaintea lui.
 */
const SCRIEREA = /admin\.rpc\("aboutyou_salveaza_listarea"/;

test("toate verificarile de SKU se fac inainte de orice scriere", () => {
  const scriere = unde(SCRIEREA, "salvarea listarii");

  const verificari: [RegExp, string][] = [
    [/const dublate = new Set<string>\(\)/, "cautarea duplicatelor din acelasi produs"],
    [/\.from\("aboutyou_variants"\)\s*\n?\s*\.select\("sku, listing_id"\)/, "cautarea coliziunilor cu alte produse"],
    [/\.from\("aboutyou_sku_istoric"\)/, "cautarea SKU-urilor refolosite"],
  ];
  for (const [model, ce] of verificari) {
    assert.ok(unde(model, ce) < scriere,
      `${ce} se face DUPA ce randul de listare a fost scris: o respingere lasa jumatate salvata`);
  }
});

test("si oprirea pe categorie sau marime dupa aprobare, la fel", () => {
  /*
   * ⚠ Regula de la 27.08: categoria si marimea nu se mai schimba dupa aprobare. Ea se oprea deja
   * inaintea scrierii, si asa trebuie sa ramana — altfel campul respins ar fi salvat oricum.
   */
  const scriere = unde(SCRIEREA, "salvarea listarii");
  assert.ok(unde(/About You nu mai acceptă schimbarea categoriei/, "oprirea pe categorie") < scriere);
  assert.ok(unde(/About You nu mai acceptă schimbarea mărimii/, "oprirea pe marime") < scriere);
});

test("coliziunea de SKU se judeca pe cheia de stil, nu pe id-ul randului", () => {
  /*
   * ⚠ Mutate inaintea scrierii, verificarile nu mai au un `listingId` de care sa se lege — si e
   * mai bine asa: randul se poate sa nu existe inca (salvare noua), sau sa fie altul decat cel
   * citit (o a doua salvare a aceluiasi produs il poate crea intre timp). In amandoua cazurile
   * propriile SKU-uri ar fi parut „ale altui produs", iar salvarea ar fi fost respinsa degeaba.
   */
  assert.match(corp, /cheiaListarii\.get\(c\.listing_id\)\s*!==\s*productId/,
    "conflictul se hotaraste comparand cheia de stil a listarii gasite");
  assert.doesNotMatch(corp, /listing_id\s*\)\s*!==\s*listingId/,
    "comparatia cu id-ul randului scris s-a intors: ea cere ca scrierea sa fi avut deja loc");
});

test("o listare pe care n-o gasim se socoteste conflict, nu „liber”", () => {
  /*
   * ⚠ Lectia pazei care cadea deschis: aici o necunoscuta inseamna doua produse cu acelasi SKU la
   * ei, iar al doilea il suprascrie tacut pe primul. `Map.get` intoarce `undefined`, care nu e
   * egal cu `productId` — deci calea implicita e chiar cea prudenta, si asta se pazeste.
   */
  assert.match(corp, /const\s*\{\s*data:\s*listari,\s*error:\s*eListari\s*\}/,
    "citirea listarilor isi prinde eroarea");
  assert.match(corp, /if\s*\(eListari\)\s*return\s*\{\s*error:/,
    "o citire picata opreste salvarea, nu o lasa sa treaca");
});

test("listarea si variantele pleaca intr-o singura cerere", () => {
  /*
   * ⚠ DOUA CERERI INSEAMNA DOUA TRANZACTII, si intre ele incape orice: randul de listare scris cu
   * campurile noi, salvarea variantelor picata, iar comerciantul citind „nu s-a salvat" peste o
   * jumatate care s-a salvat. Probat pe productie: cu variantele picand pe un tip gresit, brandul
   * si `hs_code` au ramas cele dinainte.
   */
  assert.equal(corp.split('admin.rpc("aboutyou_salveaza_listarea"').length - 1, 1,
    "o singura scriere, nu doua");
  assert.doesNotMatch(corp, /\.from\("aboutyou_listings"\)\s*\n?\s*\.update\(/,
    "randul de listare nu se mai scrie separat");
  assert.doesNotMatch(corp, /\.from\("aboutyou_listings"\)\.insert\(/,
    "randul nou nu se mai insereaza separat");
  assert.doesNotMatch(corp, /admin\.rpc\("aboutyou_salveaza_variante"/,
    "variantele merg in aceeasi tranzactie cu listarea");
  /* ⚠ Si campurile pleaca asa cum sunt: numite din nou in SQL, cele doua liste ar incepe sa se departeze. */
  assert.match(corp, /p_campuri:\s*campuri as never/);
  assert.match(corp, /p_randuri:\s*variante as never/);
});

test("raspunsul salvarii se citeste, nu se presupune", () => {
  /* ⚠ „Listarea nu exista" nu e acelasi lucru cu „a mers": ar iesi tacut, fara sa fi scris nimic. */
  assert.match(corp, /r\.stare === "lipsa" \|\| r\.variante\?\.stare === "lipsa"/,
    "si raspunsul variantelor se citeste, nu doar cel al listarii");
  assert.match(corp, /if\s*\(r\.stare !== "scris"\)/,
    "orice alt raspuns decat „scris” opreste salvarea");
});
