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

   ⚠ LEACUL NU E O TRANZACTIE MAI MARE, ci o ordine. Verificarile n-aveau nevoie de randul
   scris: singurul lucru pentru care il foloseau era excluderea listarii curente din
   cautarea de coliziuni, iar aia se face pe CHEIA DE STIL, care exista dinainte. Mutate
   inaintea oricarei scrieri, o salvare respinsa nu mai atinge nimic.

   Ce ramane nescris impreuna e doar perechea listare + variante — si acolo o cadere lasa
   campuri valide, nu o salvare respinsa si totusi facuta pe jumatate.
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

test("toate verificarile de SKU se fac inainte de orice scriere", () => {
  const scriere = Math.min(
    unde(/\.from\("aboutyou_listings"\)\s*\n?\s*\.update\(/, "actualizarea listarii"),
    unde(/\.from\("aboutyou_listings"\)\.insert\(/, "inserarea listarii"),
  );

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
  const scriere = unde(/\.from\("aboutyou_listings"\)\s*\n?\s*\.update\(/, "actualizarea listarii");
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

test("randurile de varianta se leaga de listare abia dupa ce randul exista", () => {
  const rows = unde(/const rows = variante\.map/, "construirea randurilor de varianta");
  const scriere = Math.min(
    unde(/\.from\("aboutyou_listings"\)\s*\n?\s*\.update\(/, "actualizarea listarii"),
    unde(/\.from\("aboutyou_listings"\)\.insert\(/, "inserarea listarii"),
  );
  assert.ok(rows > scriere, "`listing_id` nu exista inainte ca randul sa fie scris");
  assert.ok(rows < unde(/aboutyou_salveaza_variante/, "salvarea variantelor"));
});
