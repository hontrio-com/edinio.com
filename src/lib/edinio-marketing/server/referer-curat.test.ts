import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { curataAdresa } from "../adresa-curata";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ADRESA DE VENIRE, DE PE SERVER, NU PLEACA BRUTA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CALEA GASITA PE 03.09.2026. In browser, `page_location` trece prin
  `curataAdresa` de mult. Antetul `Referer` citit pe server nu trecea prin nimic:
  pleca intreg catre TikTok (in `page.referrer`) si se pastra intreg in coada.

  ⚠ CE PUTEA PURTA. Un `Referer` de pe propriul nostru site duce cu el tot sirul
  de interogare al paginii dinainte — un jeton de dezabonare, un cod dintr-un
  email, orice punem vreodata intr-o adresa. Ajungea la un furnizor de reclame si
  ramanea scris in baza.
*/

test("⚠ un jeton din adresa de venire nu ajunge la furnizor", () => {
  /*
    ⚠ PE O CALE CU JETON SE TAIE TOT, si asta e mai aspru decat lista alba.
    Regula exista de dinainte in `curataAdresa`: pe caile de felul asta nu se
    pastreaza nici macar `utm_*`, ca lista alba sa nu para o paza pastrand tocmai
    ce trebuia scos. Prima forma a probei astea cerea `utm_source` pastrat — deci
    proba era gresita, nu codul.
  */
  const curat = curataAdresa("https://www.edinio.com/blog/dezabonare?token=SUPERSECRET&utm_source=newsletter");
  assert.ok(!curat.includes("SUPERSECRET"), `jetonul a ramas: ${curat}`);
  assert.ok(!curat.includes("token"), "numele parametrului singur tot spune ce fel de adresa era");
  assert.equal(curat, "https://www.edinio.com/blog/dezabonare", "a mai ramas ceva din sirul de interogare");
});

test("pe o cale obisnuita, adresa de venire pastreaza ce e pe lista alba", () => {
  /*
    ⚠ MARTORUL. Fara el, „nu ramane nimic" s-ar putea obtine si golind adresa cu
    totul — iar atunci `page.referrer` catre TikTok n-ar mai spune nimic si n-am
    afla de unde vine lumea.
  */
  const curat = curataAdresa("https://www.edinio.com/preturi?utm_source=google&gclid=abc&fbclid=zzz&sesiune=SECRET");
  assert.match(curat, /utm_source=google/, "s-a pierdut sursa campaniei");
  assert.match(curat, /gclid=abc/, "s-a pierdut id-ul clicului platit");
  assert.ok(!curat.includes("fbclid"), "`fbclid` nu e pe lista alba si a ramas");
  assert.ok(!curat.includes("SECRET"), "un parametru necunoscut a supravietuit");
});

test("⚠ si contextul de pe server CHIAR o cheama", () => {
  /*
    ⚠ CE APARA. Regula de mai sus e a unei functii pure; ce conteaza e sa fie
    chemata pe drumul adevarat. Fara randul asta, cineva ar putea scoate chemarea
    din `contextulCererii` si proba de sus ar ramane verde, dovedind o insusire a
    unui cod pe care nu-l mai foloseste nimeni.

    ⚠ SI TAIE IN AMANDOUA PARTILE: daca `referer` nu se mai citeste deloc, cerinta
    dispare odata cu el.
  */
  const sursa = readFileSync("src/lib/edinio-marketing/server/consimtamant-server.ts", "utf8");
  const citesteReferer = sursa.includes('get("referer")');
  if (!citesteReferer) return;

  const i = sursa.indexOf("referrer:");
  assert.ok(i > 0, "nu mai gasesc campul `referrer` in contextul cererii");
  const randul = sursa.slice(i, sursa.indexOf(",", i) + 1);
  assert.match(randul, /curataAdresa\(/,
    "`referrer` pleaca brut de pe server, desi in browser adresa se curata de mult");
});

test("⚠ o adresa de venire de neinteles LIPSESTE, nu vine goala", () => {
  /*
    ⚠ CE APARA, si e chiar regula scrisa in acelasi fisier pentru `ip`: ce nu
    stim trebuie sa LIPSEASCA, nu sa fie un cuvant. `curataAdresa` intoarce sirul
    gol cand ce a venit nu e o adresa deloc — iar un `page.referrer` gol trimis
    catre TikTok e o afirmatie („a venit de nicaieri"), nu o tacere.
  */
  assert.equal(curataAdresa("nu e o adresa"), "", "martorul: curatarea chiar intoarce sirul gol");

  const sursa = readFileSync("src/lib/edinio-marketing/server/consimtamant-server.ts", "utf8");
  const i = sursa.indexOf("referrer:");
  assert.ok(i > 0, "nu mai gasesc campul `referrer`");
  const randul = sursa.slice(i, sursa.indexOf(",", i) + 1);
  assert.match(randul, /\|\|\s*null/,
    "un `Referer` de neinteles pleaca drept sir gol, nu drept lipsa: " + randul.trim());
});
