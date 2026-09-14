import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mesajBlocat, type CerereOperatie } from "./registru";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UN SINGUR AWB VIU PE COMANDA, INDIFERENT DE CURIER            (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Poarta de AWB citeste toate cele saptesprezece coloane, dar e un SELECT fara tranzactie si fara
 * lacat, urmat de un apel extern de cateva secunde. Registrul E atomic, insa cheia lui e
 * `${fel}:${furnizor}:${discriminant}`, deci Cargus si DPD produc siruri DIFERITE si treceau
 * amandoi. Nimic nu era unic pe comanda intre furnizori: doua AWB-uri reale, platite amandoua.
 *
 * ⚠ PROBA ARE TREI JUMATATI, SI FIECARE APARA ALTCEVA:
 *
 *   1. REGULA, pura: ce i se spune omului cand alt curier tine comanda;
 *   2. SCHEMA, citita din baseline (dumpul regenerat al PRODUCTIEI): indexul exista, sare peste
 *      retur, si cuprinde exact cele trei stari blocante;
 *   3. APELANTUL: codul chiar duce furnizorul blocant pana la mesaj.
 *
 * Fara a treia, baza ar raspunde `alt_curier` iar codul ar cadea pe ramura `default`, adica pe
 * „Operatia nu a putut fi pornita (alt_curier)". Fara a doua, codul ar fi gata iar baza n-ar opri
 * nimic.
 */

const CERERE: CerereOperatie = {
  businessId: "b7a9c3d1-0000-4000-8000-000000000001",
  orderId: "0f0f0f0f-0000-4000-8000-000000000001",
  fel: "awb",
  furnizor: "dpd",
  cheie: "awb:dpd:0f0f0f0f-0000-4000-8000-000000000001",
};

const altCurier = (furnizor?: string, awb?: string | null) =>
  mesajBlocat("alt_curier", CERERE, undefined, undefined, "reusit", furnizor, awb ?? null);

/* ── 1. Regula: ce i se spune omului ──────────────────────────────────────── */

test("⚠⚠ mesajul spune CINE tine comanda, si cu ce AWB", () => {
  /*
   * Fara numele celuilalt curier, comerciantul nu are de unde sti pe unde sa caute: comanda pare
   * curata in panou, fiindca randul blocant sta in registru, nu pe ea.
   */
  const m = altCurier("cargus", "1234567");
  assert.match(m, /Cargus/, "mesajul nu spune care curier tine comanda");
  assert.match(m, /AWB 1234567/, "mesajul nu da numarul, deci omul trebuie sa-l vaneze prin panou");
  assert.match(m, /DPD/, "mesajul nu spune nici prin cine incerca sa trimita");
});

test("⚠⚠ si spune CUM se elibereaza, nu «reincarca pagina»", () => {
  /*
   * ⚠ ASTA E AFIRMATIA CARE DEOSEBESTE REPARATIA DE DECOR.
   *
   * Fara cazul `alt_curier`, motivul cadea pe ramura `cursa`: „Operatia tocmai s-a incheiat pe alt
   * drum. Reincarca pagina." Neadevarat, si fara nicio miscare de facut, fiindca reincarcarea nu
   * clinteste randul blocant.
   *
   * ⚠ Si indrumarea numeste AMANDOUA iesirile: la doisprezece curieri din saptesprezece anularea
   * cade pe un colet deja preluat, iar atunci detasarea e singura cale.
   */
  const m = altCurier("cargus", "1234567");
  assert.match(m, /detaseaza/i, "mesajul nu arata supapa care chiar exista la toti curierii");
  assert.match(m, /anuleaza/i, "mesajul nu pomeneste anularea, calea normala");
  assert.doesNotMatch(m, /[Rr]eincarca pagina/, "mesajul a cazut inapoi pe textul de «cursa»");
});

test("⚠ si NU e textul generic de motiv necunoscut", () => {
  /*
   * Ramura `default` a lui `mesajBlocat` scrie „Operatia nu a putut fi pornita (alt_curier)".
   * Sterge cazul, si exact asta ar ajunge la comerciant: adevarat tehnic, nefolositor.
   */
  const m = altCurier("cargus", "1234567");
  assert.doesNotMatch(m, /nu a putut fi pornita/, "cazul a disparut, mesajul vine din `default`");
  assert.notEqual(m, mesajBlocat("cursa", CERERE, undefined), "mesajul e acelasi cu cel de «cursa»");
});

test("un furnizor pe care nu-l stim se arata cu codul lui, nu ca «undefined»", () => {
  assert.match(altCurier("curier-nou", "9"), /curier-nou/, "un cod necunoscut dispare din mesaj");
  assert.doesNotMatch(altCurier("curier-nou", "9"), /undefined/, "mesajul arata `undefined` omului");
  assert.doesNotMatch(altCurier(undefined, null), /undefined/, "fara furnizor, mesajul se strica");
});

test("⚠ fara AWB mesajul nu inventeaza unul", () => {
  /*
   * Randul blocant poate fi `in_curs`, adica inca fara referinta. Un „AWB null" ar fi mai rau
   * decat nimic.
   *
   * ⚠ SE CERE LIPSA PARANTEZEI, NU LIPSA CUVANTULUI. Prima forma a afirmatiei cerea ca mesajul sa
   * nu contina deloc „AWB" si ar fi cazut pe cod BUN: indrumarea spune mereu „detaseaza intai
   * AWB-ul de la Cargus". O proba care cade pe cod bun se slabeste la prima rulare, si atunci nu
   * mai apara nimic.
   */
  const m = altCurier("cargus", null);
  assert.doesNotMatch(m, /\(AWB/, "mesajul pomeneste un numar de AWB care nu exista");
  assert.match(m, /Cargus/, "si a pierdut si numele curierului");
  assert.match(m, /detaseaza/i, "si a pierdut si indrumarea");
});

/* ── 2. Schema: ce e CHIAR in productie ───────────────────────────────────── */

/*
 * ⚠ SE CITESTE BASELINE-UL, SI ASTA E DINADINS. El nu e o schita scrisa de mana, ci dumpul
 * REGENERAT al productiei (`scripts/schema-baseline.sh`), iar CI-ul pica daca difera de baza. Deci
 * o afirmatie asupra lui e o afirmatie asupra productiei.
 *
 * ⚠ SI ANCORA E TEXTUL REDAT DE POSTGRES, nu cel scris de mine in migratie: acolo am scris
 * `not like 'retur:%'`, iar `pg_get_indexdef` il reda `cheie !~~ 'retur:%'::text`. O proba scrisa
 * din memorie ar fi cazut pe cod bun.
 */
const BASELINE = "migrations/000-schema-baseline.sql";

function randulIndexului(): string {
  const s = readFileSync(BASELINE, "utf8").replace(/\r\n/g, "\n");
  const rand = s.split("\n").find((l) => l.includes("operatii_externe_awb_viu_pe_comanda_idx") && l.startsWith("CREATE"));
  assert.ok(rand, "indexul unic pe comanda nu mai exista in schema productiei");
  return rand;
}

test("⚠⚠ exista un index UNIC pe comanda pentru operatiile de AWB", () => {
  const r = randulIndexului();
  assert.match(r, /CREATE UNIQUE INDEX/, "indexul nu mai e unic, deci nu mai arbitreaza nimic");
  assert.match(r, /USING btree \(order_id\)/, "indexul nu mai e pe comanda");
  assert.match(r, /\(fel = 'awb'::text\)/, "indexul s-a intins peste alte feluri de operatii");
});

test("⚠⚠ RETURUL E EXCLUS, altfel niciun AWB de retur nu s-ar mai putea emite", () => {
  /*
   * AWB-ul de retur Sameday se inregistreaza tot cu `fel: 'awb'`, deosebit doar prin prefixul
   * `retur:` din cheie. Randul AWB-ului de tur ramane `reusit` cat traieste comanda, deci un index
   * care n-ar sari peste `retur:%` ar refuza FIECARE retur. Zero retururi in baza azi, deci
   * afirmatia asta apara viitorul, nu date existente.
   */
  assert.match(randulIndexului(), /cheie !~~ 'retur:%'::text/,
    "excluderea returului a disparut din index: emiterea AWB-ului de retur devine imposibila");
});

test("⚠⚠ blocheaza EXACT cele trei stari, si `esuat` ramane in afara", () => {
  /*
   * Un curier care a refuzat coletul la validare lasa randul `esuat`. Adaugat in predicat, o
   * singura respingere ar inchide comanda la toti cei saptesprezece curieri, pentru totdeauna.
   * Aceleasi trei stari ca in `operatii_externe_cheie_activa_idx`.
   */
  const r = randulIndexului();
  assert.match(r, /ARRAY\['in_curs'::text, 'reusit'::text, 'necunoscut'::text\]/,
    "starile blocante nu mai sunt cele trei");
  assert.doesNotMatch(r, /'esuat'/,
    "`esuat` a intrat in predicat: un refuz de validare inchide comanda la toti curierii");
});

test("⚠ si functia de rezervare stie sa spuna `alt_curier`", () => {
  /*
   * Fara ramura din functie, insertul respins de index ar cadea pana la `motiv: 'cursa'`. Indexul
   * ar opri duplicatul, dar omul ar citi un mesaj neadevarat si n-ar sti ce sa faca.
   */
  const s = readFileSync(BASELINE, "utf8");
  assert.match(s, /'motiv',\s*'alt_curier'/,
    "functia din productie nu mai intoarce `alt_curier`, deci mesajul cade pe «cursa»");
});

/* ── 3. Apelantul: motivul chiar ajunge la mesaj ──────────────────────────── */

const faraComentarii = (cale: string) =>
  readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠⚠ apelantul duce furnizorul blocant si AWB-ul pana la mesaj", () => {
  /*
   * Regula pura de mai sus trece verde si daca `incearca` nu trimite niciodata furnizorul: ea isi
   * construieste singura argumentele. Aici se cere CABLAREA.
   */
  const s = faraComentarii("src/lib/operatii/registru.ts");
  assert.match(s, /mesajBlocat\(r\.motiv, cerere, r\.incercari, r\.creat_la, r\.stare, r\.furnizor, r\.referinta_externa\)/,
    "furnizorul blocant nu mai ajunge la mesaj, deci omul nu afla cine tine comanda");
  assert.match(s, /case "alt_curier":/, "cazul a disparut din `mesajBlocat`");
});
