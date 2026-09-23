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
    assert.equal(/(const|let)\s+\w+\s*=\s*await pornestePas\(/.test(s), false, `${p} citeste rezultatul lui pornestePas`);
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
  assert.ok(corp.includes("r.blocat ? await parolaPotrivita") || corp.includes("!r.blocat"), "blocajul nu mai trece prin aceeasi ramura");
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
  assert.equal(ipPentruBaza("2a02:2f0e::1"), "2a02:2f0e::1");
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
