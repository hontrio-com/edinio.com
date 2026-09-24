import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  POZA_MAX_OCTETI,
  adresaDinBaza,
  curataProfilul,
  eBucuresti,
  greseliProfil,
  initialeDinNume,
} from "./profil-reguli";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PROFILUL CONTULUI: nume, poza, telefon, adresa de livrare     (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de proprietar: „Utilizatorul sa isi poata schimba numele, poza de profil
 * si alte detalii”. Probele apara regulile, nu cablajul: ce se refuza, ce pleaca
 * odata cu contul si ce nu se suprascrie la comanda.
 */

const RAD = process.cwd();
const citeste = (p: string) => readFileSync(join(RAD, p), "utf8").replace(/\r\n/g, "\n");
const M56 = citeste("migrations/2026-09-24-conturi-clienti-zzzzzz-profilul.sql");

const gol = { nume: "", telefon: "", judet: "", localitate: "", adresa: "", codPostal: "" };

test("numele e obligatoriu, restul nu", () => {
  assert.ok(greseliProfil(gol).nume);
  assert.deepEqual(greseliProfil({ ...gol, nume: "Ana Pop" }), {});
});

test("telefonul: gol e voie, altfel 9-15 cifre si numai semne de telefon", () => {
  const cu = (telefon: string) => greseliProfil({ ...gol, nume: "A", telefon }).telefon;
  assert.equal(cu(""), undefined);
  assert.equal(cu("0722 123 456"), undefined);
  assert.equal(cu("+40 (722) 123-456"), undefined);
  assert.ok(cu("12345"));
  assert.ok(cu("0722abc456"));
  assert.ok(cu("1234567890123456"));
});

test("⚠ o adresa inceputa se cere intreaga, iar judetul numai din lista", () => {
  const g = greseliProfil({ ...gol, nume: "A", localitate: "Cluj-Napoca" });
  assert.ok(g.judet, "judetul lipsa");
  assert.ok(g.adresa, "strada lipsa");
  assert.ok(greseliProfil({ ...gol, nume: "A", judet: "Clujj", localitate: "X", adresa: "Y" }).judet);
  assert.deepEqual(greseliProfil({ ...gol, nume: "A", judet: "Cluj", localitate: "Cluj-Napoca", adresa: "Str. Lunga 3" }), {});
  assert.ok(greseliProfil({ ...gol, nume: "A", judet: "Cluj", localitate: "C", adresa: "S", codPostal: "12" }).codPostal);
});

test("Bucurestiul se alege pe sectoare, ca la comanda", () => {
  assert.equal(eBucuresti("Municipiul Bucuresti"), true);
  assert.equal(eBucuresti("Ilfov"), false);
  assert.match(greseliProfil({ ...gol, nume: "A", judet: "Municipiul Bucuresti", adresa: "S" }).localitate ?? "", /sectorul/);
});

test("curatarea taie spatiile si lungimile, iar adresa din baza se citeste fara sa arunce", () => {
  const p = curataProfilul({ nume: "  Ana   Maria  Pop ", telefon: 722, judet: ["x"] });
  assert.equal(p.nume, "Ana Maria Pop");
  assert.equal(p.telefon, "");
  assert.equal(p.judet, "");
  assert.equal(curataProfilul({ nume: "x".repeat(500) }).nume.length, 120);
  assert.deepEqual(adresaDinBaza({ judet: "Cluj", cod_postal: "400000" }), { judet: "Cluj", localitate: "", adresa: "", codPostal: "400000" });
  assert.deepEqual(adresaDinBaza(null), { judet: "", localitate: "", adresa: "", codPostal: "" });
  assert.equal(initialeDinNume("ana maria pop"), "AP");
});

/* ═══ Baza ═══ */

test("⚠⚠ la stergere si anonimizare, telefonul, adresa si poza pleaca singure", () => {
  const f = M56.slice(M56.indexOf("create or replace function privat.cont_goleste_profilul()"), M56.indexOf("drop trigger if exists cont_goleste_profilul"));
  assert.match(f, /if new\.sters_la is not null and old\.sters_la is null then/);
  assert.match(f, /new\.telefon := null;/);
  assert.match(f, /new\.adresa := null;/);
  assert.match(f, /delete from privat\.cont_poza p where p\.cont_id = new\.id and p\.business_id = new\.business_id;/);
  assert.match(M56, /before update of sters_la on privat\.cont_cumparator\s+for each row execute function privat\.cont_goleste_profilul\(\);/);
  /* Poza are cheie straina cu stergere in cascada pe cont (si pe magazin, prin cont). */
  assert.match(M56, /references privat\.cont_cumparator \(id, business_id\) on delete cascade/);
});

test("⚠ functiile profilului sunt numai ale serverului, iar poza sta in baza cu plafon", () => {
  for (const f of ["cont_profil(uuid, uuid)", "cont_profil_salveaza(uuid, uuid, text, text, text, text, text, text)", "cont_poza_salveaza(uuid, uuid, text)", "cont_poza(uuid, uuid)", "cont_poza_sterge(uuid, uuid)"]) {
    assert.ok(M56.includes(`'public.${f}'`), `${f} lipseste din verificarea drepturilor`);
  }
  assert.match(M56, /revoke all on privat\.cont_poza from anon, authenticated;/);
  assert.match(M56, /check \(octet_length\(imagine\) between 1 and 200000\)/);
  /* Exportul (dreptul de acces) cuprinde si profilul. */
  assert.match(M56, /'telefon', c\.telefon, 'adresa_de_livrare', c\.adresa,/);
});

/* ═══ Poza ═══ */

test("⚠⚠ poza se refece pe server: intoarsa dupa EXIF, patrata, WebP, fara metadate", () => {
  const r = citeste("src/app/api/cont/poza/route.ts");
  assert.match(r, /\.rotate\(\)\s*\.resize\(256, 256, \{ fit: "cover"/);
  assert.match(r, /\.webp\(\{ quality: \d+ \}\)/);
  assert.match(r, /limitInputPixels:/, "fara plafon de pixeli, o imagine uriasa ar manca memoria functiei");
  assert.ok(POZA_MAX_OCTETI < 4.5 * 1024 * 1024, "Vercel refuza cererile peste 4,5 MB inainte de ruta");
});

test("⚠ poza se vede numai cu sesiunea, iar schimbarea ei trece prin poarta de origine", () => {
  const r = citeste("src/app/api/cont/poza/route.ts");
  const get = r.slice(r.indexOf("export async function GET"), r.indexOf("export async function POST"));
  assert.match(get, /if \(!contId\) return new NextResponse\("Unauthorized", \{ status: 401/);
  assert.match(get, /"Cache-Control": "private, max-age=31536000, immutable"/);
  for (const m of ["POST", "DELETE"]) {
    const corp = r.slice(r.indexOf(`export async function ${m}`));
    assert.match(corp.slice(0, 200), /if \(!vineDePeMagazin\(req\)\) return new NextResponse\("Forbidden", \{ status: 403 \}\);/, m);
  }
  assert.match(citeste("src/app/api/cont/profil/route.ts"), /if \(!vineDePeMagazin\(req\)\) return new NextResponse\("Forbidden", \{ status: 403 \}\);/);
});

/* ═══ Comanda ═══ */

test("⚠⚠ la comanda, profilul completeaza NUMAI campurile goale", () => {
  const c = citeste("src/components/storefront/sections/checkout/checkout-core.ts");
  const f = c.slice(c.indexOf("laLivrare: (d) => {"), c.indexOf("laLivrare: (d) => {") + 900);
  assert.match(f, /if \(!n\.name\.trim\(\) && d\.nume\) n\.name = d\.nume;/);
  assert.match(f, /if \(!n\.phone\.trim\(\) && d\.telefon\) n\.phone = d\.telefon;/);
  assert.match(f, /const faraAdresa = !n\.county && !n\.city\.trim\(\) && !n\.address\.trim\(\);/);
  assert.match(f, /n\.country === "RO" && faraAdresa/);
  /* Intrebarea pleaca si cand contul nu e obligatoriu, dar NUMAI cand conturile sunt pornite. */
  assert.match(citeste("src/components/storefront/cont/contul-la-comanda.ts"), /const cerut = \(obligatoriu \|\| aprins\) && activ;/);
});

/* ═══ Viteza (24.09.2026) ═══ */

test("⚠ pagina de cont citeste setarile si starea abonamentului DEODATA, iar portile raman", () => {
  const p = citeste("src/lib/cont/pagina.ts");
  assert.match(p, /const \[\{ data: storeSettings, error: eSetari \}, oprit\] = await Promise\.all\(\[/);
  const i = p.indexOf("const [{ data: storeSettings");
  const dupa = p.slice(i, i + 900);
  assert.match(dupa, /if \(!conturilePornite\(storeSettings\?\.cont_client_config\)\) notFound\(\);/);
  assert.match(dupa, /if \(oprit\) notFound\(\);/);
  /* Sesiunea se citeste abia DUPA porti. */
  assert.ok(p.indexOf("sesiuneCurenta(business.id)") > p.indexOf("if (oprit) notFound();"));
});

test("⚠ legaturile din cont arata pe loc ca s-a apasat (paginile sunt no-store, deci nu se preiau)", () => {
  const l = citeste("src/components/storefront/cont/ui/LegaturaCont.tsx");
  assert.match(l, /const \{ pending \} = useLinkStatus\(\);/);
  assert.doesNotMatch(l, /router\.prefetch|onMouseEnter/, "preluarea la hover nu face nimic pe no-store (masurat in panou)");
  for (const f of ["ui/CadruCont.tsx", "ui/MeniuFile.tsx", "ecrane/CardComanda.tsx", "ecrane/EcranAcasa.tsx", "ecrane/Paginare.tsx"]) {
    const s = citeste(`src/components/storefront/cont/${f}`);
    assert.doesNotMatch(s, /<Link\b/, `${f} foloseste inca <Link> fara stare`);
    assert.match(s, /<LegaturaCont\b/, f);
  }
  /* Bara se asaza fata de legatura: cardurile si butoanele sunt `relative`. */
  const c = citeste("src/components/storefront/cont/ui/clase.ts");
  assert.match(c, /export const CARD =\n  "relative /);
  assert.match(c, /`relative inline-flex min-h-11/);
});
