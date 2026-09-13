import test from "node:test";
import assert from "node:assert/strict";
import { fetchCounties, fetchCities, uitaNomenclatorulWoot } from "@/lib/woot";

/* ══════════════════════════════════════════════════════════════════════════
   NOMENCLATORUL WOOT ARDEA DOUA APELURI LA FIECARE COTATIE      (13.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE ERA. Cotarea Woot din checkout face patru asteptari una dupa alta: judetele,
   localitatile judetului, tokenul, tarifele (`shipping.actions.ts`, ramura Woot). Primele
   doua sunt un nomenclator PUBLIC al Romaniei, acelasi pentru orice cont si pentru orice
   magazin, si se cereau de la capat la FIECARE vizitator care isi scria orasul.

   ⚠ CE COSTA, si nu e doar viteza. Magazinul are plafoane pe cotatie (60 pe IP si 600 pe
   magazin la zece minute, `shipping.actions.ts:489-490`). Doua cereri irosite la fiecare
   cautare le consuma de doua ori mai repede, iar cand se epuizeaza TOTI curierii
   magazinului trec pe tarif fix. Adica o lista necachata strica si cotatiile celorlalti.
   Aceeasi lectie e scrisa deja la SmartShip (`smartship/geo.ts:12-23`) si la eColet.

   ⚠ SI DE CE NU E IN CONTRADICTIE CU `no-store`. Comentariul vechi din `woot.ts` spunea
   „lista e mica, nu merita cache", dar el se referea la `force-cache`, adica la Vercel Data
   Cache, care dadea 500 constant la runtime pe 17.07.2026. Aici se tine in MEMORIA
   INSTANTEI, deci nu trece prin cache-ul platformei; `no-store` ramane pe fetch.

   ⚠ MUTANTUL E PE APELANT: aceleasi functii adevarate, cu `fetch` inlocuit si cererile
   numarate. Scos invelisul de cache, numarul sare de la unu la doi si proba cade.
*/

/** Inlocuieste `fetch` si numara cererile, pe cale. */
function reteaNumarata(raspuns: unknown) {
  const original = globalThis.fetch;
  const cereri: string[] = [];
  globalThis.fetch = (async (url: unknown) => {
    cereri.push(String(url).split("?")[0]);
    return new Response(JSON.stringify(raspuns), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { cereri, gata: () => { globalThis.fetch = original; } };
}

const JUDETE = [{ id: 12, name: "Cluj" }];
const ORASE = [{ id: 340, name: "Cluj-Napoca" }];

test("⚠ judetele se cer O SINGURA DATA, oricati cumparatori ar veni", async () => {
  const { cereri, gata } = reteaNumarata(JUDETE);
  try {
    uitaNomenclatorulWoot();
    const a = await fetchCounties();
    const b = await fetchCounties();
    const c = await fetchCounties();

    assert.deepEqual(a, JUDETE);
    assert.deepEqual(b, JUDETE, "a doua chemare a intors altceva decat prima");
    assert.deepEqual(c, JUDETE);
    assert.equal(
      cereri.length, 1,
      `trei cotatii au ars ${cereri.length} cereri de nomenclator in loc de una; `
      + "plafoanele magazinului se consuma degeaba si toti curierii cad pe tarif fix",
    );
  } finally { gata(); }
});

test("⚠ orasele se tin pe JUDET, nu toate la un loc", async () => {
  /*
   * O cheie de cache comuna ar fi fost mai rea decat lipsa ei: al doilea judet ar fi primit
   * localitatile primului, iar cumparatorul din Cluj ar fi vazut orasele din Bihor.
   */
  const { cereri, gata } = reteaNumarata(ORASE);
  try {
    uitaNomenclatorulWoot();
    await fetchCities(12);
    await fetchCities(12);
    assert.equal(cereri.length, 1, "acelasi judet a fost cerut de doua ori");

    await fetchCities(5);
    assert.equal(cereri.length, 2, "alt judet trebuie sa fie o cerere NOUA, nu raspunsul celuilalt");
  } finally { gata(); }
});

test("⚠ si se poate uita: altfel un nomenclator schimbat n-ar mai intra niciodata", async () => {
  const { cereri, gata } = reteaNumarata(JUDETE);
  try {
    uitaNomenclatorulWoot();
    await fetchCounties();
    assert.equal(cereri.length, 1);

    uitaNomenclatorulWoot();
    await fetchCounties();
    assert.equal(cereri.length, 2, "dupa golire, lista trebuie ceruta din nou");
  } finally { gata(); }
});
