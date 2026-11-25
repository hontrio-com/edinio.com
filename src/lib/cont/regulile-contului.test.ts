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

/*
  ⚠ TOATE componentele contului, nu o lista numita: pana pe 23.09.2026 aici
  stateau doua fisiere din sase, deci probele H6 si ale semnului lung treceau
  verzi peste componente pe care nu le citeau.
*/
const ZONA_CONT = [
  ...fisiereDin("src/lib/cont", [".ts"]).filter((p) => p !== ACEST_FISIER),
  ...fisiereDin("src/app/api/cont", [".ts"]),
  ...fisiereDin("src/app/(public)/[slug]/cont", [".tsx"]),
  ...fisiereDin("src/components/storefront/cont", [".ts", ".tsx"]),
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
  /*
    ⚠⚠ SE CITESTE DEFINITIA CARE TINE, adica ULTIMA APLICATA. Proba citea migratia
    43, iar migratia 47 a refacut functia cu sase campuri de bani in plus: verde pe
    definitia veche, n-ar fi pazit niciunul. Si numele fisierelor NU dau ordinea
    (au toate aceeasi data, iar „banii-comenzii” iese alfabetic primul), deci
    ordinea e scrisa aici, iar o definitie noua pe care proba n-o cunoaste o
    face sa cada, nu sa ramana in urma.
  */
  const DEFINITII_IN_ORDINEA_APLICARII = [
    "migrations/2026-09-23-conturi-clienti-citirile.sql",
    "migrations/2026-09-23-conturi-clienti-reparatii.sql",
    "migrations/2026-09-23-conturi-clienti-banii-comenzii.sql",
    "migrations/2026-09-23-conturi-clienti-comanda-completa.sql",
    "migrations/2026-09-23-conturi-clienti-obligatoriu-si-curier.sql",
    "migrations/2026-09-29-curiera-curier.sql",
    "migrations/2026-10-07-epacket-curier.sql",
  ];
  const definesteFunctia = /create\s+(or\s+replace\s+)?function\s+public\.cont_comanda_mea\s*\(/;
  const gasite = fisiereDin("migrations", [".sql"]).filter((p) => definesteFunctia.test(citeste(p)));
  assert.deepEqual(
    [...gasite].sort(),
    [...DEFINITII_IN_ORDINEA_APLICARII].sort(),
    "cont_comanda_mea e definita intr-o migratie pe care proba n-o stie; pune-o la coada listei, e cea care tine",
  );

  const s = citeste(DEFINITII_IN_ORDINEA_APLICARII[DEFINITII_IN_ORDINEA_APLICARII.length - 1]);
  const m = definesteFunctia.exec(s);
  assert.ok(m, "nu am gasit cont_comanda_mea in ultima ei migratie");
  const corp = s.slice(m.index, s.indexOf("$fn$;", m.index));

  /*
    ⚠ `comanda_incasata` primeste metoda de plata ca sa intoarca UN BIT, „incasat”,
    pe care vederea redusa il arata. Metoda nu iese de acolo, deci apelul se scoate
    din numaratoarea de mai jos, pe nume, si numai el.
  */
  const apelIncasata = /public\.comanda_incasata\([^)]*\)/g;
  assert.equal((corp.match(apelIncasata) ?? []).length, 1, "apelul lui comanda_incasata s-a schimbat; reciteste proba");
  const faraIncasata = corp.replace(apelIncasata, "");

  /* Ce are voie sa iasa neimbracat, fiindca vederea redusa chiar le arata. */
  const ingaduite = [
    "o.id", "o.order_number", "o.created_at", "o.status", "o.total",
    "public.comanda_incasata", "l.vedere",
  ];
  for (const camp of [
    "o.payment_method", "o.subtotal", "o.shipping_cost", "o.discount_amount", "o.cod_fee_amount",
    "o.card_discount_amount", "o.cod_discount_amount", "o.discount_code", "o.vat_amount", "o.vat_rate",
    "o.prices_include_vat", "o.offer_discount_amount", "o.notes",
    "awb.curier", "awb.awb", "awb.url", "awb.emis_la", "awb.curier_real",
    "privat.cont_documentul_comenzii", "privat.cont_personalizarea_liniei", "privat.cont_defalcarea_liniei",
  ]) {
    const nume = camp.replace(".", "\\.");
    const imbracate = corp.match(new RegExp(`case when l\\.vedere = 'intreaga' then ${nume}\\b`, "g")) ?? [];
    /* ⚠ TOATE aparitiile, nu macar una: un camp scris o data imbracat si o data
       liber ar fi trecut de o proba care cere doar sa existe forma buna. */
    const toate = faraIncasata.match(new RegExp(`(?<![\\w.])${nume}\\b`, "g")) ?? [];
    assert.ok(imbracate.length > 0, `${camp} iese pe langa poarta vederii`);
    assert.equal(toate.length, imbracate.length, `${camp} apare si NEIMBRACAT in functie`);
  }
  for (const camp of ingaduite) {
    assert.ok(corp.includes(camp), `${camp} a disparut din vederea redusa`);
  }
  /*
    ⚠⚠ PERSONALIZAREA NU SE CITESTE IN CORPUL FUNCTIEI. Liniile ies si pe vederea
    redusa, deci o cheie citita direct aici (`li->'customization'`) ar scapa pe
    langa poarta. Se citeste NUMAI prin ajutoarele de mai sus, imbracate in `case`.
  */
  for (const rau of ["->'customization'", "->'personalizare'", "->>'customization'"]) {
    assert.equal(corp.includes(rau), false, `corpul citeste direct ${rau}`);
  }
});

test("⚠⚠ si celelalte citiri tin poarta vederii", () => {
  const s = citeste("migrations/2026-09-23-conturi-clienti-comanda-completa.sql");
  const corpul = (antet: string) => {
    const i = s.indexOf(antet);
    assert.ok(i > 0, `nu am gasit ${antet}`);
    return s.slice(i, s.indexOf("$fn$;", i));
  };

  /* Lista: `are_factura` spune ca exista un document, deci e fals la vederea redusa. */
  const lista = corpul("create function public.cont_comenzile_mele");
  assert.ok(
    lista.includes("case when l.vedere = 'intreaga' then privat.cont_documentul_comenzii(o) is not null else false end"),
    "`are_factura` iese pe langa poarta vederii",
  );

  /* Facturile si retururile: vederea redusa nu produce DELOC rand. */
  for (const antet of ["create or replace function public.cont_facturile_mele", "create function public.cont_retururile_mele"]) {
    assert.ok(corpul(antet).includes("and l.vedere = 'intreaga'"), `${antet} n-are poarta vederii in WHERE`);
  }

  /* Rezumatul numara cu ACELEASI predicate ca listele. */
  const rezumat = corpul("create or replace function public.cont_rezumat");
  assert.equal(rezumat.split("l.vedere = 'intreaga'").length - 1, 2, "facturile si retururile din rezumat trebuie sa ceara vederea intreaga");
  assert.ok(rezumat.includes("not coalesce(o.order_source ? 'marketplace', false)"), "rezumatul numara si facturi de marketplace");

  /*
    Nicio adresa de furnizor nu iese din documentul comenzii: coloanele `*_url` si
    `*_link` au voie sa apara NUMAI ca intrare pentru garda de test sau pentru
    „exista link?", niciodata ca valoare intoarsa.
  */
  const doc = corpul("create or replace function privat.cont_documentul_comenzii");
  const randuri = doc.split("\n").filter((r) => r.includes("_url") || r.includes("_link"));
  assert.ok(randuri.length > 0, "nu am gasit ce masor");
  for (const r of randuri) {
    assert.ok(
      r.includes("cont_e_document_de_test(") || r.includes("nullif(btrim(coalesce("),
      `documentul poate scoate o adresa de furnizor: ${r.trim()}`,
    );
  }
});

/* ═══ Tema magazinului, nu a panoului ═══ */

test("⚠⚠ zona de cont nu foloseste tokenii panoului si nici culoarea bruta a magazinului", () => {
  /*
    Paginile de cont foloseau `text-foreground`, `ring-foreground/10` si
    `businesses.primary_color` cu `text-white` peste: pe Casa Lumen iesea verdele
    Edinio, iar la 55 din 71 de magazine albul pe culoarea primara e sub 4,5:1.
  */
  const ecrane = ZONA_CONT.filter((p) => p.endsWith(".tsx"));
  assert.ok(ecrane.length >= 20, "nu am gasit ecranele de cont");
  const interzise = [
    "text-foreground", "text-muted-foreground", "ring-foreground/", "bg-primary ", 'bg-primary"',
    "text-white", "bg-red-600", "text-red-600", "p.color", "pag.color",
  ];
  for (const p of ecrane) {
    const t = citeste(p);
    for (const rau of interzise) {
      assert.equal(t.includes(rau), false, `${p} foloseste ${rau}`);
    }
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
  /* ⚠ Cu `niciDupaIesire`: vezi proba urmatoare. */
  const inceput = layout.indexOf("<DoarInAfaraContului slug={slug} niciDupaIesire>");
  const sfarsit = layout.indexOf("</DoarInAfaraContului>");
  assert.ok(inceput > 0 && sfarsit > inceput, "blocul de pixeli nu e inchis in `DoarInAfaraContului niciDupaIesire`");
  const inauntru = layout.slice(inceput, sfarsit);
  for (const c of ["FacebookPixel", "TikTokPixel", "GoogleTag", "AttributionCapture", "TheMarketerTracking"]) {
    assert.ok(inauntru.includes(c), `${c} a iesit din poarta zonei de cont`);
  }
});

/*
  ⚠⚠ PIXELII SI ZONA DE CONT NU IMPART NICIODATA ACELASI DOCUMENT (25.11.2026, gasit la recenzie).

  Intrarea era pazita din 24.09.2026 (`ActiuneCont` e un `<a>`), iesirea nu: din `/cont/comenzi/<id>` se
  ajungea pe pagina unui produs printr-un `<Link>`, fara reincarcare. Pixelii se montau atunci in documentul
  incarcat in zona de cont, iar la „Inapoi” ramaneau vii acolo: numararea paginilor dupa istoric (pornita din
  oficiu la GA4 si la pixelul Meta) trimitea adresa cu identificatorul comenzii. Scriptul unui pixel odata
  incarcat nu mai poate fi scos din pagina.

  Doua paze, amandoua probate mai jos:
    1. un document incarcat in zona de cont nu mai primeste pixeli deloc (`niciDupaIesire`);
    2. legaturile din ecranele contului care duc in magazin sunt `<a>`, ca masuratoarea sa nu piarda nimic.
*/
test("un document incarcat in zona de cont nu mai primeste pixeli nici dupa ce omul iese din ea", () => {
  const c = citeste("src/components/public/DoarInAfaraContului.tsx");
  /* Starea se citeste o singura data, din adresa cu care s-a incarcat documentul. */
  assert.ok(c.includes('const [incarcatInCont] = useState(() => typeof window !== "undefined" && eZonaDeCont(window.location.pathname, slug));'));
  assert.ok(c.includes("if (niciDupaIesire && incarcatInCont) return null;"), "paza documentului incarcat in zona de cont a disparut");
  /* Regula veche ramane intreaga, pentru toti: in zona de cont nu se deseneaza nimic. */
  assert.ok(c.includes("if (eZonaDeCont(cale, slug)) return null;"));
  /* Butonul de contact NU o cere: el trebuie sa apara cand omul iese din cont. */
  const layout = citeste("src/app/(public)/[slug]/layout.tsx");
  assert.equal(layout.split("niciDupaIesire").length - 1, 1, "`niciDupaIesire` e numai pe blocul de pixeli");
});

test("din ecranele contului se iese in magazin numai printr-o incarcare completa", () => {
  const ECRANE = ZONA_CONT.filter((p) => p.endsWith(".tsx"));
  const inCont = (tinta: string) => tinta === "/cont" || tinta.startsWith("/cont/") || tinta.startsWith("/cont?");
  /* Tintele care nu sunt scrise pe loc: fiecare e verificata mai jos, la sursa ei. */
  const SOCOTITE = new Set(["href", "m.href", "p.inapoi.href", "adresa(pagina - 1)", "adresa(pagina + 1)", "adresaComenzilor(curat)"]);
  const vinovate: string[] = [];
  let vazute = 0;
  for (const p of ECRANE) {
    const cod = citeste(p).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const legaturi = [
      ...cod.matchAll(/<(?:Link|LegaturaCont|Placa)\b[^>]*?\bhref=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g),
      ...cod.matchAll(/router\.(?:push|replace)\((?:"([^"]*)"|`([^`]*)`|([^,)]*\)?))/g),
    ];
    for (const m of legaturi) {
      vazute += 1;
      const scrisa = m[1] ?? m[2];
      if (scrisa !== undefined) { if (!inCont(scrisa)) vinovate.push(`${p}: ${scrisa}`); }
      else if (!SOCOTITE.has((m[3] ?? "").trim())) vinovate.push(`${p}: tinta socotita necunoscuta \`${(m[3] ?? "").trim()}\``);
    }
  }
  assert.ok(vazute >= 20, `proba nu mai gaseste legaturile din zona de cont (a vazut ${vazute})`);
  assert.deepEqual(vinovate, [], "o legatura fara reincarcare duce din zona de cont in magazin: fa-o `<a>` (vezi `ActiuneCont`)");

  /* Sursele tintelor socotite: meniul contului, legatura „inapoi” si paginarea raman in zona de cont. */
  const meniu = [...citeste("src/components/storefront/cont/ui/meniu.ts").matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(meniu.length >= 6 && meniu.every(inCont), `meniul contului duce in afara lui: ${meniu.join(", ")}`);
  for (const p of ECRANE) {
    for (const m of citeste(p).matchAll(/inapoi=\{\{ href: "([^"]+)"/g)) assert.ok(inCont(m[1]), `${p}: „inapoi” duce in afara contului`);
    for (const m of citeste(p).matchAll(/<Paginare baza="([^"]+)"/g)) assert.ok(inCont(m[1]), `${p}: paginarea duce in afara contului`);
  }
  assert.ok(citeste("src/lib/cont/cautare-comenzi.ts").includes('return p ? `/cont/comenzi?${p}` : "/cont/comenzi";'));

  /* Iesirile cunoscute sunt `<a>`: spre magazin, spre produsele comenzii, spre retur si spre politici. */
  const ecran = (nume: string) => citeste(`src/components/storefront/cont/${nume}`);
  assert.ok(ecran("ecrane/EcranAcasa.tsx").includes('actiune={<a href="/" className={BUTON_PRIMAR} style={STIL_PRIMAR}>Mergi la magazin</a>}'));
  assert.ok(ecran("ecrane/EcranComenzi.tsx").includes('actiune={<a href="/" className={BUTON_PRIMAR} style={STIL_PRIMAR}>Mergi la magazin</a>}'));
  assert.equal(ecran("ecrane/EcranComanda.tsx").split("<a href={legatura}").length - 1, 2, "legaturile spre produsele comenzii nu mai sunt `<a>`");
  assert.ok(ecran("ecrane/EcranComanda.tsx").includes("<a href={`/retur?order=${encodeURIComponent(c.numar)}`} className={BUTON_SECUNDAR}>"));
  assert.ok(ecran("FormularIntrare.tsx").includes('<a href="/politici/termeni" className={LEGATURA}>'));
  assert.ok(ecran("FormularIntrare.tsx").includes('<a href="/politici/confidentialitate" className={LEGATURA}>'));
  assert.ok(citeste("src/app/(public)/[slug]/cont/retururi/page.tsx").includes('<a href="/retur" className={BUTON_SECUNDAR}>'));
  /* Si pagina negasita, care apare si pe o adresa gresita din zona de cont (`/cont/comenzi/<id>`). */
  const negasita = citeste("src/app/(public)/[slug]/not-found.tsx");
  assert.ok(negasita.includes('<a href={acasa} referrerPolicy={acasa === "/" ? "strict-origin" : undefined}'), "pagina negasita iese din zona de cont fara reincarcare, sau isi duce adresa cu ea");
  assert.equal(negasita.includes("next/link"), false);
});

test("zona de cont nu isi spune adresa mai departe: de pe paginile ei pleaca numai originea", () => {
  /*
    Iesirea prin incarcare completa duce cu ea „pagina de unde vine omul”: fara asta, pagina urmatoare ar fi
    primit `/cont/comenzi/<id>` drept `document.referrer`, iar pixelii ei (cu acord) l-ar fi trimis mai departe.
  */
  const cadru = citeste("src/app/(public)/[slug]/cont/layout.tsx");
  assert.match(cadru, /^export const metadata: Metadata = \{ referrer: "strict-origin" \};$/m);
  /* Nicio pagina de cont nu isi pune alta politica peste cea a zonei. */
  for (const p of fisiereDin("src/app/(public)/[slug]/cont", [".tsx"]).filter((f) => f.endsWith("/page.tsx"))) {
    assert.equal(/\breferrer\s*:/.test(citeste(p)), false, `${p} isi pune singura politica de provenienta`);
  }
  /* Cererile zonei de cont se verifica dupa `Origin`, nu dupa `Referer`: politica stransa nu le strica. */
  assert.ok(citeste("src/lib/cont/cerere.ts").includes("Se cere `Origin`, nu `Referer`"));
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
