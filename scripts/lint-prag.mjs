#!/usr/bin/env node
/**
 * ESLint ca poarta CU PRAG: nu cere zero, cere sa nu CREASCA.
 *
 *     node scripts/lint-prag.mjs           # raporteaza si rescrie pragul
 *     node scripts/lint-prag.mjs --check   # iese 1 daca numarul de erori a crescut
 *
 * ═══ DE CE EXISTA, SI DE CE NU CERE ZERO ═══
 *
 * Un audit extern a cerut ca CI-ul sa ruleze si `lint`, pe langa tipuri, probe si build. Cererea e
 * intemeiata: `npm run lint` nu rula nicaieri in CI, deci nimic nu oprea o eroare noua.
 *
 * ⚠ DAR REPO-UL AVEA 90 DE ERORI CAND S-A PUS POARTA (08.09.2026), pe 39 de fisiere, si niciuna
 * dintre ele nu tinea de lucrarea la care se lucra:
 *
 *     38  react-hooks/set-state-in-effect
 *     16  react/no-unescaped-entities
 *     15  react-hooks/static-components
 *      6  react-hooks/purity
 *      6  @next/next/no-html-link-for-pages
 *      3  react-hooks/immutability
 *      2  react-hooks/refs
 *      2  prefer-const
 *      2  @typescript-eslint/no-explicit-any
 *
 * O poarta stricta ar fi facut CI-ul rosu pentru totdeauna din prima zi, iar un CI rosu permanent
 * nu mai e o poarta: e zgomot pe care toata lumea invata sa-l sara. Si atunci si esecurile
 * ADEVARATE trec neobservate — exact ce s-a intamplat aici cu jobul de restaurare a schemei, rosu
 * saptamani intregi fara ca cineva sa se uite la el.
 *
 * ⚠ ACELASI TIPAR CA LA `verifica-tipuri-db.mjs`: „driftul nu se repara o data, se face vizibil".
 * Pragul se poate cobori oricand, si cine repara zece erori il coboara cu zece. Ce nu se poate e
 * sa adaugi una noua fara sa se vada.
 *
 * ⚠ SE NUMARA DOAR ERORILE, nu si avertismentele. Avertismentele (134 la punerea portii, mai ales
 * `no-img-element`) sunt hotarari luate, nu scapari; numarate, ar fi facut pragul sa se miste la
 * fiecare poza adaugata si l-ar fi transformat intr-un numar pe care nimeni nu-l mai citeste.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RADACINA = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PRAG = path.join(RADACINA, "scripts", "lint-prag.json");
const doarVerifica = process.argv.includes("--check");

/*
 * ⚠ IESIREA LUI ESLINT E 1 CAND GASESTE ERORI, si asta NU e o cadere a uneltei.
 * `execFileSync` arunca atunci, iar raportul JSON sta in `e.stdout`. Fara ramura de `catch`,
 * scriptul ar fi cazut exact in cazul pentru care exista.
 */
function raport() {
  /*
   * ⚠ SE CHEAMA BINARUL DIRECT, NU PRIN `npx ... shell: true`. Prima varianta primea de la Node
   * `DEP0190`: cu `shell: true`, argumentele nu se escapeaza, se lipesc — iar o cale cu spatiu
   * („C:\Users\...\Desktop\...") e chiar felul in care asta se transforma din avertisment in
   * comanda alta decat cea scrisa. Aici n-avem nevoie de shell deloc.
   */
  const binar = path.join(RADACINA, "node_modules", "eslint", "bin", "eslint.js");
  try {
    return execFileSync(process.execPath, [binar, "-f", "json"], {
      cwd: RADACINA, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    /* ⚠ Iesirea 1 inseamna „am gasit erori", nu „unealta a cazut": raportul sta in `stdout`. */
    if (typeof e.stdout === "string" && e.stdout.trim().startsWith("[")) return e.stdout;
    throw e;
  }
}

const fisiere = JSON.parse(raport());
const erori = fisiere.reduce((n, f) => n + f.errorCount, 0);
const avertismente = fisiere.reduce((n, f) => n + f.warningCount, 0);

/*
 * ⚠ GARDA. Un `eslint` care nu citeste niciun fisier (configurare mutata, cale gresita) intoarce
 * o lista goala si zero erori — adica „totul e in regula", cel mai prost fel de a picta verde.
 * Numarul de fisiere scanate nu are cum sa scada sub cateva sute in repo-ul asta.
 */
if (fisiere.length < 200) {
  console.error(`PICAT: eslint a citit doar ${fisiere.length} fisiere. Configurarea nu mai prinde nimic.`);
  process.exit(2);
}

const pePunct = new Map();
for (const f of fisiere) {
  for (const m of f.messages) {
    if (m.severity !== 2) continue;
    const regula = m.ruleId ?? "(fara regula)";
    pePunct.set(regula, (pePunct.get(regula) ?? 0) + 1);
  }
}

console.log(`Fisiere scanate: ${fisiere.length}`);
console.log(`Erori: ${erori} · avertismente: ${avertismente}`);
for (const [regula, n] of [...pePunct].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)} ${regula}`);
}

const vechi = existsSync(PRAG) ? JSON.parse(readFileSync(PRAG, "utf8")) : { erori: Number.POSITIVE_INFINITY };

if (!doarVerifica) {
  writeFileSync(PRAG, `${JSON.stringify({ erori }, null, 2)}\n`, "utf8");
  console.log(`\nPrag scris: ${erori} erori.`);
  process.exit(0);
}

if (erori > vechi.erori) {
  console.error(`\nPICAT: erorile de lint au crescut de la ${vechi.erori} la ${erori}.`);
  console.error("Repara-le, sau — daca sunt dinadins — coboara pragul cu o explicatie in commit.");
  process.exit(1);
}

if (erori < vechi.erori) {
  console.log(`\n⚠ Erorile au SCAZUT de la ${vechi.erori} la ${erori}. Ruleaza fara --check si comite pragul nou,`);
  console.log("altfel castigul se pierde: pragul vechi lasa loc erorilor sa se intoarca.");
}

console.log("\nLintul nu a crescut.");
