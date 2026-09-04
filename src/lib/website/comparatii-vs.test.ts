import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AVERTISMENT_VS, LEGENDA_VS, TABELE_VS } from "./comparatii-vs";
import { CULORI_MARCI } from "./versus-culori";

const AICI = dirname(fileURLToPath(import.meta.url));

test("fiecare platforma comparata are tabelul ei", () => {
  /* Cheia tabelului e chiar slug-ul din adresa. Una lipsa n-ar da nicio eroare
     la scris: pagina ar randa un tabel gol. */
  for (const cheie of Object.keys(CULORI_MARCI)) {
    if (cheie === "edinio") continue;
    const tabel = TABELE_VS[cheie as keyof typeof TABELE_VS];
    assert.ok(tabel, `lipseste tabelul pentru ${cheie}`);
    assert.ok(tabel.randuri.length >= 10, `${cheie}: doar ${tabel.randuri.length} randuri`);
    assert.ok(tabel.intro.length > 40, `${cheie}: randul de deschidere e prea scurt`);
    assert.ok(tabel.coloanaRival.length > 0);
  }
});

test("niciun rand nu compara altceva decat acelasi lucru", () => {
  /*
    ⚠ PROBA DE PUBLICITATE COMPARATIVA, nu de desen.

    Un tabel care ne pune langa concurenti NUMITI intra sub reguli: fiecare
    afirmatie trebuie sa compare ACEEASI caracteristica la amandoua platformele.
    Un rand cu o celula goala compara ceva cu nimic — si asta e chiar felul de
    scapare care nu se vede la citit, fiindca randul arata intreg pe ecran.
  */
  for (const [cheie, tabel] of Object.entries(TABELE_VS)) {
    for (const rand of tabel.randuri) {
      assert.ok(rand.criteriu.trim().length > 5, `${cheie}: criteriu prea scurt`);
      assert.notEqual(rand.edinio, "", `${cheie} / ${rand.criteriu}: celula noastra goala`);
      assert.notEqual(rand.rival, "", `${cheie} / ${rand.criteriu}: celula lor goala`);
      assert.ok(
        typeof rand.edinio === "boolean" || rand.edinio.length > 0,
        `${cheie} / ${rand.criteriu}: valoare fara continut`,
      );
    }
  }
});

test("tabelele isi pastreaza randurile in care noi stam mai prost", () => {
  /*
    ⚠ CEA MAI IMPORTANTA PROBA DIN FISIER.

    Controlul asupra codului sursa, ecosistemul de extensii, customizarea foarte
    avansata — la astea concurentii stau mai bine, si asa scrie in PDF-ul
    clientului. Un tabel din care dispar n-ar mai fi o comparatie, ar fi o
    reclama, si ar cadea la prima verificare.

    Numerele de mai jos sunt CATE ERAU IN PDF, numarate cand s-a facut extragerea.
    Proba nu cere sa fie multe: cere sa NU SCADA. Cine sterge un rand incomod, il
    sterge sub ochii probei.

    ⚠ CARTUM ARE ZERO, si nu fiindca s-a sters ceva: asa vine din PDF. Din
    unsprezece randuri, opt sunt in favoarea noastra, doua sunt la fel la
    amandoua, iar la trial noi dam 15 zile fata de 7. E singurul tabel in care
    concurentul nu castiga niciodata — semnalat clientului (14.08), fiindca un
    tabel comparativ in care celalalt nu castiga nimic se citeste a reclama, nu a
    comparatie, iar Cartum e concurent direct pe aceeasi piata. Daca se adauga un
    rand, numarul de aici urca.
  */
  const MINIM_IN_FAVOAREA_LOR: Record<string, number> = {
    shopify: 2,
    cartum: 0,
    wix: 1,
    woocommerce: 2,
    opencart: 2,
    magento: 5,
  };

  for (const [cheie, tabel] of Object.entries(TABELE_VS)) {
    const inFavoareaLor = tabel.randuri.filter(
      (r) => r.edinio === false || (r.rival === true && r.edinio !== true),
    );
    assert.ok(
      inFavoareaLor.length >= MINIM_IN_FAVOAREA_LOR[cheie],
      `${cheie}: ${inFavoareaLor.length} randuri in favoarea lor, erau ${MINIM_IN_FAVOAREA_LOR[cheie]} in PDF — s-a sters un rand incomod?`,
    );
  }
});

test("editia comparata e spusa acolo unde conteaza", () => {
  /* OpenCart si Magento au si editii comerciale. Aceleasi randuri ar fi
     neadevarate despre alea, deci editia trebuie numita — si in capul coloanei,
     si in randul de deschidere. */
  for (const cheie of ["opencart", "magento"] as const) {
    const tabel = TABELE_VS[cheie];
    assert.match(tabel.coloanaRival, /Open Source/, `${cheie}: capul coloanei nu spune editia`);
    assert.match(tabel.intro, /Open Source/, `${cheie}: deschiderea nu spune editia`);
  }
});

test("legenda si avertismentul exista si spun ce trebuie", () => {
  assert.ok(LEGENDA_VS.da.length > 10);
  assert.ok(LEGENDA_VS.nu.length > 40, "explicatia lui X e cea care tine tabelul onest");
  /* ⚠ Avertismentul nu e de politete: tabelul spune lucruri despre firme straine,
     iar ce ofera ele se schimba fara sa ne anunte. */
  assert.match(AVERTISMENT_VS, /se pot modifica/);
});

/* ═══════════════════════════════════════════════════════════════════════════
   STRATUL DE DOVEZI (04.09.2026)
   ═══════════════════════════════════════════════════════════════════════════

   Publicitatea comparativa cere ca fiecare afirmatie sa fie verificabila. Pana
   azi tabelele n-aveau nici data, nici sursa: cine voia sa verifice nu stia nici
   CAND ne-am uitat, nici UNDE.

   ⚠ PROSPETIMEA NU SE PROBEAZA AICI. O proba care cade dupa 183 de zile ar
   deveni rosie intr-o zi in care nimeni n-a atins codul, iar suita ruleaza
   inaintea fiecarui push — ar fi blocat un push urgent pentru un tabel de
   marketing. Sta in `npm run verifica:surse-vs`, care se cheama cand vrei.
   Aici se probeaza doar ce e ADEVARAT MEREU: forma datei si a adreselor.
*/

test("fiecare tabel spune CAND a fost verificat, in forma AAAA-LL-ZZ", () => {
  for (const [cheie, tabel] of Object.entries(TABELE_VS)) {
    assert.match(
      tabel.verificatLa,
      /^\d{4}-\d{2}-\d{2}$/,
      `${cheie}: data de verificare nu e in forma AAAA-LL-ZZ`,
    );
    /* O data din viitor inseamna ca cineva a scris altceva decat s-a intamplat. */
    assert.ok(
      new Date(`${tabel.verificatLa}T12:00:00Z`) <= new Date(),
      `${cheie}: data de verificare e in VIITOR`,
    );
  }
});

test("fiecare tabel spune UNDE, si adresa e https si absoluta", () => {
  for (const [cheie, tabel] of Object.entries(TABELE_VS)) {
    const u = new URL(tabel.siteOficial);
    assert.equal(u.protocol, "https:", `${cheie}: site-ul oficial nu e https`);
    assert.ok(u.hostname.includes("."), `${cheie}: gazda nu arata a domeniu`);
    /* ⚠ Nu e site-ul NOSTRU. O adresa catre noi insine ar arata a sursa fara sa
       fie una — exact felul de dovada care nu dovedeste nimic. */
    assert.ok(
      !/(^|\.)edinio\.com$/.test(u.hostname),
      `${cheie}: „site-ul oficial" al concurentului arata catre noi`,
    );
  }
});

test("o `sursa` de rand sta pe CHIAR domeniul oficial al platformei", () => {
  /*
    ⚠ ASTA E REGULA CARE FACE DOVADA SA INSEMNE CEVA. O legatura catre un blog
    de altcineva, sau catre un domeniu parcat, arata a sursa fara sa fie una:
    `cartum.ro` e parcat, ei traiesc pe `cartum.io` — cine ar fi pus prima
    adresa ar fi trimis cititorul in gol.

    Azi niciun rand n-are `sursa` (auditul a cerut STRATUL, nu rescrierea
    afirmatiilor). Regula exista pentru primul care va pune una.
  */
  for (const [cheie, tabel] of Object.entries(TABELE_VS)) {
    const gazdaOficiala = new URL(tabel.siteOficial).hostname.replace(/^www\./, "");
    for (const rand of tabel.randuri) {
      if (!rand.sursa) continue;
      const gazdaSursei = new URL(rand.sursa).hostname.replace(/^www\./, "");
      assert.ok(
        gazdaSursei === gazdaOficiala || gazdaSursei.endsWith(`.${gazdaOficiala}`),
        `${cheie} / „${rand.criteriu}": sursa e pe ${gazdaSursei}, nu pe ${gazdaOficiala}`,
      );
    }
  }
});

test("`sursa` e o dovada pentru INTRETINATOR, si nu se scurge pe pagina", () => {
  /*
    ⚠ O REVIZIE A INTREBAT DE CE EXISTA UN CAMP PE CARE NIMENI NU-L CITESTE, si
    intrebarea era buna: un camp declarat, tipat si probat, dar nerandat, arata
    exact ca o cablare uitata. Nu e — e hotararea proprietarului din 04.09,
    scrisa in `comparatii-vs.ts` la `cartum`: dovezile stau IN COD, fiindca doua
    dintre ele CONTRAZIC chiar randul de langa care ar fi aparut.

    Fara randul asta, hotararea traieste doar intr-un comentariu. Cu el, cine o
    schimba e trimis inapoi la nota, sa schimbe si nota. Ce nu se poate intampla
    e sa se schimbe TACUT.

    ⚠ Se citeste cu comentariile scoase: chiar nota de mai sus scrie „sursa".
  */
  const TABEL = join(AICI, "..", "..", "components", "website", "sections", "TabelVersus.tsx");
  const sursa = readFileSync(TABEL, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  /* Proba nu e vida: fisierul chiar e cel care deseneaza tabelul. */
  assert.match(sursa, /rand\.criteriu/, "nu mai e componenta care randeaza randurile");

  assert.doesNotMatch(
    sursa,
    /\.sursa\b/,
    "TabelVersus a inceput sa afiseze `sursa`. Daca e o hotarare, schimb-o si in nota " +
      "de la `RandVs.sursa` din comparatii-vs.ts si in nota de la `cartum` — acolo scrie " +
      "de ce doua dintre dovezile de azi contrazic chiar randul de langa care ar aparea.",
  );
});

test("regula de sursa chiar poate cadea", () => {
  /* Aserttiunea de mai sus e VIDA azi: niciun rand n-are `sursa`, deci bucla nu
     se executa niciodata. Fara randurile astea, ar fi verde din lene si ar
     ramane asa pana cand cineva ar pune o sursa gresita. */
  const potrivit = (oficial: string, sursa: string) => {
    const o = new URL(oficial).hostname.replace(/^www\./, "");
    const s = new URL(sursa).hostname.replace(/^www\./, "");
    return s === o || s.endsWith(`.${o}`);
  };
  assert.equal(potrivit("https://cartum.io", "https://cartum.io/ro/integration/"), true);
  assert.equal(potrivit("https://cartum.io", "https://help.cartum.io/x"), true, "subdomeniul lor e tot al lor");
  assert.equal(potrivit("https://cartum.io", "https://cartum.ro/x"), false, "domeniul PARCAT nu e sursa");
  assert.equal(potrivit("https://cartum.io", "https://help.horoshop.ua/x"), false, "alt domeniu, chiar daca e al aceleiasi firme");
  assert.equal(potrivit("https://www.shopify.com", "https://shopify.com/pricing"), true, "www nu conteaza");
  assert.equal(potrivit("https://www.shopify.com", "https://notshopify.com/x"), false);
});
