import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CAMPURI_SECRETE } from "@/lib/integrari/secrete";

/*
 * ═══ NUMELE SECRETELOR, IDENTICE IN TREI LOCURI ═══
 *
 * `EasySalesConfig` (campurile marcate `// secret`), `CAMPURI_SECRETE.easysales_config` (mascarea
 * spre browser si pastrarea la salvare) si `privat.campuri_secrete` din migratia fundatiei
 * (criptarea in baza). Nimic nu le leaga la rulare: o nepotrivire taie tacut un strat (un secret
 * necriptat in baza, sau unul trimis browserului). Proba le compara.
 */

function dinTipuri(): string[] {
  const s = readFileSync("src/lib/easysales/tipuri.ts", "utf8");
  const corp = s.slice(s.indexOf("export interface EasySalesConfig"), s.indexOf("export interface PlicEasySales"));
  return [...corp.matchAll(/^\s*(\w+)\?:[^\n]*\/\/ secret\s*$/gm)].map((m) => m[1]).sort();
}

function dinMigratie(): string[] {
  const s = readFileSync("migrations/2026-10-13-easysales-fundatia.sql", "utf8");
  return [...s.matchAll(/\('easysales_config', '(\w+)'\)/g)].map((m) => m[1]).sort();
}

test("tipurile, harta secretelor si migratia numesc ACELEASI secrete", () => {
  const tipuri = dinTipuri();
  const harta = [...(CAMPURI_SECRETE.easysales_config ?? [])].sort();
  const migratie = dinMigratie();
  assert.ok(tipuri.length >= 6, `cititorul tipurilor n-a gasit secretele (${tipuri.join(", ")})`);
  assert.deepEqual(harta, tipuri, "CAMPURI_SECRETE.easysales_config difera de EasySalesConfig");
  assert.deepEqual(migratie, tipuri, "privat.campuri_secrete din migratie difera de EasySalesConfig");
});

test("⚠ fals-easysales.ts e NUMAI pentru probe: niciun fisier din aplicatie nu-l importa", () => {
  const vinovate: string[] = [];
  const umbla = (dir: string) => {
    for (const nume of readdirSync(dir)) {
      const cale = join(dir, nume);
      if (statSync(cale).isDirectory()) { umbla(cale); continue; }
      if (!/\.(ts|tsx)$/.test(nume) || /\.test\.tsx?$/.test(nume) || nume === "fals-easysales.ts") continue;
      if (/fals-easysales/.test(readFileSync(cale, "utf8"))) vinovate.push(cale);
    }
  };
  umbla("src");
  assert.deepEqual(vinovate, []);
});
