import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   IMBINAREA CONFIGURARII, PE RANDUL DE BAZA, INCUIAT (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ `jsonb_merge_config` facea deja imbinarea intr-o singura instructiune — mult mai bine
   decat citire-imbinare-scriere in Node — dar scria pe `public.store_settings`, care e o
   VEDERE cu declansator `INSTEAD OF UPDATE`. Postgres nu incuie randul de baza cand
   scaneaza o vedere, deci doua apeluri simultane se puteau inca pierde unul pe altul.

     cronul de comenzi  citeste {cursor: 10}  →  scrie {cursor: 11}
     webhook-ul         citeste {cursor: 10}  →           scrie {ultima_notificare: …}
                                                            ↑ cursorul 11 dispare

   Un cursor intors inapoi se repara singur: dedublarea prinde comenzile recitite.
   `needs_reconnect` pierdut NU se repara la fel de curat — magazinul ramane marcat sanatos
   cu acreditari moarte pana cand cronul mai loveste un 401.

   ══════════════════════════════════════════════════════════════════════════
   CE E DOVEDIT, SI CUM
   ══════════════════════════════════════════════════════════════════════════

   Purtarea a fost masurata pe PRODUCTIE, pe un magazin real cu eMAG conectat, intr-o
   tranzactie intoarsa la loc cu o exceptie (25.08.2026):

     petic obisnuit          → parola ramane `enc.v1.…`, username si restul neatinse
     vederea, dupa aceea     → decripteaza parola inapoi (19 semne)
     parola trimisa GOALA    → parola veche PASTRATA
     parola noua, in clar    → criptata la scriere, si decriptata inapoi corect

   ⚠ Serializarea insasi vine din `select … for update` in READ COMMITTED: al doilea apel
   asteapta la usa, apoi RECITESTE randul asa cum l-a lasat primul. Proba de mai jos nu
   poate deschide doua conexiuni, deci nu o masoara — pazeste in schimb ca cele patru
   lucruri de care atarna sa nu dispara din functie fara ca cineva sa observe.
*/

const NL = String.fromCharCode(10);

/** Corpul functiei, din baseline — care e un dump al PRODUCTIEI, nu o migratie. */
function corpulFunctiei(): string {
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const i = baseline.indexOf("CREATE OR REPLACE FUNCTION public.jsonb_merge_config");
  assert.ok(i > 0, "n-am gasit `jsonb_merge_config` in baseline");
  const j = baseline.indexOf("$function$" + NL + ";", i);
  assert.ok(j > i, "n-am gasit sfarsitul functiei");
  return baseline.slice(i, j);
}

test("proba insasi vede functia", () => {
  /* ⚠ O proba care nu gaseste nimic trece intotdeauna. */
  const corp = corpulFunctiei();
  assert.ok(corp.length > 500, `functia pare goala (${corp.length} semne)`);
});

test("scrie pe tabela de baza, nu pe vedere", () => {
  /*
   * ⚠ Deosebirea nu e cosmetica: pe vedere, `for update` n-ar incuia randul care conteaza,
   * fiindca declansatorul `INSTEAD OF` scrie in alta parte decat s-a scanat.
   */
  const corp = corpulFunctiei();
  assert.match(corp, /update privat\.store_settings set/, "scrierea trebuie sa mearga la tabela de baza");
  assert.ok(
    !/update public\.store_settings set/.test(corp),
    "scrisa prin vedere, imbinarea redevine o cursa",
  );
});

test("randul se incuie inainte de imbinare", () => {
  const corp = corpulFunctiei();
  assert.match(
    corp, /from privat\.store_settings where business_id = \$1 for update/,
    "`for update` e chiar ce serializeaza cei patru scriitori",
  );
});

test("secretele raman criptate, si un secret gol nu le sterge", () => {
  /*
   * ⚠ Ocolind vederea, se ocoleste si declansatorul ei — iar el facea DOUA lucruri de care
   * atarna parola fiecarei integrari:
   *
   *   `cripteaza_rand`     cripteaza campurile din `privat.campuri_secrete`
   *   `pazeste_secretele`  un secret trimis GOL nu sterge secretul care exista
   *
   * Fara primul, prima salvare de setari ar fi scris parola eMAG IN CLAR in baza. Fara al
   * doilea, fiecare salvare din ecran ar fi deconectat integrarea, fiindca ecranele trimit
   * parola goala cand omul n-a atins-o.
   */
  const corp = corpulFunctiei();
  assert.match(corp, /privat\.campuri_secrete where coloana = p_column/, "caile secrete se citesc");
  assert.match(corp, /privat\.cripteaza_config\(v_nou, v_cai\)/, "si valorile se cripteaza");
  assert.match(
    corp, /coalesce\(v_nou_val, ''\) = '' and coalesce\(v_vechi, ''\) <> ''/,
    "un secret trimis gol trebuie sa pastreze secretul vechi",
  );
});

test("usa ramane inchisa dupa `create or replace`", () => {
  /*
   * ⚠ `create or replace` REFACE granturile implicite, iar Postgres da EXECUTE lui PUBLIC
   * din oficiu la orice functie. Deci revocarea trebuie sa vina DUPA fiecare definitie —
   * altfel functia asta, care e `security definer` si scrie in `privat`, ar fi chemabila
   * de oricine prin PostgREST.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(
    baseline,
    /revoke execute on function public\.jsonb_merge_config\(p_business_id uuid, p_column text, p_patch jsonb\) from public;/,
    "`jsonb_merge_config` trebuie sa aiba EXECUTE revocat de la PUBLIC in baseline",
  );
});

/* ── Si partea din cod ───────────────────────────────────────────────────── */

test("panoul trimite PETIC, nu configurarea intreaga", () => {
  /*
   * ⚠ O imbinare atomica nu ajuta daca apelantul trimite tot obiectul citit cu 50 de
   * milisecunde inainte: atunci fiecare cheie din el se scrie inapoi cu valoarea VECHE.
   * `...veche` era exact asta.
   */
  const actiuni = readFileSync("src/lib/actions/emag.actions.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  const peticuri = [...actiuni.matchAll(/const petic: Partial<EmagConfig> = \{/g)];
  assert.ok(peticuri.length >= 2, `prea putine peticuri (${peticuri.length}): setari si mapari`);

  for (const p of peticuri) {
    const bloc = actiuni.slice(p.index ?? 0, (p.index ?? 0) + 2000);
    assert.ok(
      !/^\s*\.\.\.veche,\s*$/m.test(bloc.split("};")[0]),
      "peticul nu are voie sa poarte cu el toata configurarea citita mai devreme",
    );
  }
});

test("campul golit pleaca `null`, nu lipsa", () => {
  /*
   * ⚠ Intr-o imbinare, cheia absenta inseamna „las-o cum e”. Deci taxa verde stearsa de
   * comerciant ar fi ramas pe loc, iar ecranul i-ar fi spus ca s-a salvat.
   *
   * Cu obiectul intreg, `undefined` mergea: se pierdea la serializare si cheia disparea
   * din obiectul scris. Cu petic, nu mai merge — si e tocmai felul de amanunt care se
   * pierde la o trecere de la scriere intreaga la imbinare.
   */
  const actiuni = readFileSync("src/lib/actions/emag.actions.ts", "utf8");
  for (const camp of ["green_tax", "stoc_rezervat"]) {
    assert.match(
      actiuni, new RegExp(`${camp}: setari\\.${camp} \\?\\? null`),
      `${camp} golit trebuie sa plece ca \`null\`, altfel nu se poate sterge niciodata`,
    );
  }
  assert.match(
    actiuni, /alegeSupplyLeadTime\(setari\.supply_lead_time\) \?\? null/,
    "si timpul de reaprovizionare",
  );
});
