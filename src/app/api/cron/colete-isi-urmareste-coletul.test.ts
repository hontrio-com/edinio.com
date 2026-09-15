import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * COLETE ONLINE ISI URMARESTE COLETUL                        (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const CRON = "src/app/api/cron/colete-tracking/route.ts";

test("⚠ cronul exista si e programat", () => {
  assert.match(readFileSync("vercel.json", "utf8"), /"\/api\/cron\/colete-tracking"/);
  assert.ok(viu(CRON).length > 1500, "felia nu poate fi goala");
});

test("⚠⚠ ritmul respecta plafonul LOR: o cerere pe ora per colet", () => {
  /*
   * Documentatia lor: „The requests to this endpoint are limited to once every hour for each
   * uniqueId/awb." Cronul la o ora ar fi lovit exact plafonul; la doua, nu-l atinge niciodata.
   */
  const vercel = readFileSync("vercel.json", "utf8");
  const m = vercel.match(/"\/api\/cron\/colete-tracking",\s*"schedule":\s*"([^"]+)"/);
  assert.ok(m, "programarea nu se mai gaseste");
  assert.match(m![1], /\*\/(\d+) \* \* \*$/, "ritmul trebuie sa fie pe ore");
  const oreIntre = Number(m![1].match(/\*\/(\d+)/)![1]);
  assert.ok(oreIntre >= 2, `la ${oreIntre} ore s-ar atinge plafonul lor de o cerere pe ora`);
});

test("⚠ jetonul se ia O SINGURA DATA pe magazin, nu pe comanda", () => {
  /* La saizeci de comenzi ale aceluiasi magazin ar fi saizeci de autentificari degeaba, si ele
     merg pe alt host (`auth.colete-online.ro`). */
  const s = viu(CRON);
  assert.match(s, /const jetoane = new Map<string, string \| null>\(\)/);
  assert.match(s, /if \(jetoane\.has\(businessId\)\) return jetoane\.get\(businessId\)!/);
});

test("⚠⚠ identitatea e `uniqueId`-ul lor, cu DOUA coloane in fata numarului de AWB", () => {
  /*
   * Documentatia lor: „If the order has no awb, only searching by the uniqueId will work."
   * Iar pana pe 15.09.2026 doar `colete_order_id` era scrisa, desi `colete_unique_id` are
   * numele potrivit: comenzile vechi o au goala.
   */
  const s = viu(CRON);
  assert.match(s, /o\.colete_unique_id \?\? ""/);
  assert.match(s, /o\.colete_order_id \?\? ""/);
  assert.match(s, /o\.colete_awb_number \?\? ""/);
});

test("⚠⚠ tranzitia se face DOAR dupa ce starea chiar s-a scris", () => {
  /*
   * `scrieUrmarirea` refuza scrierea cand intre citire si acum expedierea s-a schimbat. Mutata
   * oricum, comanda ar fi dusa de starea unui colet care nu mai e al ei.
   */
  const s = viu(CRON);
  const iScris = s.indexOf("const scris = await scrie(o, ultim, cod);");
  const iPaza = s.indexOf("if (!scris) continue;");
  const iTranzitie = s.indexOf("tranzitieComandaMarketplace(admin, {");
  assert.ok(iScris !== -1 && iPaza !== -1 && iTranzitie !== -1);
  assert.ok(iScris < iPaza && iPaza < iTranzitie, "paza trebuie sa fie INTRE scriere si tranzitie");
});

test("⚠ verdictul tranzitiei e un SIR, nu un obiect cu `.ok`", () => {
  /* Scris ca obiect, conditia ar fi fost mereu adevarata si am fi numarat drept mutate si
     comenzile pe care tranzactia le-a refuzat. */
  const s = viu(CRON);
  assert.match(s, /if \(r !== "ok"\) continue;/);
});

test("⚠ codurile necunoscute se strang pe nume, ca harta sa creasca din trafic", () => {
  const s = viu(CRON);
  assert.match(s, /if \(eCodNecunoscutColete\(cod\)\) coduriNoi\.add\(/);
  assert.match(s, /coduriNoi: \[\.\.\.coduriNoi\]/);
});

test("⚠ fereastra se ancoreaza pe EMITERE, si ancora chiar se scrie", () => {
  const s = viu(CRON);
  assert.match(s, /\.or\(`colete_awb_at\.gte\.\$\{since\},colete_awb_at\.is\.null`\)/);
  assert.match(s, /o\.colete_awb_at !== null \|\| \(o\.created_at \?\? ""\) >= since/);
  assert.ok(!/\.or\([^)]*and\(/.test(s), "`and(...)` in `or(...)` a costat deja o data");

  const actiuni = viu("src/lib/actions/colete.actions.ts");
  assert.match(actiuni, /colete_awb_at: new Date\(\)\.toISOString\(\)/, "ancora nu se scrie la emitere");
  assert.match(actiuni, /colete_awb_at: null/, "ancora nu se sterge la dezlegare");
});

test("⚠ o citire picata NU raporteaza „zero de verificat”", () => {
  const s = viu(CRON);
  assert.match(s, /severity: "critical"/);
  assert.match(s, /status: 503/);
});

test("⚠ marcajul se scrie NECONDITIONAT pe drumurile care nu afla nimic", () => {
  /* Altfel aceleasi comenzi ar sta vesnic in capul cozii si restul n-ar fi intrebat niciodata. */
  const s = viu(CRON);
  const start = s.indexOf("async function marcheaza(o: Comanda)");
  assert.notEqual(start, -1);
  const corp = s.slice(start, start + 320);
  assert.match(corp, /colete_status_checked_at: new Date\(\)\.toISOString\(\)/);
  assert.match(corp, /\.eq\("id", o\.id\)\.eq\("business_id", o\.business_id\)/,
    "cronul scrie cu rol de SERVICIU: filtrul de magazin e AUTORIZARE");
  assert.ok(!/if \(/.test(corp), "marcajul nu are voie sa intre sub conditie");
});

test("⚠ starea se scrie pe EXPEDIEREA CITITA, prin ajutorul comun", () => {
  const s = viu(CRON);
  assert.match(s, /identitate: \{ coloana: "colete_awb_number", valoare: o\.colete_awb_number \}/);
  assert.match(s, /scrieUrmarirea\(admin, \{/);
});

test("⚠ facturarea automata nu are voie sa opreasca urmarirea celorlalte colete", () => {
  const s = viu(CRON);
  const i = s.indexOf("maybeAutoInvoice(");
  assert.notEqual(i, -1);
  const fereastra = s.slice(Math.max(0, i - 200), i + 600);
  assert.match(fereastra, /try \{/, "chemarea trebuie prinsa");
  assert.match(fereastra, /severity: "warning"/, "si esecul strigat, nu inghitit");
});
