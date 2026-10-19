import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { ORDER_STATUS } from "@/lib/orders/status";
import {
  adresaComenzilor,
  areFiltre,
  argumenteleCautarii,
  CAUTARE_MAX,
  citesteFiltrele,
  FARA_FILTRE,
  inceputulPerioadei,
  parametriiFiltrelor,
  PERIOADE_FILTRU,
  STARI_FILTRU,
} from "./cautare-comenzi";
import { stareaComenzii } from "./stare-comanda";

/*
 * Cautarea din „Comenzile mele” (cerut pe 19.10.2026): numarul comenzii sau un produs,
 * starea si perioada. Filtrul il face BAZA (`cont_comenzile_mele`), inaintea paginarii.
 */

const citeste = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const ACUM = new Date("2026-10-19T09:30:00.000Z");

describe("ce se citeste din adresa", () => {
  test("textul se curata: spatii, lungime, liste", () => {
    assert.deepEqual(citesteFiltrele({ q: "  #1337   inel  " }), { cautare: "#1337 inel", stare: "", perioada: "" });
    assert.equal(citesteFiltrele({ q: ["bratara", "ignorat"] }).cautare, "bratara", "din `?q=a&q=b` se ia primul");
    assert.equal(citesteFiltrele({ q: "x".repeat(500) }).cautare.length, CAUTARE_MAX);
    assert.deepEqual(citesteFiltrele({}), FARA_FILTRE);
  });

  test("⚠ o stare sau o perioada necunoscuta e „fara filtru”, nu eroare", () => {
    assert.equal(citesteFiltrele({ stare: "livrata" }).stare, "livrata");
    assert.equal(citesteFiltrele({ stare: "delivered" }).stare, "", "cheia din adresa e cea romaneasca");
    assert.equal(citesteFiltrele({ stare: "'; drop table orders; --" }).stare, "");
    assert.equal(citesteFiltrele({ perioada: "3-luni" }).perioada, "3-luni");
    assert.equal(citesteFiltrele({ perioada: "10-ani" }).perioada, "");
  });

  test("areFiltre", () => {
    assert.equal(areFiltre(FARA_FILTRE), false);
    assert.equal(areFiltre({ ...FARA_FILTRE, cautare: "1" }), true);
    assert.equal(areFiltre({ ...FARA_FILTRE, stare: "anulata" }), true);
    assert.equal(areFiltre({ ...FARA_FILTRE, perioada: "1-an" }), true);
  });
});

describe("starile si perioadele din filtru", () => {
  test("fiecare stare a comenzii are rand, cu eticheta de pe card", () => {
    assert.deepEqual(STARI_FILTRU.map((s) => s.stare).sort(), Object.keys(ORDER_STATUS).sort());
    for (const s of STARI_FILTRU) {
      assert.equal(s.eticheta, stareaComenzii(s.stare).label, `${s.cheie}: filtrul spune altceva decat cardul`);
      assert.match(s.cheie, /^[a-z-]+$/, "cheia din adresa: litere mici si cratime");
    }
  });

  test("perioadele: luni calendaristice, cu etichete care incap pe un telefon", () => {
    assert.deepEqual(PERIOADE_FILTRU.map((p) => p.cheie), ["o-luna", "3-luni", "6-luni", "1-an"]);
    /* ⚠ „Ultimele 30 de zile” iesea taiata in lista de ~130px de pe un telefon de 375px. */
    for (const p of PERIOADE_FILTRU) assert.ok(p.eticheta.length <= 15, `${p.eticheta} e prea lunga`);
    assert.equal(inceputulPerioadei("o-luna", ACUM).toISOString(), "2026-09-19T09:30:00.000Z");
    assert.equal(inceputulPerioadei("3-luni", ACUM).toISOString(), "2026-07-19T09:30:00.000Z");
    assert.equal(inceputulPerioadei("6-luni", ACUM).toISOString(), "2026-04-19T09:30:00.000Z");
    assert.equal(inceputulPerioadei("1-an", ACUM).toISOString(), "2025-10-19T09:30:00.000Z");
  });

  test("⚠ capatul lunii se plafoneaza: 31 mai minus 3 luni e 28 februarie, nu 3 martie", () => {
    assert.equal(inceputulPerioadei("3-luni", new Date("2026-05-31T12:00:00Z")).toISOString(), "2026-02-28T12:00:00.000Z");
    assert.equal(inceputulPerioadei("1-an", new Date("2028-02-29T12:00:00Z")).toISOString(), "2027-02-28T12:00:00.000Z");
    assert.equal(inceputulPerioadei("6-luni", new Date("2026-08-31T00:00:00Z")).toISOString(), "2026-02-28T00:00:00.000Z");
    assert.equal(inceputulPerioadei("o-luna", new Date("2026-03-31T08:00:00Z")).toISOString(), "2026-02-28T08:00:00.000Z");
    assert.equal(inceputulPerioadei("o-luna", new Date("2026-01-15T08:00:00Z")).toISOString(), "2025-12-15T08:00:00.000Z", "peste an");
  });
});

describe("ce pleaca spre baza", () => {
  test("⚠ fara filtre pleaca apelul de dinainte, cu patru argumente", () => {
    assert.deepEqual(argumenteleCautarii(FARA_FILTRE, ACUM), {});
  });

  test("starea din adresa devine starea din baza, perioada o clipa", () => {
    assert.deepEqual(argumenteleCautarii({ cautare: "inel", stare: "rambursata", perioada: "o-luna" }, ACUM), {
      p_cautare: "inel", p_stare: "refunded", p_de_la: "2026-09-19T09:30:00.000Z",
    });
    assert.deepEqual(argumenteleCautarii({ ...FARA_FILTRE, stare: "in-pregatire" }, ACUM), { p_stare: "processing" });
  });
});

describe("adresa listei", () => {
  test("fara filtre e adresa simpla, cu filtre se scrie intreaga si codificata", () => {
    assert.equal(adresaComenzilor(FARA_FILTRE), "/cont/comenzi");
    assert.equal(parametriiFiltrelor(FARA_FILTRE), "");
    assert.equal(
      adresaComenzilor({ cautare: "#13 & co", stare: "livrata", perioada: "1-an" }),
      "/cont/comenzi?q=%2313+%26+co&stare=livrata&perioada=1-an",
    );
    /* Dus si intors: ce scrie adresa se citeste inapoi la fel. */
    const f = { cautare: "brățară 50%", stare: "anulata", perioada: "6-luni" } as const;
    const inapoi = Object.fromEntries(new URLSearchParams(parametriiFiltrelor(f)));
    assert.deepEqual(citesteFiltrele(inapoi), f);
  });

  test("⚠ paginarea poarta filtrele: „Urmatoare” nu duce in lista intreaga", () => {
    const s = citeste("src/components/storefront/cont/ecrane/Paginare.tsx");
    assert.match(s, /const adresa = \(p: number\) => `\$\{baza\}\?\$\{parametri \? `\$\{parametri\}&` : ""\}p=\$\{p\}`;/);
    assert.equal((s.match(/href=\{adresa\(pagina [-+] 1\)\}/g) ?? []).length, 2);
    assert.match(citeste("src/components/storefront/cont/ecrane/EcranComenzi.tsx"), /parametri=\{parametriiFiltrelor\(filtre\)\}/);
  });
});

describe("cablarea", () => {
  test("pagina citeste filtrele si le trimite listei, iar lista le trimite bazei", () => {
    const pagina = citeste("src/app/(public)/[slug]/cont/comenzi/page.tsx");
    assert.match(pagina, /const filtre = citesteFiltrele\(sp\);/);
    assert.match(pagina, /comenzileMele\(pag\.magazin\.id, pag\.sesiune\.contId, PE_PAGINA, \(pagina - 1\) \* PE_PAGINA, filtre\)/);
    assert.match(pagina, /filtre=\{filtre\}/);
    const lib = citeste("src/lib/cont/comenzi.ts");
    const apel = lib.slice(lib.indexOf('rpc("cont_comenzile_mele"'));
    assert.match(apel.slice(0, 500), /\.\.\.argumenteleCautarii\(filtre, new Date\(\)\),/);
  });

  test("bara cauta prin ADRESA, cu formular GET ca plasa fara JavaScript", () => {
    const s = citeste("src/components/storefront/cont/ecrane/CautareComenzi.tsx");
    assert.match(s, /router\.replace\(adresaComenzilor\(curat\), \{ scroll: false \}\)/);
    assert.match(s, /action="\/cont\/comenzi"\s+method="get"/);
    for (const nume of ['name="q"', 'name="stare"', 'name="perioada"']) assert.ok(s.includes(nume), nume);
  });
});

describe("migratia", () => {
  const MIGRATIE = citeste("migrations/2026-10-19-conturi-clienti-cautarea-in-comenzi.sql");
  const corp = MIGRATIE.slice(MIGRATIE.indexOf("create function public.cont_comenzile_mele("), MIGRATIE.indexOf("$fn$;"));

  test("forma veche iese, iar cea noua e chemata NUMAI de server", () => {
    assert.match(MIGRATIE, /drop function if exists public\.cont_comenzile_mele\(uuid, uuid, integer, integer\);/);
    assert.match(MIGRATIE, /drop function if exists public\.cont_comenzile_mele\(uuid, uuid, integer, integer, text, text, timestamptz\);/);
    assert.match(MIGRATIE, /revoke all on function public\.cont_comenzile_mele\(uuid, uuid, integer, integer, text, text, timestamptz\) from public, anon, authenticated;/);
    assert.match(MIGRATIE, /grant execute on function public\.cont_comenzile_mele\(uuid, uuid, integer, integer, text, text, timestamptz\) to service_role;/);
    assert.match(MIGRATIE, /notify pgrst, 'reload schema';/);
  });

  test("⚠ filtrele au implicit NULL: un apel cu patru argumente da lista de dinainte", () => {
    for (const p of ["p_cautare text default null", "p_stare text default null", "p_de_la timestamptz default null"]) {
      assert.ok(corp.includes(p), p);
    }
    assert.match(corp, /and \(p_stare is null or o\.status = p_stare\)/);
    assert.match(corp, /and \(p_de_la is null or o\.created_at >= p_de_la\)/);
    /* Fara cuvinte, lista e goala, iar `not exists` pe o lista goala trece tot. */
    assert.ok(corp.includes("coalesce(array_agg("), "fara cuvinte, `array_agg` da NULL, nu lista goala");
    assert.match(corp, /and not exists \(\s*select 1\s*from unnest\(c\.tipare\) as t\(tipar\)/);
  });

  test("⚠ textul omului se taie pe cuvinte, se scapa pentru LIKE si se compara fara diacritice, pe ambele parti", () => {
    assert.ok(corp.includes(String.raw`replace(replace(replace(x.w, '\', '\\'), '%', '\%'), '_', '\_')`));
    assert.ok(corp.includes(String.raw`regexp_split_to_table(lower(public.fara_diacritice(btrim(coalesce(p_cautare, '')))), '\s+')`));
    assert.ok(corp.includes("ltrim(w.w, '#')"), "„#1337” se cauta ca „1337”");
    assert.ok(corp.includes("where x.w <> '' and x.n <= 8"));
    assert.ok(corp.includes("lower(public.fara_diacritice(coalesce(o.order_number, ''))) like t.tipar"));
    assert.ok(corp.includes("lower(public.fara_diacritice(coalesce(s.li->>'name', ''))) like t.tipar"));
  });

  test("⚠ restul corpului e cel din schema de referinta, rand cu rand, in aceeasi ordine", () => {
    /*
     * Corpul vechi (productia) trebuie sa se regaseasca intreg in cel nou: filtrele se
     * ADAUGA, nu inlocuiesc. Asa nu se pierde pe drum poarta vederii (`are_factura`),
     * departajatorul pe `id` sau plafonul de 100.
     */
    const baseline = citeste("migrations/000-schema-baseline.sql");
    const i = baseline.indexOf("CREATE OR REPLACE FUNCTION public.cont_comenzile_mele(");
    assert.notEqual(i, -1);
    const vechi = baseline.slice(baseline.indexOf("AS $function$", i) + "AS $function$".length, baseline.indexOf("$function$\n;", i))
      .split("\n").map((r) => r.trim()).filter(Boolean);
    const nou = corp.split("\n").map((r) => r.trim()).filter(Boolean);
    let j = 0;
    for (const r of vechi) {
      while (j < nou.length && nou[j] !== r) j++;
      assert.ok(j < nou.length, `din corpul productiei lipseste: ${r}`);
      j++;
    }
    assert.ok(corp.includes("case when l.vedere = 'intreaga' then privat.cont_documentul_comenzii(o) is not null else false end"));
  });
});
