import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UN CRON CU BUGET ZERO RAPORTEAZA `ok: true` SI NU FACE NIMIC (13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ CAZUL. `ups-tracking` avea `BUGET_MS = maxDuration*1000 - ASTEPTARE_MS*2 - 15_000 -
 * MARJA_MS`, adica `60.000 − 40.000 − 15.000 − 5.000 = 0`. `termen = Date.now() + 0`, iar
 * verificarea din bucla sta inaintea primei comenzi, deci iesea din prima iteratie: fiecare
 * expediere eligibila intra in `sarite` si ruta raspundea `ok: true`. Nicio comanda UPS n-ar
 * fi avansat vreodata, si nicio alarma n-ar fi sunat.
 *
 * ⚠ DE CE REGULA, SI NU O PROBA DESPRE UPS. Cifra gresita e un simptom; boala e ca nimeni
 * nu socoteste rezultatul. Sunt paisprezece cronuri cu buget; oricare poate ajunge la zero
 * la urmatoarea rezerva adaugata „ca sa fim siguri". Proba asta socoteste CHIAR expresia din
 * cod si cere un rest de lucru.
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: se pune la loc termenul scos din UPS, sau se adauga o
 * rezerva noua oriunde altundeva. Proba trebuie sa cada.
 */

const DIR = "src/app/api/cron";
/** Sub atat, o rulare n-ar apuca nici macar o expediere: bugetul e decorativ. */
const MINIM_MS = 10_000;

function sursa(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
}

/**
 * Valorile constantelor numerice pe care le pot vedea cronurile.
 *
 * ⚠ Se citesc DE PE DISC, nu se scriu aici: o valoare copiata in proba s-ar departa de cea
 * adevarata exact cand conteaza, si proba ar socoti un buget pe care nu-l are nimeni.
 */
/** Expresia, cu simbolurile inlocuite. `null` daca a ramas ceva nerezolvat. */
function evalueaza(expr: string, constante: Map<string, number>): number | null {
  let e = expr;
  for (const [nume, val] of constante) e = e.replace(new RegExp(`\\b${nume}\\b`, "g"), String(val));
  e = e.replace(/_/g, "");

  /*
   * ⚠ SE EVALUEAZA DOAR DUPA CE SE DOVEDESTE CA N-A MAI RAMAS DECAT ARITMETICA.
   *
   * Orice simbol nerezolvat contine litere, deci cade aici si iese `null`, adica „n-am putut
   * socoti", niciodata un numar inventat. Fara garda, `Function` ar fi rulat text din sursa.
   */
  if (!/^[\d\s*+\-()]+$/.test(e)) return null;
  const v = Function(`"use strict"; return (${e});`)() as number;
  return Number.isFinite(v) ? v : null;
}

function tabelaDeConstante(propriu: string): Map<string, number> {
  /* Intai se strang definitiile BRUTE, ca text: unele sunt scrise din altele. */
  const brute = new Map<string, string>();
  const aduna = (text: string) => {
    for (const m of text.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*([^;\n]+);/g)) {
      if (!brute.has(m[1])) brute.set(m[1], m[2]);
    }
  };
  aduna(propriu);

  /*
   * ═══ ⚠ NUMAI DIN MODULELE PE CARE CRONUL CHIAR LE IMPORTA ═══
   *
   * Prima forma scana tot `src/lib` si lua PRIMA potrivire. Dar `ASTEPTARE_MS` e exportat de
   * mai multi clienti de curierat, cu valori care pot sa difere: proba ar fi socotit bugetul
   * UPS cu asteptarea altui curier si ar fi iesit verde pe un numar fals. O plasa care
   * masoara altceva decat crede e mai rea decat lipsa ei.
   *
   * ⚠ Un singur nivel de import, dinadins: ce nu se rezolva iese „nesocotit", iar proba
   * CADE pe el. Asa limita se vede, in loc sa fie acoperita cu o ghiceala.
   */
  for (const m of propriu.matchAll(/^import\s+[^;]*?from\s+"(@\/[^"]+)"/gm)) {
    const baza = `src/${m[1].slice(2)}`;
    for (const candidat of [`${baza}.ts`, `${baza}/index.ts`]) {
      try {
        aduna(readFileSync(candidat, "utf8"));
        break;
      } catch { /* nu exista fisierul asta, se incearca urmatorul */ }
    }
  }

  /*
   * ⚠ REZOLVARE IN PASE, fiindca o constanta poate fi scrisa din alta.
   *
   * `conversii` are `BUGET_MS = ARENDA_MS - MS_CERERE_FURNIZOR - MARJA_MARCAJ_MS`, iar
   * `ARENDA_MS` e la randul lui o inmultire. O singura trecere care accepta doar numere
   * scrise direct lasa tocmai cronurile cu aritmetica, adica exact pe cele unde se poate
   * ascunde un zero.
   */
  const t = new Map<string, number>();
  for (let pas = 0; pas < 8; pas++) {
    let progres = false;
    for (const [nume, rhs] of brute) {
      if (t.has(nume)) continue;
      const v = evalueaza(rhs, t);
      if (v !== null) { t.set(nume, v); progres = true; }
    }
    if (!progres) break;
  }
  return t;
}

function socoteste(expr: string, constante: Map<string, number>, maxDuration: number): number | null {
  return evalueaza(expr.replace(/\bmaxDuration\b/g, String(maxDuration)), constante);
}

test("⚠⚠ niciun cron nu porneste cu buget nepozitiv", () => {
  const rute: string[] = [];
  for (const intrare of readdirSync(DIR, { withFileTypes: true })) {
    if (!intrare.isDirectory()) continue;
    const cale = `${DIR}/${intrare.name}/route.ts`;
    try { readFileSync(cale); rute.push(cale); } catch { /* fara ruta, e in regula */ }
  }

  /*
   * ⚠ SE NUMARA. Fara pragul asta, o redenumire a folderelor ar face proba sa treaca peste
   * ZERO cronuri si sa iasa verde: exact „proba care nu poate cadea".
   */
  assert.ok(rute.length >= 20, `gasite doar ${rute.length} cronuri: plasa n-are pe cine cadea`);

  const rele: string[] = [];
  const nesocotite: string[] = [];
  let socotite = 0;

  for (const cale of rute) {
    const s = sursa(cale);
    const m = /const BUGET_MS\s*=\s*([^;]+);/.exec(s);
    if (!m) continue;

    const md = /export const maxDuration = (\d+);/.exec(s);
    if (!md) { nesocotite.push(`${cale}: are BUGET_MS dar nu declara maxDuration`); continue; }

    const valoare = socoteste(m[1], tabelaDeConstante(s), Number(md[1]));
    if (valoare === null) { nesocotite.push(`${cale}: ${m[1].trim()}`); continue; }

    socotite++;
    if (valoare < MINIM_MS) {
      rele.push(`${cale}: ${m[1].trim()} = ${valoare} ms (minim ${MINIM_MS})`);
    }
  }

  /*
   * ⚠ SI CE N-A PUTUT FI SOCOTIT E TOT O CADERE. O formula pe care proba n-o intelege e
   * chiar locul unde se poate ascunde urmatorul zero; trecuta cu vederea, plasa ar avea o
   * gaura exact pe forma defectului.
   */
  assert.deepEqual(nesocotite, [],
    `bugetele astea n-au putut fi socotite, deci nu sunt aparate de nimic:\n${nesocotite.join("\n")}`);

  assert.ok(socotite >= 8, `doar ${socotite} bugete socotite: plasa e prea mica`);

  assert.deepEqual(rele, [],
    "cronurile astea pornesc fara timp de lucru; vor raspunde `ok: true` fara sa verifice "
    + `nimic:\n${rele.join("\n")}`);
});
