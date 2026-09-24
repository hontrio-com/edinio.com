import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PAGINA_MAXIMA, PE_PAGINA, decalajSigur, numarulPaginii } from "./paginare";
import { MESAJ_UNIC } from "./cod";
import { VIATA_COOKIE_SEC } from "./jeton";

/*
 * Intrebarile proprietarului dinaintea unirii (24.09.2026): fontul zonei de cont,
 * paginarea la „Comenzile mele" si „functiile de la Datele mele (sesiuni, descarca
 * datele etc.) functioneaza cum trebuie?". Probele apara ce s-a gasit si reparat.
 *
 * ⚠ Regulile care tin de mai multe fisiere se apara PE SURSA, ca in
 * `regulile-contului.test.ts`: un al doilea drum scris maine ar ocoli o proba care
 * masoara doar apelantul.
 */

const RAD = process.cwd();
const citeste = (p: string) => readFileSync(join(RAD, p), "utf8").replace(/\r\n/g, "\n");

/** Toate rutele de sub `/api/cont`, si cele adanci (`factura/[orderId]/storno`). */
const RUTE = (readdirSync(join(RAD, "src/app/api/cont"), { recursive: true }) as string[])
  .map((f) => f.replace(/\\/g, "/"))
  .filter((f) => f.endsWith("route.ts"))
  .map((f) => `src/app/api/cont/${f}`);

/* ═══ Paginarea ═══ */

test("pagina din adresa: orice gunoi da 1, un numar urias se plafoneaza", () => {
  for (const p of [undefined, "", "0", "-3", "abc", "NaN", []]) assert.equal(numarulPaginii(p), 1, String(p));
  assert.equal(numarulPaginii("7"), 7);
  assert.equal(numarulPaginii("7abc"), 7);
  assert.equal(numarulPaginii(["2", "5"]), 2, "`?p=2&p=5` ia prima valoare");
  assert.equal(numarulPaginii("99999999999"), PAGINA_MAXIMA);
});

test("decalajul trimis bazei incape mereu in `integer`", () => {
  assert.equal(decalajSigur(Number.NaN), 0);
  assert.equal(decalajSigur(-20), 0);
  assert.equal(decalajSigur(40), 40);
  assert.ok(decalajSigur(Number.MAX_SAFE_INTEGER) <= 2 ** 31 - 1);
  assert.ok((PAGINA_MAXIMA - 1) * PE_PAGINA <= 2 ** 31 - 1);
});

test("Comenzi si Facturi citesc pagina prin `numarulPaginii` si trimit decalajul prin `decalajSigur`", () => {
  for (const [pagina, lib, fn] of [
    ["src/app/(public)/[slug]/cont/comenzi/page.tsx", "src/lib/cont/comenzi.ts", "cont_comenzile_mele"],
    ["src/app/(public)/[slug]/cont/facturi/page.tsx", "src/lib/cont/facturi.ts", "cont_facturile_mele"],
  ] as const) {
    const s = citeste(pagina);
    assert.match(s, /numarulPaginii\(p\)/, pagina);
    assert.doesNotMatch(s, /Number\.parseInt/, `${pagina}: pagina se citeste intr-un singur loc`);
    assert.match(s, /if \(pagina > 1 && \w+\.length === 0\) redirect\("\/cont\/(comenzi|facturi)"\)/, `${pagina}: dupa capatul listei, inapoi la prima`);
    const l = citeste(lib);
    const apel = l.slice(l.indexOf(`rpc("${fn}"`));
    assert.match(apel.slice(0, 300), /p_decalaj: decalajSigur\(decalaj\)/, lib);
  }
});

test("butoanele paginarii: clasele se unesc prin `cn`, textul ramane pentru cititorul de ecran", () => {
  const s = citeste("src/components/storefront/cont/ecrane/Paginare.tsx");
  assert.match(s, /cn\(BUTON_SECUNDAR, /);
  assert.doesNotMatch(s, /`\$\{BUTON_SECUNDAR\}/, "lipite ca sir, `px-3` si `px-5` se bat dupa ordinea din CSS");
  assert.equal((s.match(/sr-only sm:not-sr-only/g) ?? []).length, 2);
});

test("comanda ceruta cu un id care nu e uuid da 404, nu eroare de baza", () => {
  const s = citeste("src/lib/cont/comenzi.ts");
  const corp = s.slice(s.indexOf("export async function comandaMea("));
  const garda = corp.indexOf("if (!esteUuid(orderId)) return null;");
  assert.ok(garda > 0, "lipseste garda");
  assert.ok(garda < corp.indexOf('rpc("cont_comanda_mea"'), "garda vine INAINTEA bazei");
  assert.match(citeste("src/app/api/cont/comanda/route.ts"), /!esteUuid\(orderId\)/);
});

/* ═══ Fontul ═══ */

test("zona de cont ia fontul magazinului si nu ingroasa artificial un font cu o singura greutate", () => {
  const clase = citeste("src/components/storefront/cont/ui/clase.ts");
  assert.match(clase, /TEXT_CONT: CSSProperties = \{ fontFamily: "var\(--st-font-body\)", fontSynthesisWeight: "none" \}/);
  assert.match(clase, /TITLU: CSSProperties = \{ fontFamily: "var\(--st-font-heading\)" \}/);
  for (const f of ["src/components/storefront/cont/ui/CadruCont.tsx", "src/components/storefront/cont/ecrane/EcranIntrare.tsx"]) {
    assert.match(citeste(f), /<main className="[^"]*" style=\{TEXT_CONT\}>/, f);
  }
  /* Motivul: Instrument Serif vine intr-o singura greutate. Daca se schimba, proba spune. */
  assert.match(citeste("src/lib/storefront/design/fonts.ts"), /Instrument_Serif\(\{[\s\S]{0,80}weight: "400"/);
});

/* ═══ Migratia 52: ultima definitie a fiecarei functii ═══ */

const MIGRATII = readdirSync(join(RAD, "migrations"))
  .filter((f) => f.endsWith(".sql") && !f.startsWith("000-"))
  .sort()
  .map((f) => ({ f, text: readFileSync(join(RAD, "migrations", f), "utf8").replace(/\r\n/g, "\n") }));

/** Corpul ULTIMEI definitii (in ordinea numelor, care e si cea in care se aplica aici). */
function corpul(nume: string): { f: string; corp: string } {
  const cap = `create or replace function public.${nume}(`;
  const m = MIGRATII.filter((x) => x.text.includes(cap)).at(-1);
  if (!m) return { f: "", corp: "" };
  const i = m.text.lastIndexOf(cap);
  const a = m.text.indexOf("$$", i);
  const b = m.text.indexOf("$$", a + 2);
  return { f: m.f, corp: m.text.slice(a + 2, b) };
}

test("⚠ cele patru functii reparate au ultima definitie in migratia 52", () => {
  for (const n of ["cont_iesi_de_peste_tot", "cont_export", "cont_sterge_contact", "cont_verifica_cod"]) {
    const { f, corp } = corpul(n);
    assert.equal(f, "2026-09-24-conturi-clienti-zz-datele-mele.sql", n);
    assert.ok(corp.length > 150, `${n}: corp de ${corp.length} semne`);
  }
});

test("⚠⚠ iesirea de peste tot uita si dispozitivele tinute minte", () => {
  const { corp } = corpul("cont_iesi_de_peste_tot");
  assert.match(corp, /epoca_sesiunii = epoca_sesiunii \+ 1/);
  assert.match(corp, /delete from privat\.cont_dispozitiv d where d\.cont_id = p_cont and d\.business_id = p_business;/);
});

test("⚠⚠ exportul: toate comenzile, cu detaliul lor, si nicio amprenta", () => {
  const { corp } = corpul("cont_export");
  assert.match(corp, /cross join lateral public\.cont_comanda_mea\(p_business, p_cont, l\.order_id\) d/);
  assert.doesNotMatch(corp, /\blimit\b/i, "un plafon aici taie comenzile din export fara sa spuna");
  assert.doesNotMatch(corp, /cont_comenzile_mele/, "lista paginata (100 pe pagina) nu e exportul");
  /* Numai `parola_hash is not null`: un `to_jsonb` pe un rand din `privat` ar duce si amprenta. */
  assert.deepEqual(corp.match(/parola_hash[^,)]*/g), ["parola_hash is not null"]);
  assert.doesNotMatch(corp, /jeton_hash|cod_hash|provocare_hash/);
  assert.doesNotMatch(corp, /to_jsonb\((c|x|j)\)/);
  for (const cheie of ["'cont'", "'contacte'", "'comenzi'", "'retururi'", "'preferinte'", "'dispozitive_tinute_minte'", "'jurnal'"]) {
    assert.ok(corp.includes(cheie), cheie);
  }
});

test("⚠⚠ ultimul EMAIL confirmat nu se poate scoate, oricate telefoane ar avea contul", () => {
  const { corp } = corpul("cont_sterge_contact");
  const numarare = corp.slice(corp.indexOf("select count(*) into v_ramase"), corp.indexOf("if v_ramase = 0"));
  assert.match(numarare, /x\.fel = 'email' and x\.verificat_la is not null/);
});

test("adresa noua mosteneste alegerea „fara emailuri”", () => {
  const { corp } = corpul("cont_verifica_cod");
  assert.match(corp, /insert into public\.recovery_optout \(business_id, email, motiv\)\s+values \(p_business, v_dest, 'dezabonare'\)/);
  /* Si ramane legata de codul cerut de CHIAR contul asta, cu scopul inchis la adaugare. */
  assert.match(corp, /if p_scop is distinct from 'adaugare-contact' or p_cont is null then/);
  assert.match(corp, /if v_cod\.cont_id is distinct from p_cont then/);
});

/* ═══ Rutele din „Datele mele" ═══ */

test("⚠⚠ parola contului se verifica intr-un SINGUR loc, cu plafoanele intrarii", () => {
  const a = citeste("src/lib/cont/autentificare.ts");
  const f = a.slice(a.indexOf("export async function parolaDinCont("));
  const corp = f.slice(0, f.indexOf("\n}\n"));
  for (const bucata of ["permisDeCalcul(p.ip)", "cont_parola_pentru_intrare", "verificareOarba(scrisa)", "cont_intrare_esuata"]) {
    assert.ok(corp.includes(bucata), bucata);
  }
  /* Nicio ruta nu compara parola pe cont propriu (intrarea trece prin `intraCuParola`). */
  assert.ok(RUTE.length >= 15, `am gasit ${RUTE.length} rute`);
  for (const r of RUTE) {
    assert.doesNotMatch(citeste(r), /parolaPotrivita\(|verificareOarba\(/, `${r}: parola se verifica prin \`parolaDinCont\``);
  }
});

test("⚠⚠ stergerea contului cere parola INAINTEA cererii catre magazin si a stergerii", () => {
  const s = citeste("src/app/api/cont/sterge/route.ts");
  const parola = s.indexOf("await parolaDinCont(");
  assert.ok(parola > 0);
  assert.ok(parola < s.indexOf("trimiteCerereaDeStergere(magazin"), "cererea catre magazin pleaca abia dupa parola");
  assert.ok(parola < s.indexOf("stergeContul(magazin.id"), "stergerea vine abia dupa parola");
  const ecran = citeste("src/components/storefront/cont/StergeContul.tsx");
  assert.match(ecran, /JSON\.stringify\(\{ confirmare: cuvant, cereStergereaDatelor: cerere, parola \}\)/);
  assert.match(citeste("src/components/storefront/cont/ecrane/EcranDate.tsx"), /<StergeContul comenzi=\{comenzi\} areParola=\{areParola\} \/>/);
});

test("adresa noua: forma verificata inaintea parolei, parola inaintea codului, plafonul pe IP spus pe fata", () => {
  const s = citeste("src/app/api/cont/contact/route.ts");
  const i = s.indexOf('if (actiune === "cere-cod")');
  const bloc = s.slice(i, s.indexOf('if (actiune === "confirma")'));
  const forma = bloc.indexOf("adresaEmailValida(valoare)");
  const parola = bloc.indexOf("await parolaDinCont(");
  const cod = bloc.indexOf("await cereCod(");
  assert.ok(forma > 0 && forma < parola && parola < cod);
  assert.match(bloc, /if \(!r\.trimis && eLimitaDeIp\(r\.motiv\)\) return NextResponse\.json\(\{ eroare: MESAJ_PREA_MULTE \}, \{ status: 429 \}\)/);
  assert.doesNotMatch(MESAJ_UNIC, /cunoscuta/, "codul e pentru o adresa NOUA; textul vechi era al intrarii cu cod");
});

test("⚠ iesirea de peste tot: la eroare ramai in cont si afli, nu esti scos doar de aici", () => {
  const s = citeste("src/app/api/cont/iesire-peste-tot/route.ts");
  assert.doesNotMatch(s, /sesiuneCurenta\(magazin\.id\)\.catch/, "o eroare de citire nu are voie sa arate ca „nu esti logat”");
  assert.equal((s.match(/return inapoiCuEroare\(\);/g) ?? []).length, 2);
  assert.ok(s.indexOf("await stergeCookieContului()") > s.lastIndexOf("return inapoiCuEroare();"));
});

test("exportul: la eroare, inapoi la „Datele mele” cu mesaj; fara sesiune, la intrare", () => {
  const s = citeste("src/app/api/cont/export/route.ts");
  assert.doesNotMatch(s, /status: 500/);
  assert.match(s, /\/cont\/intra/);
});

test("fiecare `?eroare=` trimis de o ruta are textul lui pe „Datele mele”", () => {
  const pagina = citeste("src/app/(public)/[slug]/cont/date/page.tsx");
  const trimise = new Set<string>();
  for (const r of RUTE) {
    for (const m of citeste(r).matchAll(/\/cont\/date\?eroare=([a-z-]+)/g)) trimise.add(m[1]);
  }
  assert.deepEqual([...trimise].sort(), ["export", "iesire"]);
  for (const k of trimise) assert.match(pagina, new RegExp(`\\n  ${k}: "`), k);
  assert.match(pagina, /ERORI\[eroare\] \?\? null/, "textul din adresa nu se afiseaza niciodata ca atare");
});

test("textul despre sesiuni spune limitele ADEVARATE", () => {
  const reguli = MIGRATII.filter((m) => m.text.includes("function privat.cont_reguli_sesiune()")).at(-1)?.text ?? "";
  assert.match(reguli, /select interval '30 days', interval '14 days'/);
  assert.equal(VIATA_COOKIE_SEC, 30 * 24 * 3600);
  const ecran = citeste("src/components/storefront/cont/ecrane/EcranDate.tsx");
  assert.match(ecran, /cel mult 30 de zile, sau pana nu-l mai folosesti 14 zile/);
  assert.doesNotMatch(ecran, /pana iesi din el/);
});
