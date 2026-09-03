import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { curataAdresa, PARAMETRI_PASTRATI } from "./adresa-curata";
import { liniiDocument } from "@/lib/website/legal";
import { COOKIES } from "@/lib/website/cookies";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  IDENTIFICATORII DE CLIC: HOTARAREA, SI CE AR SCHIMBA-O
  ═══════════════════════════════════════════════════════════════════════════════

  Un audit a cerut ca `gclid` si rudele lui sa fie legate de categoria „marketing".
  Hotararea din 03.09.2026 e sa NU fie, si motivele stau scrise langa
  `PARAMETRI_PASTRATI`. Probele de aici nu apara hotararea fiindca ar fi sfanta —
  o apara ca sa nu se schimbe TACUT, si o leaga de textul juridic care ar rasturna-o.
*/

const IDENTIFICATORI_DE_CLIC = ["gclid", "gbraid", "wbraid", "dclid"] as const;

test("⚠ identificatorii de clic supravietuiesc curatarii", () => {
  /*
    ⚠ DE CE E O PROBA. Fara ea, cineva ar putea scoate `gclid` din lista dintr-un
    impuls de precautie — si n-ar cadea nimic. S-ar vedea abia peste o luna, in
    rapoarte: traficul platit mutat tacut la „organic", adica exact minciuna de
    care ne temem.
  */
  const curat = curataAdresa("https://www.edinio.com/preturi?gclid=Cj0KCQiA123&utm_source=google&fbclid=zz");
  assert.match(curat, /gclid=Cj0KCQiA123/, "s-a pierdut identificatorul clicului platit");
  assert.match(curat, /utm_source=google/, "s-a pierdut sursa campaniei");
  assert.ok(!curat.includes("fbclid"), "`fbclid` nu e pe lista alba si a ramas");

  for (const id of IDENTIFICATORI_DE_CLIC) {
    assert.ok((PARAMETRI_PASTRATI as readonly string[]).includes(id), `"${id}" a iesit din lista pastrata`);
  }
});

test("⚠ curatarea nu se uita la consimtamant, si asta e DINADINS", () => {
  /*
    ⚠ CE PAZESTE. Daca maine cineva adauga aici un argument de consimtamant,
    hotararea se schimba — si atunci trebuie schimbat si TEXTUL, nu doar codul.
    Proba cade ca sa oblige pe cineva sa treaca prin nota de langa
    `PARAMETRI_PASTRATI` inainte de a rasturna alegerea.
  */
  assert.equal(curataAdresa.length, 1,
    "`curataAdresa` a primit un al doilea argument — daca e consimtamantul, citeste nota de langa `PARAMETRI_PASTRATI` si schimba si politica");
});

test("⚠ textul si codul trebuie sa spuna ACELASI lucru despre identificatorii de clic", () => {
  /*
    ═══ ⚠ AICI E MIEZUL, si e regula pe care o tin de doua zile ═══

    Politica promite azi ca `_gcl_*` — COOKIE-URILE — se scriu numai dupa acordul
    de marketing. Asta chiar se respecta: `categoriaCookie` le pune la „marketing"
    si le matura la retragere.

    Despre PARAMETRUL din adresa nu promitem nimic, si de aceea codul actual nu
    contrazice nimic.

    ⚠ DAR DACA TEXTUL INCEPE SA PROMITA. In clipa in care politica spune ca niciun
    identificator de reclama nu pleaca fara acordul de marketing, codul trebuie sa
    se potriveasca — altfel avem exact felul de promisiune pe care l-am scos din
    trei locuri saptamana asta. Proba asta cade atunci, si te trimite sa alegi:
    ori se imparte lista, ori se rescrie fraza.
  */
  const text = liniiDocument(COOKIES).join(String.fromCharCode(10));

  /* Ce se poate promite despre parametru, nu despre cookie. */
  const pomenesteParametrul = /gclid|identificator(ul)? (de )?clic/i.test(text);
  if (!pomenesteParametrul) return;

  const sursa = readFileSync("src/lib/edinio-marketing/adresa-curata.ts", "utf8");
  const curataStieDeConsimtamant = /function curataAdresa\([^)]*(consim|marketing|acord)/i.test(sursa);

  assert.ok(
    curataStieDeConsimtamant,
    "politica a inceput sa vorbeasca despre identificatorii de clic, dar `curataAdresa` ii pastreaza " +
    "indiferent de categorie. Ori se leaga de acordul de marketing, ori fraza din politica se rescrie — " +
    "vezi nota de langa `PARAMETRI_PASTRATI`.",
  );
});

test("⚠ si cookie-urile de reclama CHIAR sunt sub marketing, cum spune textul", () => {
  /*
    ⚠ MARTORUL care face proba de sus sa insemne ceva. Daca `_gcl_*` n-ar fi
    legate de marketing, atunci politica ar minti deja azi, si toata cantarirea de
    mai sus ar porni de la o premisa falsa.
  */
  const text = liniiDocument(COOKIES).join(String.fromCharCode(10));
  assert.match(text, /_gcl_/, "politica nu mai pomeneste cookie-urile `_gcl_*`");

  const cookie = readFileSync("src/lib/edinio-marketing/consimtamant/cookie.ts", "utf8");
  const iMarketing = cookie.indexOf("COOKIE_MARKETING_PREFIXE");
  assert.ok(iMarketing > 0, "nu mai gasesc prefixele de marketing");
  const randul = cookie.slice(iMarketing, cookie.indexOf(";", iMarketing));
  assert.match(randul, /_gcl_/, "`_gcl_*` nu mai e la marketing, desi politica spune ca e");
});
