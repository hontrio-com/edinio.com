import test from "node:test";
import assert from "node:assert/strict";
import { CALITATE, LATIMI, cheieVarianta } from "./latimi-imagini";
import { CALE } from "../../infra/cloudflare/worker-variante-imagini.js";

/**
 * CONTRACTUL DINTRE CHEIA VARIANTEI SI WORKERUL DIN CLOUDFLARE.
 *
 * ═══ ⚠ DE CE E CEL MAI FRAGIL LOC DIN TOATA LUCRAREA ═══
 *
 * Cheia unei variante se COMPUNE in TypeScript (`cheieVarianta`) si se DESFACE inapoi in
 * JavaScript, in Workerul care ruleaza la Cloudflare. Cele doua nu se vad niciodata: nu exista
 * tip comun, nu exista import in productie, iar Workerul nu trece prin `tsc`, prin lint sau prin
 * build. O virgula mutata in oricare dintre ele nu doboara nimic.
 *
 * Si urmarea nu e o poza mai putin clara. Cu steagul `NEXT_PUBLIC_IMAGINI_DIRECT` aprins,
 * browserul cere obiectul DIRECT: daca Workerul nu recunoaste calea, nu mai cere nimanui s-o
 * faca, si ce vede omul e o POZA RUPTA — pe fiecare vitrina, pentru fiecare varianta nefacuta
 * inca.
 *
 * ⚠ De-aia proba de aici importa CHIAR fisierul Workerului, nu o copie a expresiei lui.
 */

const CHEI = [
  "products/11111111-1111-4111-8111-111111111111/poza.webp",
  "products/11111111-1111-4111-8111-111111111111/poza.jpg",
  "products/22222222-2222-4222-8222-222222222222/imported/33333333-3333-4333-8333-333333333333/1781681400365-zzidrzh.jpg",
  "logos/44444444-4444-4444-8444-444444444444/1785676092941-s8wln.webp",
  "covers/55555555-5555-4555-8555-555555555555/sigla-2024.png",
  "gallery/66666666-6666-4666-8666-666666666666/pages/a-b_c.d.jpeg",
];

test("⚠ Workerul desface INAPOI orice cheie pe care o compune TypeScript", () => {
  /*
   * Se merge pe toate latimile scarii si pe forme de cheie luate din productie — inclusiv una cu
   * dosare imbricate si una al carei nume are chiar un punct in el.
   */
  for (const cheie of CHEI) {
    for (const latime of LATIMI) {
      const varianta = cheieVarianta(cheie, latime, CALITATE);
      const m = CALE.exec(`/${varianta}`);

      assert.ok(m, `Workerul nu recunoaste calea /${varianta}`);
      assert.equal(Number(m[1]), latime, `latimea citita gresit din /${varianta}`);
      assert.equal(Number(m[2]), CALITATE, `calitatea citita gresit din /${varianta}`);
      /*
       * ⚠ CHEIA TREBUIE SA IASA CARACTER CU CARACTER. Iesita altfel — de pilda fara terminatia
       * originalului, daca expresia ar taia lacom — Workerul ar cere originii SA FACA ALT FISIER
       * decat cel cerut de browser, si cererea urmatoare ar da tot 404. La nesfarsit.
       */
      assert.equal(m[3], cheie, `cheia s-a schimbat pe drum, din /${varianta}`);
    }
  }
});

test("⚠ terminatia originalului ramane in cheie, deci doua poze nu se calca", () => {
  /*
   * `poza.jpg` si `poza.webp` sunt DOUA fisiere. Daca varianta ar arunca terminatia originalului,
   * amandoua ar da `…/poza.webp` — adica una ar fi servita in locul celeilalte, tacut.
   */
  const a = cheieVarianta("products/x/poza.jpg", 640, 75);
  const b = cheieVarianta("products/x/poza.webp", 640, 75);
  assert.notEqual(a, b, "doua originale diferite au ajuns la aceeasi varianta");
  assert.equal(CALE.exec(`/${a}`)?.[3], "products/x/poza.jpg");
  assert.equal(CALE.exec(`/${b}`)?.[3], "products/x/poza.webp");
});

test("⚠ Workerul NU raspunde la cai care nu sunt variante", () => {
  /*
   * ⚠ PERECHEA NEGATIVA. Fara ea, „Workerul recunoaste tot ce trebuie" s-ar fi indeplinit si cu o
   * expresie care recunoaste ORICE — iar atunci fiecare 404 de pe domeniu ar fi trimis o cerere
   * catre originea noastra, pe socoteala noastra, pentru fisiere care n-au nimic de-a face cu
   * imaginile.
   */
  for (const cale of [
    "/products/x/poza.webp",
    "/_optim/products/x/poza.webp",
    "/_optim/w640/products/x/poza.webp",
    "/_optim/wq75/products/x/poza.webp",
    "/_optim/w640q75/products/x/poza.jpg",
    "/_optim/w640q75/.webp",
    /*
     * ⚠ SI CALEA TREBUIE SA INCEAPA CHIAR CU `_optim/`. Fara ancora de la inceput, orice dosar
     * care contine sirul ar fi trecut — iar un depozit public primeste chei scrise de import, deci
     * `products/<magazin>/_optim/…` nu e o inchipuire. Fiecare asemenea 404 ar fi trimis o cerere
     * catre originea noastra, pe socoteala noastra.
     */
    "/altceva/_optim/w640q75/products/x/p.webp",
    "/products/x/_optim/w640q75/y.webp",
    "/facturi-emag/x/y.pdf",
    "/",
  ]) {
    assert.equal(CALE.exec(cale), null, `Workerul a primit o cale care nu e varianta: ${cale}`);
  }
});

test("⚠ latimea si calitatea au margini in expresie, ca sa nu creasca la nesfarsit", () => {
  /*
   * Cifrele intra intr-un `fetch` catre originea noastra. Nemarginite, un sir de o mie de cifre ar
   * fi plecat ca `w=…` — refuzat la noi, dar dupa ce a trecut retea si timp pentru fiecare cerere
   * a fiecarui robot care se plimba pe domeniu.
   */
  assert.equal(CALE.exec("/_optim/w123456q75/products/x/p.webp"), null, "latime nemarginita");
  assert.equal(CALE.exec("/_optim/w640q7555/products/x/p.webp"), null, "calitate nemarginita");
  assert.ok(CALE.exec("/_optim/w1920q75/products/x/p.webp"), "cea mai mare latime a scarii e refuzata");
});
