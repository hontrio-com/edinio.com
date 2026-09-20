import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  „Ignora" e o promisiune facuta comerciantului: cosul ramane in cifre si nu mai
  primeste niciun mesaj. Promisiunea are TREI drumuri pe care se poate rupe -
  emailul de mana, SMS-ul de mana si cronul - si nici unul dintre ele nu striga
  daca se uita coloana. Un cos ignorat care primeste mai departe SMS-uri e mai
  rau decat butonul lipsa: comerciantul crede ca a oprit ceva.

  ⚠ Pana pe 21.09.2026 singura iesire era stergerea definitiva, din prima
  apasare, fara sa intrebe nimic. Iar stergerea scoate cosul SI din cifre, deci
  rata de abandon si venitul potential se schimbau in urma.
*/

const cale = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("⚠ POARTA TRIMITERILOR DE MANA REFUZA COSURILE IGNORATE", () => {
  const sursa = cale("../actions/abandoned-cart.actions.ts");

  /* Regula sta in poarta comuna, nu copiata in fiecare canal. */
  const poarta = sursa.slice(
    sursa.indexOf("async function poateTrimiteCatre"),
    sursa.indexOf("export async function sendAbandonedCartEmail"),
  );
  assert.ok(poarta.length > 0, "nu s-a gasit poarta comuna");
  assert.match(poarta, /cart\.ignorat_la/, "poarta nu se uita la cosurile ignorate");

  /*
    ⚠ Coloana trebuie si CERUTA. O poarta care citeste `cart.ignorat_la` dintr-un
    rand care nu contine coloana primeste `undefined` si lasa totul sa treaca -
    plasa pare pusa si nu prinde nimic. Amandoua interogarile o cer.
  */
  const cereri = sursa.match(/\.select\("id, customer_name, email, phone, status, ignorat_la,/g) ?? [];
  assert.equal(cereri.length, 2, "una dintre trimiteri nu cere coloana, deci poarta o vede goala");
});

test("⚠ CRONUL NU IA COSURILE IGNORATE", () => {
  /*
    Cronul nu trece prin poarta de mai sus: el isi alege singur cosurile. Deci
    un cos ignorat ar fi scapat de butonul din panou si ar fi primit mai departe
    mesaje automate - tocmai cele pe care comerciantul nu le mai vede plecand.
  */
  const cron = cale("../../app/api/cron/abandoned-recovery/route.ts");
  const interogare = cron.slice(cron.indexOf('.from("abandoned_carts")\n      .select("id, customer_name'));
  assert.match(
    interogare.slice(0, 600), /\.is\("ignorat_la", null\)/,
    "cronul nu filtreaza cosurile ignorate",
  );
});

test("⚠ STERGEREA NU MAI PLEACA DINTR-O SINGURA APASARE", () => {
  const ecran = cale("../../components/dashboard/AbandonedCartsClient.tsx");

  /* Cosul de gunoi deschide fereastra; nu mai cheama stergerea de-a dreptul. */
  assert.doesNotMatch(ecran, /onClick=\{\(\) => remove\(c\)\}/, "cosul de gunoi sterge direct");
  assert.match(ecran, /onClick=\{\(\) => setDeHotarat\(c\)\}/);

  /* Fereastra spune ce se pierde, nu doar „esti sigur?". */
  const fereastra = ecran.slice(ecran.indexOf("{deHotarat && ("), ecran.indexOf("{/* Recovery modal */}"));
  assert.match(fereastra, /definitiv/i, "nu se spune ca stergerea e definitiva");
  assert.match(fereastra, /rămâne în (statistici|cifre)/i, "nu se spune ce pastreaza „Ignora”");
  assert.match(fereastra, /Renunță/, "fereastra nu are iesire fara urmari");
});

test("⚠ UN COS IGNORAT NU MAI ARE BUTOANE DE TRIMIS", () => {
  /*
    Nu tine loc de poarta de pe server - dar un buton care arata activ si da
    eroare la apasare e o minciuna de ecran.
  */
  const ecran = cale("../../components/dashboard/AbandonedCartsClient.tsx");
  assert.match(ecran, /disabled=\{!c\.email \|\| !!c\.ignorat_la\}/);
  assert.match(ecran, /disabled=\{!c\.phone \|\| !!c\.ignorat_la\}/);
  assert.match(ecran, /Ignorat</, "randul nu arata ca e ignorat");
});
