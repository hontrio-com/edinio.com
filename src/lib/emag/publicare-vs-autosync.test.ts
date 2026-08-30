import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   „TRIMITE AUTOMAT PRETUL SI STOCUL" NU E „PUBLICA PRODUSELE NOI" (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Panoul are DOUA comutatoare, independente. Dar `configPentruCoada` le punea pe amandoua
   sub acelasi „nu": taietura se facea la `auto_sync` (queue.ts:110), iar `config.auto_publish`
   se citea abia mai jos — deci nu apuca sa fie intrebat NICIODATA.

   ⚠ CE INSEMNA. Comerciantul care spune „prețurile le conduc eu din panoul eMAG, dar
   produsele noi să plece singure" — o combinatie pe care interfata i-o ingaduie — nu primea
   nimic. Nici in coada, nici in jurnal: iesirea era un `return` gol. Si nu se repara singur:
   plasa cere `last_synced_at is not null`, iar un produs care n-a plecat niciodata n-are asa
   ceva. Nici reaprinderea de mai tarziu nu-l recupereaza.

   ⚠ IAR UN BUTON PE CARE SCRIE „PUBLICĂ" nu are ce cauta sub un comutator care vorbeste
   despre ce se intampla FARA ca omul sa ceara.

   ⚠ Deosebirea era deja facuta in casa, la retragere: „`auto_sync` STINS NU E UN MOTIV SA NU
   RETRAGEM". De aceea `deconectat` exista pe tip dinainte. Publicarea n-o primise.
*/

const coada = readFileSync("src/lib/emag/queue.ts", "utf8");
const viu = coada.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("starea configului poarta configul si cand sincronizarea e stinsa", () => {
  /* Fara el, apelantul n-avea de unde sti daca „Publică automat" e aprins. */
  assert.match(viu, /\| \{ fel: "nu"; deconectat: boolean; motiv: string; config\?: EmagConfig \}/);
  assert.match(viu, /motiv: "Sincronizarea automată cu eMAG e oprită\.", config \}/);
});

test("⚠ produsul nou cu „Publică automat” trece peste sincronizarea stinsa", () => {
  assert.match(viu, /const publicareCeruta\s*=\s*produsNou && stare\.fel === "nu" && !stare\.deconectat && stare\.config\?\.auto_publish === true;/);
  assert.match(viu, /if \(stare\.fel !== "porneste" && !publicareCeruta\) return;/);
});

test("⚠ apasarea pe „Publică” trece si ea", () => {
  /* `publicaSiFaraOferta` se pune NUMAI de pe drumurile care spun „Publică" — deci acolo
     omul tocmai a cerut-o, acum. */
  assert.match(viu, /const apasatDeOm = optiuni\.publicaSiFaraOferta === true;/);
  assert.match(viu, /const trecePeApasare = apasatDeOm && stare\.fel === "nu" && !stare\.deconectat;/);
  /* ⚠ Iesirea intoarce acum un VERDICT, nu `0`: `enqueueMany` nu mai poate spune „zero" si
     pentru „n-am ce pune", si pentru „am picat" — vezi `propagare.ts`. Purtarea e aceeasi. */
  assert.match(viu, /if \(stare\.fel !== "porneste" && !trecePeApasare\) return \{ fel: "oprit" \};/);
});

test("⚠ MAGAZINUL DECONECTAT ramane un „nu” adevarat, pe amandoua caile", () => {
  /*
   * Cea mai importanta proba din fisier, si perechea celorlalte doua. Fara `!stare.deconectat`,
   * reparatia ar fi insemnat „publica si cand nu exista cont" — adica elemente puse in coada
   * pentru un magazin care n-are unde sa le trimita, si care ar fi ars incercari degeaba.
   */
  const treceri = viu.match(/stare\.fel === "nu" && !stare\.deconectat/g) ?? [];
  assert.equal(treceri.length, 2, "amandoua trecerile cer magazinul conectat");
});

test("⚠ „nu se stie” ramane un „nu” pe amandoua caile", () => {
  /*
   * `necitit` nu e `nu`, deci niciuna dintre treceri nu-l prinde — si asa trebuie: o pana a
   * bazei n-are voie sa arate ca o hotarare a comerciantului. Punerea in coada e reversibila
   * si se reia la urmatoarea atingere.
   */
  assert.doesNotMatch(viu, /stare\.fel === "necitit" && !stare\.deconectat/);
  assert.match(viu, /publicareCeruta[\s\S]{0,200}?stare\.fel === "nu"/);
});

test("retragerea si-a pastrat deosebirea ei", () => {
  /* Tiparul de la care s-a pornit. Daca se strica, se strica si motivarea reparatiei. */
  assert.match(viu, /if \(stare\.fel === "nu" && stare\.deconectat\) return \{ fel: "gata" \};/);
});

/* ── Si mesajele ─────────────────────────────────────────────────────────── */

test("⚠ mesajul de zero nu mai da o cauza imposibila", () => {
  /*
   * Textul vechi dadea drept cauza „ofertele sunt preluate din contul tău eMAG" — pentru o
   * lista care, PRIN DEFINITIE, contine produse fara niciun rand in `emag_offers`. Adica
   * exact singurul lucru care nu putea fi adevarat acolo.
   *
   * Dupa reparatie, `auto_sync` nu mai e un motiv. Raman doua, si duc in locuri diferite.
   */
  const act = readFileSync("src/lib/actions/emag.actions.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  /*
   * ⚠ SE NUMARA FATA DE DRUMURI, nu fata de un numar scris de mana.
   *
   * Prima forma cerea exact DOUA. Cand a aparut al treilea drum de publicare (bara de selectie din
   * lista de produse), proba a picat pe un cod CORECT — iar reparatia evidenta ar fi fost sa i se
   * mareasca numarul, dupa care al patrulea drum ar fi putut veni FARA mesaj si numarul ar fi
   * ramas bun. Regula e „fiecare zero isi spune cauza adevarata".
   */
  /* ⚠ Ancora e chemarea de PUBLICARE, nu orice `puse === 0`: exista si drumuri de pret si de
     stoc care ies pe zero din alte motive si spun alte lucruri. */
  const zerouri = (act.match(/await publicaPeEmagStrict\(/g) ?? []).length;
  assert.ok(zerouri >= 2, `asteptam cel putin doua drumuri de publicare, sunt ${zerouri}`);
  const cate = (act.match(/contul eMAG nu e conectat\. Conectează-l din setările integrării\./g) ?? []).length;
  assert.equal(cate, zerouri, `fiecare zero trebuie sa spuna cauza adevarata (${cate} din ${zerouri})`);

  /* ⚠ Si cealalta ramura trimite mai departe, nu se opreste la constatare. */
  assert.match(act, /Folosește „Trimite acum” pe/);
});
