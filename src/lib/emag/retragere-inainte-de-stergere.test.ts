import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   PRODUSUL NU SE STERGE PANA CAND RETRAGEREA NU E SCRISA (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE ERA GRESIT. `enqueueEmagRetragereInainteDeStergere` intorcea `void`, deci nimeni
   nu putea afla daca a reusit. Iar inauntru, citirea ofertelor era

     const { data } = await admin.from("emag_offers")…
     for (const r of (data ?? []) as …)

   PostgREST nu arunca la refuz: intoarce `{ data: null, error }`. Deci o pana de o clipa
   a bazei dadea lista goala — adica exact ce da un produs care n-a fost niciodata pe
   eMAG. Functia se incheia linistit, produsul se stergea, si oferta ramanea la VANZARE.

   ⚠ SI NU MAI ERA NIMIC DE REPARAT DUPA ACEEA. `on delete set null` rupe
   `emag_offers.product_id` chiar la stergere, deci nici macar nu se mai poate afla ce
   oferte erau ale produsului. Comerciantul afla cand ii vine o comanda pentru marfa pe
   care n-o mai are — si plateste el anularea, in bani si in punctaj.

   ⚠ Nu se asteapta dupa eMAG, si asta e important: ar lega „sterg un produs” de „raspunde
   marketplace-ul”. Se asteapta doar ca lucrarea sa fie SCRISA in coada; de acolo cronul
   o duce singur, cu reincercari.
*/

const NL = String.fromCharCode(10);

function faraNote(cale: string): string {
  return readFileSync(cale, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

test("proba insasi vede cele doua fisiere", () => {
  /* ⚠ O proba care nu gaseste nimic trece intotdeauna. */
  const coada = faraNote("src/lib/emag/queue.ts");
  const actiuni = faraNote("src/lib/actions/product.actions.ts");
  assert.match(coada, /enqueueEmagRetragereInainteDeStergere/, "n-am gasit functia");
  assert.match(actiuni, /enqueueEmagRetragereInainteDeStergere/, "n-am gasit apelantii");
});

test("retragerea raspunde „gata” sau „nesigur”, nu `void`", () => {
  const coada = faraNote("src/lib/emag/queue.ts");
  assert.match(
    coada, /Promise<RezultatRetragere>/,
    "raspunsul trebuie sa se poata citi: `void` nu se poate cantari",
  );
  assert.match(coada, /fel: "nesigur"/, "trebuie sa existe raspunsul care opreste stergerea");
});

test("citirea ofertelor picata da „nesigur”, nu „n-avea ce retrage”", () => {
  const coada = faraNote("src/lib/emag/queue.ts");
  const i = coada.indexOf("export async function enqueueEmagRetragereInainteDeStergere");
  assert.ok(i > 0);
  const corp = coada.slice(i);

  /* ⚠ `error` trebuie CITIT la citirea ofertelor: acolo era gaura. */
  const iCitire = corp.indexOf('from("emag_offers")');
  assert.ok(iCitire > 0, "n-am gasit citirea ofertelor");
  const inainte = corp.slice(Math.max(0, iCitire - 200), iCitire);
  assert.match(inainte, /const \{ data, error \}/, "citirea trebuie sa ceara si `error`");

  /* ⚠ Si la SCRIEREA in coada, care era la fel de oarba. */
  const iScriere = corp.indexOf('from("emag_sync_queue").upsert');
  assert.ok(iScriere > 0, "n-am gasit scrierea in coada");
  const inainteScrierii = corp.slice(Math.max(0, iScriere - 200), iScriere);
  assert.match(inainteScrierii, /const \{ error: eScriere \}/, "scrierea trebuie verificata");
});

test("„nu e conectat” trece, „n-am putut citi configurarea” NU", () => {
  /*
   * ⚠ Amandoua erau acelasi `null`, deci o pana de o clipa arata exact ca un magazin fara
   * eMAG — si stergerea mergea inainte.
   *
   * ⚠ Iar `auto_sync` stins NU e un motiv sa nu retragem: comutatorul acela spune „nu-mi
   * trimite singur schimbarile”, nu „lasa ofertele la vanzare dupa ce sterg produsul”.
   */
  const coada = faraNote("src/lib/emag/queue.ts");
  assert.match(coada, /fel: "necitit"/, "configurarea necitita trebuie sa aiba raspunsul ei");
  assert.match(
    coada, /stare\.fel === "nu" && stare\.deconectat/,
    "numai magazinul FARA cont eMAG sare peste retragere",
  );
});

test("amandoua stergerile de produse se opresc la „nesigur”", () => {
  /*
   * ⚠ Si cea in masa. Acolo cantareste chiar mai mult: o stergere de sute de produse
   * poate lasa sute de oferte la vanzare deodata.
   */
  const actiuni = faraNote("src/lib/actions/product.actions.ts");
  const chemari = [...actiuni.matchAll(/enqueueEmagRetragereInainteDeStergere\(/g)];
  assert.equal(chemari.length, 2, "sunt doua cai de stergere: una singura si una in masa");

  for (const c of chemari) {
    const dupa = actiuni.slice(c.index ?? 0, (c.index ?? 0) + 500);
    assert.match(
      dupa, /retragerea\.fel === "nesigur"/,
      "fiecare stergere trebuie sa se opreasca daca retragerea nu s-a putut programa",
    );
    assert.match(dupa, /return \{\s*$|return \{/m, "si trebuie sa raspunda comerciantului");
  }
});

test("retragerea se pune INAINTE de stergere, si se asteapta", () => {
  /*
   * ⚠ Ordinea nu e un amanunt: dupa stergere, `emag_offers.product_id` e deja `null`, deci
   * citirea n-ar mai gasi nimic. Iar `void` in loc de `await` ar face acelasi lucru pe
   * alta cale: functia ar porni si stergerea n-ar astepta-o.
   */
  const actiuni = faraNote("src/lib/actions/product.actions.ts");
  assert.ok(
    !/void\s+enqueueEmagRetragereInainteDeStergere/.test(actiuni),
    "nu se pune cu `void`: stergerea trebuie sa astepte raspunsul",
  );

  const linii = actiuni.split(NL);
  const iRetragere = linii.findIndex((l) => l.includes("enqueueEmagRetragereInainteDeStergere("));
  const iStergere = linii.findIndex((l, i) => i > iRetragere && /from\("products"\)\.delete\(\)/.test(l));
  assert.ok(iRetragere > 0 && iStergere > iRetragere, "retragerea trebuie sa vina prima");
});
