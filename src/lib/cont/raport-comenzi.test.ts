import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { celulaFoii, foaiaExportului } from "@/lib/orders/export-comenzi";
import { FARA_FILTRE } from "./cautare-comenzi";
import { numeleRaportului, RAPORT_MAX, tabelulRaportului, type RandRaport } from "./raport-comenzi";

/*
 * Raportul de comenzi din contul clientului (cerut pe 23.11.2026): toate comenzile filtrului de pe
 * ecran, intr-un fisier .xlsx. Datele sunt inventate.
 */

const citeste = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const rand = (r: Partial<RandRaport>): RandRaport => ({
  numar: "#0412", creataLa: "2026-11-20T08:15:00.000Z", stare: "shipped", incasata: false, total: 149.9,
  destinatar: "Maria Ionescu", telefon: "0722000111",
  adresa: { address: "Str. Lunga 5", city: "Brasov", county: "Brasov", postal_code: "500001" },
  awburi: "711000001 81400000001", produse: "2 x Inel argint; 1 x Bratara", bucati: 3,
  ...r,
});

describe("Tabelul raportului", () => {
  const t = tabelulRaportului([
    rand({}),
    /* Vederea redusa: baza a ascuns deja destinatarul, telefonul, adresa si AWB-ul. */
    rand({ numar: "#0399", stare: "refunded", incasata: false, destinatar: null, telefon: null, adresa: null, awburi: null }),
    rand({ numar: "#0380", stare: "delivered", incasata: true, adresa: { street: "Garii", street_no: "7", city: "Cluj-Napoca", county: "Cluj", postalCode: "400001" } }),
  ]);
  const col = (antet: string) => t.antete.indexOf(antet);

  test("coloanele raportului, cu fiecare rand la lungimea antetului", () => {
    assert.deepEqual(t.antete, [
      "Comanda", "Data", "Stare", "Incasata", "Total", "Destinatar", "Telefon", "Adresa", "Localitate", "Judet", "Cod postal",
      "AWB", "Bucati", "Produse",
    ]);
    assert.equal(t.latimi.length, t.antete.length);
    for (const r of t.randuri) assert.equal(r.length, t.antete.length);
    /* Text de vitrina: fara diacritice. */
    assert.doesNotMatch(t.antete.join(" "), /[ăâîșțĂÂÎȘȚ]/);
  });

  test("un rand intreg: cine primeste, unde, cu ce AWB si ce", () => {
    const r = t.randuri[0];
    assert.equal(r[col("Comanda")], "#0412");
    assert.deepEqual(r[col("Data")], { data: "2026-11-20T08:15:00.000Z" });
    assert.equal(r[col("Stare")], "Expediata");
    assert.equal(r[col("Incasata")], "Nu");
    assert.equal(r[col("Total")], 149.9);
    assert.equal(r[col("Destinatar")], "Maria Ionescu");
    assert.equal(r[col("Telefon")], "0722000111");
    assert.equal(r[col("Adresa")], "Str. Lunga 5");
    assert.equal(r[col("Localitate")], "Brasov");
    assert.equal(r[col("Cod postal")], "500001");
    assert.equal(r[col("AWB")], "711000001 81400000001");
    assert.equal(r[col("Bucati")], 3);
    assert.equal(r[col("Produse")], "2 x Inel argint; 1 x Bratara");
  });

  test("⚠ la vederea redusa celulele cu date personale raman goale, restul se vede", () => {
    const r = t.randuri[1];
    for (const antet of ["Destinatar", "Telefon", "Adresa", "Localitate", "Judet", "Cod postal", "AWB"]) {
      assert.equal(r[col(antet)], null, antet);
    }
    assert.equal(r[col("Comanda")], "#0399");
    assert.equal(r[col("Stare")], "Rambursata");
    assert.equal(r[col("Produse")], "2 x Inel argint; 1 x Bratara");
  });

  test("adresa veche (strada si numar separate) iese pe o linie, codul postal din oricare scriere", () => {
    const r = t.randuri[2];
    assert.equal(r[col("Adresa")], "Garii 7");
    assert.equal(r[col("Cod postal")], "400001");
    assert.equal(r[col("Incasata")], "Da");
  });

  test("foaia: totalul ramane numar, data ramane data", () => {
    const foaie = foaiaExportului(t);
    assert.equal(foaie.length, 4);
    assert.deepEqual(foaie[0][0], { value: "Comanda", fontWeight: "bold" });
    assert.deepEqual(celulaFoii(149.9), { value: 149.9, type: Number, format: "#,##0.00" });
    const data = foaie[1][1] as { value: Date; type: DateConstructor };
    assert.equal(data.type, Date);
    /* 08:15 UTC in noiembrie = 10:15 la Bucuresti. */
    assert.equal(data.value.toISOString(), "2026-11-20T10:15:00.000Z");
  });

  test("numele fisierului poarta perioada ceruta pe zile", () => {
    assert.equal(numeleRaportului("magazin", FARA_FILTRE, "2026-11-23"), "comenzi-magazin-2026-11-23.xlsx");
    assert.equal(numeleRaportului("magazin", { ...FARA_FILTRE, deLa: "2026-11-15", panaLa: "2026-11-30" }, "2026-11-23"), "comenzi-magazin-2026-11-15_2026-11-30.xlsx");
    assert.equal(numeleRaportului("magazin", { ...FARA_FILTRE, deLa: "2026-11-15" }, "2026-11-23"), "comenzi-magazin-2026-11-15_2026-11-23.xlsx");
    assert.equal(numeleRaportului("magazin", { ...FARA_FILTRE, panaLa: "2026-11-30" }, "2026-11-23"), "comenzi-magazin-inceput_2026-11-30.xlsx");
  });
});

describe("Ruta raportului", () => {
  const ruta = citeste("src/app/api/cont/comenzi/raport/route.ts");

  test("⚠ POST cu poarta de origine, sesiunea contului si fara pastrare in memorie", () => {
    assert.match(ruta, /export async function POST\(req: NextRequest\)/);
    assert.doesNotMatch(ruta, /export async function GET/);
    assert.match(ruta, /if \(!vineDePeMagazin\(req\)\) return new NextResponse\("Forbidden", \{ status: 403 \}\);/);
    assert.match(ruta, /s = await sesiuneCurenta\(magazin\.id\);/);
    assert.match(ruta, /if \(!s\) return NextResponse\.redirect\(new URL\("\/cont\/intra", req\.nextUrl\.origin\), 303\);/);
    assert.match(ruta, /"Cache-Control": "private, no-store"/);
    /* Magazinul vine din gazda cererii, contul din sesiune: niciunul din formular. */
    assert.match(ruta, /raportulComenzilor\(magazin\.id, s\.contId, filtre\)/);
  });

  test("filtrele se citesc cu ACEEASI functie ca lista, din campurile cu numele din adresa", () => {
    assert.match(ruta, /const filtre = citesteFiltrele\(await camp\(\)\);/);
    assert.match(ruta, /for \(const nume of \["q", "stare", "perioada", "de_la", "pana_la"\]\)/);
    const lib = citeste("src/lib/cont/raport-comenzi.ts");
    assert.match(lib, /\.rpc\("cont_raportul_comenzilor", \{/);
    assert.match(lib, /\.\.\.argumenteleCautarii\(filtre, new Date\(\)\),/);
    assert.match(lib, /p_limita: RAPORT_MAX,/);
  });

  test("raportul gol si eroarea il intorc pe om in lista, cu filtrele lui; plafonul se spune in fisier", () => {
    assert.match(ruta, /if \(randuri\.length === 0\) return inapoi\("gol"\);/);
    assert.match(ruta, /return inapoi\("eroare"\);/);
    assert.match(ruta, /if \(total > randuri\.length\) \{/);
    assert.ok(RAPORT_MAX >= 1000);
    const pagina = citeste("src/app/(public)/[slug]/cont/comenzi/page.tsx");
    assert.match(pagina, /gol: "Nu exista comenzi in filtrul ales, deci raportul ar fi gol\."/);
    assert.match(pagina, /mesajRaport=\{typeof sp\.raport === "string" \? MESAJE_RAPORT\[sp\.raport\] \?\? null : null\}/);
  });
});
