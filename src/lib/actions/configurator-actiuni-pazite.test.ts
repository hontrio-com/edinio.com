import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Fiecare actiune a configuratorului isi ia magazinul din SESIUNE?
 *
 * ═══ ⚠ DE CE E NEVOIE DE O PROBA PE SURSA ═══
 *
 * Orice export dintr-un modul „use server" primeste un identificator si poate fi chemat de
 * oricine, cu ce argumente vrea — manifestul e GLOBAL, deci nu conteaza de pe ce pagina.
 * O actiune care ar primi `businessId` ca argument si l-ar CREDE ar fi o usa intre magazine.
 *
 * Nimic nu paza asta azi: `tsc` nu vede diferenta intre un id venit din sesiune si unul venit
 * din browser, eslint nici atat, iar o proba de comportament ar avea nevoie de o baza si de doua
 * sesiuni. Singurul lucru care deosebeste cele doua stari, aici si acum, e CE SCRIE in sursa.
 *
 * Proiectul are deja doua lectii scrise despre exact asta: „use server expune FIECARE export" si
 * manifestul global de actiuni.
 *
 * ═══ CE PAZESTE, EXACT ═══
 *
 *   1. Fiecare actiune exportata cheama `magazinulMeu()`.
 *   2. Niciuna nu primeste `businessId` ca parametru.
 *   3. Nu se exporta niciun ajutor — doar actiuni si tipuri.
 *   4. Fiecare scriere e ingradita la magazin, prin `esteAlMagazinului` sau `business_id`.
 */

const FISIER = path.resolve(process.cwd(), "src/lib/actions/configurator.actions.ts");

/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
function sursa(): string {
  return readFileSync(FISIER, "utf8").replace(/\r\n/g, "\n");
}

interface Actiune {
  nume: string;
  /** Semnatura, pana la acolada care deschide corpul. */
  semnatura: string;
  corp: string;
}

/** Fiecare `export async function` din fisier, cu corpul lui. */
function actiunile(): Actiune[] {
  const s = sursa();
  const out: Actiune[] = [];
  for (const m of s.matchAll(/^export async function (\w+)\(/gm)) {
    const start = m.index ?? 0;
    const desc = s.indexOf("{", s.indexOf(")", start));
    assert.ok(desc > start, `nu am gasit corpul lui ${m[1]}`);
    // Pana la urmatorul export de nivel zero, sau pana la capat.
    const urmator = s.indexOf("\nexport ", desc);
    const stop = urmator > 0 ? urmator : s.length;
    out.push({ nume: m[1], semnatura: s.slice(start, desc), corp: s.slice(desc, stop) });
  }

  /*
   * ⚠ GARDA DE NUMARATOARE. Fara ea, o rescriere a fisierului ar face expresia sa nu mai
   * potriveasca nimic, iar proba ar trece pe gol peste zero actiuni. Exact modul de esec pe care
   * proiectul il are scris de trei ori.
   */
  assert.ok(out.length >= 10, `am citit doar ${out.length} actiuni — cititorul s-a rupt`);
  return out;
}

test("FIECARE actiune isi ia magazinul din sesiune", () => {
  for (const a of actiunile()) {
    assert.ok(
      a.corp.includes("await magazinulMeu("),
      `${a.nume} nu cheama magazinulMeu(): ar lucra fara sa stie al cui e magazinul`,
    );
  }
});

test("NICIO actiune nu primeste business_id ca argument", () => {
  /*
   * Un id venit de la client e o cerere, nu o dovada. Primit ca argument si folosit ca atare, ar
   * fi lasat pe oricine sa scrie in magazinul altuia — iar `business_id`-ul scris fiind al
   * atacatorului, randul ar fi trecut si de RLS.
   */
  for (const a of actiunile()) {
    assert.ok(
      !/business_?[Ii]d/.test(a.semnatura),
      `${a.nume} primeste un id de magazin ca argument: ${a.semnatura.split("\n")[0]}`,
    );
  }
});

test("nu se exporta niciun AJUTOR din fisierul de actiuni", () => {
  /*
   * Un `export function` „privat prin conventie" e tot un capat HTTP public. Se pot exporta doar
   * actiuni (`async function`) si tipuri, care oricum dispar la compilare.
   */
  const linii = sursa().split("\n").filter((l) => l.startsWith("export "));
  assert.ok(linii.length >= 10, `am citit doar ${linii.length} exporturi — cititorul s-a rupt`);
  for (const l of linii) {
    assert.ok(
      l.startsWith("export async function ")
      || l.startsWith("export interface ")
      || l.startsWith("export type "),
      `export nepermis din fisierul de actiuni: ${l.trim()}`,
    );
  }
});

test("FIECARE actiune care scrie e ingradita la magazin", () => {
  const SCRIERI = [".update(", ".delete(", ".insert(", ".upsert("];
  /*
   * Trei feluri de ingradire, toate adevarate:
   *   - `esteAlMagazinului` — randul s-a verificat inainte de scriere;
   *   - `.eq("business_id", …)` — scrierea insasi e filtrata;
   *   - `business_id: a.magazin.id` — la INSERT nu e ce filtra, dar magazinul se scrie din
   *     sesiune, nu din ce a trimis browserul.
   */
  const INGRADIRI = [
    "esteAlMagazinului(",
    '.eq("business_id", a.magazin.id)',
    "business_id: a.magazin.id",
  ];
  let cuScrieri = 0;
  for (const a of actiunile()) {
    if (!SCRIERI.some((w) => a.corp.includes(w))) continue;
    cuScrieri++;
    assert.ok(
      INGRADIRI.some((g) => a.corp.includes(g)),
      `${a.nume} scrie fara sa ingradeasca la magazin`,
    );
  }
  // ⚠ Aceeasi garda: daca nicio actiune n-ar mai parea sa scrie, proba ar fi trecut pe gol.
  assert.ok(cuScrieri >= 5, `am gasit doar ${cuScrieri} actiuni care scriu — cititorul s-a rupt`);
});
