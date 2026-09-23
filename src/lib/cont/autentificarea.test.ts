import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { amprentaParolei, parolaPotrivita, problemaParolei, verificareOarba } from "./parola";
import { ipPentruBaza } from "./cerere";
import { curataContClientConfig, IMPLICIT } from "./config";

/*
 * Intrarea cu email si parola, contul nou confirmat cu cod, resetarea si codul
 * pe un dispozitiv nou (cerute de proprietar pe 24.09.2026). Parola se probeaza
 * pe comportament; regulile care tin de mai multe fisiere, PE SURSA.
 */

const RAD = process.cwd();
const citeste = (p: string) => readFileSync(join(RAD, p), "utf8").replace(/\r\n/g, "\n");

function fisiereDin(dir: string, ext: string[]): string[] {
  const iesire: string[] = [];
  const mergi = (d: string) => {
    for (const n of readdirSync(join(RAD, d))) {
      const rel = `${d}/${n}`;
      if (statSync(join(RAD, rel)).isDirectory()) mergi(rel);
      else if (ext.some((e) => n.endsWith(e)) && !n.endsWith(".test.ts")) iesire.push(rel);
    }
  };
  mergi(dir);
  return iesire;
}

/** Ultima definitie a unei functii SQL, din migratiile contului, in ordinea numelor. */
function ultimaDefinitie(functie: string): string {
  const fisiere = readdirSync(join(RAD, "migrations"))
    .filter((f) => f.endsWith(".sql") && f.includes("conturi-clienti"))
    .sort();
  let gasit = "";
  for (const f of fisiere) {
    const s = citeste(`migrations/${f}`);
    const re = new RegExp(`create (or replace )?function ${functie.replace(".", "\\.")}\\(`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const inceput = s.indexOf("$$", m.index);
      gasit = s.slice(m.index, s.indexOf("$$", inceput + 2));
    }
  }
  return gasit;
}

/* ═══ Parola ═══ */

test("amprenta e scrypt, cu parametrii in ea, si alta la fiecare chemare", async () => {
  const a = await amprentaParolei("o parola destul de lunga");
  const b = await amprentaParolei("o parola destul de lunga");
  assert.match(a, /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{16,}\$[A-Za-z0-9_-]{60,}$/);
  assert.notEqual(a, b, "sarea nu se schimba");
  assert.equal(await parolaPotrivita("o parola destul de lunga", a), true);
  assert.equal(await parolaPotrivita("o parola destul de lung", a), false);
  assert.equal(await parolaPotrivita("O parola destul de lunga", a), false);
});

test("aceeasi parola scrisa altfel in Unicode se potriveste", async () => {
  /* „e" + accent combinat, fata de „é" gata compus: acelasi text pe doua tastaturi. */
  const compus = "cafe" + String.fromCharCode(0x301) + "-si-ceai";
  const gata = "caf" + String.fromCharCode(0xe9) + "-si-ceai";
  assert.equal(await parolaPotrivita(gata, await amprentaParolei(compus)), true);
});

test("o amprenta stricata sau cu parametri uriasi intoarce fals, fara exceptie si fara calcul", async () => {
  const buna = await amprentaParolei("parola-de-proba-1");
  const bucati = buna.split("$");
  for (const rea of [
    null, undefined, "", "parola-de-proba-1", "bcrypt$10$abc",
    ["scrypt", String(1 << 22), ...bucati.slice(2)].join("$"),
    ["scrypt", "32768", "64", ...bucati.slice(3)].join("$"),
    [...bucati.slice(0, 4), "", bucati[5]].join("$"),
  ]) {
    const inceput = Date.now();
    assert.equal(await parolaPotrivita("parola-de-proba-1", rea as string), false, String(rea));
    assert.ok(Date.now() - inceput < 1000, "o amprenta cu parametri uriasi a pornit calculul");
  }
});

test("verificarea oarba consuma timp si intoarce mereu fals", async () => {
  assert.equal(await verificareOarba("orice"), false);
  assert.equal(await verificareOarba(undefined as unknown as string), false);
});

test("regula parolei: lungimea, cele ghicite din prima si adresa", () => {
  assert.match(problemaParolei("scurt") ?? "", /cel putin 8/);
  assert.match(problemaParolei("x".repeat(129)) ?? "", /cel mult 128/);
  assert.match(problemaParolei("        ") ?? "", /spatii|des folosite/);
  assert.match(problemaParolei("12345678") ?? "", /des folosite/);
  assert.match(problemaParolei("aaaaaaaaaa") ?? "", /des folosite/);
  assert.match(problemaParolei("Password123") ?? "", /des folosite/);
  assert.match(problemaParolei("ion.popescu@exemplu.ro", "Ion.Popescu@exemplu.ro") ?? "", /adresa/);
  assert.match(problemaParolei("ion.popescu", "ion.popescu@exemplu.ro") ?? "", /adresa/);
  assert.equal(problemaParolei(42), "Scrie o parola.");
  assert.equal(problemaParolei("cal verde pe camp"), null);
  /* Fara reguli de compunere: o fraza lunga, fara cifre si fara majuscule, e buna. */
  assert.equal(problemaParolei("mergem la mare in august"), null);
});

test("⚠⚠ in baza nu poate ajunge o parola in clar", () => {
  const m = citeste("migrations/2026-09-24-conturi-clienti-parola.sql");
  assert.match(m, /cont_cumparator_parola_forma\s+check \(parola_hash is null or parola_hash like 'scrypt\$%'\)/);
  assert.match(m, /cont_cod_parola_forma\s+check \(parola_hash is null or \(scop = 'inregistrare' and parola_hash like 'scrypt\$%'\)\)/);
});

/* ═══ Intrarea numai cu cod s-a inchis ═══ */

test("⚠⚠ intrarea NUMAI cu cod e inchisa, si in baza, si in cod", () => {
  const cere = ultimaDefinitie("public.cont_cere_cod");
  assert.ok(cere.length > 500, "nu am gasit `cont_cere_cod`");
  assert.match(cere, /p_scop not in \('adaugare-contact', 'inregistrare', 'resetare-parola', 'doi-pasi'\)/);
  assert.equal(existsSync(join(RAD, "src/app/api/cont/cod/route.ts")), false, "ruta veche de intrare cu cod a revenit");
  for (const p of [...fisiereDin("src", [".ts", ".tsx"])]) {
    const s = citeste(p);
    assert.equal(s.includes("\"/api/cont/cod\""), false, `${p} cheama ruta veche`);
    assert.equal(/p_scop: "intrare"|scop: "intrare"/.test(s), false, `${p} cere un cod de intrare fara parola`);
  }
});

/* ═══ Un singur raspuns ═══ */

test("⚠⚠ contul nou si parola uitata raspund LA FEL, oricare ar fi adresa", () => {
  /*
    Rezultatul lui `pornestePas` (trimis sau nu, cont sau nu) nu are voie sa
    schimbe raspunsul: altfel formularul ar spune oricui ce adrese au cont.
  */
  for (const p of ["src/app/api/cont/inregistrare/route.ts", "src/app/api/cont/parola/route.ts"]) {
    const s = citeste(p);
    assert.ok(s.includes("await pornestePas("), `${p} nu mai porneste pasul`);
    /* Rezultatul se poate citi NUMAI pentru plafonul pe IP, care nu spune nimic despre adresa. */
    const folosiri = [...s.matchAll(/\br\.(\w+)/g)].map((m) => m[1]);
    assert.ok(folosiri.every((f) => f === "motiv"), `${p} citeste din rezultat altceva decat motivul`);
    assert.ok(s.includes("eLimitaDeIp(r.motiv)"), `${p} nu mai deosebeste plafonul pe IP`);
    assert.ok(s.includes("inFundal: true"), `${p} asteapta emailul in raspuns (timpul ar spune cine are cont)`);
    assert.ok(s.includes("MESAJ_PARTEA_INTAI"), `${p} nu foloseste raspunsul comun`);
  }
});

test("⚠⚠ cookie-ul provocarii se pune INAINTEA oricarei iesiri", () => {
  /* Altfel prezenta lui ar fi spus daca adresa exista sau daca s-a atins un plafon. */
  const s = citeste("src/lib/cont/autentificare.ts");
  const corp = s.slice(s.indexOf("export async function pornestePas("), s.indexOf("async function trimiteCodul("));
  const cookie = corp.indexOf("(await cookies()).set(COOKIE_PAS");
  const primaIesire = corp.indexOf("return ");
  assert.ok(cookie > 0 && primaIesire > 0 && cookie < primaIesire);
});

test("⚠⚠ la intrare, contul lipsa si contul blocat raspund ca o parola gresita", () => {
  const s = citeste("src/lib/cont/autentificare.ts");
  const corp = s.slice(s.indexOf("export async function intraCuParola("), s.indexOf("export async function incheieIntrarea("));
  assert.ok(corp.includes("await verificareOarba(p.parola)"), "adresa fara cont nu mai consuma aceeasi munca");
  assert.ok(corp.includes("&& !blocatCont"), "blocajul pe cont nu mai trece prin aceeasi ramura ca parola gresita");
  assert.equal(/mesaj:[^\n]*blocat/i.test(corp), false, "blocajul pe cont are mesaj propriu (oracol)");
  assert.equal((corp.match(/MESAJ_INTRARE_GRESITA/g) ?? []).length, 1, "mai multe feluri de refuz inainte de parola");
});

/* ═══ Codul e legat de browser ═══ */

test("codurile de cont nou, resetare si pas doi cer o provocare", () => {
  const cere = ultimaDefinitie("public.cont_cere_cod");
  assert.match(cere, /p_scop <> 'adaugare-contact' and \(p_provocare_hash is null/);
  const verifica = ultimaDefinitie("public.cont_verifica_provocare");
  assert.match(verifica, /x\.provocare_hash = p_provocare_hash/);
  /* Care drum e, spune randul codului, nu cererea. */
  assert.match(verifica, /v_cod\.scop = 'resetare-parola'/);
});

test("cookie-urile noi sunt httpOnly si nu seamana cu ale Supabase", () => {
  const s = citeste("src/lib/cont/autentificare.ts");
  for (const [nume, valoare] of [["COOKIE_PAS", "ec_cont_pas"], ["COOKIE_DISPOZITIV", "ec_disp"]] as const) {
    assert.ok(s.includes(`export const ${nume} = "${valoare}";`));
    /* `poarta-mfa.ts` si iesirea din panou se uita dupa `sb-*-auth-token`. */
    assert.equal(/^sb-.*-auth-token/.test(valoare), false);
    assert.ok(new RegExp(`set\\(${nume}, jeton, \\{ \\.\\.\\.optiuniCookie\\(\\)`).test(s), `${nume} nu trece prin optiuniCookie`);
  }
  assert.match(citeste("src/lib/cont/jeton.ts"), /httpOnly: true,/);
});

test("⚠ o schimbare de parola scoate din cont celelalte dispozitive", () => {
  for (const f of ["public.cont_schimba_parola", "public.cont_verifica_provocare"]) {
    const d = ultimaDefinitie(f);
    assert.match(d, /epoca_sesiunii = c\.epoca_sesiunii \+ 1/, `${f} nu ridica epoca`);
    assert.match(d, /delete from privat\.cont_dispozitiv/, `${f} lasa dispozitivele de incredere`);
  }
});

/* ═══ Jurnalele ═══ */

test("⚠⚠ nicio parola si niciun corp de cerere nu ajung in error_logs", () => {
  const fisiere = [...fisiereDin("src/app/api/cont", [".ts"]), ...fisiereDin("src/lib/cont", [".ts"])];
  let apeluriVazute = 0;
  for (const p of fisiere) {
    const s = citeste(p);
    for (const a of s.match(/logError\(\{[\s\S]*?\}\)/g) ?? []) {
      apeluriVazute++;
      const interpolari = [...a.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]);
      const valori = [...a.matchAll(/^\s*\w+:\s*([^\s"'`][^,\n]*)/gm)].map((m) => m[1]);
      for (const v of [...interpolari, ...valori]) {
        assert.equal(/\b(parola\w*|corp|email)\b/.test(v), false, `${p} scrie „${v.trim()}" in error_logs`);
      }
    }
    assert.equal(/console\.\w+\([^)]*\bparola/.test(s), false, `${p} scrie parola in consola`);
  }
  assert.ok(apeluriVazute >= 20, `am gasit doar ${apeluriVazute} apeluri; proba nu masoara nimic`);
});

/* ═══ IP-ul ═══ */

test("IP-ul ajunge in baza numai cand e un IP", () => {
  assert.equal(ipPentruBaza("unknown"), null, "`clientIp` intoarce „unknown\" cand lipseste antetul");
  assert.equal(ipPentruBaza("necunoscut"), null);
  assert.equal(ipPentruBaza(""), null);
  assert.equal(ipPentruBaza(null), null);
  assert.equal(ipPentruBaza("1.2.3.4, 5.6.7.8"), null);
  assert.equal(ipPentruBaza(" 1.2.3.4 "), "1.2.3.4");
  /* IPv6 pe retea: doua adrese din acelasi /64 dau aceeasi cheie. */
  assert.equal(ipPentruBaza("2a02:2f0e::1"), "2a02:2f0e:0:0::/64");
  assert.equal(ipPentruBaza("2a02:2f0e:0:0:ffff::9"), ipPentruBaza("2a02:2f0e::1"));
  assert.notEqual(ipPentruBaza("2a02:2f0e:0:1::1"), ipPentruBaza("2a02:2f0e::1"));
  assert.equal(ipPentruBaza("::ffff:1.2.3.4"), "1.2.3.4");
  for (const p of fisiereDin("src/lib/cont", [".ts"])) {
    assert.equal(citeste(p).includes("ip === \"necunoscut\""), false, `${p} compara IP-ul cu un sir pe care clientIp nu-l intoarce`);
  }
});

/* ═══ Setarea ═══ */

test("codul la intrare: implicit pe dispozitiv nou, si numai cele doua valori", () => {
  assert.equal(IMPLICIT.verificare_intrare, "dispozitiv_nou");
  assert.equal(curataContClientConfig({ enabled: true, verificare_intrare: "mereu" }).verificare_intrare, "mereu");
  assert.equal(curataContClientConfig({ enabled: true, verificare_intrare: "niciodata" }).verificare_intrare, "dispozitiv_nou");
  assert.equal(curataContClientConfig({ enabled: true, verificare_intrare: 1 }).verificare_intrare, "dispozitiv_nou");
});

/* ═══ Intarite dupa verificarea din 24.09.2026 ═══ */

test("⚠⚠ resetarea pe o adresa FARA cont lasa un rand-momeala, dupa plafoane", () => {
  /*
    Fara el, codul pasului doi raspundea „a expirat" in loc de „gresit", iar
    retrimiterea spunea „pasul a expirat": oricine afla ce adrese au cont.
  */
  const cere = ultimaDefinitie("public.cont_cere_cod");
  const momeala = cere.indexOf("'momeala:' || gen_random_uuid()");
  assert.ok(momeala > 0, "randul-momeala lipseste");
  assert.ok(cere.indexOf("'buget-epuizat'") < momeala, "momeala se scrie inaintea plafoanelor (le-ar ocoli)");
});

test("⚠⚠ numaratorile si scrierile stau sub aceeasi incuietoare pe destinatie", () => {
  for (const f of ["public.cont_cere_cod", "public.cont_verifica_provocare", "public.cont_verifica_cod"]) {
    assert.ok(ultimaDefinitie(f).includes("pg_advisory_xact_lock(hashtextextended(p_business::text"), `${f} numara fara incuietoare`);
  }
});

test("⚠⚠ zece incercari pe zi pe adresa, peste toate provocarile ei", () => {
  const v = ultimaDefinitie("public.cont_verifica_provocare");
  assert.ok(v.includes("interval '24 hours'") && v.includes("if v_zi >= 10 then"), "plafonul zilnic pe adresa lipseste");
});

test("⚠⚠ codurile pasului doi se numara separat si nu le opreste plafonul zilnic", () => {
  const cere = ultimaDefinitie("public.cont_cere_cod");
  assert.ok(cere.includes("((x.scop = 'doi-pasi') = (p_scop = 'doi-pasi'))"), "un strain poate bloca pasul doi cerand coduri");
  assert.ok(cere.includes("if p_scop <> 'doi-pasi' then"), "plafonul zilnic opreste si pasul doi");
});

test("⚠⚠ orice schimbare de parola inchide codurile inca vii ale contului", () => {
  /* Numarat pe forma, nu pe spatii: cele doua locuri din verificare au alta indentare. */
  const inchide = /update privat\.cont_cod c\s+set folosit_la = now\(\)\s+where c\.business_id = p_business and c\.folosit_la is null\s+and \(c\.cont_id = /g;
  assert.equal((ultimaDefinitie("public.cont_schimba_parola").match(inchide) ?? []).length, 1, "schimbarea din cont lasa coduri vii");
  const v = ultimaDefinitie("public.cont_verifica_provocare");
  /* De doua ori: la contul nou pe o adresa cu cont si la resetare. */
  assert.equal((v.match(inchide) ?? []).length, 2, "o parola setata prin cod lasa coduri vii");
  assert.ok(v.includes("c.parola_schimbata_la <= ("), "pasul doi nu mai verifica parola schimbata intre timp");
});

test("⚠ codul vechi nu mai poate crea conturi fara parola", () => {
  const v = ultimaDefinitie("public.cont_verifica_cod");
  assert.ok(v.includes("p_scop is distinct from 'adaugare-contact' or p_cont is null"));
  assert.equal(v.includes("insert into privat.cont_cumparator"), false, "ramura veche de intrare a revenit");
});

test("⚠ scrypt ruleaza abia dupa plafonul pe IP si dupa provocare", () => {
  const inreg = citeste("src/app/api/cont/inregistrare/route.ts");
  assert.ok(inreg.indexOf("permisDeCalcul(") > 0 && inreg.indexOf("permisDeCalcul(") < inreg.indexOf("amprentaParolei("));
  const pas = citeste("src/app/api/cont/pas/route.ts");
  const provocare = pas.indexOf("await arePas()");
  assert.ok(provocare > 0 && provocare < pas.indexOf("amprentaParolei("), "parola se amprenteaza fara provocare");
  assert.ok(pas.indexOf("permisDeCalcul(") < pas.indexOf("amprentaParolei("));
});

test("⚠⚠ o adresa noua in cont cere parola contului", () => {
  const s2 = citeste("src/app/api/cont/contact/route.ts");
  const corp = s2.slice(s2.indexOf("if (actiune === \"cere-cod\")"), s2.indexOf("if (actiune === \"confirma\")"));
  const parola = corp.indexOf("parolaPotrivita(");
  assert.ok(parola > 0 && parola < corp.indexOf("await cereCod("), "codul pentru adresa noua pleaca fara parola");
});
