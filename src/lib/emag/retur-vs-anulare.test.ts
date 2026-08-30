import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { statusEdinio } from "./orders";

/* ══════════════════════════════════════════════════════════════════════════
   „RETURNAT" NU INSEAMNA „INAPOI PE RAFT" (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   `aplica_tranzitia_comenzii` trata `refunded` si `cancelled` la fel: amandoua intorc
   vanzarea, deci eliberau stocul intregii comenzi. Pentru o ANULARE e limpede corect —
   marfa n-a plecat nicaieri.

   Pentru un RETUR nu e. eMAG trimite statusul 5 „Returned", pe care il mapam la `refunded`
   — si asa trebuie, fiindca „returned" nu exista in `orders_status_check`, iar `refunded` e
   si intelesul potrivit pentru bani. Efectul asupra stocului insa nu era potrivit deloc.

   ═══ ⚠ SI ERA EXACT OPUSUL REGULII PE CARE O AVEAM DEJA SCRISA ═══

   `rma.ts`: „STOCUL NU SE PUNE INAPOI AUTOMAT. NICIODATA, DEOCAMDATA." Motivul e bun —
   marfa intoarsa vine desfacuta, zgariata, incompleta, ori pur si simplu alta decat cea
   trimisa. Un retur „Primit" inseamna ca a ajuns coletul, nu ca produsul e bun de vandut.

   Deci doua reguli se bateau cap in cap:

     RMA eMAG          -> nu repune stocul, omul verifica marfa si o adauga de mana
     status 5 Returned -> repunea stocul INTREGII comenzi, singur

   ⚠ CE COSTA, PE DOUA DRUMURI DEODATA:
     1. Comanda de trei produse din care clientul intoarce unul: se puneau inapoi TREI.
     2. Comerciantul verifica marfa si adauga de mana ce e bun — peste ce s-a pus automat.
        Se dubla. Si se vede abia la inventar, cand nu se mai stie de unde vine diferenta.

   ═══ MASURAT IN PRODUCTIE, IN TRANZACTII INTOARSE INAPOI ═══

   Produs cu stoc 8, exact scenariul cerut de audit:

     8 -> se vand 2 -> 6 -> eMAG „5 Returned" -> ramane 6   (verdict `lasat-consumat`)
     6 -> se vand 2 -> 4 -> eMAG „0 Cancelled" -> revine la 6

   Si martorii, ca reparatia sa nu treaca drept mai mult decat e:

     acelasi retur chemat cu `true`          -> 8   (purtarea de dinainte)
     acelasi retur chemat cu PATRU argumente -> 8   (ceilalti apelanti, neschimbati)
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ statusul ramane `refunded` — problema n-a fost starea, ci stocul", () => {
  /*
   * ⚠ Tentatia era sa se mute maparea, ca sa nu mai atinga ramura de „intoarcere". Dar
   * „returned" NU exista in `orders_status_check`, iar orice alta stare ar fi mintit despre
   * bani: la un retur ei chiar se intorc. Se schimba efectul, nu numele.
   */
  assert.equal(statusEdinio(5), "refunded");
  assert.equal(statusEdinio(0), "cancelled");
});

test("⚠ eMAG cere anume: returul NU elibereaza, anularea DA", () => {
  const o = viu("src/lib/emag/orders.ts");
  assert.match(o, /elibereazaStoc: status !== "refunded",/);
});

test("⚠ conducta poarta hotararea pana in SQL", () => {
  const t = viu("src/lib/orders/tranzitie-marketplace.ts");
  assert.match(t, /elibereazaStoc\?: boolean;/);
  /* ⚠ `null`, nu `false`, cand nu s-a cerut nimic: `false` ar fi oprit eliberarea la TOATE
     anularile din aplicatie — o reparatie care ar fi stricat mult mai mult decat repara. */
  assert.match(t, /p_elibereaza_stoc: p\.elibereazaStoc \?\? null,/);
});

test("⚠ implicitul din SQL ramane cel de azi", () => {
  /*
   * Cea mai importanta proba din fisier. Panoul, loturile, `editeaza_comanda_atomic` si
   * celelalte canale cheama cu patru argumente. Un implicit schimbat ar fi oprit eliberarea
   * stocului la fiecare anulare din aplicatie, tacut.
   */
  const mig = readFileSync("migrations/2026-10-25-returul-nu-repune-stocul.sql", "utf8");
  assert.match(mig, /p_elibereaza_stoc boolean default null/);
  assert.match(mig, /if coalesce\(p_elibereaza_stoc, true\) then/);
  assert.match(mig, /v_rez_stoc := 'lasat-consumat';/);
});

test("⚠ semnatura veche se sterge, si drepturile NU se largesc", () => {
  const mig = readFileSync("migrations/2026-10-25-returul-nu-repune-stocul.sql", "utf8");
  /* Lasata, ar fi ramas o a doua functie cu acelasi nume si patru argumente — chemabila, si
     fara paza noua. */
  assert.match(mig, /drop function if exists public\.aplica_tranzitia_comenzii\(uuid, text, text, uuid\);/);
  /*
   * ⚠ MASURAT INAINTE DE A SCRIE MIGRATIA: forma veche avea `{postgres=X, service_role=X}`.
   * Prima varianta a acestui fisier scria `grant ... to authenticated` din reflex — ceea ce
   * ar fi deschis un `security definer` peste comenzile ORICUI catre orice utilizator
   * conectat. O gaura mai mare decat defectul reparat.
   */
  assert.match(
    mig,
    /revoke execute on function public\.aplica_tranzitia_comenzii\(uuid, text, text, uuid, boolean\) from public, anon, authenticated;/,
  );
  assert.match(
    mig,
    /grant execute on function public\.aplica_tranzitia_comenzii\(uuid, text, text, uuid, boolean\) to service_role;/,
  );
  assert.doesNotMatch(mig, /to service_role, authenticated/);
});

test("⚠ si baza chiar are forma asta acum, nu doar fisierul", () => {
  /*
   * ⚠ O proba care citeste numai migratia citeste o INTENTIE. Baseline-ul e regenerat din
   * productie, deci el spune ce e chiar acolo — si asta e deosebirea dintre „am scris
   * reparatia" si „reparatia ruleaza".
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const i = baseline.indexOf("FUNCTION public.aplica_tranzitia_comenzii");
  assert.ok(i > 0, "functia se gaseste in baseline");
  const corp = baseline.slice(i, i + 4000);
  assert.match(corp, /p_elibereaza_stoc boolean DEFAULT NULL/);
  assert.match(corp, /coalesce\(p_elibereaza_stoc, true\)/);
});
