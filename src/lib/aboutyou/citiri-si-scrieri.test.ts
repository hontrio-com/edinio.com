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

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

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

test("⚠ un lot trimis la ei nu se mai pierde in tacere", () => {
  /*
   * `recordBatch` se cheama DUPA ce cererea externa a reusit. Daca scrierea pica, id-ul lor se
   * pierdea: nu mai stiam ce sa sondam, lotul nu se incheia niciodata, iar listarea ramanea
   * `pending` pe veci — fara nicio eroare nicaieri.
   *
   * ⚠ Si nu se poate retrimite orbeste: o cerere externa cu rezultat necunoscut, retrimisa, face
   * dubluri. Deci id-ul se scrie macar in jurnal, ca `critical`, cu tot ce trebuie pentru o
   * reluare de mana.
   */
  const sync = viu("src/lib/aboutyou/sync.ts");
  assert.match(sync, /export async function recordBatch\([\s\S]{0,400}?Promise<boolean>/);
  assert.match(sync, /action: "aboutyou\/lot-nescris", severity: "critical"/);

  /* ⚠ Si apelantul chiar se uita la raspuns: altfel ar spune „trimis" despre ceva ce nu mai poate
     urmari, iar listarea ar ramane `pending` la nesfarsit. */
  assert.match(sync, /if \(!await recordBatch\(/);
  assert.match(sync, /if \(nescrise > 0\)/);
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
});
