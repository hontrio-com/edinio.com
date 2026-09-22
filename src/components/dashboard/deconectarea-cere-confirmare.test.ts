import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * DECONECTAREA UNEI INTEGRARI CERE INTOTDEAUNA O CONFIRMARE    (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de el: „daca apesi pe Deconecteaza sa iti ceara o confirmare (valabil la
 * toate integrarile)".
 *
 * ⚠⚠ MASURAT INAINTE: din 35 de ecrane de integrare cu deconectare, DOUA intrebau
 * ceva (Trendyol si About You, prin `window.confirm`). Celelalte 33 rupeau legatura
 * din prima apasare, iar la jumatate dintre ele asta inseamna stergerea cheilor din
 * baza: ca sa te intorci, ceri din nou acreditarile de la furnizor. Butonul statea
 * in coltul din dreapta sus al cartonasului de cont, adica exact acolo unde se duce
 * mausul cand cauti „setari".
 *
 * ⚠ POPULATIA SE INTREABA DE LA COD, NU DUPA NUME. Un ecran intra in plasa daca
 * CHEAMA ceva care rupe legatura: fie o actiune de server `disconnect*` /
 * `deconecteaza*`, fie o adresa `/disconnect` (asa face Stripe, prin `fetch`).
 * O lista de fisiere ar fi uitat exact ecranul urmator.
 *
 * ⚠ DE CE NU SE PRIMESTE `window.confirm`. Blocheaza firul si arata ca o fereastra
 * de sistem, nu ca panoul: pe o hotarare care sterge acreditari, casuta cenusie a
 * browserului e taman semnul pe care mana il apasa din reflex. Si, scrisa de 33 de
 * ori, ar fi divergit de la un ecran la altul din prima saptamana.
 */

const PANOURI = "src/components/dashboard";
const BUTONUL = "ButonDeconectare";

/**
 * Golește comentariile, păstrând numerele de rând.
 *
 * ⚠⚠ DE CE EXISTA. Fara ea, plasa se prindea in propriile mele comentarii, de
 * doua ori in aceeasi zi: randul „⚠ Fara `window.confirm`: intrebarea o pune
 * `ButonDeconectare`" scria chiar sirul pe care proba il cauta, deci Posta,
 * SmartShip si Trendyol ieseau vinovate TOCMAI fiindca fusesera reparate. La
 * fel, `NoticeConfigClient` avea „After a WhatsApp connect/disconnect" intr-o
 * nota, si intra in multime desi nu deconecteaza nimic.
 *
 * Vezi memoria `comentariul-fals-e-o-invitatie`.
 *
 * ⚠ Randurile NU se sterg, se golesc: altfel numerele raportate ar arata spre
 * alt loc decat cel vinovat, si omul ar cauta unde nu e.
 */
function faraComentarii(sursa: string): string {
  return sursa
    .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, " "))
    .replace(/^([ \t]*)\/\/.*$/gm, (_r, spatiu) => spatiu);
}

function toateEcranele(dir: string): string[] {
  const iesire: string[] = [];
  for (const intrare of readdirSync(dir, { withFileTypes: true })) {
    const cale = join(dir, intrare.name);
    if (intrare.isDirectory()) iesire.push(...toateEcranele(cale));
    else if (intrare.name.endsWith(".tsx") && !intrare.name.endsWith(".test.tsx")) iesire.push(cale);
  }
  return iesire;
}

/**
 * Ecranele care chiar pot rupe legatura cu un furnizor.
 *
 * Doua feluri, amandoua intrebate din cod:
 *  - importa o actiune de server al carei nume incepe cu `disconnect` sau `deconecteaza`
 *  - cheama o adresa care contine `/disconnect` (Stripe, prin `fetch`)
 */
function ecraneCuDeconectare(): { cale: string; cum: string }[] {
  const iesire: { cale: string; cum: string }[] = [];
  for (const cale of toateEcranele(PANOURI)) {
    const sursa = faraComentarii(readFileSync(cale, "utf8"));

    const actiuni: string[] = [];
    /* ⚠ `[^}]` in loc de steagul `s`: tinta de compilare a casei e sub es2018,
       iar `/…/s` nu trece de `tsc`. Clasa neagata sare oricum peste randuri. */
    for (const m of sursa.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@\/lib\/actions\/[^"]+"/g)) {
      for (const brut of m[1].split(",")) {
        const nume = brut.trim().split(" as ")[0].trim();
        if (/^(disconnect|deconecteaza)/.test(nume)) actiuni.push(nume);
      }
    }
    if (actiuni.length) { iesire.push({ cale, cum: actiuni.join(", ") }); continue; }

    if (/["'`][^"'`]*\/disconnect[^"'`]*["'`]/.test(sursa)) {
      iesire.push({ cale, cum: "fetch /disconnect" });
    }
  }
  return iesire.sort((a, b) => a.cale.localeCompare(b.cale));
}

/* ══ 1. Componenta comuna chiar INTREABA ═══════════════════════════════════ */

test("⚠⚠ `ButonDeconectare` pune o fereastra cu doua iesiri, nu doar un buton", () => {
  const sursa = readFileSync(join(PANOURI, `${BUTONUL}.tsx`), "utf8");

  assert.match(sursa, /<Dialog\b/, "componenta nu mai deschide nicio fereastra");
  assert.match(sursa, /onConfirma\(\)/, "fereastra nu mai duce nicaieri: apasarea nu cheama nimic");
  assert.match(sursa, /Anulează/, "nu mai exista iesirea care NU face nimic");
  /*
    ⚠ `cePierzi` E OBLIGATORIU, si de-aia proba se uita ca n-a capatat `?` sau o
    valoare implicita. „Esti sigur?" nu e o intrebare, e o formalitate: omul trebuie
    sa afle daca pierde cheile, listarile, sau doar legatura.
  */
  assert.match(
    sursa,
    /\n\s*cePierzi:\s*string;/,
    "`cePierzi` a devenit optional; fereastra poate intreba fara sa spuna ce se pierde",
  );
  assert.ok(
    !/cePierzi\s*=\s*["'`]/.test(sursa),
    "`cePierzi` a capatat un text implicit, deci acelasi text pe toate integrarile",
  );
});

/* ══ 2. Fiecare ecran care poate deconecta trece pe acolo ══════════════════ */

test("⚠⚠ orice ecran care poate rupe legatura cu un furnizor cere confirmarea", () => {
  const ecrane = ecraneCuDeconectare();

  /* Fara asta, o redenumire a actiunilor ar goli multimea si proba ar trece pe vecie. */
  assert.ok(
    ecrane.length > 25,
    `am gasit doar ${ecrane.length} ecrane cu deconectare; s-au redenumit actiunile?`,
  );

  const vinovate: string[] = [];
  for (const { cale, cum } of ecrane) {
    const sursa = readFileSync(cale, "utf8");
    if (!sursa.includes(BUTONUL)) {
      vinovate.push(`${cale.split("\\").join("/")} (${cum})`);
    }
  }

  assert.deepEqual(
    vinovate,
    [],
    "Ecrane care rup legatura cu un furnizor fara sa intrebe nimic:\n  "
      + vinovate.join("\n  ")
      + `\nFoloseste <${BUTONUL} nume="…" cePierzi="…" onConfirma={…} />.`,
  );
});

/* ══ 3. Si nu se pune a doua intrebare peste prima ═════════════════════════ */

test("⚠ deconectarea nu mai trece si printr-o casuta `confirm()`", () => {
  /*
   * Doua intrebari una peste alta se invata sa fie apasate fara citire, iar a doua
   * o anuleaza pe prima. `confirm()` ramane bun pe ALTE hotarari (stergeri, porniri
   * in masa): proba se uita doar la randurile care vorbesc de deconectare.
   *
   * ⚠ SE CAUTA `confirm(`, NU „window.confirm". Doua ecrane (Innoship si Packeta)
   * il scriau fara prefix, si treceau nevazute. Gaura a fost semnalata de unul
   * dintre cei care au facut inlocuirea, nu de proba.
   */
  const vinovate: string[] = [];
  for (const { cale } of ecraneCuDeconectare()) {
    const sursa = faraComentarii(readFileSync(cale, "utf8").replace(/\r\n/g, "\n"));
    const linii = sursa.split("\n");
    for (let i = 0; i < linii.length; i++) {
      if (!/\bconfirm\(/.test(linii[i])) continue;
      /* Cele doua randuri de dupa poarta de obicei textul intrebarii. */
      const bucata = linii.slice(i, i + 3).join(" ");
      if (/[Dd]econect/.test(bucata)) {
        vinovate.push(`${cale.split("\\").join("/")}:${i + 1}`);
      }
    }
  }

  assert.deepEqual(
    vinovate,
    [],
    "A ramas o casuta `confirm()` pe deconectare, peste fereastra casei:\n  " + vinovate.join("\n  "),
  );
});
