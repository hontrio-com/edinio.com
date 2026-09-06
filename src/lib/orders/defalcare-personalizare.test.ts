import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { verificaPersonalizarea } from "@/lib/customization/comanda";
import { citesteDefalcarea, suprafataDeAratat, caM2 } from "./defalcare-personalizare";

/**
 * Panoul de comenzi arata DIN CE se compune pretul, si arata chiar ce a incasat serverul.
 *
 * ═══ ⚠ CE REPARA ═══
 *
 * Serverul scria pe linie doua chei — `customization` (ce a ales clientul) si `personalizare` (din
 * ce se compune pretul) — iar panoul o citea doar pe prima. Linia scria 910,00 lei pe un produs al
 * carui catalog zice 89, si nimic de pe ecran nu spunea de unde vin, desi platforma salvase chiar
 * explicatia: „8,75 m² x 89 lei/m² = 778,75" plus „Protectie impermeabila 131,25".
 *
 * Comerciantul nu putea raspunde clientului care intreaba de ce plateste atat, si nu putea verifica
 * singur ca s-a incasat corect.
 *
 * ═══ ⚠ DE CE PROBA ARE DOUA JUMATATI ═══
 *
 * 1. CITITORUL se probeaza pe date REALE: defalcarea nu se scrie de mana in proba, ci se scoate din
 *    `verificaPersonalizarea` — chiar functia care scrie cheia in `orders.items`. Asa, o
 *    redenumire in motor (`eticheta` -> `label`) pica AICI, nu pe ecranul comerciantului. Scrisa de
 *    mana, proba ar fi ramas verde exact cand panoul se golea.
 *
 * 2. RANDAREA se probeaza pe SURSA. Proiectul n-are jsdom, n-are React Testing Library si n-are
 *    Playwright, deci nicio componenta nu se randeaza intr-o proba; garantia se apara citind
 *    fisierul, ca in `customization/niciun-drum-nu-ocoleste.test.ts`.
 */

const RAD = process.cwd();

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8").replace(/\r\n/g, "\n");
}

const PANOU = "src/components/dashboard/OrderDetailClient.tsx";

/** Fototapetul din exemplul proiectului: 89 lei/m², cu pretul de catalog SCOS din socoteala. */
function fototapet(reglaje: Record<string, unknown> = {}) {
  return {
    customization: {
      enabled: true,
      fields: [
        {
          id: "d", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
          latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 },
        },
        {
          id: "prot", type: "comutator", label: "Protectie impermeabila",
          impact: { fel: "pe_m2", suma: 15 },
        },
      ],
      pret: {
        fel: "suprafata", campDimensiuni: "d", tarif: 89,
        includePretulProdusului: false, ...reglaje,
      },
    },
  };
}

/** Detaliul EXACT pe care il scrie serverul in `orders.items[].personalizare`. */
function detaliulScrisDeServer(pageSections: unknown, brut: unknown): unknown {
  const r = verificaPersonalizarea(pageSections, brut, "biz-1");
  assert.equal(r.fel, "ok", `serverul a refuzat comanda: ${JSON.stringify(r)}`);
  if (r.fel !== "ok") throw new Error("imposibil");
  return r.date.detaliu;
}

test("⚠ cei 910 lei se explica pe ecran, rand cu rand", () => {
  /*
   * ⚠ CIFRELE SUNT SCRISE PE FATA, nu recalculate in proba. 350 x 250 cm = 8,75 m²; 8,75 x 89 =
   * 778,75; protectia 8,75 x 15 = 131,25; la un loc 910,00 — pe un produs al carui catalog zice 89.
   */
  const detaliu = detaliulScrisDeServer(fototapet(), { d: { latime: 350, inaltime: 250 }, prot: true });
  const d = citesteDefalcarea(detaliu);

  assert.ok(d, "panoul nu poate citi ce a scris serverul");
  assert.equal(d.randuri.length, 2, `randuri citite: ${JSON.stringify(d.randuri)}`);

  assert.deepEqual(d.randuri[0], {
    eticheta: "Suprafata", suma: 778.75, detaliu: "8,75 m² x 89 lei/m²",
  });
  assert.deepEqual(d.randuri[1], {
    eticheta: "Protectie impermeabila", suma: 131.25, detaliu: "8,75 m² x 15 lei/m²",
  });

  /* Suma randurilor e chiar cat s-a incasat pe bucata. NU se socoteste in panou, doar se verifica aici. */
  assert.equal(d.randuri[0].suma + d.randuri[1].suma, 910);

  /* Fara minim si fara rotunjire, aria facturata E cea masurata: nu se arata al doilea rand degeaba. */
  assert.equal(suprafataDeAratat(d), null);
});

test("⚠ cand s-a facturat mai mult decat masura, se vede si de ce", () => {
  /*
   * ⚠ Asta e randul pe care comerciantul chiar TREBUIE sa-l vada. 300 x 280 cm masoara 8,40 m²,
   * dar rotunjirea in sus la 0,5 m² factureaza 8,50 — iar clientul care isi masoara peretele si
   * inmulteste singur obtine alt numar decat cel de pe factura.
   */
  const detaliu = detaliulScrisDeServer(
    fototapet({ rotunjire: 0.5 }),
    { d: { latime: 300, inaltime: 280 } },
  );
  const d = citesteDefalcarea(detaliu);
  assert.ok(d);

  const s = suprafataDeAratat(d);
  assert.ok(s, "diferenta dintre masurat si facturat nu ajunge pe ecran");
  assert.equal(caM2(s.masurat), "8,40 m²");
  assert.equal(caM2(s.facturat), "8,50 m²");
  assert.equal(d.randuri[0].detaliu, "8,50 m² x 89 lei/m²", "randul nu spune suprafata FACTURATA");
});

test("⚠ comenzile de pana acum nu au cheia, si panoul ramane exact cum era", () => {
  /*
   * `orders.items` e jsonb vechi: pe toate comenzile de dinaintea reparatiei cheia lipseste. `null`
   * inseamna „n-am ce arata", si atunci blocul nu se randeaza deloc.
   */
  assert.equal(citesteDefalcarea(undefined), null);
  assert.equal(citesteDefalcarea(null), null);
  assert.equal(citesteDefalcarea({}), null);
  assert.equal(citesteDefalcarea({ defalcare: [] }), null);
});

/** Acelasi produs, dar personalizarea nu costa nimic: se cer doar dimensiunile. */
function ramaFaraPret() {
  return {
    customization: {
      enabled: true,
      fields: [
        {
          id: "d", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
          latime: { min: 10, max: 500 }, inaltime: { min: 10, max: 350 },
        },
        { id: "m", type: "text", label: "Mesaj", required: false },
      ],
    },
  };
}

test("⚠ dimensiunile CERUTE dar NEPLATITE nu deschid un bloc despre bani", () => {
  /*
   * ⚠ REGRESIA PE PRODUSELE CARE MERG AZI. Personalizarile fara pret sunt cele mai multe, si
   * una dintre ele cere chiar dimensiuni: modul „adaugat" cu un singur camp de dimensiuni intra
   * tot prin `campulDeSuprafata`, deci comanda primeste `aria` si `ariaFacturata` — cu `defalcare`
   * GOALA, fiindca nimic nu se plateste.
   *
   * Pe ele, un „exista aria, deci am ce arata" deschidea in panou titlul „Pretul personalizarii"
   * fara niciun rand sub el. Cifrele vin din motorul care scrie cheia, nu de mana: daca maine
   * `pretulPersonalizarii` incepe sa scrie un rand si pentru suprafata neplatita, proba asta se
   * face rosie in loc sa ascunda schimbarea.
   */
  const detaliu = detaliulScrisDeServer(ramaFaraPret(), { d: { latime: 350, inaltime: 250 }, m: "salut" });
  assert.deepEqual(detaliu, { supliment: 0, aria: 8.75, ariaFacturata: 8.75, defalcare: [] });
  assert.equal(citesteDefalcarea(detaliu), null, "un bloc despre bani pe o personalizare care nu costa");

  /*
   * ⚠ Si nu e „mereu null cand n-are randuri": cand suprafata FACTURATA difera de cea masurata,
   * randul ala e singurul lucru de pe ecran care explica diferenta, deci blocul ramane.
   */
  const doarSuprafata = citesteDefalcarea({ defalcare: [], aria: 8.4, ariaFacturata: 8.5 });
  assert.ok(doarSuprafata, "diferenta dintre masurat si facturat s-a pierdut");
  assert.deepEqual(suprafataDeAratat(doarSuprafata), { masurat: 8.4, facturat: 8.5 });
});

test("⚠ un `items` scris strambe NU arunca, si nu inventeaza cifre", () => {
  /*
   * ⚠ `orders.items` e si EDITABIL din panou: editarea pastreaza cheile necunoscute printr-un
   * spread, deci aici poate ajunge orice. O exceptie ar fi albit pagina INTREAGA a comenzii — adica
   * i-ar fi luat comerciantului si adresa, si AWB-ul, pentru o defalcare pe care oricum n-o avea.
   */
  for (const gunoi of [0, 1, "", "text", true, [], [1, 2], NaN, () => 1, { defalcare: "nu-i lista" }]) {
    assert.equal(citesteDefalcarea(gunoi), null, `a intors ceva pentru ${String(gunoi)}`);
  }

  const amestec = citesteDefalcarea({
    aria: 8.75,
    ariaFacturata: "8,75",
    defalcare: [
      null, 7, "rand", [], {},
      { eticheta: "Fara suma" },
      { suma: 12 },
      { eticheta: "Suma ca sir", suma: "131.25" },
      { eticheta: "  Bun  ", suma: 131.25, detaliu: 5 },
      { eticheta: "L".repeat(5000), suma: 1, detaliu: "D".repeat(5000) },
    ],
  });
  assert.ok(amestec);
  /*
   * ⚠ Randurile fara eticheta sau fara SUMA NUMAR se arunca, nu se completeaza cu „0,00 lei". Un
   * zero pe ecran e o afirmatie despre bani, si e cea gresita: acolo nu se stie cat s-a incasat, nu
   * se stie ca n-a costat nimic. Si un „131.25" venit ca SIR nu se preface in numar: intr-o
   * defalcare de bani, un numar ghicit e mai rau decat un rand lipsa, fiindca lipsa se vede.
   */
  assert.deepEqual(amestec.randuri[0], { eticheta: "Bun", suma: 131.25 });
  /*
   * ⚠ Si un text nesfarsit se TAIE, nu se randeaza intreg: eticheta vine din definitia
   * produsului, dar `orders.items` e editabil, iar un sir de cateva mii de semne ar fi impins
   * suma in afara randului si ar fi intins pagina comenzii.
   */
  assert.equal(amestec.randuri.length, 2, `randuri citite: ${JSON.stringify(amestec.randuri)}`);
  assert.equal(amestec.randuri[1].eticheta.length, 200, "eticheta uriasa nu s-a taiat");
  assert.equal(amestec.randuri[1].detaliu?.length, 200, "detaliul urias nu s-a taiat");
  assert.equal(amestec.aria, 8.75);
  assert.equal(amestec.ariaFacturata, undefined, "un sir a trecut drept suprafata facturata");
  assert.equal(suprafataDeAratat(amestec), null, "compara o suprafata cu una care lipseste");
});

test("⚠ o defalcare uriasa nu randeaza zece mii de randuri", () => {
  const multe = citesteDefalcarea({
    defalcare: Array.from({ length: 5000 }, (_, i) => ({ eticheta: `R${i}`, suma: 1 })),
  });
  assert.ok(multe);
  assert.equal(multe.randuri.length, 40);
});

test("⚠ panoul CITESTE cheia si RANDEAZA defalcarea", () => {
  /*
   * ⚠ Mutantul care dovedeste proba: se scoate ramura `{defalcare && (<DefalcareaPersonalizarii …>)}`
   * din `OrderDetailClient.tsx`. Cititorul si toate probele de mai sus raman verzi — si ecranul
   * comerciantului se intoarce exact la defectul de la care am plecat.
   */
  const s = sursa(PANOU);

  /* Tipul liniei stie de cheie, si o tine `unknown`: forma se verifica la citire, nu se declara. */
  assert.match(s, /personalizare\?: unknown;/, "tipul liniei nu cunoaste cheia `personalizare`");
  assert.match(
    s, /import \{[\s\S]{0,160}citesteDefalcarea[\s\S]{0,160}\} from "@\/lib\/orders\/defalcare-personalizare";/,
    "panoul nu importa cititorul",
  );

  /* Se citeste CHEIA scrisa de server, nu altceva. */
  assert.match(
    s, /const defalcare = citesteDefalcarea\(item\.personalizare\);/,
    "panoul nu citeste `personalizare` de pe linie",
  );

  /* Si chiar se randeaza, sub valorile alese, in acelasi bloc de personalizare. */
  assert.match(
    s, /\{defalcare && \(\s*<DefalcareaPersonalizarii d=\{defalcare\} cantitate=\{/,
    "defalcarea se citeste, dar nu ajunge pe ecran",
  );
  const bloc = s.slice(s.indexOf("function DefalcareaPersonalizarii"));
  assert.ok(bloc.length > 400, "componenta de defalcare a disparut");
  assert.match(bloc, /\{r\.eticheta\}/, "randul nu arata eticheta");
  assert.match(bloc, /\{r\.detaliu\}/, "randul nu arata detaliul „8,75 m² x 89 lei/m²”");
  assert.match(bloc, /formatPrice\(r\.suma\)/, "randul nu arata suma");
  assert.match(bloc, /suprafataDeAratat\(d\)/, "aria facturata nu se compara cu cea masurata");
  assert.match(bloc, /caM2\(suprafata\.masurat\)[\s\S]{0,120}caM2\(suprafata\.facturat\)/,
    "nu se vede de ce s-a facturat mai mult decat masura");

  /*
   * ⚠ Blocul apare si cand comanda are DOAR defalcarea, si nu apare deloc cand n-are niciuna —
   * adica pe toate comenzile de pana acum.
   */
  assert.match(s, /\{\(campuri\.length > 0 \|\| defalcare\) && \(/, "conditia blocului s-a schimbat");
});

test("⚠ panoul NU isi socoteste singur pretul", () => {
  /*
   * ⚠ A doua socoteala ar fi fost cel mai usor lucru de scris si cel mai scump de tinut: ea s-ar fi
   * departat de motor la prima corectura, iar panoul ar fi contrazis factura emisa din aceleasi
   * date — fara ca cineva sa poata spune care dintre ele minte.
   */
  const s = sursa(PANOU);
  for (const motor of ["pretulPersonalizarii", "pretUnitar", "podeaPersonalizarii", "suprafataFacturata"]) {
    assert.equal(s.includes(motor), false, `panoul cheama ${motor}: are a doua socoteala`);
  }
  /* Nici cititorul nu socoteste: el nu importa nimic. */
  assert.equal(
    /^import /m.test(sursa("src/lib/orders/defalcare-personalizare.ts")), false,
    "cititorul a capatat importuri — deci si o cale spre un al doilea calcul",
  );
});
