import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { COLOANA_AWB } from "@/lib/orders/awb-propriu";

/* ══════════════════════════════════════════════════════════════════════════
   O CERERE CATRE CURIER FARA TERMEN TINE CUMPARATORUL BLOCAT      (13.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE ERA. Cotatia din checkout cheama treisprezece curieri deodata si ii asteapta
   pe toti (`Promise.all` in `shipping.actions.ts`). Cinci clienti nu puneau niciun
   termen pe `fetch`: Sameday, Woot, DPD, Cargus si Colete. Un singur furnizor care
   accepta conexiunea si apoi tace tine ecranul de livrare pe loc pana cand renunta
   omul sau taie platforma functia. Nu e o incetinire, e un checkout oprit, si niciun
   log nu spune de ce.

   ⚠ SI COTATIA INTERNATIONALA DPD statea si mai prost: ea se asteapta cu un `await`
   singur, INAINTE de `Promise.all`, deci acolo nici macar ceilalti curieri nu apucau
   sa raspunda.

   ⚠ DE CE E SIGUR SA PUI TERMEN PE O CALE CARE EMITE AWB-URI. Un `fetch` taiat arunca
   o eroare care nu trece prin niciun constructor din `eroare-furnizor.ts`, deci
   `verdictFurnizor` cade pe implicitul lui: `necunoscut`. Adica exact ce trebuie.
   Coletul POATE sa fi fost creat, deci randul din registru blocheaza si iese la om,
   in loc sa ingaduie o reincercare care ar trimite al doilea colet.

   ══════════════════════════════════════════════════════════════════════════
   ⚠ DE CE PROBA ASTA CERE `signal:`, SI NU O FORMA ANUME
   ══════════════════════════════════════════════════════════════════════════

   Prima versiune a scanerului cerea `AbortSignal.timeout(`. Masurata pe depozit, ar
   fi iesit ROSIE peste cod corect: Packeta isi leaga cererile cu `new AbortController()`
   plus `setTimeout(() => ctrl.abort(), …)` si `signal: ctrl.signal`, fiindca are nevoie
   sa deosebeasca un `AbortError` al lui de altceva. E un termen adevarat, scris altfel.

   O proba care cere forma apara forma. Aici regula e „cererea e MARGINITA in timp",
   si amandoua formele o implinesc, deci amandoua trec.

   ⚠ SI DE CE UN POTRIVITOR DE PARANTEZE, nu o fereastra de atatea caractere. Euristica
   dintai taia obiectul de optiuni la primul `);` gasit, iar `ecolet/client.ts` are un
   comentariu de cincisprezece randuri CHIAR INTRE antete si `signal`, deci raporta
   lipsa pe o chemare care il avea. Un scaner care se inseala pe cod bun e mai rau decat
   lipsa lui: invata pe cine il citeste sa nu-l creada.
*/

/** Numele curierilor, luate din singura lista care conteaza. */
const CURIERI = Object.keys(COLOANA_AWB);

/**
 * Fisierele de client ale curierilor, gasite pe disc.
 *
 * ⚠ NU E O LISTA SCRISA DE MANA, dinadins. Scrisa, al optsprezecelea curier ar fi
 * intrat fara sa fie acoperit, iar proba ar fi ramas verde exact cand nu mai apara
 * totul. Asa, un modul nou sub `src/lib/<curier>/` e prins fiindca poarta numele lui.
 */
function fisiereleCurierilor(): string[] {
  const gasite: string[] = [];

  const mergiIn = (dir: string) => {
    for (const intrare of readdirSync(dir)) {
      const cale = `${dir}/${intrare}`;
      if (statSync(cale).isDirectory()) { mergiIn(cale); continue; }
      if (!intrare.endsWith(".ts") || intrare.endsWith(".test.ts")) continue;

      /* Potrivire pe SEGMENT, nu pe subsir: altfel `ups` ar fi prins si un
         `backups.ts`, iar proba ar fi inceput sa vorbeasca despre alte fisiere. */
      const segmente = cale.split("/");
      const eAlUnuiCurier = segmente.some(
        (s) => CURIERI.includes(s) || CURIERI.includes(s.replace(/\.ts$/, "")),
      );
      if (!eAlUnuiCurier) continue;
      if (!readFileSync(cale, "utf8").includes("fetch(")) continue;
      gasite.push(cale);
    }
  };

  mergiIn("src/lib");
  return gasite;
}

/**
 * Argumentele chemarii care incepe la paranteza `dela`.
 *
 * Numara parantezele, sarind peste siruri (inclusiv sabloane) si peste comentarii,
 * ca sa intoarca EXACT lista de argumente, oricat de lung ar fi ce e inauntru.
 */
function argumenteleLui(sursa: string, dela: number): string {
  let adancime = 0;
  let inSir: string | null = null;
  let inComentariu: "linie" | "bloc" | null = null;

  for (let i = dela; i < sursa.length; i++) {
    const c = sursa[i];
    const urm = sursa[i + 1];

    if (inComentariu === "linie") { if (c === "\n") inComentariu = null; continue; }
    if (inComentariu === "bloc") { if (c === "*" && urm === "/") { inComentariu = null; i++; } continue; }
    if (inSir) {
      if (c === "\\") { i++; continue; }
      if (c === inSir) inSir = null;
      continue;
    }
    if (c === "/" && urm === "/") { inComentariu = "linie"; i++; continue; }
    if (c === "/" && urm === "*") { inComentariu = "bloc"; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { inSir = c; continue; }

    if (c === "(") adancime++;
    else if (c === ")") {
      adancime--;
      if (adancime === 0) return sursa.slice(dela, i + 1);
    }
  }
  return sursa.slice(dela);
}

test("⚠ fiecare cerere catre un curier are termen", () => {
  const fisiere = fisiereleCurierilor();
  const fara: string[] = [];
  let chemari = 0;

  for (const cale of fisiere) {
    const sursa = readFileSync(cale, "utf8");
    const re = /\bfetch\(/g;
    let m: RegExpExecArray | null;

    while ((m = re.exec(sursa)) !== null) {
      chemari++;
      const args = argumenteleLui(sursa, m.index + m[0].length - 1);
      const linie = sursa.slice(0, m.index).split("\n").length;

      if (!/\bsignal:/.test(args)) { fara.push(`${cale}:${linie}`); continue; }
      /* Un `signal` care nu leaga nimic e mai rau decat lipsa lui: pare pus. */
      assert.doesNotMatch(
        args, /\bsignal:\s*(undefined|null)\b/,
        `${cale}:${linie}: \`signal\` gol nu margineste nicio cerere`,
      );
    }
  }

  assert.deepEqual(
    fara, [],
    "cererile astea pot astepta la nesfarsit; leaga-le cu `AbortSignal.timeout(...)` "
    + "sau cu un `AbortController` plus `setTimeout`, ca la Packeta",
  );

  /*
   * ⚠ SI SE NUMARA. Fara randurile astea, o cale schimbata sau un regex care nu mai
   * potriveste nimic ar fi facut proba sa treaca peste ZERO chemari si sa iasa verde:
   * tiparul „proba care nu poate cadea". Masurat pe 13.09.2026: 19 fisiere, 43 chemari.
   */
  assert.ok(fisiere.length >= 19, `gasite doar ${fisiere.length} fisiere de curier`);
  assert.ok(chemari >= 40, `gasite doar ${chemari} chemari fetch: plasa n-are pe cine cadea`);
});

test("⚠ si fiecare curier din harta chiar are un modul acoperit", () => {
  /*
   * Altfel un curier si-ar putea tine cererile intr-un fisier care nu poarta numele
   * lui, si proba de mai sus l-ar ocoli fara sa spuna nimic. Cei care n-au deloc
   * `fetch` propriu sunt numiti aici, cu motivul.
   */
  const FARA_CLIENT_PROPRIU: Record<string, string> = {};

  const fisiere = fisiereleCurierilor();
  const neacoperiti = CURIERI.filter(
    (c) => !FARA_CLIENT_PROPRIU[c] && !fisiere.some((f) => f.split("/").some(
      (s) => s === c || s.replace(/\.ts$/, "") === c,
    )),
  );

  assert.deepEqual(
    neacoperiti, [],
    "curierii astia nu au niciun fisier cu `fetch` sub numele lor: ori modulul s-a mutat, "
    + "ori chiar n-au client propriu, si atunci treci-i in `FARA_CLIENT_PROPRIU` cu motivul",
  );
});
