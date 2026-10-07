import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * E-PACKET ISI URMARESTE COLETUL                              (07.10.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cablarea cronului. Regulile (citirea, ce se spune, alarma) sunt probate pe purtare in
 * `src/lib/epacket/urmarire.test.ts`; aici se cere ca ruta chiar sa le cheme, pe drumurile si
 * in ordinea bune.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const CRON = "src/app/api/cron/epacket-tracking/route.ts";

test("⚠ cronul exista si e programat la doua ore, pe minutul lui", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
  const al = vercel.crons.filter((c) => c.path === "/api/cron/epacket-tracking");
  assert.equal(al.length, 1, "cronul nu e programat, sau e programat de doua ori");
  assert.equal(al[0].schedule, "37 */2 * * *");
  /* Pe minutul LUI: doua cronuri pe acelasi minut se bat pe aceeasi baza. */
  const peMinut = vercel.crons.filter((c) => c.schedule === "37 */2 * * *");
  assert.equal(peMinut.length, 1, "alt cron sta pe acelasi minut");
});

test("⚠⚠ poarta e un boolean, pusa INAINTEA clientului cu rol de serviciu", () => {
  const s = viu(CRON);
  const iPoarta = s.indexOf("if (!verificaCron(req)) return NextResponse.json({ error: \"Unauthorized\" }, { status: 401 });");
  const iBaza = s.indexOf("createClient<Database>(");
  assert.ok(iPoarta > 0 && iBaza > iPoarta, "poarta lipseste, e pe dos, sau vine dupa deschiderea bazei");
});

test("⚠ bugetul se scrie din `maxDuration` si din asteptarea REALA a clientului", () => {
  const s = viu(CRON);
  assert.match(s, /export const maxDuration = 60;/);
  assert.match(s, /const BUGET_MS = maxDuration \* 1000 - ASTEPTARE_MS - MARJA_MS;/);
  assert.match(s, /import \{[^}]*\bASTEPTARE_MS\b[^}]*\} from "@\/lib\/epacket\/client";/);
  assert.doesNotMatch(s, /const ASTEPTARE_MS\b/, "asteptarea s-a copiat local si se poate departa de a clientului");
  assert.match(s, /stareEpacket\(cfg, awb, ASTEPTARE_MS\)/);
});

test("⚠ plafonul lor (60 pe minut pe cheie): pauza intre cererile unui magazin", () => {
  const s = viu(CRON);
  const m = /const PAUZA_MS = ([\d_]+);/.exec(s);
  assert.ok(m, "pauza lipseste");
  assert.ok(Number(m[1].replace(/_/g, "")) >= 1000, "sub o secunda pe cerere se trece de 60 pe minut");
  assert.match(s, /if \(i > 0\) await pauza\(PAUZA_MS\);/);
});

test("⚠ fereastra se ancoreaza pe EMITERE, cu doi termeni simpli si perechea in memorie", () => {
  const s = viu(CRON);
  assert.match(s, /\.or\(`epacket_awb_at\.gte\.\$\{since\},epacket_awb_at\.is\.null`\)/);
  assert.match(s, /o\.epacket_awb_at !== null \|\| \(o\.created_at \?\? ""\) >= since/);
  assert.ok(!/\.or\([^)]*and\(/.test(s), "`and(...)` in `or(...)` a costat deja o data");
  assert.match(s, /\.order\("epacket_status_checked_at", \{ ascending: true, nullsFirst: true \}\)/);
  assert.match(s, /\.in\("status", \["pending", "confirmed", "processing", "shipped"\]\)/);
});

test("⚠ ancora se scrie la emitere si la legare, si se goleste la dezlegare", () => {
  const actiuni = viu("src/lib/actions/epacket.actions.ts");
  const scrise = [...actiuni.matchAll(/epacket_awb_at: ([^,\n]+),/g)].map((m) => m[1].trim());
  assert.ok(scrise.filter((v) => v === "acum").length >= 2, "emiterea si legarea scriu clipa");
  assert.ok(scrise.includes("null"), "dezlegarea nu goleste ancora");
  assert.match(actiuni, /const acum = new Date\(\)\.toISOString\(\);/);
});

test("⚠⚠ marcajul se scrie pe ORICE drum: fara config, la eroare, la AWB negasit", () => {
  const s = viu(CRON);
  const faraConfig = s.slice(s.indexOf("if (!cfg || !(cfg.api_key"), s.indexOf("for (let i = 0; i < lista.length"));
  assert.match(faraConfig, /await marcheaza\(lista\.map\(\(o\) => o\.id\)\);/);
  const laEroare = s.slice(s.indexOf("} catch (e) {", s.indexOf("stareEpacket(cfg")), s.indexOf("s.verificate++"));
  assert.match(laEroare, /await marcheaza\(\[o\.id\]\);/, "eroarea nu marcheaza: coletul ar sta vesnic in capul cozii");
  assert.ok(laEroare.indexOf("await marcheaza([o.id])") < laEroare.indexOf("eAwbNegasit(e)"), "marcajul vine dupa ramificare");
});

test("⚠ starea se scrie pe identitatea CITITA, iar semnalarea vine INAINTEA ei", () => {
  const s = viu(CRON);
  assert.match(s, /identitate: \{ coloana: "epacket_awb_number", valoare: o\.epacket_awb_number \}/);
  assert.match(s, /expediere: \{ coloana: "epacket_awb_number", valoare: o\.epacket_awb_number \}/);
  assert.ok(s.indexOf("semnaleazaExpedierea(") < s.indexOf("scrieUrmarirea("), "semnalarea trebuie sa vina inaintea starii");
  assert.match(s, /prelucrat = rez !== "reincearca";/);
});

test("⚠ factura automata se ASTEAPTA, nu se lanseaza in gol", () => {
  const s = viu(CRON);
  assert.match(s, /await maybeAutoInvoice\(businessId, o\.id, tinta,/);
});
