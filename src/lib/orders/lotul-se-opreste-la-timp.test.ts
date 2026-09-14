import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * LOTUL SE OPRESTE SINGUR, IN LOC SA FIE TAIAT FARA RASPUNS.
 *
 * ═══ ⚠ CE S-A INCHIS (13.09.2026) ═══
 *
 * `runPool` mergea pana termina toate comenzile, fara niciun termen. Facturile se emit UNA CATE
 * UNA (furnizorii dau numere de document pe o serie comuna), deci cincizeci de comenzi pe un
 * furnizor lent depaseau `maxDuration`, iar platforma taia functia: actiunea nu mai intorcea
 * NIMIC, desi serverul stia exact ce reusise.
 *
 * Ecranul trata deja cinstit cazul („nu stim cate s-au facut"), dar „nu stim" e cel mai prost
 * raspuns posibil cand serverul chiar stia. Cu un buget propriu sub `maxDuration`, lotul se
 * opreste singur si intoarce rezultatul PARTIAL.
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: scotand verificarea de termen din bazin, ridicand bugetul
 * peste `maxDuration`, sau tacand steagul in ecran, probele de mai jos cad.
 */

const RAD = process.cwd();

/** ⚠ Comentariile se taie: fisierele isi explica pe larg propriile reguli. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const LOT = "src/lib/actions/bulk-orders.actions.ts";
const PAGINA = "src/app/(dashboard)/dashboard/orders/page.tsx";
const ECRAN = "src/components/dashboard/OrdersClient.tsx";

test("⚠⚠ bugetul lotului sta SUB `maxDuration`, cu marja de scriere", () => {
  /*
   * ⚠ AFIRMATIA CENTRALA, SI SINGURA CARE SE POATE VERIFICA PE NUMERE.
   *
   * Un buget egal sau mai mare decat `maxDuration` n-ar apara nimic: functia ar fi taiata
   * inainte ca bazinul sa se opreasca singur, adica exact defectul de dinainte, doar cu un
   * comentariu linistitor deasupra. Dupa bazin mai urmeaza jurnalul si `revalidatePath`, deci
   * marja nu e rotunjire.
   */
  const buget = /const BUGET_LOT_MS = ([\d_]+);/.exec(sursa(LOT));
  assert.ok(buget, "lotul nu mai are buget propriu de timp");
  const bugetMs = Number(buget![1].replace(/_/g, ""));

  const max = /export const maxDuration = (\d+);/.exec(sursa(PAGINA));
  assert.ok(max, "pagina de comenzi nu mai declara `maxDuration`: bugetul n-are fata de ce sta");
  const maxMs = Number(max![1]) * 1000;

  assert.ok(bugetMs < maxMs, `bugetul lotului (${bugetMs} ms) nu mai e sub \`maxDuration\` (${maxMs} ms)`);

  /*
   * ═══ ⚠ MARJA SE MASOARA DUPA CEL MAI LUNG APEL, NU DUPA SCRIERILE DE LA FINAL ═══
   *
   * Prima forma a probei cerea doar `maxMs - bugetMs >= 20_000`, adica exact cat trebuie
   * jurnalului si lui `revalidatePath`. Trecea verde peste un defect REAL, si l-a lasat sa
   * traiasca: bazinul NU intrerupe o lucrare pornita, deci un AWB pornit cu o clipa inainte de
   * termen isi duce apelul pana la capat. Cu 60s la GLS, functia ajungea la ~340s din 300.
   *
   * ⚠ SI DE ACEEA PRAGUL SE CALCULEAZA, NU SE SCRIE. Numarul citit din capul meu a fost chiar
   * greseala; termenele le stiu doar sursele curierilor. Un curier nou cu termen mai lung
   * strica proba automat, fara sa-si mai aminteasca nimeni de randurile astea.
   */
  const SURSE_CURIERI = [
    "src/lib/gls/client.ts", "src/lib/gls/puncte.ts", "src/lib/packeta/client.ts",
    "src/lib/dhl/client.ts", "src/lib/fedex/client.ts", "src/lib/ecolet/client.ts",
    "src/lib/innoship/client.ts", "src/lib/smartship/client.ts", "src/lib/shipo/client.ts",
    "src/lib/posta/client.ts", "src/lib/pallex/client.ts", "src/lib/sameday/client.ts",
    "src/lib/cargus.ts", "src/lib/dpd.ts", "src/lib/colete.ts",
  ];
  let celMaiLungApelMs = 0;
  let deLa = "";
  for (const cale of SURSE_CURIERI) {
    const s = sursa(cale);
    for (const m of s.matchAll(/const ASTEPTARE\w*_MS = ([\d_]+);/g)) {
      const ms = Number(m[1].replace(/_/g, ""));
      if (ms > celMaiLungApelMs) { celMaiLungApelMs = ms; deLa = cale; }
    }
  }
  /* ⚠ Prag pe cautarea insasi: daca regexul sau lista se strica, proba ar cere zero si ar trece
     verde pe orice buget. Masurat pe 14.09.2026: cel mai lung e 60_000, la GLS. */
  assert.ok(celMaiLungApelMs >= 45_000,
    `cautarea termenelor s-a stricat: cel mai lung apel gasit e ${celMaiLungApelMs} ms`);

  /* ⚠ Plus scrierile de dupa bazin, care raman parte din socoteala. */
  const NECESAR = celMaiLungApelMs + 15_000;
  assert.ok(maxMs - bugetMs >= NECESAR,
    `marja e ${maxMs - bugetMs} ms, dar cel mai lung apel (${celMaiLungApelMs} ms, ${deLa}) `
    + `plus scrierile cer ${NECESAR} ms: un AWB pornit in ultima clipa duce functia peste `
    + "`maxDuration`, si atunci actiunea nu mai intoarce NIMIC");
});

test("⚠ bazinul chiar verifica termenul, si nu intrerupe o lucrare pornita", () => {
  const s = sursa(LOT);
  assert.match(s, /const termen = Date\.now\(\) \+ BUGET_LOT_MS;/,
    "bazinul nu-si mai socoteste termenul la pornire");
  assert.match(s, /if \(Date\.now\(\) >= termen\) return;/,
    "bazinul nu mai verifica termenul inainte de a porni o comanda noua");

  /*
   * ⚠ Verificarea sta INAINTEA luarii unei comenzi din coada, nu dupa. Mutata dupa `cursor++`,
   * o comanda ar fi scoasa din coada si niciodata lucrata: n-ar fi nici facuta, nici numarata
   * ca ramasa.
   */
  const iTermen = s.indexOf("if (Date.now() >= termen) return;");
  const iCursor = s.indexOf("const idx = cursor++;");
  assert.ok(iTermen > 0 && iCursor > 0 && iTermen < iCursor,
    "termenul se verifica DUPA ce comanda a fost scoasa din coada: ar disparea fara sa fie lucrata");
});

test("⚠ oprirea se SPUNE, pe amandoua loturile", () => {
  /*
   * ⚠ Doua loturi, doua iesiri, si amandoua trebuie sa poarte steagul. Pus intr-unul singur,
   * lotul de facturi ar fi spus adevarul si cel de AWB-uri ar fi tacut, sau invers.
   * Vezi memoria `acelasi-lucru-in-doua-copii`.
   */
  const s = sursa(LOT);
  const setari = (s.match(/if \(result\.done \+ result\.skipped \+ result\.failed < result\.total\) result\.oprit = true;/g) ?? []).length;
  assert.equal(setari, 2, `steagul de oprire se pune in ${setari} din 2 loturi`);
  assert.match(s, /oprit\?: true;/, "rezultatul lotului nu mai poate spune ca s-a oprit devreme");
});

test("⚠ si ecranul spune CATE au ramas neincercate, nu doar cate au reusit", () => {
  /*
   * Fara randul asta, o selectie de 50 din care s-au apucat 12 ar arata „12 reușite" si atat.
   * Omul ar crede ca celelalte 38 au disparut sau, mai rau, ca s-au facut deja.
   */
  const s = sursa(ECRAN);
  assert.match(s, /if \(res\.oprit\)/, "ecranul nu mai deosebeste lotul oprit de unul terminat");
  assert.match(s, /res\.total - res\.done - res\.skipped - res\.failed/,
    "ecranul nu mai socoteste cate comenzi au ramas neincercate");
  assert.match(s, /nimic nu s-a trimis de două ori/,
    "nu se mai spune ca reluarea e sigura: omul n-ar sti daca poate incerca din nou");
});
