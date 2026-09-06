import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * `page_sections` se scrie INTREG, de patru drumuri. Ce nu stie drumul, se pierde.
 *
 * ═══ ⚠ CLASA, NU DEFECTUL ═══
 *
 * Coloana e un `jsonb` cu douasprezece chei de nivel intai, iar fiecare scriitor o INLOCUIESTE, nu
 * o comaseaza. Deci orice cheie pe care scriitorul n-o cunoaste dispare la prima salvare — fara
 * nicio eroare, fara vreun rand in vreun raport, si de obicei fara ca cineva sa observe pana cand
 * lipseste ceva pe vitrina.
 *
 * S-a intamplat deja de doua ori, si a doua oara a fost gasita de un audit al proprietarului:
 *
 *  1. Reimportul CSV cu „suprascrie" stergea `customization` — comerciantul isi configura
 *     fototapetul, isi actualiza preturile din fisier a doua zi, si produsul se intorcea la pretul
 *     de catalog. Reparat, dar reparat DOAR pentru cheia aceea.
 *  2. Acelasi reimport stergea `gpsr` — 116 produse in productie la 06.09.2026, adica datele de
 *     siguranta obligatorii prin regulament — si campurile `google.*` pe care fisierul nu le
 *     poarta.
 *
 * ⚠ De-aia proba asta nu cere „se pastreaza `gpsr`", ci ca fiecare scriitor sa PORNEASCA de la ce
 * exista. Scrisa pe chei, ar fi trecut verde peste a treia cheie pierduta.
 *
 * ⚠ Proba e pe SURSA fiindca scrierile sunt inauntrul unor functii care cer baza (`scrieProdusele`
 * cheama `admin.from(...)`) sau React (`ProductForm.handleSubmit`). Vezi `niciun-drum-nu-ocoleste`
 * pentru acelasi tipar si acelasi motiv.
 */

function sursa(relativ: string): string {
  return readFileSync(path.resolve(process.cwd(), relativ), "utf8").replace(/\r\n/g, "\n");
}

const IMPORT = "src/lib/import/committer.ts";
const FORMULAR = "src/components/dashboard/ProductForm.tsx";
const ACTIUNI = "src/lib/actions/product.actions.ts";

test("⚠ probele stiu sa citeasca fisierele", () => {
  /* Perechea obligatorie: un cititor rupt ar face toate probele de mai jos verzi pe siruri goale. */
  for (const f of [IMPORT, FORMULAR, ACTIUNI]) assert.ok(sursa(f).length > 5_000, f);
});

test("⚠ reimportul CSV porneste de la randul EXISTENT, nu de la fisier", () => {
  const s = sursa(IMPORT);

  /* Se citeste `page_sections` INTREG, nu o singura cheie din el. */
  assert.match(
    s, /personalizareaVeche = new Map<string, Record<string, unknown>>\(\)/,
    "importul tine iar doar o cheie, deci restul se pierd la reimport",
  );
  assert.equal(
    /\?\.customization;\n\s*if \(c\) personalizareaVeche\.set/.test(s), false,
    "importul citeste iar doar `customization`",
  );

  /* Si se scrie ca temelie, cu cheile fisierului deasupra. */
  assert.match(s, /\.\.\.psVeche,\n\s*\.\.\.psNoua,/,
    "randul existent nu mai e temelia, deci cheile necunoscute de fisier se rad");

  /*
   * ⚠ `google` se comaseaza pe UN NIVEL, si numai el: fisierul poarta doar `gtin` si `brand`, deci
   * scris peste, ar fi sters restul campurilor Google completate din panou. Celelalte chei se
   * inlocuiesc intregi, fiindca acolo fisierul chiar E sursa — un import trebuie sa poata si
   * sterge.
   */
  assert.match(s, /esteObiectSimplu\(googleVechi\) \? googleVechi : \{\}/);
  assert.match(s, /esteObiectSimplu\(googleNou\) \? googleNou : \{\}/);
});

test("⚠ formularul de produs pastreaza cheile pe care nu le cunoaste", () => {
  /*
   * `handleSubmit` compune un literal NOU cu unsprezece chei, iar `updateProduct` il scrie ca
   * inlocuire. Spread-ul sta PRIMUL, deci cele unsprezece chei il suprascriu imediat si purtarea
   * de azi ramane neschimbata pana la ultimul caracter — se pastreaza doar restul.
   */
  const s = sursa(FORMULAR);
  assert.match(
    s, /page_sections: \{\n(?:.*\n)*?\s*\.\.\.\(\(product\?\.page_sections \?\? \{\}\) as Record<string, unknown>\),/,
    "formularul reconstruieste iar `page_sections` doar din cheile pe care le stie",
  );
});

test("⚠ duplicarea unui produs nu poate naste un pachet stricat", () => {
  /*
   * ⚠ GASIT VERIFICAND AUDITUL, nu de audit.
   *
   * `duplicateProduct` citea fara filtru si insera fara `is_bundle`, iar coloana are `default
   * false`. Copia unui PACHET iesea produs SIMPLU, la pretul inghetat al pachetului, purtand un
   * `page_sections.bundle` pe care nimeni nu-l mai citeste (toti cititorii se uita intai la
   * coloana). Adica: se vindea la pretul unui set si se livra o singura bucata — iar prima salvare
   * din formular i-ar fi sters tacut si cheia `bundle`.
   *
   * Azi butonul nici nu se ofera pe pachete (`produse-filtre.ts` le scoate din lista), deci poarta
   * inchide un cap care s-ar fi deschis la prima schimbare de filtru — exact felul de gaura care
   * asteapta luni de zile si apoi apare intr-o zi in care nimeni nu se uita.
   */
  const s = sursa(ACTIUNI);
  const i = s.indexOf("export async function duplicateProduct");
  assert.ok(i > 0, "nu mai exista `duplicateProduct`");
  /*
   * ⚠ FELIA SE MARGINESTE LA FUNCTIE, si asta a prins-o un mutant, nu o citire atenta.
   *
   * Prima forma taia 3000 de caractere de la inceputul functiei — destul cat sa prinda si
   * `.eq("is_bundle", false)` din functia URMATOARE. Mutantul care scotea filtrul chiar din
   * `duplicateProduct` trecea, fiindca proba il gasea in vecin. O felie care se scurge in
   * altceva raspunde despre altceva.
   */
  const urmatoarea = s.indexOf("\nexport async function ", i + 1);
  /*
   * ⚠ SI COMENTARIILE SE SCOT, si asta a prins-o tot un mutant, nu o citire atenta.
   *
   * Felia marginita la functie era corecta, dar cauta `.eq("is_bundle", false)` intr-un text care
   * contine si NOTA de deasupra reparatiei — unde tocmai secventa aia e citata. Mutantul care
   * scotea filtrul din interogare TRECEA, fiindca proba il gasea in propria explicatie.
   *
   * O proba nu are voie sa se potriveasca cu ce SCRIE despre cod; doar cu codul. Si se cere
   * secventa intreaga de filtre, nu randul singur, ca sa se vada ca sta in interogarea buna.
   */
  const bucata = s.slice(i, urmatoarea === -1 ? undefined : urmatoarea)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.match(
    bucata, /\.eq\("business_id", businessId\)\s*\n\s*\.eq\("is_bundle", false\)/,
    "duplicarea citeste iar si pachetele, si le naste ca produse simple la pretul setului",
  );
});
