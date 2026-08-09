#!/usr/bin/env node
/**
 * Deriva dintre `src/types/database.types.ts` si schema din Git.
 *
 *     node scripts/verifica-tipuri-db.mjs           # raporteaza si rescrie pragul
 *     node scripts/verifica-tipuri-db.mjs --check   # iese 1 daca deriva a CRESCUT
 *
 * ═══ DE CE EXISTA ═══
 *
 * Tipurile generate ramasesera in urma schemei, iar codul a compensat cu
 * `as never`: locuri in care TypeScript nu mai verifica nici numele tabelei, nici
 * al coloanei, nici argumentele unui RPC. Probat o data, deliberat: cu clientul
 * netipat, un nume de functie inexistent, un parametru scris gresit si un tip
 * gresit de argument au trecut TOATE TREI nevazute.
 *
 * Auditul extern cerea „regenereaza tipurile din productie". Ar fi gresit de doua
 * ori: `public.store_settings` e o VEDERE, iar generatorul nu poate deduce NOT NULL
 * pe coloanele unei vederi — toate ar deveni nullable, in sute de folosiri; si
 * productia e sursa gresita, fiindca baseline-ul din Git exista tocmai ca sa nu mai
 * luam de bun ce s-a nimerit sa fie in baza.
 *
 * Raspunsul e altul: **driftul nu se repara o data, se face vizibil.** `--check` nu
 * cere zero, cere doar sa nu creasca — asa poarta se poate trece, deci nu se ignora.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RADACINA = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASELINE = path.join(RADACINA, "migrations", "000-schema-baseline.sql");
const TIPURI = path.join(RADACINA, "src", "types", "database.types.ts");
const PRAG = path.join(RADACINA, "scripts", "tipuri-db-prag.json");

/*
 * Terminatiile de linie se normalizeaza, la AMBELE fisiere.
 *
 * Pe Windows git le converteste la checkout, iar potrivirile pe linie intreaga
 * pica tacut din cauza caracterului de retur ramas la capat. S-a si intamplat:
 * dupa un `git stash`, verificatorul a citit ZERO tabele din tipuri. Nu a raportat
 * insa „zero deriva" — a PICAT, fiindca are garda pe numarul citit. O proba care
 * nu poate esua nu apara nimic.
 */
const CR = String.fromCharCode(13);
const normalizeaza = (t) => t.split(CR).join("");

// Tabelele de lucru si copiile de siguranta nu au ce cauta in tipuri.
const IGNORATE = /^(zz_|_)/;

/** Tabelele din `public`, cu coloanele lor, citite din baseline. */
function dinBaseline() {
  const sql = normalizeaza(readFileSync(BASELINE, "utf8"));
  const tabele = new Map();
  /*
   * ⚠ Ultima coloana se termina cu `);` pe ACEEASI linie, nu pe una separata.
   * Prima forma cerea paranteza pe linie proprie si nu potrivea NIMIC — proba
   * raporta „zero deriva" fiindca nu citise nimic. De aia exista garda de mai jos.
   */
  const re = /^create table if not exists public\.([a-z0-9_]+) \(([\s\S]*?)\);$/gm;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const nume = m[1];
    if (IGNORATE.test(nume)) continue;
    const coloane = new Set();
    for (const linie of m[2].split("\n")) {
      const l = linie.trim();
      if (!l || l.startsWith("--")) continue;
      // Constrangerile la nivel de tabel nu sunt coloane.
      if (/^(primary key|unique|foreign key|constraint|check|exclude)\b/i.test(l)) continue;
      const c = l.match(/^([a-z0-9_]+)\s/);
      if (c) coloane.add(c[1]);
    }
    tabele.set(nume, coloane);
  }
  return tabele;
}

/** Numele tabelelor din tipuri, in ORDINEA in care apar in fisier. */
const ordineaDinTipuri = [];

/** Tabelele declarate in `database.types.ts`, cu coloanele din blocul `Row`. */
function dinTipuri() {
  const linii = normalizeaza(readFileSync(TIPURI, "utf8")).split("\n");
  const tabele = new Map();
  let i = 0;
  while (i < linii.length && !/^ {4}Tables: \{$/.test(linii[i])) i++;
  for (; i < linii.length; i++) {
    if (/^ {4}\}$/.test(linii[i])) break; // gata sectiunea Tables
    const m = linii[i].match(/^ {6}([a-z0-9_]+): \{$/);
    if (!m) continue;
    const coloane = new Set();
    let j = i + 1;
    while (j < linii.length && !/^ {8}Row: \{$/.test(linii[j])) {
      if (/^ {6}[a-z0-9_]+: \{$/.test(linii[j])) break;
      j++;
    }
    for (j = j + 1; j < linii.length; j++) {
      if (/^ {8}\}$/.test(linii[j])) break;
      const c = linii[j].match(/^ {10}([a-z0-9_]+)\??:/);
      if (c) coloane.add(c[1]);
    }
    ordineaDinTipuri.push(m[1]);
    tabele.set(m[1], coloane);
  }
  return tabele;
}

const baza = dinBaseline();
const tip = dinTipuri();

if (baza.size === 0 || tip.size === 0) {
  console.error(`Nu am putut citi schema (baseline: ${baza.size} tabele, tipuri: ${tip.size}).`);
  console.error("Formatul unuia dintre fisiere s-a schimbat. NU inseamna zero deriva.");
  process.exit(2);
}

const tabeleLipsa = [...baza.keys()].filter((t) => !tip.has(t)).sort();
const coloaneLipsa = [];
for (const [nume, coloane] of baza) {
  const inTip = tip.get(nume);
  if (!inTip) continue;
  for (const c of coloane) if (!inTip.has(c)) coloaneLipsa.push(`${nume}.${c}`);
}
const fantome = [];
for (const [nume, coloane] of tip) {
  const inBaza = baza.get(nume);
  if (!inBaza) continue;
  for (const c of coloane) if (!inBaza.has(c)) fantome.push(`${nume}.${c}`);
}
coloaneLipsa.sort();
fantome.sort();

console.log(`Tabele in schema: ${baza.size} · in tipuri: ${tip.size}`);
console.log(`Tabele LIPSA din tipuri: ${tabeleLipsa.length}`);
for (const t of tabeleLipsa) console.log(`  - ${t}`);
console.log(`Coloane LIPSA din tipuri: ${coloaneLipsa.length}`);
for (const c of coloaneLipsa) console.log(`  - ${c}`);
console.log(`Coloane FANTOMA (in tipuri, nu in schema): ${fantome.length}`);
for (const c of fantome) console.log(`  - ${c}`);

/*
 * Ordinea alfabetica nu e cosmetica: fisierul se intretine DE MANA, aditiv, iar
 * ordinea e singurul lucru care face o intrare adaugata de doua ori vizibila cu
 * ochiul liber. O tabela pusa in alta parte a si scapat o data.
 */
const dezordonate = [];
for (let i = 1; i < ordineaDinTipuri.length; i++) {
  if (ordineaDinTipuri[i] < ordineaDinTipuri[i - 1]) {
    dezordonate.push(`${ordineaDinTipuri[i - 1]} -> ${ordineaDinTipuri[i]}`);
  }
}
console.log(`Perechi in afara ordinii alfabetice: ${dezordonate.length}`);
for (const d of dezordonate) console.log(`  - ${d}`);

const acum = {
  tabele: tabeleLipsa.length,
  coloane: coloaneLipsa.length,
  fantome: fantome.length,
  dezordonate: dezordonate.length,
};

if (!process.argv.includes("--check")) {
  writeFileSync(PRAG, JSON.stringify(acum, null, 2) + "\n");
  console.log(`\nPrag scris in ${path.relative(RADACINA, PRAG)}.`);
  process.exit(0);
}

if (!existsSync(PRAG)) {
  console.error("Lipseste pragul. Ruleaza scriptul fara --check o data si comite fisierul.");
  process.exit(2);
}
const prag = JSON.parse(readFileSync(PRAG, "utf8"));
let rau = false;
for (const cheie of ["tabele", "coloane", "fantome", "dezordonate"]) {
  if (acum[cheie] > (prag[cheie] ?? 0)) {
    console.error(`PICAT: ${cheie} a crescut de la ${prag[cheie] ?? 0} la ${acum[cheie]}.`);
    rau = true;
  }
}
if (rau) {
  console.error("\nAdauga intrarile in src/types/database.types.ts, ADITIV, in stilul existent.");
  console.error("Regenerarea completa din productie NU e raspunsul — vezi antetul acestui script.");
  process.exit(1);
}
if (["tabele", "coloane", "fantome", "dezordonate"].some((k) => acum[k] < (prag[k] ?? 0))) {
  console.log("\nDeriva a SCAZUT. Ruleaza scriptul fara --check si comite pragul nou.");
}
console.log("\nDeriva nu a crescut.");
