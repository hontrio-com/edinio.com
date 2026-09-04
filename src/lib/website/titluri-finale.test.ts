import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { siteMetadata } from "./metadata";
import { COMPETITORS } from "./nav";

/*
  ═══ TITLURILE ȘI DESCRIERILE FINALE, CUVÂNT CU CUVÂNT ═══

  Textele de mai jos au fost stabilite cu proprietarul pe 04.09.2026, pagină cu
  pagină. Nu sunt sugestii: sunt CHIAR ce trebuie să apară în rezultatele Google.
  Proba asta e singurul loc din depozit care le ține scrise o dată și le
  confruntă cu ce e în pagini.

  ⚠ DE CE E NEVOIE DE EA, deși valorile stau deja în `page.tsx`. Fiindcă
  `<title>`-ul final NU e șirul din pagină: rădăcina (`app/layout.tsx`) declară
  `template: "%s | Edinio"`, deci Next lipește sufixul peste tot ce nu se declară
  `absolute`. Adică adevărul se află abia după compunere, iar o pagină poate fi
  „corectă" în sursă și greșită în HTML. Aici se măsoară compunerea.

  ⚠ TREI TITLURI NU IAU ȘABLONUL, și ele sunt capcana. Nu se termină în
  „| Edinio", deci lăsate pe șablon ar fi ieșit „Contact Edinio | Suport și
  asistență | Edinio" sau „Întrebări frecvente despre Edinio | Edinio". Ele se
  dau cu `titluComplet: true`, iar proba verifică AMÂNDOUĂ fețele: că cele trei
  chiar sar peste sufix, și că toate celelalte chiar îl primesc.

  ⚠ DIACRITICELE FAC PARTE DIN TEXT. Metadatele depozitului erau scrise fără
  ele, ca o convenție; textele finale le au. Un „Preţ" cu ț cedilat sau un „Pret"
  gol ar fi altceva decât s-a aprobat, iar în rezultatele Google se vede.
*/

const AICI = dirname(fileURLToPath(import.meta.url));
const APP = join(AICI, "..", "..", "app");

/** Sufixul pe care rădăcina îl lipește peste orice titlu nedeclarat `absolute`. */
const SUFIX = " | Edinio";

interface Asteptat {
  /** Fișierul care declară metadatele, relativ la `src/app`. */
  fisier: string;
  /** `<title>`-ul din HTML, după ce Next a aplicat șablonul. */
  titlu: string;
  /** `<meta name="description">`. */
  descriere: string;
}

/**
 * Adevărul, pentru fiecare pagină statică.
 *
 * Ordinea e cea din brief-ul proprietarului, ca perechile să poată fi citite
 * alături de el fără să fie căutate.
 */
const PAGINI: Record<string, Asteptat> = {
  "/": {
    fisier: "(website)/page.tsx",
    titlu: "Platformă eCommerce pentru crearea unui magazin online | Edinio",
    descriere:
      "Creează și administrează magazinul tău online cu Edinio, platforma eCommerce românească cu integrări, automatizări și mentenanță gratuită permanentă.",
  },
  "/preturi": {
    fisier: "(website)/preturi/page.tsx",
    titlu: "Preț creare magazin online cu platforma Edinio | Edinio",
    descriere:
      "Creează-ți magazinul online cu Edinio de la 99 lei/lună. Ai 15 zile gratuite, integrări incluse și mentenanță gratuită permanentă.",
  },
  "/integrari": {
    fisier: "(website)/integrari/page.tsx",
    titlu: "Integrări magazin online pentru curieri, plăți și facturare | Edinio",
    descriere:
      "Edinio îți permite să conectezi rapid curieri, plăți, facturare, marketplace-uri și servicii de marketing pentru magazinul tău online.",
  },
  "/migrare": {
    fisier: "(website)/migrare/page.tsx",
    titlu: "Migrare magazin online din orice platformă | Edinio",
    descriere:
      "Treci pe Edinio fără să pornești de la zero. Transferăm produsele, categoriile, clienții și comenzile magazinului tău online.",
  },
  "/optimizare": {
    fisier: "(website)/optimizare/page.tsx",
    titlu: "Magazin online rapid și optimizat SEO | Edinio",
    descriere:
      "Creează cu Edinio un magazin online rapid, optimizat pentru SEO, mobil și performanță, pregătit tehnic pentru Google și alte motoare de căutare.",
  },
  "/mentenanta-gratuita": {
    fisier: "(website)/mentenanta-gratuita/page.tsx",
    titlu: "Mentenanță gratuită permanentă pentru magazin online | Edinio",
    descriere:
      "Nu plătești separat pentru mentenanță. Edinio se ocupă permanent de actualizări, securitate, remedieri și optimizarea magazinului tău online.",
  },
  "/intrebari-frecvente": {
    fisier: "(website)/intrebari-frecvente/page.tsx",
    titlu: "Întrebări frecvente despre Edinio",
    descriere:
      "Află cum funcționează Edinio și găsește răspunsuri despre integrări, mentenanță, plăți, domeniu propriu și administrarea magazinului online.",
  },
  "/blog": {
    fisier: "(website)/blog/page.tsx",
    titlu: "Blog eCommerce: sfaturi, noutăți și tendințe | Edinio",
    descriere:
      "Citește sfaturi practice, noutăți și tendințe despre eCommerce, magazine online, marketing, vânzare online și evoluția comerțului digital.",
  },
  "/ajutor": {
    fisier: "(ajutor)/ajutor/page.tsx",
    titlu: "Centru de ajutor Edinio: ghiduri și tutoriale",
    descriere:
      "Centrul de ajutor Edinio îți oferă ghiduri pas cu pas pentru configurarea magazinului, administrarea produselor, comenzilor și integrărilor.",
  },
  "/contact": {
    fisier: "(website)/contact/page.tsx",
    titlu: "Contact Edinio | Suport și asistență",
    descriere:
      "Ai nevoie de ajutor? Contactează echipa Edinio pentru suport, configurare, integrări sau întrebări despre magazinul tău online.",
  },
  "/vs": {
    fisier: "(website)/vs/page.tsx",
    titlu: "Compară Edinio cu alte platforme eCommerce | Edinio",
    descriere:
      "Compară Edinio cu alte platforme eCommerce după costuri, funcționalități, integrări și mentenanță, ca să alegi soluția potrivită magazinului tău.",
  },
  "/termeni": {
    fisier: "(website)/termeni/page.tsx",
    titlu: "Termeni și condiții | Edinio",
    descriere:
      "Consultă termenii și condițiile de utilizare a platformei Edinio, inclusiv regulile privind contul, abonamentul, plățile și utilizarea serviciilor.",
  },
  "/confidentialitate": {
    fisier: "(website)/confidentialitate/page.tsx",
    titlu: "Politica de confidențialitate | Edinio",
    descriere:
      "Află cum Edinio colectează, utilizează și protejează datele cu caracter personal și ce drepturi ai privind prelucrarea datelor.",
  },
  "/cookies": {
    fisier: "(website)/cookies/page.tsx",
    titlu: "Politica privind cookie-urile | Edinio",
    descriere:
      "Află ce tipuri de cookie-uri folosește Edinio, în ce scop sunt utilizate și cum îți poți gestiona preferințele privind cookie-urile.",
  },
  "/gdpr": {
    fisier: "(website)/gdpr/page.tsx",
    titlu: "Drepturile GDPR | Edinio",
    descriere:
      "Află care sunt drepturile tale privind protecția datelor personale și cum le poți exercita în relația cu Edinio, conform legislației aplicabile.",
  },
};

/**
 * Sursa unei pagini, fără comentarii.
 *
 * ⚠ Comentariile se scot fiindcă notele din pagini citează chiar textele
 * căutate — o scanare naivă s-ar fi agățat de propriile explicații.
 */
function sursa(fisier: string): string {
  return readFileSync(join(APP, fisier), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("titlurile finale, așa cum ajung în HTML", () => {
  for (const [ruta, a] of Object.entries(PAGINI)) {
    test(`${ruta}`, () => {
      const s = sursa(a.fisier);

      /* Pagina se declară `absolute` doar dacă titlul cerut NU se termină în
         sufixul mărcii. Amândouă fețele contează: fără steag ar ieși dublat, cu
         steag pus degeaba ar lipsi sufixul. */
      const cereSteag = !a.titlu.endsWith(SUFIX);
      const areSteag = /titluComplet:\s*true/.test(s);
      assert.equal(
        areSteag,
        cereSteag,
        cereSteag
          ? `${ruta}: titlul „${a.titlu}" nu se termină în „${SUFIX}", deci are nevoie de ` +
            "`titluComplet: true` — altfel șablonul rădăcinii îi lipește încă un „| Edinio”"
          : `${ruta}: are titluComplet degeaba — titlul cerut se termină în „${SUFIX}", ` +
            "deci sufixul trebuie lăsat pe seama șablonului, nu scris de două ori",
      );

      /* Bucata pe care pagina o trimite: titlul întreg minus sufixul, dacă
         sufixul vine de la șablon. */
      const bucata = cereSteag ? a.titlu : a.titlu.slice(0, -SUFIX.length);
      assert.ok(
        s.includes(JSON.stringify(bucata)),
        `${ruta}: nu găsesc titlul în ${a.fisier}.\n  aștept: ${JSON.stringify(bucata)}`,
      );

      assert.ok(
        s.includes(JSON.stringify(a.descriere)),
        `${ruta}: nu găsesc descrierea în ${a.fisier}.\n  aștept: ${JSON.stringify(a.descriere)}`,
      );
    });
  }
});

describe("regulile pe care textele trebuie să le respecte", () => {
  const toate = Object.entries(PAGINI);

  test("niciun titlu nu poartă „Edinio” de două ori", () => {
    /*
      ⚠ ASTA E CHIAR DEFECTUL DE CARE SE TEME BRIEF-UL. `template: "%s | Edinio"`
      peste un titlu care se termină deja în „| Edinio" dă
      „… | Edinio | Edinio". Se numără pe titlul FINAL, adică după compunere.
    */
    for (const [ruta, a] of toate) {
      const cate = (a.titlu.match(/Edinio/g) ?? []).length;
      assert.ok(cate <= 1 || !a.titlu.includes(`${SUFIX}${SUFIX}`), `${ruta}: „${a.titlu}"`);
      assert.doesNotMatch(a.titlu, /\| Edinio \| Edinio/, `${ruta}: sufix dublat`);
    }
  });

  test("fiecare pagină are titlu ȘI descriere proprie — niciuna repetată", () => {
    /* Două pagini cu aceeași descriere e semnalul clasic de canibalizare, și e
       și lucrul pe care Search Console îl raportează ca „duplicate". */
    const titluri = toate.map(([, a]) => a.titlu);
    const descrieri = toate.map(([, a]) => a.descriere);
    assert.equal(new Set(titluri).size, titluri.length, "două pagini au același titlu");
    assert.equal(new Set(descrieri).size, descrieri.length, "două pagini au aceeași descriere");
  });

  test("diacriticele românești sunt cele adevărate, nu cedilele", () => {
    /*
      ⚠ „ş"/„ţ" CU SEDILĂ (U+015F, U+0163) NU SUNT LITERE ROMÂNEȘTI. Cele bune au
      virgulă dedesubt: „ș" (U+0219) și „ț" (U+021B). Arată aproape la fel în
      editor și se pot strecura dintr-un copy-paste vechi; în rezultatele Google
      și la căutare se comportă ca alt caracter.
    */
    for (const [ruta, a] of toate) {
      for (const camp of [a.titlu, a.descriere]) {
        assert.doesNotMatch(camp, /[şţ]/, `${ruta}: are ș/ț cu sedilă în „${camp}"`);
      }
    }
  });

  test("nicăieri `meta keywords`", () => {
    /* Nu le folosim, și rădăcina le-a pierdut dinadins pe 04.09.2026: metadata
       rădăcinii se moștenește de TOT ce randează aplicația, deci expresiile
       platformei ajungeau pe domeniile proprii ale comercianților. */
    for (const a of Object.values(PAGINI)) {
      assert.doesNotMatch(sursa(a.fisier), /\bkeywords\s*:/, `${a.fisier} declară keywords`);
    }
  });
});

describe("niciun titlu nu se termină în „Edinio | Edinio”", () => {
  /*
    ⚠ REGULA ASTA A FOST SCRISĂ DUPĂ CE DEFECTUL A FOST MĂSURAT, nu înainte.
    Toate cele 415 pagini ale centrului de ajutor rendau
    „… - Centru de ajutor Edinio | Edinio": titlul lor se termina în „Edinio",
    iar șablonul rădăcinii îi mai lipea unul. Nimic nu cădea — `<title>` era
    valid, doar caraghios, și se vedea numai în rezultatele Google.

    ⚠ NU E „Edinio de două ori”. Titlul cerut pentru /vs/{concurent} e
    „Edinio vs Shopify: … | Edinio", care ÎL are de două ori pe bună dreptate:
    primul e subiectul comparației, al doilea e marca. Defectul e mai îngust și
    se vede după formă, nu după număr — titlul se TERMINĂ în „Edinio" și mai
    primește un „| Edinio" de la șablon, adică două nume lipite unul de altul.

    ⚠ SE UITĂ DOAR LA TITLURILE DINAMICE, și tot o măsurătoare a decis asta.
    Prima scriere a regulii se uita la toate paginile și s-a aprins pe /preturi —
    al cărui titlu CERUT este chiar „Preț creare magazin online cu platforma
    Edinio | Edinio". Deci există un caz în care „Edinio" la coadă plus sufix e
    exact ce a aprobat proprietarul, iar regula n-are ce căuta acolo: paginile
    statice își au textele fixate cuvânt cu cuvânt în tabelul de sus, deci nu pot
    aluneca. Regula asta păzește ce NU se poate fixa într-un tabel — titlurile
    compuse la rulare, din date.

    ⚠ Și se citește DOAR dinăuntrul apelului de `siteMetadata`. A doua alarmă
    falsă a venit din `alternates.types`, unde fluxul RSS are și el un `title`
    („Blogul Edinio") care n-are nicio legătură cu `<title>`.
  */
  const APELURI = [
    "(website)/vs/[competitor]/page.tsx",
    "(website)/blog/categorie/[slug]/page.tsx",
    "(website)/blog/autor/[slug]/page.tsx",
    "(ajutor)/ajutor/[categorie]/page.tsx",
    "(ajutor)/ajutor/[categorie]/[ghid]/page.tsx",
  ];

  /** Bucata de sursă dinăuntrul apelului `siteMetadata({ … })`. */
  function apelul(s: string): string {
    const i = s.indexOf("siteMetadata({");
    if (i < 0) return "";
    let adanc = 0;
    for (let j = s.indexOf("{", i); j < s.length; j++) {
      if (s[j] === "{") adanc++;
      else if (s[j] === "}" && --adanc === 0) return s.slice(i, j + 1);
    }
    return s.slice(i);
  }

  test("proba nu e vidă: fișierele chiar cheamă helperul", () => {
    for (const f of APELURI) {
      assert.match(sursa(f), /siteMetadata\(/, `${f} nu mai cheamă siteMetadata — lista a rămas în urmă`);
    }
  });

  for (const f of APELURI) {
    test(`${f}`, () => {
      /*
        ⚠ SE CAUTĂ FORMA, NU LOCUL. Titlul nu e mereu un literal în apel: la
        `/blog/categorie` e o variabilă compusă mai sus, cu un fallback din baza
        de date. Deci se strâng TOATE literalele fișierului care se termină în
        „Edinio" fără punctuație după — forma care, plus sufixul șablonului, dă
        „Edinio | Edinio". Descrierile scapă de la sine: ele se termină în punct.
      */
      const bucata = sursa(f);
      const literale = [
        ...[...bucata.matchAll(/"([^"\n]*)"/g)].map((m) => m[1]),
        ...[...bucata.matchAll(/`([^`]*)`/g)].map((m) => m[1]),
      ];
      const primejdioase = literale.filter((t) => t.trimEnd().endsWith("Edinio"));
      if (primejdioase.length === 0) return;
      const absolut = /titluComplet:\s*true/.test(bucata);
      assert.ok(
        absolut,
        `${f}: „${primejdioase[0]}" se termină în „Edinio", iar șablonul rădăcinii îi mai ` +
          "lipește un „| Edinio”, deci iese „… Edinio | Edinio”. " +
          "Pune `titluComplet: true` — textul rămâne neschimbat, dispare doar sufixul dublat.",
      );
    });
  }

  test("regula chiar poate cădea, și nu se aprinde pe titlurile bune", () => {
    /* Fără rândurile astea, scanarea ar fi verde din lene. */
    const primejdios = (t: string) => t.trimEnd().endsWith("Edinio");
    assert.equal(primejdios("Centru de ajutor Edinio"), true, "n-a prins forma măsurată");
    assert.equal(primejdios("${c.titlu} - Centru de ajutor Edinio"), true);
    /* Descrierile se termină în punct, deci nu intră în discuție. */
    assert.equal(primejdios("Articole despre x de pe blogul Edinio."), false);
    /* Titlul de la /vs îl are pe „Edinio" în față, nu la coadă. */
    assert.equal(primejdios("Edinio vs Shopify: care platformă eCommerce ți se potrivește?"), false);
  });
});

describe("paginile /vs/{concurent}: șablon comun, conținut individual", () => {
  /*
    Metadatele urmează o formulă, fiindcă intenția de căutare e aceeași pe toate
    șase („Edinio sau X?"). Ce rămâne diferit e conținutul: titlul vizibil, fraza
    de sub el, rândurile tabelului, sursele și data verificării.
  */
  const titlu = (n: string) => `Edinio vs ${n}: care platformă eCommerce ți se potrivește?`;
  const descriere = (n: string) =>
    `Edinio sau ${n}? Compară costurile, integrările, mentenanța și modul de ` +
    "administrare înainte să alegi platforma pentru magazinul tău online.";

  test("proba nu e vidă: lista de concurenți chiar are pagini", () => {
    assert.ok(COMPETITORS.length >= 6, `doar ${COMPETITORS.length} concurenți`);
  });

  for (const c of COMPETITORS) {
    test(`${c.href}`, () => {
      const m = siteMetadata({ title: titlu(c.name), description: descriere(c.name), path: c.href });
      /* `<title>` final = ce trimite pagina + sufixul șablonului. */
      assert.equal(`${m.title as string}${SUFIX}`, `${titlu(c.name)}${SUFIX}`);
      assert.equal(m.description, descriere(c.name));
      /* Canonicul rămâne al paginii, nu al listei. */
      assert.equal(
        (m.alternates as { canonical?: string }).canonical,
        `https://www.edinio.com${c.href}`,
      );
    });
  }

  test("șablonul din pagină e CHIAR cel de aici", () => {
    /* Altfel proba de mai sus ar măsura o copie a formulei, nu formula folosită. */
    const s = sursa("(website)/vs/[competitor]/page.tsx");
    assert.match(s, /care platformă eCommerce ți se potrivește\?/, "titlul din pagină s-a schimbat");
    assert.match(s, /Compară costurile, integrările, mentenanța/, "descrierea din pagină s-a schimbat");
  });
});
