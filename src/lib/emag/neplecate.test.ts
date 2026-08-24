import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O SCHIMBARE CARE N-A LASAT NICIO URMA NICAIERI (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Modificarea produsului si punerea ei in coada sunt DOUA scrieri separate:

     UPDATE products   COMMIT
     ↓
     enqueue in coada   ← daca pica AICI, produsul e schimbat si coada e goala

   `after()` leaga lucrarea de ciclul cererii si scrie orice esec in jurnal — deci nu se
   mai pierde tacut, cum se pierdea cu `void enqueue(...)`. Dar fereastra ramane: procesul
   poate muri intre cele doua.

   ⚠ Pe PRET si pe STOC repara `masoaraDeriva`. Pe TITLU, DESCRIERE, IMAGINI si
   CARACTERISTICI nu repara nimeni: nu exista o a doua sursa de adevar care sa vada
   deosebirea.

   ⚠ Auditul extern cerea un OUTBOX TRANZACTIONAL — un rand scris in aceeasi tranzactie cu
   modificarea, printr-un declansator pe `products`. Ar inchide fereastra matematic, si e
   raspunsul corect pe termen lung. Dar `products` e masa cea mai fierbinte din platforma,
   atinsa de fiecare comanda, de fiecare import si de fiecare proiectie de catalog.

   Pasul asta raspunde in schimb la intrebarea din spatele cererii: „care produse s-au
   schimbat DUPA ultima trimitere si n-au nicio lucrare in coada?". Nu previne pierderea;
   o face trecatoare. Deosebirea e scrisa si in cod, ca sa nu para altceva decat e.

   ══════════════════════════════════════════════════════════════════════════
   CE E DOVEDIT IN POSTGRES
   ══════════════════════════════════════════════════════════════════════════

   Masurat pe productie, intr-o tranzactie intoarsa la loc (25.08.2026):

     inainte de a simula ceva            0 produse neplecate din 4677 de oferte
     cu `last_synced_at` mutat inaintea lui `updated_at`   → 1, si chiar produsul acela
     cu o lucrare pusa in coada pentru el                  → 0, corect exclus

   ⚠ Prima incercare a probei a dat 0 si arata ca functia nu merge. Nu era ea: pe
   `products` exista un declansator care rescrie `updated_at` la `now()`, deci „am
   modificat produsul acum o ora" nu se poate simula atingandu-l. A doua forma muta
   marcajul ofertei, si atunci s-a vazut.
*/

function migratia(): string {
  const f = readdirSync("migrations").filter((x) => x.includes("schimbari-neplecate"));
  assert.ok(f.length === 1, "n-am gasit migratia");
  return readFileSync(`migrations/${f[0]}`, "utf8");
}

function cronulFaraNote(): string {
  return readFileSync("src/app/api/cron/emag-sync/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

test("proba insasi vede migratia si cronul", () => {
  /* ⚠ O proba care nu gaseste nimic trece intotdeauna. */
  assert.match(migratia(), /produse_nesincronizate_emag/);
  assert.match(cronulFaraNote(), /produse_nesincronizate_emag/);
});

test("intrebarea e chiar cea care lipsea", () => {
  const m = migratia();
  assert.match(
    m, /p\.updated_at > coalesce\(o\.last_synced_at, 'epoch'::timestamptz\)/,
    "schimbat DUPA ultima trimitere",
  );
  assert.match(
    m, /not exists \([\s\S]*?emag_sync_queue q/,
    "si fara nicio lucrare in coada",
  );
});

test("⚠ o oferta netrimisa NICIODATA intra si ea", () => {
  /*
   * `coalesce(..., 'epoch')` nu e o formalitate: e cel mai limpede caz de „schimbare
   * neplecata" cu putinta. Sarita fiindca marcajul e gol, plasa ar fi ratat exact
   * produsele care n-au ajuns nicaieri.
   */
  assert.match(migratia(), /coalesce\(o\.last_synced_at, 'epoch'/);
});

test("un element ABANDONAT nu se reaprinde de aici", () => {
  /*
   * ⚠ Cea mai importanta dintre paze. Un element abandonat s-a incercat de cinci ori si a
   * esuat cu un motiv pe care il vede comerciantul in panou. Reaprins la fiecare zece
   * minute, ar intra intr-o bucla fara sfarsit — si i-ar ascunde motivul, fiindca
   * `attempts` s-ar reseta de fiecare data.
   *
   * Excluderea se face cerand pur si simplu sa NU existe niciun rand in coada, fara sa se
   * uite la `abandonat_la`: un rand abandonat e tot un rand.
   */
  const m = migratia();
  const i = m.indexOf("not exists");
  const conditie = m.slice(i, m.indexOf("order by", i));
  assert.ok(
    !/abandonat_la/.test(conditie),
    "conditia trebuie sa fie „niciun rand”, nu „niciun rand neabandonat”",
  );
});

test("ofertele PRELUATE nu se rescriu niciodata singure", () => {
  assert.match(migratia(), /o\.auto_sync = true/,
    "un rand cu `auto_sync = false` e al comerciantului, din contul lui");
});

test("rabdarea exista, ca sa nu se puna de doua ori acelasi lucru", () => {
  /*
   * ⚠ Fara ea, fiecare salvare de produs ar fi pus DOUA randuri in coada: unul de la
   * actiunea comerciantului si unul de aici — fiindca in clipa dintre ele lucrarea chiar
   * e in aer.
   */
  assert.match(migratia(), /p\.updated_at < now\(\) - p_rabdare/);
  assert.match(cronulFaraNote(), /RABDARE_NEPLECATE = "10 minutes"/);
});

test("usa functiei e inchisa", () => {
  /*
   * ⚠ E `security definer` si citeste produsele ORICUI dupa `business_id`. Lasata deschisa,
   * oricine ar fi putut afla ce produse are un magazin strain. Postgres da EXECUTE lui
   * PUBLIC din oficiu la orice functie noua.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(
    baseline,
    /revoke execute on function public\.produse_nesincronizate_emag\([^)]*\) from public;/,
  );
});

test("se repune prin coada obisnuita, nu se scrie de mana", () => {
  /*
   * ⚠ In `enqueueEmagSyncMany` stau toate regulile — magazin conectat, `auto_sync` pe
   * oferta, fragmentarea id-urilor pe bucati de 200. Scrise a doua oara aici, s-ar fi
   * departat de ele fara sa se vada, exact ca `retrage()` fata de `existaLaEmag`.
   */
  const cron = cronulFaraNote();
  const i = cron.indexOf("produse_nesincronizate_emag");
  const bloc = cron.slice(i, cron.indexOf("── 6)", i) > 0 ? cron.indexOf("── 6)", i) : i + 2500);
  assert.match(bloc, /enqueueEmagSyncMany\(businessId, ids\)/);
  assert.ok(
    !/from\("emag_sync_queue"\)\.upsert/.test(bloc),
    "n-are voie sa scrie direct in coada",
  );
});

test("numarul se raporteaza, si gasirea a ceva se scrie in jurnal", () => {
  /*
   * ⚠ Numarul asta trebuie sa fie ZERO. Masurat pe productie inainte de a fi pornit: 0 din
   * 4677 de oferte. Daca vreodata nu mai e zero, inseamna ca punerea in coada se pierde
   * undeva in amonte — iar aia e o constatare, nu o reparatie de rutina, si trebuie sa se
   * vada in centrul de necazuri, nu doar in raspunsul cronului.
   */
  const cron = cronulFaraNote();
  assert.match(cron, /neplecate,/, "numarul intra in raspunsul cronului");
  assert.match(cron, /produse schimbate fara nicio lucrare in coada/, "si se scrie in jurnal");
});

test("nu toarna un catalog intreg in coada dintr-odata", () => {
  /*
   * ⚠ Daca ceva s-a rupt in amonte si un catalog intreg iese „neplecat", plasa n-are voie
   * sa puna 20.000 de randuri deodata: ar ineca lucrarile adevarate, inclusiv mișcarile de
   * stoc de dupa vanzari, care sunt cele mai grabite dintre toate.
   */
  assert.match(cronulFaraNote(), /NEPLECATE_PE_MAGAZIN = 50;/);
  assert.match(migratia(), /least\(coalesce\(p_limita, 50\), 500\)/, "si baza are propriul plafon");
});

test("pasul spune singur ca NU e un outbox", () => {
  /*
   * ⚠ Nota asta e parte din reparatie, nu decor. Un cititor care gaseste peste un an pasul
   * asta trebuie sa afle ca fereastra tot exista si ca outbox-ul ramane de facut — altfel
   * ar bifa cererea auditului cu ceva ce raspunde la ea doar pe jumatate.
   */
  const cuNote = readFileSync("src/app/api/cron/emag-sync/route.ts", "utf8");
  assert.match(cuNote, /NU E UN OUTBOX/, "pasul trebuie sa-si spuna limita");
  assert.match(migratia(), /outbox/i, "si migratia, la fel");
});
