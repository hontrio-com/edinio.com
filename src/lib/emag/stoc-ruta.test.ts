import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   RUTA USOARA DE STOC N-A FUNCTIONAT NICIODATA (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ MASURAT IN JURNALUL DE CERERI AL PRODUCTIEI, pe contul VetDepo:

     PATCH /offer_stock/{id}     0 reusite,  850 de refuzuri 400
     POST  /product_offer/save   1145 reusite,  0 refuzuri
     POST  /order/read, /category/read, /rma/read, /vat/read …   toate merg

   NICIUN 200. Niciodata. S-a vazut abia la 04:02, cand a miscat primul stoc — pana
   atunci ruta pur si simplu nu fusese chemata. Din acel minut, fiecare vanzare pe Edinio
   a incetat sa mai scada stocul la eMAG: exact supravanzarea pentru care exista
   integrarea.

   ⚠ NICIUN AUDIT N-A GASIT-O, si nici n-avea cum: trei audituri externe au citit codul,
   iar codul e in acord cu schema LOR. Defectul se vedea numai in trafic.

   ══════════════════════════════════════════════════════════════════════════
   CE S-A EXCLUS, CU DOVEZI
   ══════════════════════════════════════════════════════════════════════════

     acreditarile   toate celelalte rute merg pe acelasi cont
     releul, IP-ul  la fel
     ofertele       active la ei (`status 1`), aprobate (`validation_status 9`), cu stoc
     valorile       5, 7, 16, 25, 31 — nimic negativ, nimic urias
     invelisul      `{data:{…}}` e ce cere schema LOR pentru TOATE scrierile, si e chiar
                    forma care merge de 1145 de ori pe `product_offer/save`
     adresa         `emagUrl` da exact `/api-3/offer_stock/{id}`

   ⚠ A RAMAS METODA: `PATCH` e singurul loc din integrare unde nu trimitem `POST`, si
   singurul care cade. Iar cele 850 de refuzuri n-au `mesaje` — cand eMAG refuza din
   logica lui trimite `isError` cu motive. Un 400 fara forma lor seamana a cerere oprita
   inainte de aplicatia lor.

   ⚠ IPOTEZA A RAMAS IPOTEZA. Releul cu IP fix traieste doar in mediul Vercel, deci o
   cerere de proba de pe masina de lucru ar fi primit un 403 despre IP, nu un raspuns
   despre metoda. De aceea stocul s-a mutat pe o ruta DOVEDITA, in loc sa se ghiceasca
   metoda si sa se spere.
*/

function faraNote(cale: string): string {
  return readFileSync(cale, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

test("proba insasi vede fisierele", () => {
  /* ⚠ O proba care nu gaseste nimic trece intotdeauna. */
  const t = faraNote("src/lib/emag/trimite.ts");
  assert.ok(t.length > 10_000, `trimite.ts pare gol (${t.length})`);
  assert.match(t, /async function duStocul\(/, "n-am gasit ruta de stoc");
});

test("stocul NU mai pleaca pe `offer_stock`", () => {
  /*
   * ⚠ Miezul reparatiei. Repusa, ruta aceea nu da nicio eroare la compilare, nicio proba
   * nu cade, si nimic nu se vede — pana cand cineva vinde ceva.
   */
  const cod = faraNote("src/lib/emag/trimite.ts");
  const i = cod.indexOf("async function duStocul(");
  const corp = cod.slice(i, cod.indexOf(String.fromCharCode(10) + "}", i));

  assert.ok(
    !/actualizeazaStoc\(/.test(corp),
    "stocul a fost pus inapoi pe `offer_stock`, ruta masurata cu 0 reusite din 850",
  );
  assert.match(corp, /salveazaOferte\(ctx\.auth,/, "trebuie sa plece pe `offer/save`");
});

test("pleaca NUMAI `{id, stock}`, nimic altceva", () => {
  /*
   * ⚠ `offer/save` poate schimba si pretul, si TVA-ul, si starea. Un camp in plus ar fi o
   * schimbare pe care n-a cerut-o nimeni — chiar lectia Trendyol, unde o miscare trimisa
   * pe ruta gresita a raportat succes fara sa schimbe pretul.
   */
  const cod = faraNote("src/lib/emag/trimite.ts");
  const i = cod.indexOf("const oferte: EmagOferta[] = stocuri.map(");
  assert.ok(i > 0, "n-am gasit construirea incarcaturii");
  const bucata = cod.slice(i, cod.indexOf("}));", i) + 4);

  for (const interzis of ["sale_price", "vat_id", "status", "handling_time", "min_sale_price"]) {
    assert.ok(!bucata.includes(interzis), `incarcatura de stoc poarta si \`${interzis}\``);
  }
  assert.match(bucata, /id: st\.emagId/);
  assert.match(bucata, /stock: \[\{ warehouse_id: depozit, value: st\.cantitate \}\]/);
});

test("se trimite in loturi, nu o cerere pe ofertă", () => {
  /*
   * ⚠ Forma dinainte facea cate o cerere PE OFERTA. Un produs cu 50 de variante ardea 50
   * din cele 3 cereri pe secunda ale magazinului pentru O SINGURA miscare de stoc — iar
   * acelea sunt cererile prin care trebuie sa plece urmatoarea vanzare.
   */
  const cod = faraNote("src/lib/emag/trimite.ts");
  const i = cod.indexOf("async function duStocul(");
  const corp = cod.slice(i, cod.indexOf(String.fromCharCode(10) + "}", i));
  assert.match(corp, /for \(let i = 0; i < oferte\.length; i \+= LOT\)/, "lot de cel mult 50");
});

test("ruta rupta ramane in cod, cu masuratoarea pe ea", () => {
  /*
   * ⚠ Nu se sterge. Cine gaseste peste un an `offer_stock` in documentatia lor si vrea
   * s-o foloseasca fiindca „e cea mai usoara" trebuie sa dea peste masuratoare, nu peste
   * un loc gol. O reparatie care sterge dovada invita defectul inapoi.
   */
  const cuNote = readFileSync("src/lib/emag/client.ts", "utf8");
  assert.match(cuNote, /export function actualizeazaStoc\(/, "functia nu se sterge");
  assert.match(cuNote, /N-A MERS NICIODATA/, "si masuratoarea trebuie sa fie langa ea");
  assert.match(cuNote, /850/, "cu cifra, nu cu o vorba generala");

  /* ⚠ Si nimeni n-o mai cheama. */
  const chemari = readFileSync("src/lib/emag/trimite.ts", "utf8").match(/actualizeazaStoc\(/g);
  assert.equal(chemari, null, "ruta masurata ca ruptă nu are voie sa mai fie chemata");
});
