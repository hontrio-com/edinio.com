import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   „IN CATE ZILE EXPEDIEZI", LA TRENDYOL (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ SE POATE, DAR NU CA LA eMAG. Trendyol are un singur camp echivalent: `deliveryDuration`,
   intreg, optional, INVELIT in `deliveryOption` (singular) la creare/actualizare de produs, si in
   `deliveryOptions` (PLURAL) pe ruta dedicata `delivery-info-bulk-update`. Se declara pe BARCOD,
   nu pe magazin.

   La eMAG omul alege dintr-o lista pe care ei ne-o dau (`/handling_time/read`). Trendyol n-are
   asa ceva: documentatia da inteles doar lui `0` („azi in curier") si `1` („cel tarziu maine"),
   iar OpenAPI-ul spune atat, `integer` — fara minim, maxim sau lista.

   ⚠ CAMPUL EXISTA IN COD DE LA PRIMUL COMIT AL INTEGRARII, si n-a plecat niciodata. Mai rau: era
   declarat PLAT pe `TrendyolProductItem`, iar in schema lor `deliveryDuration` nu exista la
   nivelul intai. Cine l-ar fi completat ar fi trimis la radacina, si Trendyol l-ar fi ignorat in
   tacere — cerere acceptata, produs publicat, termen neschimbat.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const tipuri = viu("src/lib/trendyol/types.ts");
const mapping = viu("src/lib/trendyol/mapping.ts");
const client = viu("src/lib/trendyol/client.ts");

test("⚠ campul e INVELIT, nu plat", () => {
  /* Forma plata ar fi plecat la radacina si ar fi fost ignorata tacut. */
  assert.match(tipuri, /deliveryOption\?: \{ deliveryDuration\?: number; fastDeliveryType\?: string \};/);
  assert.doesNotMatch(tipuri, /^\s+deliveryDuration\?: number;$/m, "forma plata s-a intors");
});

test("⚠ se OMITE cand comerciantul n-a ales nimic", () => {
  /*
   * Netrimis, Trendyol pastreaza termenul implicit al CONTULUI, pus in panoul lor. Trimis cu o
   * valoare de rezerva, fiecare republicare i-ar rescrie hotararea - fara nicio eroare, fiindca
   * si `1` e o valoare perfect valida. Chiar greseala `handling_time ?? 1` de la eMAG.
   */
  assert.match(mapping, /const zile = config\.delivery_duration;/);
  assert.match(mapping, /if \(zile != null && Number\.isInteger\(zile\) && zile >= 0 && zile <= ZILE_EXPEDIERE_MAXIM\)/);
  assert.doesNotMatch(mapping, /delivery_duration \?\? \d/, "o valoare de rezerva s-a strecurat");
});

test("⚠ plafonul e AL NOSTRU, si asa scrie", () => {
  /*
   * ⚠ Un comentariu care atribuie furnizorului o margine aleasa de noi devine fapt pentru cine il
   * citeste mai tarziu. Ei nu publica niciun plafon; noi ne oprim la ce are inteles documentat.
   */
  const brut = readFileSync("src/lib/trendyol/mapping.ts", "utf8");
  assert.match(brut, /NU E PLAFONUL LOR/);
  assert.match(mapping, /const ZILE_EXPEDIERE_MAXIM = 1;/);
});

test("⚠ ruta de schimbare pe produse aprobate exista, cu cheia la PLURAL", () => {
  /*
   * `deliveryOption` incape si in incarcatura de produs, dar aia trimite continutul intreg si
   * trece produsul din nou prin revizuia lor. Iar `price-and-inventory` are strict
   * `barcode/quantity/salePrice/listPrice`. Fara ruta asta, o schimbare de termen n-ar avea pe
   * unde sa ajunga la produsele publicate.
   *
   * ⚠ Singular la creare, PLURAL aici. Asa scrie in amandoua paginile lor, si asa arata si
   * raspunsul de citire.
   */
  assert.match(client, /export function updateDeliveryInfo\(/);
  assert.match(client, /deliveryOptions: \{ deliveryDuration: number \}/);
  assert.match(client, /products\/delivery-info-bulk-update/);
});

test("⚠ schimbarea setarii repune produsele la coada", () => {
  /*
   * Fara asta, setarea se salveaza si nu ajunge nicaieri - iar ecranul arata ca a mers. E acelasi
   * lucru reparat azi la About You, unde o schimbare de curs nu ajungea la preturi.
   */
  const act = viu("src/lib/actions/trendyol.actions.ts");
  assert.match(act, /const termenSchimbat = input\.delivery_duration !== undefined/);
  assert.match(act, /enqueueTrendyolLivrareMany\(businessId, ids\.map/);
  /* ⚠ `livrare`, nu `upsert`: ruta cea mai usoara pentru intentia avuta. */
  const coada = viu("src/lib/trendyol/queue.ts");
  assert.match(coada, /return enqueueMany\(businessId, productIds, "livrare"\);/);
  const sync = viu("src/lib/trendyol/sync.ts");
  assert.match(sync, /case "livrare":/);
  assert.match(sync, /await updateDeliveryInfo\(ctx\.auth, items\)/);
});

test("⚠ ecranul nu promite zile pe care nu le stim", () => {
  /*
   * Un camp liber ar fi lasat omul sa scrie 3, iar noi n-avem cum sa stim daca il primesc. Doua
   * optiuni, plus „cum e in cont" - exact ce e documentat, nici mai mult.
   */
  const ecran = readFileSync("src/components/dashboard/TrendyolClient.tsx", "utf8");
  assert.match(ecran, /Cum e setat în contul Trendyol/);
  assert.match(ecran, /În aceeași zi/);
  assert.match(ecran, /Cel târziu a doua zi/);
  /*
   * Si nu exista o a patra optiune strecurata.
   *
   * ⚠ Se taie la `</select>`, nu la un numar de caractere: prima varianta lua 2200 de caractere
   * si intra in campul URMATOR, unde adresa de retur are si ea un „Implicita din contul Trendyol".
   * Proba numara 4 si striga degeaba — codul era in regula.
   */
  const i = ecran.indexOf("În câte zile expediezi");
  const bucata = ecran.slice(i, ecran.indexOf("</select>", i));
  assert.equal((bucata.match(/<option value="/g) ?? []).length, 3,
    "trei optiuni: implicita din cont, azi, maine");
});

test("⚠ si operatia noua incape in constrangerea din baza", () => {
  /*
   * ⚠ O valoare pe care `check`-ul o respinge nu strica randul: il opreste sa existe. Coada ar fi
   * tacut, iar termenul n-ar fi plecat niciodata.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(baseline, /trendyol_sync_queue_op_check[\s\S]{0,200}'livrare'::text/);
});
