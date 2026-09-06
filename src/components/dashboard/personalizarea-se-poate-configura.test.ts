import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeazaDefinitia } from "@/lib/customization/definitie";
import { pretulPersonalizarii, pretUnitar } from "@/lib/customization/pret";
import { normalizeazaValorile } from "@/lib/customization/valori";

/**
 * Comerciantul poate CHIAR sa configureze un fototapet?
 *
 * ═══ ⚠ DE CE E NEVOIE DE PROBA ASTA ═══
 *
 * Fiindca motorul poate fi perfect si comerciantul sa n-aiba de unde sa-l porneasca. Lantul are
 * patru verigi — meniul de tipuri, reglajele fiecarui tip, scrierea in `page_sections`, si
 * contractul de server — iar fiecare merge si fara celelalte. Proiectul are exemplul scris: o
 * familie intreaga de tabele a trait luni de zile cu motorul complet si fara nicio interfata.
 *
 * ⚠ Probele pe SURSA sunt aici singura cale: proiectul n-are jsdom, n-are React Testing Library si
 * n-are Playwright, deci nicio componenta nu se randeaza intr-o proba.
 */

const RAD = process.cwd();

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8").replace(/\r\n/g, "\n");
}

const EDITOR = "src/components/dashboard/PersonalizareCampuri.tsx";
const FORMULAR = "src/components/dashboard/ProductForm.tsx";
const ACTIUNE = "src/lib/actions/product.actions.ts";

test("⚠ probele stiu sa citeasca fisierele", () => {
  assert.ok(sursa(EDITOR).length > 5_000);
  assert.ok(sursa(FORMULAR).length > 20_000);
});

test("⚠ TOATE cele noua tipuri se pot alege din meniu", () => {
  /*
   * ⚠ Meniul se construieste din `TIPURI`, lista din modulul pur — nu dintr-o insiruire scrisa de
   * mana. Scris de mana, un tip nou adaugat in motor ar fi ramas invizibil in panou, si nimeni
   * n-ar fi aflat: motorul l-ar fi stiut, comerciantul nu l-ar fi gasit.
   */
  const s = sursa(EDITOR);
  assert.match(s, /\{TIPURI\.map\(\(t\) => <option key=\{t\} value=\{t\}>\{NUME_TIP\[t\]\}<\/option>\)\}/);
  /* Si ca fiecare tip are un nume omenesc, nu identificatorul din cod. */
  for (const t of ["text", "textarea", "image", "select", "color", "numar", "dimensiuni", "butoane", "comutator"]) {
    assert.match(s, new RegExp(`^\\s*${t}: "`, "m"), `tipul \`${t}\` n-are nume in meniu`);
  }
});

test("⚠ tipurile noi au reglajele lor, si numai ele", () => {
  const s = sursa(EDITOR);
  /* dimensiuni: margini pe fiecare latura + unitate */
  assert.match(s, /case "dimensiuni":/);
  assert.match(s, /\(\["latime", "inaltime"\] as const\)\.map/);
  assert.match(s, /UNITATI\.map/);
  /* numar: min/max/pas/implicit */
  assert.match(s, /\(\[\["min", "Minim"\], \["max", "Maxim"\], \["pas", "Pas"\], \["implicit", "Implicit"\]\] as const\)/);
  /* butoane: optiuni cu id stabil */
  assert.match(s, /id: crypto\.randomUUID\(\), eticheta: "", impact: \{ fel: "fara" \}/);
});

test("⚠ pretul se poate pune, si numai in cele trei feluri", () => {
  /*
   * Fara procente, fara inmultiri, fara formule. Un al patrulea fel adaugat aici ar fi inceput
   * drumul catre un motor de expresii — adica exact configuratorul care nu se cere.
   */
  const s = sursa(EDITOR);
  assert.match(s, /<option value="fara">Fara pret<\/option>/);
  assert.match(s, /<option value="fix">Suma fixa \(lei\)<\/option>/);
  assert.match(s, /<option value="pe_m2">Pe metru patrat \(lei\/m²\)<\/option>/);

  /*
   * ⚠ PRIMA FORMA A GARZII ASTEIA A DAT UN FALS POZITIV, si merita scris de ce.
   *
   * Era `/procent|formula|expresie/i.test(s)` — o cautare de cuvinte peste TOT fisierul. A picat
   * pe randul „Editorul campurilor de personalizare, din formularul de produs": cuvantul
   * romanesc „form-u-l-a-rul" contine „formula". Adica proba raporta un al patrulea fel de pret pe
   * un fisier corect, si m-ar fi trimis sa caut ceva ce nu exista.
   *
   * Acum se numara CHIAR optiunile meniului de pret, nu cuvinte din text.
   */
  const de = s.indexOf("function ImpactEditor");
  assert.ok(de > 0, "n-am gasit editorul de pret");
  /*
   * ⚠ Se margineste la CHIAR functia. Feliat pana la finalul fisierului, blocul prindea si
   * meniurile lui `Optiuni` si `ModPret` — deci proba raporta sapte feluri de pret pe un editor
   * care are trei. A doua oara acelasi tipar: o proba care citeste mai mult decat trebuie sa vada.
   */
  const pana = s.indexOf("\nfunction ", de + 1);
  const bloc = s.slice(de, pana > 0 ? pana : undefined);
  const feluri = [...bloc.matchAll(/<option value="([a-z_0-9]+)">/g)].map((m) => m[1]);
  assert.deepEqual(
    feluri, ["fara", "fix", "pe_m2"],
    `meniul de pret are felurile ${JSON.stringify(feluri)} — un al patrulea inseamna drumul catre un motor de expresii`,
  );

  /* ⚠ Sumele nu pot fi negative nici din ecran, nu doar la citire. */
  assert.match(s, /Math\.max\(0, Number\(e\.target\.value\) \|\| 0\)/);
});

test("⚠ modul de pretuire pe SUPRAFATA se poate configura intreg", () => {
  const s = sursa(EDITOR);
  assert.match(s, /<option value="suprafata">Calculat din suprafata \(lei\/m²\)<\/option>/);
  assert.match(s, /Campul de dimensiuni/);
  assert.match(s, /Tarif lei\/m²/);
  assert.match(s, /Tariful vine din \(optional\)/);
  assert.match(s, /Suprafata minima facturata/);
  assert.match(s, /Rotunjeste suprafata in sus la/);
  assert.match(s, /includePretulProdusului/);
});

test("⚠ modul de pret AJUNGE in baza, nu doar in ecran", () => {
  /*
   * ⚠ CEA MAI SCUMPA DIN FISIER. Formularul copia `customization` camp cu camp — `enabled` si
   * `fields` — deci `pret` se pierdea la FIECARE salvare: comerciantul configura fototapetul la 89
   * lei/m², salva, si produsul se intorcea la pretul de catalog. Fara nicio eroare, si fara ca
   * ecranul sa arate ca s-a pierdut ceva.
   */
  const s = sursa(FORMULAR);
  assert.match(s, /\.\.\.\(form\.customization\.pret \? \{ pret: form\.customization\.pret \} : \{\}\)/);
  /* Si ca actiunea de server chiar accepta forma intreaga. */
  assert.match(sursa(ACTIUNE), /customization\?: DefinitiePersonalizare;/);
});

test("⚠ tipul nu mai e scris a patra oara", () => {
  /*
   * Era declarat identic in patru locuri, iar in cel care scrie in baza `type` era doar `string`.
   * Un tip nou trebuia adaugat de patru ori, si prima uitare nu era semnalata de tsc.
   */
  assert.match(sursa(FORMULAR), /export type CustomizationField = CampPersonalizare;/);
  assert.equal(
    /type: "text" \| "textarea" \| "image" \| "select" \| "color";/.test(sursa(FORMULAR)),
    false,
    "formularul isi declara iar propria uniune de tipuri",
  );
});

test("⚠ stergerea campului de dimensiuni nu lasa pretul agatat de nimic", () => {
  /*
   * Lasat asa, produsul s-ar fi pretuit dupa un camp care nu mai exista. Cititorul l-ar fi tratat
   * oricum ca „adaugat", deci ecranul ar fi aratat un mod de pretuire si s-ar fi incasat altul.
   */
  const s = sursa(EDITOR);
  assert.match(s, /p\?\.fel === "suprafata" && !fields\.some\(\(c\) => c\.id === p\.campDimensiuni\)/);
  assert.match(s, /\? \{ fel: "adaugat" as const \}/);
});

/* ══════════════════════════════════════════════════════════════════════════
   Drumul intreg: ce configureaza comerciantul se si incaseaza
   ══════════════════════════════════════════════════════════════════════════ */

test("ACCEPTANTA: fototapetul configurat din panou da 910 lei la comanda", () => {
  /*
   * ⚠ Se porneste de la forma pe care o SCRIE formularul in `page_sections`, nu de la una scrisa
   * de mana pentru proba. Asa, o schimbare in editor care ar strica forma se vede aici.
   */
  const scrisDePanou = {
    enabled: true,
    fields: [
      {
        id: "a1", type: "dimensiuni", label: "Dimensiunile peretelui", placeholder: "", required: true,
        unitate: "cm",
        latime: { min: 100, max: 500, implicit: 100 },
        inaltime: { min: 70, max: 350, implicit: 70 },
      },
      {
        id: "a2", type: "butoane", label: "Material", placeholder: "", required: true,
        optiuni: [
          { id: "o1", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "o2", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
        ],
      },
      {
        id: "a3", type: "comutator", label: "Protectie impermeabila", placeholder: "", required: false,
        impact: { fel: "pe_m2", suma: 15 },
      },
    ],
    pret: {
      fel: "suprafata", campDimensiuni: "a1", tarif: 69, campTarif: "a2",
      includePretulProdusului: false,
    },
  };

  const d = normalizeazaDefinitia(scrisDePanou);
  assert.ok(d, "forma scrisa de panou nu se mai citeste");
  assert.equal(d.pret?.fel, "suprafata");

  const v = normalizeazaValorile(d, { a1: { latime: 350, inaltime: 250 }, a2: "o2", a3: true });
  assert.equal(v.ok, true, `constatari: ${JSON.stringify(v.constatari)}`);

  const p = pretulPersonalizarii(d, v.valori);
  assert.equal(p.supliment, 910);
  assert.equal(pretUnitar(p, 89), 910, "pretul de catalog s-a incasat pe langa suprafata");
});
