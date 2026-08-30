import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   ORICE TABEL DIN `public` CU GRANTURI CATRE ANON TREBUIE SA AIBA RLS (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ DEFECTUL A FOST AL MEU, IN ACEEASI ZI, SI DE-AIA E SCRIS AICI.

   Am facut o copie de siguranta a preturilor VetDepo inainte sa le schimb, cu:

     create table public.zz_backup_preturi_vetdepo_20260825 as select ...

   Pare inofensiv. Nu e: `create table as select` NU porneste RLS, iar in Supabase tabelele
   noi din `public` mostenesc granturile implicite catre `anon` si `authenticated`. Verificat
   in productie, amandoua copiile aveau:

     SELECT, INSERT, UPDATE, DELETE, TRUNCATE — pentru anon si authenticated
     relrowsecurity = false

   Adica oricine cu cheia publica putea citi, modifica sau STERGE snapshoturile de pret prin
   Data API. N-au stoc si n-au date personale, deci n-a fost P0 — dar a fost o usa deschisa
   de mine, tacut, printr-o comanda care arata ca o simpla copiere.

   ⚠ SI DE-AIA PROBA E GENERALA, nu pe numele acelor doua tabele. Un test scris pe VetDepo
   ar fi trecut vesel la urmatoarea copie facuta in graba. Regula e: din `public`, cu granturi
   catre client, fara RLS — nu se poate, decat daca cineva scrie ANUME de ce.
*/

const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");

/**
 * Tabelele care au voie sa fie citite fara RLS, si MOTIVUL.
 *
 * ⚠ Gol dinadins. Cine adauga unul trebuie sa raspunda intai la „de ce poate oricine sa
 * citeasca asta?" — daca raspunsul e „e doar o copie de lucru", atunci NU are ce cauta in
 * `public` cu granturi de client.
 */
const FARA_RLS_DINADINS: Record<string, string> = {
  store_settings:
    "E o VEDERE, nu un tabel, iar vederile nu pot purta RLS. Se creeaza cu "
    + "`security_invoker = true`, deci ruleaza sub drepturile celui care o cheama, iar RLS-ul "
    + "de pe `privat.store_settings` de dedesubt chiar se aplica. "
    + "⚠ Baseline-ul scrie `grant ... on table public.store_settings` si pentru vederi, "
    + "iar vederea se creeaza dinamic dintr-o functie — deci nu se poate deosebi din text.",
};

/** Tabelele din `public` care primesc drepturi de la `anon` sau `authenticated`. */
function tabeleCuGranturiDeClient(): Set<string> {
  const gasite = new Set<string>();
  const re = /^grant\s+\w+\s+on\s+table\s+public\.([a-z0-9_]+)\s+to\s+(anon|authenticated);/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(baseline)) !== null) gasite.add(m[1]);
  return gasite;
}

/** Tabelele din `public` pe care baseline-ul chiar porneste RLS. */
function tabeleCuRls(): Set<string> {
  const gasite = new Set<string>();
  const re = /^alter\s+table\s+public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security;/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(baseline)) !== null) gasite.add(m[1]);
  return gasite;
}

test("⚠ probele stiu sa citeasca baseline-ul", () => {
  /*
   * ⚠ Perechea obligatorie a oricarei probe care numara: daca regexurile n-ar potrivi nimic,
   * verificarea de mai jos ar trece cu multimi goale si ar raporta „totul e in regula" despre
   * o schema pe care n-a citit-o. Un zero fals arata exact ca un zero adevarat.
   */
  assert.ok(tabeleCuGranturiDeClient().size > 20, "granturile se citesc");
  assert.ok(tabeleCuRls().size > 20, "si RLS-ul");
});

test("⚠ niciun tabel din `public` deschis catre client fara RLS", () => {
  const cuGranturi = tabeleCuGranturiDeClient();
  const cuRls = tabeleCuRls();

  const descoperite = [...cuGranturi]
    .filter((t) => !cuRls.has(t))
    .filter((t) => !(t in FARA_RLS_DINADINS))
    .sort();

  assert.deepEqual(
    descoperite, [],
    "Tabele din `public` cu granturi catre anon/authenticated si FARA row level security.\n"
    + "Oricine cu cheia publica le poate citi si scrie prin Data API.\n"
    + "Repara cu:\n"
    + "  revoke all on table public.<tabel> from anon, authenticated;\n"
    + "  alter table public.<tabel> enable row level security;\n"
    + "Sau, daca chiar trebuie sa fie deschis, treci-l in `FARA_RLS_DINADINS` cu motivul.",
  );
});

test("⚠ fiecare copie de siguranta are RLS", () => {
  /*
   * Proba de mai sus le prinde pe toate. Asta o dubleaza anume pentru `zz_backup_*`, fiindca
   * ele se nasc dintr-un `create table as select` scris in graba, inaintea unei schimbari
   * mari — exact clipa in care nimeni nu se gandeste la granturi.
   *
   * ⚠ SE CERE RLS, nu „zero granturi": masurat, sase copii mai vechi au granturi de client
   * DAR au si RLS pornit, deci sunt inchise — cu RLS si fara nicio politica, `anon` nu vede
   * nimic. O proba care ar fi cerut zero granturi ar fi cerut o schimbare inutila la sase
   * tabele deja sigure, si ar fi fost mai aspra decat adevarul.
   */
  const cuRls = tabeleCuRls();
  const toateCopiile = [...new Set(
    [...baseline.matchAll(/^create table if not exists public\.(zz_backup[a-z0-9_]+)/gim)]
      .map((m) => m[1]),
  )];
  assert.ok(toateCopiile.length > 0, "copiile chiar se gasesc in baseline");

  const fara = toateCopiile.filter((t) => !cuRls.has(t)).sort();
  assert.deepEqual(fara, [], "copii de siguranta fara row level security");
});
