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
  textulDeCautat,
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

/* Migratia din 23.11.2026: corpul de azi al listei si raportul cu aceleasi filtre. */
const MIGRATIE_NOUA = citeste("migrations/2027-02-12-cont-cautare-destinatar-interval-raport.sql");
const corpulFunctiei = (antet: string) => {
  const i = MIGRATIE_NOUA.indexOf(antet);
  assert.notEqual(i, -1, antet);
  return MIGRATIE_NOUA.slice(i, MIGRATIE_NOUA.indexOf("$fn$;", i));
};
const CORP_NOU = corpulFunctiei("create function public.cont_comenzile_mele(");

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
    /*
     * ⚠ Din 23.11.2026 functia are o migratie mai noua (destinatar, telefon, AWB, `p_pana_la`), deci
     * corpul din schema de referinta se cauta in EA: inaintea regenerarii schemei e corpul din 19.10
     * (cuprins in cel nou), dupa regenerare e chiar cel nou. In ambele stari nimic nu are voie sa lipseasca.
     */
    const baseline = citeste("migrations/000-schema-baseline.sql");
    const i = baseline.indexOf("CREATE OR REPLACE FUNCTION public.cont_comenzile_mele(");
    assert.notEqual(i, -1);
    const vechi = baseline.slice(baseline.indexOf("AS $function$", i) + "AS $function$".length, baseline.indexOf("$function$\n;", i))
      .split("\n").map((r) => r.trim()).filter(Boolean);
    const nou = CORP_NOU.split("\n").map((r) => r.trim()).filter(Boolean);
    let j = 0;
    for (const r of vechi) {
      while (j < nou.length && nou[j] !== r) j++;
      assert.ok(j < nou.length, `din corpul productiei lipseste: ${r}`);
      j++;
    }
    assert.ok(corp.includes("case when l.vedere = 'intreaga' then privat.cont_documentul_comenzii(o) is not null else false end"));
  });
});

describe("destinatar, telefon, AWB si perioada pe zile (23.11.2026)", () => {
  const CORP_RAPORT = corpulFunctiei("create function public.cont_raportul_comenzilor(");
  const filtrele = (corp: string) => corp.slice(corp.indexOf("/* <filtrele>"), corp.indexOf("/* </filtrele> */"));

  test("zilele din adresa: valide, intoarse la loc, si iau locul perioadei din lista", () => {
    assert.deepEqual(citesteFiltrele({ de_la: "2026-11-15", pana_la: "2026-11-30" }), { ...FARA_FILTRE, deLa: "2026-11-15", panaLa: "2026-11-30" });
    assert.deepEqual(citesteFiltrele({ de_la: "2026-11-30", pana_la: "2026-11-15" }), { ...FARA_FILTRE, deLa: "2026-11-15", panaLa: "2026-11-30" }, "scrise pe dos");
    assert.deepEqual(citesteFiltrele({ de_la: "31.11.2026", pana_la: "2026-02-31" }), FARA_FILTRE, "o zi care nu exista nu filtreaza");
    assert.deepEqual(citesteFiltrele({ perioada: "3-luni", de_la: "2026-11-15" }), { ...FARA_FILTRE, deLa: "2026-11-15" }, "ziua bate lista");
    assert.equal(areFiltre({ ...FARA_FILTRE, panaLa: "2026-11-30" }), true);
    /* Fara zile, obiectul arata exact ca inainte: cheile nici nu exista. */
    assert.equal("deLa" in citesteFiltrele({ q: "inel" }), false);
  });

  test("⚠ zilele sunt ROMANESTI, cu amandoua capetele incluse", () => {
    assert.deepEqual(argumenteleCautarii({ ...FARA_FILTRE, deLa: "2026-11-15", panaLa: "2026-11-30" }, ACUM), {
      /* Noiembrie = ora de iarna (UTC+2): ziua de 15 incepe la 22:00 UTC pe 14. */
      p_de_la: "2026-11-14T22:00:00.000Z", p_pana_la: "2026-11-30T21:59:59.999Z",
    });
    /* Iulie = ora de vara (UTC+3). */
    assert.deepEqual(argumenteleCautarii({ ...FARA_FILTRE, panaLa: "2026-07-01" }, ACUM), { p_pana_la: "2026-07-01T20:59:59.999Z" });
    /* ⚠ `p_pana_la` nu pleaca necerut: functia de dinaintea migratiei nu-l cunoaste. */
    assert.equal("p_pana_la" in argumenteleCautarii({ cautare: "inel", stare: "", perioada: "o-luna" }, ACUM), false);
  });

  test("adresa poarta zilele, iar formularul le trimite cu aceleasi nume", () => {
    assert.equal(
      adresaComenzilor({ ...FARA_FILTRE, cautare: "popescu", deLa: "2026-11-15", panaLa: "2026-11-30" }),
      "/cont/comenzi?q=popescu&de_la=2026-11-15&pana_la=2026-11-30",
    );
    const f = { cautare: "0722 123 456", stare: "expediata", perioada: "", deLa: "2026-11-01", panaLa: "2026-11-30" } as const;
    assert.deepEqual(citesteFiltrele(Object.fromEntries(new URLSearchParams(parametriiFiltrelor(f)))), f);
    const bara = citeste("src/components/storefront/cont/ecrane/CautareComenzi.tsx");
    for (const nume of ['name="de_la"', 'name="pana_la"']) assert.ok(bara.includes(nume), nume);
    const ecran = citeste("src/components/storefront/cont/ecrane/EcranComenzi.tsx");
    assert.ok(ecran.includes('<form method="post" action="/api/cont/comenzi/raport"'));
    for (const nume of ["q", "stare", "perioada", "de_la", "pana_la"]) assert.ok(ecran.includes('type="hidden" name="' + nume + '"'), nume);
  });

  test("⚠ un telefon sau un AWB scris cu spatii pleaca lipit; restul textului, neatins", () => {
    assert.equal(textulDeCautat("0722 123 456"), "0722123456");
    assert.equal(textulDeCautat("+40 722 123 456"), "40722123456");
    assert.equal(textulDeCautat("(0722) 123-456"), "0722123456");
    assert.equal(textulDeCautat("813 825 038 89"), "81382503889", "AWB citit de pe eticheta");
    assert.equal(textulDeCautat("12 34"), "12 34", "putine cifre: raman cuvinte, ca numerele de comanda");
    assert.equal(textulDeCautat("inel 16"), "inel 16");
    assert.equal(textulDeCautat("#1337"), "#1337");
    assert.deepEqual(argumenteleCautarii({ ...FARA_FILTRE, cautare: "0722 123 456" }, ACUM), { p_cautare: "0722123456" });
  });

  test("forma veche iese, cele noi sunt chemate NUMAI de server", () => {
    const sem8 = "uuid, uuid, integer, integer, text, text, timestamptz, timestamptz";
    const semRaport = "uuid, uuid, text, text, timestamptz, timestamptz, integer";
    assert.ok(MIGRATIE_NOUA.includes("drop function if exists public.cont_comenzile_mele(uuid, uuid, integer, integer, text, text, timestamptz);"));
    for (const f of ["public.cont_comenzile_mele(" + sem8 + ")", "public.cont_raportul_comenzilor(" + semRaport + ")"]) {
      assert.ok(MIGRATIE_NOUA.includes("revoke all on function " + f + " from public, anon, authenticated;"), f);
      assert.ok(MIGRATIE_NOUA.includes("grant execute on function " + f + " to service_role;"), f);
    }
    for (const f of ["privat.cont_awburile_comenzii(uuid)", "privat.cont_potrivire_destinatar(text, text, text, text)"]) {
      assert.ok(MIGRATIE_NOUA.includes("revoke all on function " + f + " from public, anon, authenticated;"), f);
    }
    assert.ok(MIGRATIE_NOUA.includes("notify pgrst, 'reload schema';"));
    assert.ok(CORP_NOU.includes("p_pana_la timestamptz default null"));
  });

  test("⚠ corpul din 19.10.2026 se regaseste intreg, in ordine: filtrele se ADAUGA", () => {
    const veche = citeste("migrations/2026-10-19-conturi-clienti-cautarea-in-comenzi.sql");
    const corpVechi = veche.slice(veche.indexOf("language sql stable security definer"), veche.indexOf("$fn$;"))
      .split("\n").map((r) => r.trim()).filter(Boolean);
    const nou = CORP_NOU.split("\n").map((r) => r.trim()).filter(Boolean);
    let j = 0;
    for (const r of corpVechi) {
      while (j < nou.length && nou[j] !== r) j++;
      assert.ok(j < nou.length, "din corpul de dinainte lipseste: " + r);
      j++;
    }
  });

  test("⚠⚠ poarta vederii: destinatarul, telefonul si AWB-ul se cauta si se arata numai la vederea intreaga", () => {
    const linie = "or (l.vedere = 'intreaga' and privat.cont_potrivire_destinatar(t.tipar, o.customer_name, o.customer_phone, a.awburi))";
    assert.ok(CORP_NOU.includes(linie));
    assert.ok(CORP_NOU.includes("select case when c.tipare <> '{}' and l.vedere = 'intreaga' then privat.cont_awburile_comenzii(o.id) end as awburi"));
    for (const coloana of ["o.customer_name", "o.customer_phone", "o.shipping_address"]) {
      assert.ok(CORP_RAPORT.includes("case when l.vedere = 'intreaga' then " + coloana + " end"), coloana);
    }
    assert.ok(CORP_RAPORT.includes("select case when l.vedere = 'intreaga' then privat.cont_awburile_comenzii(o.id) end as awburi"));
    /* In afara acestor porti, numele si telefonul nu apar nicaieri in cele doua corpuri. */
    for (const corp of [CORP_NOU, CORP_RAPORT]) {
      const faraPorti = corp.split("\n").filter((r) => !r.includes("l.vedere = 'intreaga'")).join("\n");
      assert.doesNotMatch(faraPorti, /customer_name|customer_phone|shipping_address|cont_awburile_comenzii/);
    }
  });

  test("⚠ lista si raportul filtreaza cu ACELASI bloc, litera cu litera", () => {
    const f = filtrele(CORP_NOU);
    assert.ok(f.length > 400, "blocul de filtre nu s-a gasit");
    assert.equal(filtrele(CORP_RAPORT), f);
    assert.ok(f.includes("and (p_pana_la is null or o.created_at <= p_pana_la)"));
    /* Raportul nu pagineaza, dar are plafon, iar totalul gasit vine pe rand. */
    assert.ok(CORP_RAPORT.includes("limit greatest(1, least(5000, coalesce(p_limita, 2000)));"));
    assert.ok(CORP_RAPORT.includes("count(*) over ()"));
  });

  test("telefonul se compara pe cifre, AWB-ul de la patru caractere, numai pentru cuvinte lungi", () => {
    const ajutor = corpulFunctiei("create or replace function privat.cont_potrivire_destinatar(");
    assert.ok(ajutor.includes("or (length(v.cuvant) >= 4 and lower(coalesce(p_awburi, '')) like p_tipar)"));
    assert.ok(ajutor.includes("or (v.cuvant ~ '^[0-9+]+$' and length(v.cifre) >= 6 and t.forme like '%' || v.cifre || '%')"));
    assert.ok(ajutor.includes("d.c || ' 0' || d.n || ' 40' || d.n || ' 0040' || d.n as forme"), "cele trei scrieri ale numarului");
    /* AWB-urile: o singura lista de coloane, cu numarul partenerului (DPD prin Curiera) in ea. */
    const awburi = corpulFunctiei("create or replace function privat.cont_awburile_comenzii(");
    for (const c of ["o.curiera_awb_number", "o.curiera_partener_awb", "o.dpd_awb_number", "o.epacket_awb_number"]) assert.ok(awburi.includes(c), c);
  });
});
