import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";

/*
 * Intr-o PAGINA, callbackul lui `after()` nu are voie sa ceara datele cererii (19.11.2026).
 *
 * Next 16 (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`, „With request APIs”): intr-o
 * componenta de server (pagina, layout, `generateMetadata`), `headers()` si `cookies()` chemate INAUNTRUL lui `after`
 * arunca. Intr-o ruta de API sau intr-o actiune de server sunt permise. Datele se citesc in randare si se dau
 * callbackului ca valori.
 *
 * Gasit inaintea unui push, in jurnalul serverului local care randa magazinele reale: „Route /[slug]/checkout used
 * `headers()` inside `after()` while rendering”. Doua locuri, amandoua tacute pentru cumparator si pentru comerciant:
 *
 *   1. pagina de comanda chema `await headers()` in callback: evenimentul `begin_checkout` nu s-a scris NICIODATA
 *      (in productie, 20.09-19.11.2026: zero sesiuni cu checkout in `analitice_zilnic`, langa 825 cu cos si 137 cu
 *      comanda);
 *   2. pagina de produs chema in callback `esteProprietarulMagazinului`, care citeste `cookies()` si isi prinde singura
 *      caderea: raspundea mereu „vizitator”, deci proprietarul era numarat in `product_view`.
 *
 * Proiectul n-are jsdom si nici un server de Next in probe, deci regula se tine pe sursa.
 */

/** Dosarele in care traiesc componentele de server ale vitrinei si ale panoului. Rutele de API sunt `route.ts`. */
const RADACINI = ["src/app", "src/lib/storefront", "src/components"];

/** Ce cere datele cererii, direct sau printr-o functie a casei care le cere la randul ei. */
const CER_CEREREA: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bheaders\(\)/, "headers()"],
  [/\bcookies\(\)/, "cookies()"],
  [/\bdraftMode\(\)/, "draftMode()"],
  [/\besteProprietarulMagazinului\(/, "esteProprietarulMagazinului() (citeste cookies())"],
  [/\bcreateClient\(\)/, "createClient() (clientul Supabase al sesiunii citeste cookies())"],
];

function fisiere(dosar: string, strans: string[] = []): string[] {
  for (const nume of readdirSync(dosar)) {
    const cale = `${dosar}/${nume}`;
    if (statSync(cale).isDirectory()) fisiere(cale, strans);
    else if (/\.tsx$/.test(nume) && !/\.test\.tsx$/.test(nume)) strans.push(cale);
  }
  return strans;
}

/** Codul fara comentarii si fara continutul sirurilor: ramane doar ce se executa, cu aceleasi pozitii de paranteze. */
function viu(sursa: string): string {
  let iesire = "";
  let i = 0;
  while (i < sursa.length) {
    const c = sursa[i];
    const urm = sursa[i + 1];
    if (c === "/" && urm === "*") {
      const capat = sursa.indexOf("*/", i + 2);
      i = capat < 0 ? sursa.length : capat + 2;
    } else if (c === "/" && urm === "/") {
      const capat = sursa.indexOf("\n", i);
      i = capat < 0 ? sursa.length : capat;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < sursa.length && sursa[j] !== c) j += sursa[j] === "\\" ? 2 : 1;
      iesire += c + c;
      i = j + 1;
    } else {
      iesire += c;
      i++;
    }
  }
  return iesire;
}

/** Corpurile tuturor apelurilor `after(...)` dintr-un cod deja curatat: de la paranteza deschisa pana la perechea ei. */
function corpuriAfter(cod: string): string[] {
  const corpuri: string[] = [];
  for (const m of cod.matchAll(/(?<![\w.$])after\(/g)) {
    const inceput = m.index + m[0].length;
    let adancime = 1;
    let j = inceput;
    while (j < cod.length && adancime > 0) {
      if (cod[j] === "(") adancime++;
      else if (cod[j] === ")") adancime--;
      j++;
    }
    corpuri.push(cod.slice(inceput, j - 1));
  }
  return corpuri;
}

const incalcari = (corp: string) => CER_CEREREA.filter(([tipar]) => tipar.test(corp)).map(([, nume]) => nume);

test("niciun `after()` dintr-o componenta de server nu cere datele cererii", () => {
  const cuAfter: string[] = [];
  const gresite: string[] = [];
  for (const radacina of RADACINI) {
    for (const cale of fisiere(radacina)) {
      const sursa = readFileSync(cale, "utf8");
      if (!/from "next\/server"/.test(sursa) || !/\bafter\b/.test(sursa)) continue;
      const corpuri = corpuriAfter(viu(sursa));
      if (corpuri.length === 0) continue;
      cuAfter.push(cale);
      for (const corp of corpuri) for (const ce of incalcari(corp)) gresite.push(`${cale}: ${ce} in callbackul lui after()`);
    }
  }
  // Martorul: cautarea chiar gaseste paginile care scriu evenimente dupa raspuns (patru pe 19.11.2026).
  for (const asteptat of [
    "src/app/(public)/[slug]/page.tsx",
    "src/app/(public)/[slug]/checkout/page.tsx",
    "src/app/(public)/[slug]/_rute/pagina-produs.tsx",
    "src/lib/storefront/catalog/pagina-magazin.tsx",
  ]) assert.ok(cuAfter.includes(asteptat), `nu mai gasesc after() in ${asteptat}; cautarea s-a rupt sau fisierul s-a mutat`);
  assert.deepEqual(gresite, [], "datele cererii se citesc in randare si se dau callbackului ca valori");
});

test("pagina de comanda si pagina de produs dau callbackului valori citite in randare", () => {
  const comanda = viu(readFileSync("src/app/(public)/[slug]/checkout/page.tsx", "utf8"));
  assert.match(comanda, /const anteturi = await headers\(\);/, "antetele se citesc o data, in randare");
  assert.match(comanda, /const ipVizitator = clientIpFromHeaders\(anteturi\);\s*after\(/, "IP-ul se scoate inaintea lui after()");
  assert.equal(comanda.match(/\bheaders\(\)/g)?.length, 1, "o singura citire a antetelor in toata pagina");
  // `after` ruleaza si la redirectare: programat inaintea lor, ar numara si magazinele fara pagina de comanda si pe cele suspendate.
  assert.ok(comanda.includes("redirect(") && comanda.lastIndexOf("redirect(") < comanda.search(/(?<![\w.$])after\(/),
    "evenimentul se programeaza DUPA redirectari: numara doar paginile de comanda chiar servite");

  const produs = viu(readFileSync("src/app/(public)/[slug]/_rute/pagina-produs.tsx", "utf8"));
  assert.match(produs, /const esteProprietar = user\?\.id === business\.user_id;\s*after\(/, "proprietarul se afla inaintea lui after()");
  assert.doesNotMatch(produs, /esteProprietarulMagazinului/, "pagina de produs nu mai cheama functia care citeste cookies()");
});

test("regula chiar prinde: forma veche a fiecarui loc e vazuta, forma noua nu", () => {
  const vecheComanda = viu(`
    after(async () => {
      const anteturi = await headers();
      const ua = anteturi.get("user-agent"); // headers() dintr-un comentariu nu conteaza
      await scrie({ ip: clientIpFromHeaders(anteturi) });
    });`);
  assert.deepEqual(corpuriAfter(vecheComanda).flatMap(incalcari), ["headers()"]);

  const vecheProdus = viu(`
    after(async () => {
      if (!seMasoaraVizita({ esteProprietar: await esteProprietarulMagazinului(business.user_id) })) return;
    });`);
  assert.deepEqual(corpuriAfter(vecheProdus).flatMap(incalcari), ["esteProprietarulMagazinului() (citeste cookies())"]);

  const noua = viu(`
    const anteturi = await headers();
    const ipVizitator = clientIpFromHeaders(anteturi);
    after(async () => {
      /* cookies() pomenit doar aici */
      await scrie({ ip: ipVizitator, text: "headers() intr-un sir" });
    });
    const dupa = await cookies();`);
  assert.deepEqual(corpuriAfter(noua).flatMap(incalcari), []);
  // Alt apel care doar se termina in „after(” nu e al nostru.
  assert.deepEqual(corpuriAfter(viu("obiect.after(() => headers()); cheamaDupaafter(() => cookies());")), []);
});
