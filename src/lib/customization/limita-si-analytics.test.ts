import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MAX_CAMPURI, MAX_LUNGIME_TEXT, MAX_PERSONALIZARE_LINIE, normalizeazaDefinitia } from "./definitie";
import { greutateaMaximaAPersonalizarii, problemaPersonalizarii } from "./salvare";

/**
 * DOUA CONSTATARI MICI, DAR ADEVARATE, din a treia runda de audit.
 *
 * 1. Schema ingaduia o configuratie pe care COSUL o taia. Nimic nu scartaia: pagina de produs o
 *    accepta, „Adauga in cos" o accepta, `localStorage` o salva — si linia DISPAREA la prima
 *    reimprospatare.
 * 2. Analytics primea pretul de CATALOG pentru un produs personalizat, deci un fototapet de 910 lei
 *    intra in rapoarte ca 89.
 */

const sursa = (r: string) => readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

const campText = (i: number, lungime: number) => ({
  id: `t${i}`, type: "text", label: `Text ${i}`, required: false, max_length: lungime,
});

/* ═══════════════════════════════════════════════════════════════════════════
   LIMITA — una singura, si e cea a cosului
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ o configuratie mai grea decat o poate purta cosul se REFUZA la salvare", () => {
  /*
   * ⚠ CAZUL DIN AUDIT: 30 de campuri × 2.000 de caractere = 60.000, iar cosul taie la 20.000.
   * Comerciantul o salva, clientul o completa, si linia se evapora la refresh.
   *
   * Acum afla comerciantul, cand configureaza, cu un mesaj care spune ce sa taie.
   */
  const prea = {
    customization: {
      enabled: true,
      fields: Array.from({ length: MAX_CAMPURI }, (_, i) => campText(i, MAX_LUNGIME_TEXT)),
    },
  };
  const m = problemaPersonalizarii(prea);
  assert.ok(m, "configuratia care depaseste plafonul cosului a fost salvata");
  assert.match(String(m), /prea mult text/i);
  assert.match(String(m), /20\.000|20 000/, `mesajul nu spune care e limita: ${m}`);
});

test("⚠ o configuratie obisnuita trece in continuare", () => {
  /*
   * ⚠ PERECHEA CARE APARA CE EXISTA. Masurat in productie pe 07.09.2026: 71 de produse
   * personalizabile active, cu maximum 3 campuri, 500 de caractere si 5 fisiere. Un plafon care
   * ar refuza asta ar fi oprit vanzarea, nu ar fi aparat-o.
   */
  const obisnuit = {
    customization: {
      enabled: true,
      fields: [
        { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
          latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
        campText(1, 500),
        { id: "f", type: "fisier", label: "Macheta", required: false, max_files: 5 },
      ],
    },
  };
  assert.equal(problemaPersonalizarii(obisnuit), null, "o configuratie reala a fost refuzata");
});

test("⚠ greutatea se socoteste pe cazul CEL MAI GREU, nu pe cel obisnuit", () => {
  /*
   * Cosul taie cand payload-ul REAL depaseste plafonul, iar un client care completeaza tot la
   * maximum e un client obisnuit, nu un atacator. O socoteala „in medie" ar fi lasat sa treaca
   * exact configuratia care se evapora.
   */
  const d = normalizeazaDefinitia({ enabled: true, fields: [campText(1, 2000), campText(2, 2000)] })!;
  assert.ok(
    greutateaMaximaAPersonalizarii(d) >= 4000,
    "doua campuri de 2.000 de caractere se socotesc ca mai putin de 4.000",
  );
});

test("⚠ cosul si schema folosesc ACEEASI constanta, nu doua numere egale", () => {
  /*
   * ⚠ ASTA E TOT ROSTUL REPARATIEI. Doua numere care se intampla sa fie egale se despart la prima
   * schimbare, si atunci se intoarce exact contradictia: o configuratie salvabila care dispare din
   * cos. Se cere sa vina din acelasi loc.
   */
  const cos = sursa("src/lib/storefront/cart/normalize.ts");
  assert.match(cos, /MAX_PERSONALIZARE_LINIE/, "cosul si-a scris iar propriul numar");
  assert.match(cos, /from "@\/lib\/customization\/definitie"/, "cosul nu mai importa limita canonica");
  assert.equal(MAX_PERSONALIZARE_LINIE, 20_000);
});

/* ═══════════════════════════════════════════════════════════════════════════
   ANALYTICS — suma pe care o vede omul
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ „adaugat in cos” raporteaza pretul PERSONALIZAT, nu pe cel de catalog", () => {
  /*
   * ⚠ CE ERA: un fototapet de 910 lei intra in Meta, TikTok si GA4 ca 89. Comanda si serverul erau
   * corecte — paguba era in cifre, iar pe ele se socotesc pragurile de licitatie si randamentul
   * reclamelor.
   *
   * ⚠ SI DE CE NU `pretAfisat`: acela e un SIR formatat („de la 778,75 lei"). Numarul vine din
   * `pretPeBucata`, din acelasi loc — nu socotit a doua oara la apelant, unde s-ar fi departat de
   * ce vede omul pe ecran.
   */
  for (const f of [
    "src/components/storefront/sections/product/ProductPageClassic.tsx",
    "src/components/storefront/sections/product/ProductPageDetailed.tsx",
  ]) {
    const s = sursa(f);
    assert.ok(
      s.includes("price: pers.pretPeBucata(displayPrice)"),
      `${f} raporteaza inca pretul de catalog, nu pe cel personalizat`,
    );
    assert.ok(
      !s.includes("trackAddToCart({ productId: product.id, name: product.name, price: displayPrice"),
      `${f} inca trimite pretul de catalog la analytics`,
    );
  }
});

test("⚠ `pretPeBucata` si `pretDeAfisat` spun acelasi lucru", () => {
  /*
   * Unul e text, celalalt numar, dar amandoua trebuie sa cada pe PODEA cand pretul nu se poate sti
   * inca (laturi necompletate). Un zero trimis la Meta ar fi stricat chiar cifrele pe care se
   * socotesc licitatiile.
   */
  const h = sursa("src/components/storefront/sections/product/_shared/usePersonalizare.ts");
  const numeric = h.slice(h.indexOf("const pretPeBucata"), h.indexOf("const pretDeAfisat"));
  assert.match(numeric, /podeaPersonalizarii\(definitie, bazaPeBucata\)/, "numericul nu cade pe podea");
  assert.match(numeric, /ariaFacturata === undefined/, "numericul nu stie de suprafata necompletata");
});
