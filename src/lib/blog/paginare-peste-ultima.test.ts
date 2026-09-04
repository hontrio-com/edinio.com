import { strict as assert } from "node:assert";
import { test, describe, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  articoleleAutorului,
  articoleleCategoriei,
  articoleleEtichetei,
  cautaArticole,
  dupaUltimaPagina,
  paginaDeArticole,
} from "./citire";
import { paginaCeruta, paginaNuExista } from "./paginare";

/*
  ═══ 500 ÎN LOC DE 404 PE ORICE `?p=` DINCOLO DE ULTIMA PAGINĂ ═══

  Măsurat în producție pe 04.09.2026: `/blog?p=2`, `/blog?p=999`,
  `/blog/categorie/…?p=2`, `/blog/autor/…?p=2`, `/blog/eticheta/…?p=2` și
  căutarea răspundeau toate **500**, inclusiv pentru Googlebot — deși comentariile
  din `Paginare.tsx` susțineau că dau 404.

  Cauza, verificată direct pe bază: cu `count: "exact"`, o felie care începe după
  ultimul rând nu întoarce listă goală, ci **416 / PGRST103**. `cere()` aruncă
  dinadins pe orice eroare, iar garda stătea DUPĂ citirea care arunca, deci nu
  apuca să ruleze niciodată.

  ═══ ⚠ CE ERA GREȘIT CU PROBELE DE AICI, PÂNĂ ÎN ACEEAȘI ZI ═══

  Erau trei probe care CITEAU SURSA ca text, și o revizie adversarială le-a
  spart pe toate trei, cu mutații rulate:

    1. `if (dupaUltimaPagina(e3))` schimbat în `(e2)` — altă eroare, din același
       domeniu, deci `tsc` tace — trecea de amândouă probele de cablare: una
       căuta doar `indexOf("dupaUltimaPagina(")`, cealaltă accepta orice `e\d+`.
       Iar ruta redevenea 500.
    2. `paginaNuExista` era „probată" prin prezența a trei șiruri în corpul ei:
       inversarea rezultatului (`return false` → `return true`) trecea, și tot
       blogul ar fi răspuns 404 pe prima pagină.
    3. Un corp sintactic nevalid trecea și el: fișierul era citit, nu executat.

  Acum se măsoară CE FAC. Cablarea se probează chemând chiar cele cinci citiri,
  peste un PostgREST fals care răspunde 416 exact la felia paginată — deci o
  gardă care se uită la altă eroare nu mai are cum să treacă.
*/

const AICI = dirname(fileURLToPath(import.meta.url));
const CITIRE = join(AICI, "citire.ts");

/** Sursa fără comentarii, ca proba să se agațe de cod, nu de vorbele despre el. */
function sursaFaraComentarii(cale: string): string {
  return readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("predicatul", () => {
  test("recunoaște codul PostgREST pentru „offset peste numărul de rânduri”", () => {
    assert.equal(dupaUltimaPagina({ code: "PGRST103" }), true);
  });

  test("NU iartă nicio altă eroare", () => {
    /* O pană a bazei trebuie să rămână 500. Iertată aici, ar deveni o listă
       goală, care arată exact ca „nu sunt articole" — chiar defectul pe care
       `cere()` a fost scris să-l închidă. */
    for (const cod of ["PGRST116", "PGRST301", "42501", "42703", "", undefined]) {
      assert.equal(dupaUltimaPagina({ code: cod }), false, `codul „${cod}" a fost iertat`);
    }
    assert.equal(dupaUltimaPagina(null), false);
    assert.equal(dupaUltimaPagina(undefined), false);
    assert.equal(dupaUltimaPagina({}), false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   CABLAREA, MĂSURATĂ PE CELE CINCI CITIRI ADEVĂRATE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Un PostgREST fals, în proces.
 *
 * ⚠ RĂSPUNDE 416 DOAR LA FELIA PAGINATĂ, restul 200. Discriminantul e antetul
 * `Prefer: count=exact` — măsurat, nu presupus: supabase-js 2.106 trimite
 * `.range(…)` ca `offset`/`limit` ÎN ADRESĂ, nu ca antet `Range`, iar numărarea
 * exactă e singurul semn din cerere care deosebește felia de o căutare simplă.
 *
 * Despărțirea contează: căutarea unei categorii, a unui autor sau a unei
 * etichete reușește, deci garda e chemată cu EROAREA CITIRII PAGINATE. Dacă
 * falsul ar răspunde 416 la tot, o gardă care se uită la eroarea greșită ar
 * trece — chiar mutația pe care proba asta e scrisă s-o prindă.
 *
 * Ce întorc cererile fără numărare e cea mai mică formă care ține citirea în
 * picioare: un rând cu `id`, ca `if (!cat) return gol` să nu iasă devreme.
 */
function postgrestFals() {
  const original = globalThis.fetch;
  const cereri: { url: string; feliata: boolean }[] = [];

  globalThis.fetch = (async (intrare: unknown, init?: { headers?: unknown }) => {
    const url = String(typeof intrare === "string" ? intrare : (intrare as { url?: string })?.url ?? "");
    const antete = new Headers((init?.headers ?? {}) as HeadersInit);
    const feliata = (antete.get("Prefer") ?? "").includes("count=exact");
    cereri.push({ url, feliata });

    if (feliata) {
      /* Chiar răspunsul măsurat pe bază pentru o felie care începe după ultimul
         rând, cu `count=exact`. */
      return new Response(
        JSON.stringify({
          code: "PGRST103",
          message: "Requested range not satisfiable",
          details: "An offset of 12 was requested, but there are only 1 rows.",
          hint: null,
        }),
        { status: 416, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify([{ id: "00000000-0000-0000-0000-000000000001" }]), {
      status: 200,
      headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" },
    });
  }) as unknown as typeof globalThis.fetch;

  return { cereri, restaureaza: () => { globalThis.fetch = original; } };
}

/* Clientul are nevoie doar de o adresă și de o cheie ca să se construiască;
   nicio cerere nu pleacă din proces, `fetch` e înlocuit. */
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://proba.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "cheie-de-proba";

const GOL = { articole: [], total: 0, pagini: 1 };

const CITIRILE: [string, () => Promise<unknown>][] = [
  ["lista principală (/blog)", () => paginaDeArticole(9)],
  ["rubrică (/blog/categorie/…)", () => articoleleCategoriei("o-rubrica", 9)],
  ["autor (/blog/autor/…)", () => articoleleAutorului("un-autor", 9)],
  ["etichetă (/blog/eticheta/…)", () => articoleleEtichetei("o-eticheta", 9)],
  ["căutare (/blog/cautare)", () => cautaArticole("ceva", 9)],
];

describe("o pagină de după ultima dă „pagină inexistentă”, nu aruncă", () => {
  let fals: ReturnType<typeof postgrestFals> | null = null;
  afterEach(() => { fals?.restaureaza(); fals = null; });

  for (const [nume, cheama] of CITIRILE) {
    test(nume, async () => {
      fals = postgrestFals();
      const raspuns = await cheama();
      assert.deepEqual(
        raspuns,
        GOL,
        `${nume}: 416 de la PostgREST n-a fost prins de gardă, deci ruta răspunde 500`,
      );
      /* Fără rândul ăsta, o citire care n-ar cere niciodată o felie ar trece
         proba fără să fi fost măsurată. */
      assert.ok(
        fals.cereri.some((c) => c.feliata),
        `${nume}: nu s-a cerut nicio felie numărată, deci garda nici n-a fost pusă la încercare`,
      );
    });
  }

  test("fiecare citire întoarce un obiect PROPRIU, nu unul comun", async () => {
    /*
      ⚠ `PAGINA_INEXISTENTA` era o constantă de modul, deci aceeași referință —
      și același array gol — ieșea din toate cele cinci citiri, la fiecare cerere
      din același proces Node. Un singur apelant care ar fi sortat lista pe loc ar
      fi stricat-o pentru toți vizitatorii următori, iar defectul ar fi apărut la
      ore după cauză.

      Proba mută dinadins lista primită de la o citire și cere ca a doua să nu fi
      aflat nimic.
    */
    fals = postgrestFals();
    const unu = (await paginaDeArticole(9)) as { articole: unknown[] };
    unu.articole.push("un rând strecurat");
    const doi = (await articoleleCategoriei("o-rubrica", 9)) as { articole: unknown[] };
    assert.deepEqual(doi.articole, [], "a doua citire a primit lista murdărită de prima");
    const trei = (await paginaDeArticole(9)) as { articole: unknown[] };
    assert.deepEqual(trei.articole, [], "aceeași citire, a doua oară, a primit lista murdărită");
  });

  test("sunt fix cinci citiri paginate, toate acoperite mai sus", () => {
    /* Nu ține locul probelor de comportament — le apără de o citire NOUĂ
       adăugată fără gardă și fără rând în tabelul de sus. */
    const bucati = sursaFaraComentarii(CITIRE).split(".select(");
    const cuNumarare = bucati.filter((b) => b.includes('count: "exact"'));
    assert.equal(cuNumarare.length, CITIRILE.length, `${cuNumarare.length} citiri cu numărare exactă, dar ${CITIRILE.length} probate`);
  });
});

/**
 * Același fals, dar felia numărată răspunde cu o eroare ADEVĂRATĂ a bazei.
 *
 * Restul cererilor reușesc, ca și mai sus, ca să se ajungă chiar la gardă.
 */
function postgrestCade() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_intrare: unknown, init?: { headers?: unknown }) => {
    const antete = new Headers((init?.headers ?? {}) as HeadersInit);
    if ((antete.get("Prefer") ?? "").includes("count=exact")) {
      return new Response(JSON.stringify({ code: "PGRST301", message: "JWT expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify([{ id: "00000000-0000-0000-0000-000000000001" }]), {
      status: 200,
      headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" },
    });
  }) as unknown as typeof globalThis.fetch;
  return { restaureaza: () => { globalThis.fetch = original; } };
}

describe("o eroare ADEVĂRATĂ a bazei rămâne o eroare, pe TOATE cele cinci", () => {
  /*
    Partea cealaltă a regulii, și cea care contează mai mult: garda are voie să
    ierte EXACT 416/PGRST103. Iertând mai mult, o pană a bazei ar deveni o listă
    goală — adică „blogul n-are articole", servit cu 200 și pus în cache.

    ⚠ DOUĂ LUCRURI ERAU GREȘITE AICI, și le-a numit o revizie adversarială:

    1. Se chema DOAR `paginaDeArticole`. O gardă lărgită în oricare din celelalte
       patru citiri trecea nevăzută, deși comentariul fișierului promitea altceva.
    2. Tiparul cerut era `/paginaDeArticole|JWT|PGRST301/i` — o tautologie:
       `cere()` pune numele funcției în FIECARE mesaj pe care îl aruncă, deci
       prima alternativă se potrivea cu orice eșec, inclusiv cu unul din alt
       motiv. Acum se cere mesajul BAZEI, nu numele funcției noastre.
  */
  let fals: ReturnType<typeof postgrestCade> | null = null;
  afterEach(() => { fals?.restaureaza(); fals = null; });

  for (const [nume, cheama] of CITIRILE) {
    test(nume, async () => {
      fals = postgrestCade();
      await assert.rejects(
        () => cheama(),
        (e: unknown) => {
          const mesaj = e instanceof Error ? e.message : String(e);
          assert.match(mesaj, /JWT expired/, `${nume}: eroarea bazei nu ajunge în mesaj: ${mesaj}`);
          return true;
        },
        `${nume}: un 401 al bazei a fost înghițit — ruta ar răspunde „niciun articol"`,
      );
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   CE FACE PAGINA CU RĂSPUNSUL — chemat, nu citit din sursă
   ═══════════════════════════════════════════════════════════════════════════ */

describe("paginaNuExista", () => {
  test("prima pagină e mereu bună, chiar și pe un blog gol", () => {
    /* ⚠ Mutația care trecea înainte: `if (pagina <= 1) return false` → `true`.
       Ar fi făcut 404 pe `/blog`, `/blog/categorie/…`, `/blog/autor/…`,
       `/blog/eticheta/…` și pe căutare. Adică tot blogul. */
    assert.equal(paginaNuExista(1, 0, 1), false);
    assert.equal(paginaNuExista(1, 100, 9), false);
    assert.equal(paginaNuExista(0, 0, 1), false);
    assert.equal(paginaNuExista(-3, 0, 1), false);
  });

  test("„niciun articol” duce la 404 pentru orice pagină ≥ 2", () => {
    /* ⚠ Aici se vede `PAGINA_INEXISTENTA`: garda din `citire.ts` întoarce
       `total: 0`, iar pagina trebuie să-l traducă în 404, nu într-o listă goală
       servită cu 200. Mutația `||` → `&&` trecea înainte; acum cade. */
    assert.equal(paginaNuExista(2, 0, 1), true);
    assert.equal(paginaNuExista(999, 0, 1), true);
  });

  test("pagina de după ultima duce la 404", () => {
    assert.equal(paginaNuExista(10, 100, 9), true);
    assert.equal(paginaNuExista(9, 100, 9), false, "ultima pagină chiar există");
    assert.equal(paginaNuExista(2, 100, 9), false);
  });
});

describe("paginaCeruta", () => {
  test("numai cifre curate, altfel pagina 1", () => {
    /* `Number.parseInt("2abc")` dă 2, deci `/blog?p=2abc` servea conținutul
       paginii 2 la a doua adresă — conținut dublat pentru un motor de căutare. */
    for (const [intrare, astept] of [
      ["2", 2], ["1", 1], ["999", 999],
      ["2abc", 1], ["-1", 1], ["0", 1], ["", 1], ["  ", 1], ["1.5", 1],
      ["١٢", 1], ["1e3", 1], ["0x2", 1], ["+2", 1], [" 2 ", 2],
    ] as [string, number][]) {
      assert.equal(paginaCeruta(intrare), astept, `p=${JSON.stringify(intrare)}`);
    }
    assert.equal(paginaCeruta(undefined), 1);
    assert.equal(paginaCeruta(["3", "4"]), 3, "primul din listă, ca la Next");
  });
});

describe("pagina 1 nu poate ajunge la gardă", () => {
  test("offsetul primei pagini e 0 în TOATE cele cinci citiri", () => {
    /*
      Verificat pe bază: `Range: 0-11` cu `count=exact` pe o mulțime goală
      întoarce 200 cu listă goală, nu 416. Deci garda nu poate ascunde niciodată
      prima pagină a unui blog gol — atâta timp cât offsetul ei chiar e 0.

      ⚠ AICI ERA `assert.match`, care se mulțumește cu O SINGURĂ apariție din
      cinci: o mutație care strica patru din cele cinci citiri trecea verde prin
      tot depozitul. Se numără.
    */
    const citire = sursaFaraComentarii(CITIRE);
    const potriviri = [...citire.matchAll(/const de_la = Math\.max\(0, \(pagina - 1\) \* pePagina\)/g)];
    assert.equal(
      potriviri.length,
      CITIRILE.length,
      `${potriviri.length} citiri calculează offsetul așa, dar sunt ${CITIRILE.length} citiri paginate`,
    );
  });
});
