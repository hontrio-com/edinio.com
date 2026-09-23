import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MESAJ_UNIC, MESAJ_SMS_INCA_NU } from "./cod";

/*
 * Probele astea aduna regulile pe care le-au gasit sase sceptici peste Etapele A
 * si B, si le apara PE SURSA, nu pe apelant: un al doilea drum scris maine ar
 * ocoli o proba care masoara doar ce face codul de azi.
 */

const RAD = process.cwd();
const citeste = (p: string) => readFileSync(join(RAD, p), "utf8").replace(/\r\n/g, "\n");

function fisiereDin(dir: string, ext: string[]): string[] {
  const iesire: string[] = [];
  const mergi = (d: string) => {
    for (const n of readdirSync(join(RAD, d))) {
      const rel = `${d}/${n}`;
      if (statSync(join(RAD, rel)).isDirectory()) mergi(rel);
      else if (ext.some((e) => n.endsWith(e))) iesire.push(rel);
    }
  };
  mergi(dir);
  return iesire;
}

/** Tot ce se vede sau se scrie in zona de cont. */
const ACEST_FISIER = "src/lib/cont/regulile-contului.test.ts";

const ZONA_CONT = [
  ...fisiereDin("src/lib/cont", [".ts"]).filter((p) => p !== ACEST_FISIER),
  ...fisiereDin("src/app/api/cont", [".ts"]),
  ...fisiereDin("src/app/(public)/[slug]/cont", [".tsx"]),
  "src/components/storefront/cont/FormularIntrare.tsx",
  "src/components/storefront/cont/RotesteJetonul.tsx",
  "src/components/public/DoarInAfaraContului.tsx",
];

const MIGRATII_CONT = fisiereDin("migrations", [".sql"]).filter((p) => p.includes("conturi-clienti"));

/* ═══ Scrierea ═══ */

test("semnul lung nu intra in zona de cont", () => {
  for (const p of [...ZONA_CONT, ...MIGRATII_CONT]) {
    /* ⚠ Cautat prin COD, nu scris literal: altfel proba ar cadea pe ea insasi,
       si prima reparatie ar fi fost sa o slabim. */
    const semnulLung = String.fromCharCode(0x2014);
    assert.equal(citeste(p).includes(semnulLung), false, `${p} are semnul lung`);
  }
});

test("H6: ecranele noi se scriu fara diacritice", () => {
  /* ⚠ Numai TEXTUL care ajunge la om. Codul si comentariile sunt in aceeasi
     limba, deci se masoara fisierul intreg; asa a fost usor de tinut curat. */
  const ecrane = ZONA_CONT.filter((p) => p.endsWith(".tsx"));
  assert.ok(ecrane.length >= 5, "nu am gasit ecranele de cont");
  for (const p of ecrane) {
    const gasite = citeste(p).match(/[ăâîșțĂÂÎȘȚ]/g);
    assert.equal(gasite, null, `${p} are diacritice: ${gasite?.slice(0, 5).join("")}`);
  }
});

/* ═══ Regula de marketplace ═══ */

test("regula de marketplace se scrie NUMAI cu coalesce", () => {
  /*
    ⚠⚠ `not (order_source ? 'marketplace')` intoarce NULL pentru un
    `order_source` NULL, iar `where` nu trece randul. Masurat pe productie pe
    23.09.2026: 64 de comenzi au `order_source` NULL, la 15 magazine, deci forma
    fara `coalesce` da 279 de comenzi in loc de 343.
  */
  /* ⚠ Se masoara SQL-ul executabil, nu comentariile: forma gresita e scrisa
     dinadins in comentarii, ca sa se stie de ce nu se foloseste. */
  const faraComentarii = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*--.*$/gm, " ");
  for (const p of MIGRATII_CONT) {
    const s = faraComentarii(citeste(p));
    const fara = s.match(/not\s*\(\s*\w+\.order_source\s*\?\s*'marketplace'\s*\)/g);
    assert.equal(fara, null, `${p} foloseste forma fara coalesce: ${fara?.[0]}`);
  }
  const citiri = MIGRATII_CONT.map(citeste).join("\n");
  assert.ok(
    /not\s+coalesce\(\s*o\.order_source\s*\?\s*'marketplace'\s*,\s*false\s*\)/.test(citiri),
    "nu am gasit deloc forma cu coalesce; regula a disparut?",
  );
});

/* ═══ Vederea redusa ═══ */

test("vederea redusa lasa sa iasa DOAR numarul, data, starea, liniile si totalul", () => {
  /*
    ⚠⚠ Sase campuri treceau pe langa poarta, printre care NUMELE CURIERULUI, care
    statea chiar intre doua randuri imbracate in `case`. Proba masoara SURSA
    functiei, nu un apel: un camp adaugat maine fara `case` cade aici.
  */
  const s = citeste("migrations/2026-09-23-conturi-clienti-reparatii.sql");
  const inceput = s.indexOf("create function public.cont_comanda_mea");
  assert.ok(inceput > 0, "nu am gasit cont_comanda_mea in migratia de reparatii");
  const corp = s.slice(inceput, s.indexOf("$fn$;", inceput));

  /* Ce are voie sa iasa neimbracat, fiindca vederea redusa chiar le arata. */
  const ingaduite = [
    "o.id", "o.order_number", "o.created_at", "o.status", "o.total",
    "public.comanda_incasata", "l.vedere",
  ];
  for (const camp of ["o.payment_method", "o.subtotal", "o.shipping_cost", "o.discount_amount", "o.cod_fee_amount", "awb.curier", "awb.awb", "awb.url"]) {
    const tipar = new RegExp(`case when l\\.vedere = 'intreaga' then ${camp.replace(".", "\\.")}`);
    assert.ok(tipar.test(corp), `${camp} iese pe langa poarta vederii`);
  }
  for (const camp of ingaduite) {
    assert.ok(corp.includes(camp), `${camp} a disparut din vederea redusa`);
  }
});

test("presetarea lui `vedere` e cea saraca", () => {
  const s = citeste("migrations/2026-09-23-conturi-clienti-reparatii.sql");
  assert.ok(
    /alter column vedere set default 'redusa'/.test(s),
    "presetarea lui `vedere` trebuie sa cada INCHIS",
  );
});

/* ═══ Un singur raspuns ═══ */

test("cererea de cod raspunde la fel in toate cazurile in care nu s-a trimis nimic", () => {
  /*
    ⚠ Singura iesire care are voie sa spuna altceva e cea de TELEFON, fiindca
    acolo chiar nu s-a scris nimic si nu se va trimite nimic: un „codul a plecat"
    ar fi fost o minciuna, nu o taina.
  */
  const s = citeste("src/lib/cont/cod.ts");
  const corp = s.slice(s.indexOf("export async function cereCod"), s.indexOf("export async function verificaCod"));
  const intoarceri = corp.match(/return \{ mesaj: (\w+)/g) ?? [];
  assert.ok(intoarceri.length >= 5, "prea putine iesiri gasite, proba nu masoara nimic");
  for (const i of intoarceri) {
    assert.ok(
      i.includes("MESAJ_UNIC") || i.includes("MESAJ_SMS_INCA_NU"),
      `iesire cu alt mesaj: ${i}`,
    );
  }
  assert.notEqual(MESAJ_UNIC, MESAJ_SMS_INCA_NU);
  assert.match(MESAJ_SMS_INCA_NU, /telefon/i);
});

test("SMS-ul se refuza INAINTE sa se scrie ceva in baza", () => {
  /*
    ⚠ Prima scriere chema `cont_cere_cod` si abia dupa aceea se oprea: randul era
    scris, consuma bugetul zilnic de SMS, iar omul primea „codul a plecat".
  */
  const s = citeste("src/lib/cont/cod.ts");
  const corp = s.slice(s.indexOf("export async function cereCod"), s.indexOf("export async function verificaCod"));
  const pozitieRefuz = corp.indexOf('fel === "telefon"');
  const pozitieRpc = corp.indexOf('rpc("cont_cere_cod"');
  assert.ok(pozitieRefuz > 0 && pozitieRpc > 0, "nu am gasit ce masor");
  assert.ok(pozitieRefuz < pozitieRpc, "refuzul SMS-ului trebuie sa fie INAINTEA apelului catre baza");
});

/* ═══ Identitatea nu vine din cerere ═══ */

test("niciun fisier din zona de cont nu paseaza `p_cont` sau `p_business` dintr-o cerere", () => {
  for (const p of ZONA_CONT.filter((x) => x.endsWith(".ts"))) {
    const s = citeste(p);
    for (const rau of ["p_cont: corp", "p_business: corp", "p_cont: req", "p_business: req", "searchParams.get"]) {
      assert.equal(s.includes(rau), false, `${p} ia identitatea din cerere: ${rau}`);
    }
  }
});

test("rutele care scriu cer originea magazinului", () => {
  /*
    ⚠ `req.json()` nu se uita la `Content-Type`, deci un formular de pe alt site
    putea trimite corpul cu cookie-ul omului. Iesirea din cont e scutita dinadins:
    o cerere straina care te DEconecteaza e o suparare, nu o bresa, iar o poarta
    aici ar fi inchis singura usa de iesire.
  */
  /*
    ⚠ POPULATIA E „CE EXPORTA `POST`", nu „toate rutele". Regula apara scrierile:
    o cerere straina care declanseaza o SCRIERE cu cookie-ul omului e o bresa, pe
    cand una care doar cere o citire nu castiga nimic (raspunsul nu se poate citi
    cross-origin). Prima scriere a probei cerea poarta de la toate, si a cazut pe
    ruta de factura, care e un GET. Slabirea ar fi fost sa scot ruta pe nume;
    corect e sa numesc regula adevarata.
  */
  const cuScriere = fisiereDin("src/app/api/cont", [".ts"])
    .filter((p) => /export async function POST/.test(citeste(p)))
    .filter((p) => !p.includes("/iesire/"));
  assert.ok(cuScriere.length >= 3, "nu am gasit rutele care scriu");
  for (const p of cuScriere) {
    assert.ok(citeste(p).includes("vineDePeMagazin(req)"), `${p} nu verifica originea`);
  }
});

/* ═══ Plasa de rotire nu e cod mort ═══ */

test("rotirea jetonului chiar se cheama de undeva", () => {
  /*
    ⚠ Toata masinaria de rotire si de detectie a refolosirii era scrisa si
    NECHEMATA: `roteste()` nu era importata nicaieri, deci ramura de „jeton
    refolosit" nu se aprindea niciodata. O aparare care nu ruleaza arata exact ca
    una care ruleaza.
  */
  const toate = [...fisiereDin("src/app", [".ts", ".tsx"]), ...fisiereDin("src/components", [".tsx"])];
  const apelanti = toate.filter((p) => citeste(p).includes("roteste("));
  assert.ok(apelanti.length > 0, "`roteste()` nu e chemata de nicaieri");
  const declansatori = toate.filter((p) => citeste(p).includes("/api/cont/atinge"));
  assert.ok(declansatori.length > 0, "nimeni nu cheama ruta care roteste");
});

/* ═══ Pixelii nu intra in zona de cont ═══ */

test("pixelii comerciantului nu se randeaza pe paginile de cont", () => {
  const layout = citeste("src/app/(public)/[slug]/layout.tsx");
  const inceput = layout.indexOf("<DoarInAfaraContului>");
  const sfarsit = layout.indexOf("</DoarInAfaraContului>");
  assert.ok(inceput > 0 && sfarsit > inceput, "blocul de pixeli nu e inchis in `DoarInAfaraContului`");
  const inauntru = layout.slice(inceput, sfarsit);
  for (const c of ["FacebookPixel", "TikTokPixel", "GoogleTag", "AttributionCapture"]) {
    assert.ok(inauntru.includes(c), `${c} a iesit din poarta zonei de cont`);
  }
});

/* ═══ Niciun contact in jurnalul fara retentie ═══ */

/**
 * `${valoare}` interpolata intr-un sir.
 *
 * ⚠⚠ `String.raw`, si nu concatenare de siruri cu `\\`. Prima scriere a compus
 * tiparul din `"\\$\\{\\s*"`, escaparile s-au pierdut pe drumul prin unealta
 * care a scris fisierul, si in fisier a ramas `"\$\{\s*"`. In JavaScript alea nu
 * sunt escapari de regex, sunt escapari de SIR: devin `${s*` si un caracter de
 * backspace. Adica tiparul nu potrivea niciodata nimic, iar proba trecea vesel
 * fara sa masoare nimic. A prins-o lintul, nu eu.
 */
function tiparDeInterpolare(nume: string): RegExp {
  return new RegExp(String.raw`\$\{\s*` + nume + String.raw`\b`);
}

test("proba de mai jos chiar potriveste ceva", () => {
  /* ⚠ O plasa care nu prinde nimic arata exact ca una care nu are ce prinde.
     Se dovedeste pe un exemplu RAU si pe unul BUN. */
  assert.equal(tiparDeInterpolare("email").test("logError({ message: `a esuat ${email}` })"), true);
  assert.equal(tiparDeInterpolare("cod").test('logError({ action: "cont/cod" })'), false);
});

test("nicio ruta de cont nu scrie contacte in error_logs", () => {
  for (const p of fisiereDin("src/app/api/cont", [".ts"])) {
    const s = citeste(p);
    const apeluri = s.match(/logError\(\{[\s\S]*?\}\)/g) ?? [];
    for (const a of apeluri) {
      /* ⚠ Se cauta INTERPOLAREA unei valori, nu un subsir: `action: "cont/cod"`
         contine „cod" si e cu totul altceva decat codul omului. */
      for (const rau of ["destinatie", "email", "cod", "ip", "corp"]) {
        const tipar = tiparDeInterpolare(rau);
        assert.equal(tipar.test(a), false, `${p} scrie valoarea „${rau}" in error_logs, care nu are retentie`);
      }
    }
  }
});
