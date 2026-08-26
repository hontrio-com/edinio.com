import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   NICIO CITIRE SI NICIO SCRIERE NU PICA IN TACERE (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   PostgREST NU arunca la refuz: intoarce `{ data: null, error }`. Tot `aboutyou/queue.ts` era
   scris ca si cum ar arunca — cele patru `catch`-uri ale lui cheama `scrieEsecul`, care e scris
   bine si are deasupra chiar povestea celor 1051 de preturi pierdute pe 21.08 — dar nu se
   executau NICIODATA, fiindca nu era nimic de prins. Nota despre defect era in fisier; leacul, nu.

   ⚠ CITIRILE ERAU MAI GRAVE DECAT SCRIERILE. O scriere picata inseamna „nu s-a intamplat"; o
   citire picata inseamna ca s-a luat o HOTARARE gresita:

       `data: null`  citit ca „magazinul nu e conectat"   -> nu se pune nimic la coada
       `count: null` citit ca „produsul nu e listat"      -> retragerea nu pleaca NICIODATA
       `data: null`  citit ca „nu e comanda About You"    -> AWB-ul nu ajunge la ei

   ⚠ SI A DOUA E CEA MAI URATA: produsul sters ramane ACTIV pe About You si primeste comenzi
   pentru marfa care nu mai exista. Nici nu se poate repara de mana — listarea supravietuieste cu
   `product_id` NULL (cheia straina e `on delete set null`), iar panoul porneste de la `products`,
   deci listarea orfana nu se mai afiseaza. Comerciantul n-are nici buton, nici rand de apasat.

   ⚠ DE CE N-A PRINS-O PROBA CARE EXISTA. `src/lib/supabase/in-nefragmentat.test.ts` scaneaza
   `src/lib/…/queue.ts` si verifica trei lucruri: ca s-au gasit cel putin trei cozi, ca nu se
   trimite o lista intreaga la `.in()`, si ca nu exista `catch {}` gol. About You le trecea pe
   toate trei — taia corect pe bucati, si fiecare `catch` chema `scrieEsecul`. Ironia e completa:
   chiar `catch`-urile care faceau proba verde erau cele care nu se executau niciodata. Proba
   pazea FORMA remediului, nu efectul lui.
*/

/*
 * ⚠ COMENTARIILE DE LINIE SE STERG PRIMELE, si ordinea nu e o preferinta.
 *
 * Invers, o secventa de deschidere de bloc aflata intr-un comentariu de LINIE (in `client.ts`
 * sta scrisa asa o cale de API cu stelut la sfarsit) porneste stergatorul de blocuri, care
 * inghite tot pana la urmatoarea inchidere — 835 de caractere de cod adevarat, masurat. Iar o
 * proba care cauta ceva in bucata inghitita trece linistita, pe gol.
 */
const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const coada = viu("src/lib/aboutyou/queue.ts");

test("⚠ fiecare citire din coada trece prin `randCitit`, nu prin `const { data }`", () => {
  /* `randCitit` arunca `EroareCitireBaza`, deci citirea picata cade in `catch`-ul care era deja
     acolo — iar `scrieEsecul` incepe in sfarsit sa scrie. */
  assert.match(coada, /import \{ randCitit \} from "@\/lib\/supabase\/rand-citit"/);

  /* ⚠ Niciun `const { data … } = await` fara `error` alaturi: aia e chiar forma defectului. */
  const fara = [...coada.matchAll(/const \{\s*data[^}]*\}\s*=\s*await/g)]
    .filter((m) => !/error/.test(m[0]));
  assert.deepEqual(fara.map((m) => m[0]), [], "o citire fara `error` s-a intors in queue.ts");
});

test("⚠ si `count` e citit cu `error`, fiindca `null` inseamna doua lucruri", () => {
  /* `count: null` dintr-o pana arata exact ca „zero randuri". Prima inseamna „nu stim", a doua
     „produsul nu e listat" — iar codul lua a doua si iesea tacut. */
  const numaratori = [...coada.matchAll(/const \{[^}]*count[^}]*\}\s*=\s*await/g)];
  assert.ok(numaratori.length >= 2, `am gasit doar ${numaratori.length} numaratori`);
  for (const m of numaratori) {
    assert.match(m[0], /error/, `numaratoare fara \`error\`: ${m[0]}`);
  }
});

test("⚠ fiecare punere la coada isi verifica `error`", () => {
  /*
   * Patru cai: produs, produse in masa, stoc in masa, expediere. Fiecare era un `await
   * admin.from(...).upsert(...)` gol. Cea de-a doua e chiar drumul celor 1051 de preturi.
   */
  const upserturi = [...coada.matchAll(/\.upsert\(/g)];
  assert.equal(upserturi.length, 4, `asteptam patru puneri la coada, am gasit ${upserturi.length}`);

  const aruncari = [...coada.matchAll(/if \(eCoada\) throw new Error\(/g)];
  assert.equal(aruncari.length, 4, "fiecare punere la coada trebuie sa arunce la eroare");
});

test("⚠ o bucata picata OPRESTE lotul, nu-l scurteaza in tacere", () => {
  /*
   * `idsListate` verifica `error` — dar facea `continue`. E a treia forma a aceluiasi defect, si
   * cea mai inselatoare, fiindca „verifica error" o bifeaza formal: o bucata picata din zece
   * inseamna ca produsele ei nu ajung in `listedIds`, deci se filtreaza afara, deci se pune la
   * coada un SUBSET. Iar `rows.length` nu iese zero, deci nici lipsa nu bate la ochi.
   */
  const i = coada.indexOf("async function idsListate");
  const f = coada.slice(i, coada.indexOf("\n}", i));
  assert.match(f, /throw new Error\(/, "bucata picata trebuie sa opreasca tot lotul");
  assert.doesNotMatch(f, /continue;/, "`continue` lasa un subset tacut");
});

test("⚠ nicio trimitere nu mai pleaca fara urma scrisa INAINTE", () => {
  /*
   * ═══ ⚠ FEREASTRA CARE A RAMAS DUPA `recordBatch` (27.08.2026) ═══
   *
   * `recordBatch` scria lotul DUPA ce About You il primea. Intre acceptul lor si scrierea
   * noastra ramanea o fereastra in care operatia se intampla si noi n-o mai stiam — iar sapte
   * din opt chematori nici nu-i citeau raspunsul, deci raportau REUSITA.
   *
   * Nu se putea repara citind raspunsul: o reluare oarba de-acolo poate expedia sau anula de
   * DOUA ORI. Deci urma se scrie inainte, si `recordBatch` nu mai exista aici.
   */
  const sync = viu("src/lib/aboutyou/sync.ts");
  assert.doesNotMatch(sync, /recordBatch\(/, "calea veche s-a intors");
  assert.match(sync, /export async function cuLotDurabil</);

  /* ⚠ Insertul intentiei e INAINTEA apelului: altfel n-ar apara nimic. */
  const f = sync.slice(sync.indexOf("export async function cuLotDurabil"));
  const corp = f.slice(0, f.indexOf("\n}\n"));
  assert.ok(corp.indexOf('status: "intentie"') < corp.indexOf("const res = await trimite()"),
    "intentia trebuie scrisa inaintea cererii");
  /* ⚠ Si `trimis_la` tot inainte: pus dupa, o cadere intre apel si scriere ar arata ca n-a plecat. */
  assert.ok(corp.indexOf("trimis_la:") < corp.indexOf("const res = await trimite()"));
  /* ⚠ Intentia nescrisa OPRESTE cererea. */
  assert.match(corp, /if \(eIntentie\) \{[\s\S]*?return null;/);

  /* ⚠ Refuz vs necunoscut, pe CODUL HTTP. `408` si `429` nu sunt refuzuri. */
  assert.match(sync, /export function eRefuzLimpede/);
  assert.match(sync, /status === 408 \|\| status === 429/);
  assert.ok(corp.includes(".delete().eq(\"business_id\", businessId).eq(\"intent_id\", intentId)"),
    "refuzul limpede sterge urma");
  assert.ok(corp.includes('status: "necunoscut"'), "necunoscutul o pastreaza");
});

test("⚠ toate cele opt trimiteri trec prin outbox, si niciuna pe langa", () => {
  const sync = viu("src/lib/aboutyou/sync.ts");
  const orders = viu("src/lib/aboutyou/orders.ts");
  const feluri = new Set([...`${sync}${orders}`.matchAll(/cuLotDurabil\(admin, ctx\.businessId, ("?\w+"?),/g)]
    .map((m) => m[1].replace(/"/g, "")));
  /* `kind` e o variabila la stoc/pret: acolo felul se alege la chemare. */
  assert.deepEqual([...feluri].sort(),
    ["cancel", "kind", "product", "removal", "return", "ship", "status", "stock_removal"]);

  /* ⚠ Si fiecare chematoare se uita la `null`: altfel cererea ar parea facuta. */
  const nuluri = [...`${sync}${orders}`.matchAll(/if \(res === null\)|if \(zero === null\)/g)];
  assert.ok(nuluri.length >= 6, `doar ${nuluri.length} chematori verifica intentia nescrisa`);
});

test("⚠ intentia ramasa deschisa ajunge la un om, o singura data", () => {
  /*
   * „Am trimis si nu stiu ce a iesit" e singura stare care cere un OM: nu se poate relua orbeste.
   * Se scrie `critical`, si se marcheaza randul, altfel cronul de minut ar scrie acelasi lucru de
   * 1440 de ori pe zi si ar ingropa alarmele adevarate.
   */
  const sync = viu("src/lib/aboutyou/sync.ts");
  assert.match(sync, /export async function alarmaIntentiiDeschise/);
  assert.match(sync, /action: "aboutyou\/intentie-deschisa", severity: "critical"/);
  assert.match(sync, /\.is\("alarma_scrisa_la", null\)/);
  assert.match(sync, /alarma_scrisa_la: new Date\(\)\.toISOString\(\)/);

  /* Si e chemata din cron, altfel n-ar afla nimeni niciodata. */
  const cron = viu("src/app/api/cron/aboutyou-sync/route.ts");
  assert.match(cron, /await alarmaIntentiiDeschise\(admin, businessId\)/);

  /* ⚠ Loturile deschise NU se sondeaza: n-au id-ul lor, deci n-au ce intreba. */
  assert.match(sync, /\.in\("status", \["pending", "processing", "retry"\]\)/);
});

test("⚠ publicarea asteapta ULTIMUL lot al produsului, nu primul", () => {
  /*
   * `POST /products/` primeste cel mult 100 de articole, deci 250 de variante inseamna trei
   * loturi. Se publica la primul incheiat — nu o cursa rara, ci purtarea obisnuita a oricarui
   * produs cu peste 100 de variante: se cerea aprobarea cand doua treimi din variante nu
   * ajunsesera inca.
   *
   * ⚠ Fara contor nou: loturile aceluiasi produs poarta acelasi `style_key` in `related_ids`.
   */
  const sync = viu("src/lib/aboutyou/sync.ts");
  assert.match(sync, /const fratiNeterminati = randuriCitite</);
  assert.match(sync, /\.contains\("related_ids", \[listing\.style_key\]\)/);
  assert.match(sync, /\.in\("status", \["pending", "processing", "retry"\]\)/);
  assert.match(sync, /\.neq\("id", b\.id\)/, "lotul curent nu se numara pe sine");

  /* ⚠ Si verificarea e INAINTEA punerii publicarii la coada. */
  const i = sync.indexOf("const fratiNeterminati");
  const j = sync.indexOf('op: "publish"');
  assert.ok(i > 0 && j > i, "verificarea fratilor trebuie sa fie inaintea publicarii");

  /*
   * ═══ ⚠ SI CEEA CE PROBA ASTA NU VEDEA (27.08.2026) ═══
   *
   * Verificarea exista si era inaintea publicarii — amandoua adevarate — dar SCRIEREA STATUSULUI
   * era inaintea verificarii. Deci lotul 1 scotea listarea din `pending`, iar loturile 2 si 3 nu
   * mai intrau deloc in ramura: un produs cu peste 100 de variante nu se publica NICIODATA.
   *
   * Proba trecea verde peste chiar defectul pe care il masura. Acum se cere si ordinea a treia:
   * iesirea pe frati neterminati vine INAINTEA oricarei scrieri de status.
   */
  const iesirea = sync.indexOf("if (fratiNeterminati.length > 0) {");
  const scrierea = sync.indexOf("const urmare = urmareaLotului(listing.stare_dinainte)");
  assert.ok(iesirea > i, "iesirea pe frati vine dupa interogarea lor");
  assert.ok(scrierea > iesirea,
    "statusul se scrie DUPA iesirea pe frati neterminati, altfel loturile urmatoare nu mai intra in ramura");
  /* Si ramura intreaga se intra doar cat listarea e `pending`, deci scrierea o inchide. */
  assert.match(sync, /b\.kind === "product" && listing\.status === "pending"/);
});

/* ══════════════════════════════════════════════════════════════════════════
   SI ACUM REGULA E PESTE TOT DOSARUL, NU DOAR PE COADA (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Proba pazea `queue.ts`. Restul integrarii avea noua citiri inghitite, gasite la audit:

     `loadAboutYouContext`   pana citita ca „magazinul nu e conectat" -> pasii 2, 3 si 4 din cron
                             sareau TACUT peste magazin, iar rularea se numara reusita
     `getVariantData`        pana citita ca „produsul n-are variante"
     `getListing…`           pana citita ca „listarea nu exista"
     randul lateral al comenzii   pana citita ca „comanda e noua" -> calea de CREARE
     configul din `patchAboutYouConfig`   citeste-modifica-scrie: `{}` peste configul intreg
     configul din ruta de webhook         raspundea `200`, inaintea oricarei scrieri

   ⚠ De-aia nu se mai repara caz cu caz: fisierele se scaneaza, si unul nou intra sub aceeasi
   regula fara sa i-o ceara nimeni.
*/

import { readdirSync } from "node:fs";

/** Locurile in care `const { data }` fara `error` e chiar in regula. */
const IERTATE = new Set([
  /* Nu e o citire: se citeste `error`-ul unui `insert`, iar `data` e randul creat. */
  "orders.ts:created",
]);

test("⚠ niciun fisier din `src/lib/aboutyou` nu mai citeste `const { data }` fara `error`", () => {
  const fisiere = readdirSync("src/lib/aboutyou")
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  assert.ok(fisiere.length >= 8, `prea putine fisiere scanate: ${fisiere.length}`);

  const gasite: string[] = [];
  for (const f of fisiere) {
    const src = viu(`src/lib/aboutyou/${f}`);
    for (const linie of src.split("\n")) {
      /* `const { data }` sau `const { data: x }` FARA `error` pe aceeasi destructurare. */
      const m = /const\s*\{\s*data(?:\s*:\s*\w+)?\s*\}\s*=/.exec(linie);
      if (m && !IERTATE.has(`${f}:${/data\s*:\s*(\w+)/.exec(linie)?.[1] ?? ""}`)) {
        gasite.push(`${f}: ${linie.trim().slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(gasite, [], `citiri inghitite:\n${gasite.join("\n")}`);
});

test("⚠ si ruta de webhook deosebeste pana de configul lipsa", () => {
  /*
   * Cele patru raspunsuri nu se mai confunda: pana -> 503, config lipsa -> 200 (hotarare veche
   * si buna), autentificare rea -> 200, scris in inbox -> 200. Inainte, primul cadea pe al doilea
   * si evenimentul se pierdea inainte sa apuce sa ajunga in inbox.
   */
  const ruta = viu("src/app/api/aboutyou/webhook/route.ts");
  assert.ok(ruta.includes('if (eSettings && eSettings.code !== "PGRST116") {'), "pana nu se deosebeste");
  assert.ok(ruta.includes('{ status: 503 }'), "nu raspunde 503");
  /* Si 503-ul de la config vine INAINTEA ramurii care raspunde 200 pe secret lipsa. */
  assert.ok(ruta.indexOf('{ status: 503 }') < ruta.indexOf("cfg?.webhook_secret"));
});
