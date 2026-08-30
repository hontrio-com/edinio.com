import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O ALARMA CARE SUNA MEREU E O ALARMA OPRITA (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   `domains-reconcile` scria „1 domenii neverificate" din ora in ora. Nota din cod prezicea
   exact ce se va intampla — „daca aceleasi domenii revin rulare de rulare, ce e stricat e
   CITIREA, nu domeniul" — si nu facea nimic cu predictia.

   ⚠ MASURAT: `okai.ro` a scris randul asta de 150 de ori, din 10.08.2026. Iar magazinul de sub
   el (`okxishop`) are ZERO produse si ZERO comenzi — deci nici macar nu era o vitrina cazuta,
   era un rand parasit care tipa de saisprezece zile.

   ⚠ SI ZGOMOTUL ASCUNDE. In aceeasi noapte, o veghe de-a mea raporta „N listari atinse" in
   fiecare minut, iar linia aia fara semnal e chiar cea sub care statea ascuns un defect real:
   doua magazine care nu-si reconciliau NICIODATA aprobarile. L-am gasit abia cand m-am
   intrebat de ce numarul din veghe nu se potriveste cu numaratoarea mea.

   Emailurile erau deja franate chiar mai jos in acelasi fisier, cu explicatia potrivita.
   Jurnalul nu era — si tot el e locul in care se uita omul.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const cron = viu("src/app/api/cron/domains-reconcile/route.ts");

test("⚠ acelasi rezultat nu se mai scrie din ora in ora", () => {
  /* Se compara o AMPRENTA a setului, nu doar numarul: doua domenii diferite, ambele
     neverificate, sunt o schimbare care trebuie spusa. */
  assert.match(cron, /const amprenta = JSON\.stringify\(\{/);
  assert.match(cron, /d\.amprenta !== amprenta\) break;/);
  assert.match(cron, /const seScrie = laRand === 0 \|\| deLaUltima >= ORE_TACERE \* 3600_000;/);
});

test("⚠ cand setul SE SCHIMBA, se scrie pe loc", () => {
  /* Franarea are voie sa taca peste ce s-a spus deja, niciodata peste ceva nou. Un domeniu nou
     cazut n-are voie sa astepte douasprezece ore fiindca altul tipa de saisprezece zile. */
  assert.match(cron, /laRand === 0 \|\|/, "amprenta noua trece imediat");
});

test("⚠ la a doua oara se spune CE INSEAMNA repetarea", () => {
  /*
   * Nu „un domeniu neverificat" inca o data, ci „al N-lea rand cu acelasi rezultat, deci
   * uita-te la sonda". Mesajul isi schimba intelesul odata cu situatia — altfel omul citeste
   * de o suta cincizeci de ori aceeasi propozitie si invata s-o sara.
   */
  assert.match(cron, /al \$\{laRand \+ 1\}-lea rand cu ACELASI rezultat/);
  assert.match(cron, /ce e de reparat e sonda sau randul din baza, nu domeniul/);
});

test("⚠ o citire picata a istoricului SCRIE, nu tace", () => {
  /*
   * Aceeasi asimetrie ca la emailuri, unde e scrisa cu aceleasi cuvinte: „la indoiala se
   * trimite". O citire picata n-are voie sa faca zgomotul sa para liniste — asta ar transforma
   * o pana de baza intr-o alarma stinsa.
   */
  const i = cron.indexOf("const { data: precedente, error: eIstoric }");
  const f = cron.slice(i, i + 700);
  assert.match(f, /let laRand = 0;/);
  assert.match(f, /if \(!eIstoric\) \{/, "streak-ul se numara DOAR daca citirea a mers");
  /* Cu `laRand` ramas 0 la eroare, `seScrie` iese adevarat: se scrie. */
});
