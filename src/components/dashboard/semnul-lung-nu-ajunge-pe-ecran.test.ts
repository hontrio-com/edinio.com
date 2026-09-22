import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

/*
 * Semnul lung nu ajunge pe ecranul comerciantului, in panourile de curier.
 *
 * ═══ REGULA ═══
 *
 * Proprietarul a cerut ca semnul lung sa nu apara in scrierea mea, nicaieri.
 * Plasa asta tine linia unde a fost curatata: in panourile de expediere, ZERO
 * aparitii in pozitii care ajung pe ecran, adica in cod sau in siruri.
 *
 * ⚠ LISTA NU E "TOATE PANOURILE DE CURIER"
 *
 * E "cele al caror nume incepe cu unul din 17 prefixe", plus trei numite pe
 * litere. Nu e acelasi lucru, si diferenta a costat: `EmagAwbModal` emite AWB-uri
 * adevarate fara sa inceapa cu vreun prefix, `ShippingRulesEditor` avea DOUA
 * semne chiar pe ecran, iar `useGreutateaAwb` e `.ts` intr-o scanare de `.tsx`,
 * desi sirurile lui se randeaza INAUNTRUL modalelor deja curatate.
 *
 * Populatia fusese numita dupa tiparul cu care am cautat-o. De aceea a treia
 * proba de mai jos cere ca ORICE `*AwbModal.tsx` sau `*PickupModal.tsx` din dosar
 * sa fie in lista: urmatorul panou nascut in afara prefixelor pica proba in loc
 * sa se strecoare.
 *
 * ⚠ Comentariile din aceleasi fisiere NU sunt curatate inca: 120 de aparitii,
 * masurate pe 14.09.2026. Sunt tot scrisul meu si tot trebuie sa plece, dar
 * sunt igiena, nu text citit de cineva. Plasa nu le numara DINADINS, ca sa nu
 * pice la fiecare comentariu rescris. Vezi memoria `recensamant-emdash-si-textul-lui`.
 *
 * ═══ CE S-A MASURAT ═══
 *
 * 252 de aparitii in 33 de fisiere: 132 pe ecran, 120 in comentarii. Cele 132
 * au plecat pe 14.09.2026.
 *
 * ⚠ `rg` daduse 242, si avea dreptate: numara RANDURI cu potrivire, nu
 * APARITII. Sase randuri aveau cate doua semne. O cifra rotunda nu inseamna
 * nimic pana nu stii ce unitate numara.
 *
 * ═══ ⚠ DE CE PLASA ARE SI O MOSTRA, NU DOAR HARTA ═══
 *
 * O harta goala poate insemna doua lucruri: ori chiar nu mai e niciun semn pe
 * ecran, ori lexerul s-a stricat si crede ca TOT e comentariu. In al doilea caz
 * proba ar trece pe vecie fara sa apere nimic.
 *
 * De aceea prima proba da lexerului o mostra cu clasificare stiuta dinainte,
 * si cere numarul exact pe fiecare stare. Intre randurile ei e chiar cazul care
 * mi-a pacalit primul clasificator: randul care INCHIDE un bloc de comentariu
 * nu incepe cu `*`, deci o potrivire pe prefix il numea gresit "de pe ecran".
 * Prima cernere daduse 152/90; adevarul era 132/120.
 *
 * Fiecare proba trebuie sa poata si ESUA, nu doar sa treaca.
 */

const PANOURI = "src/components/dashboard";
const SEMN = "—";

const CURIERI = [
  "Cargus", "Colete", "Gls", "Packeta", "Ups", "Woot", "Pallex", "Shipo",
  "Ecolet", "Dhl", "Fedex", "Posta", "Sameday", "Dpd", "FanCourier",
  "Innoship", "Smartship",
];

/* Panouri de expediere pe care prefixele le sar prin constructie. */
const SUPLIMENTARE = [
  "EmagAwbModal.tsx",        // emite AWB-uri, dar nu poarta numele unui curier
  "ShippingRulesEditor.tsx", // constructorul de reguli de livrare
  "useGreutateaAwb.ts",      // `.ts`, si textul lui se vede in modalele de AWB
];

const COD = "cod";
const SIR = "sir";
const RAND = "rand";
const BLOC = "bloc";
type Stare = typeof COD | typeof SIR | typeof RAND | typeof BLOC;

/*
 * Parcurge textul caracter cu caracter si spune, pentru FIECARE semn lung, in
 * ce stare se afla chiar el: cod, sir, comentariu de rand, comentariu de bloc.
 * Nu se uita la randul lui, ci la pozitia lui.
 */
function stari(text: string): Array<[number, Stare]> {
  const iesire: Array<[number, Stare]> = [];
  let stare: Stare = COD;
  let ghilimea = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const d = i + 1 < text.length ? text[i + 1] : "";
    if (stare === COD) {
      if (c === "/" && d === "/") { stare = RAND; i += 2; continue; }
      if (c === "/" && d === "*") { stare = BLOC; i += 2; continue; }
      if (c === "'" || c === '"' || c === "`") { stare = SIR; ghilimea = c; }
      else if (c === SEMN) iesire.push([i, COD]);
    } else if (stare === SIR) {
      if (c === "\\") { i += 2; continue; }
      // ⚠ Si linia noua inchide sirul: un sir nenchis pe rand e mai probabil o
      //   ghilimea din proza decat un literal care se intinde. Textul dintr-un
      //   sabon pe mai multe randuri ramane astfel tot "de ecran", corect.
      if (c === ghilimea || c === "\n") { stare = COD; ghilimea = ""; }
      else if (c === SEMN) iesire.push([i, SIR]);
    } else if (stare === RAND) {
      if (c === "\n") stare = COD;
      else if (c === SEMN) iesire.push([i, RAND]);
    } else {
      if (c === "*" && d === "/") { stare = COD; i += 2; continue; }
      if (c === SEMN) iesire.push([i, BLOC]);
    }
    i += 1;
  }
  return iesire;
}

function panouriDeCurier(): string[] {
  const dupaPrefix = readdirSync(PANOURI)
    .filter((f) => f.endsWith(".tsx") && CURIERI.some((c) => f.startsWith(c)));
  return [...new Set([...dupaPrefix, ...SUPLIMENTARE])].sort();
}

function nrRand(text: string, poz: number): number {
  return text.slice(0, poz).split("\n").length;
}

test("lexerul chiar deosebeste sirul de comentariu, inclusiv randul care INCHIDE blocul", () => {
  const mostra = [
    `const a = "x ${SEMN} y";`,                        // sir, ajunge pe ecran
    `// un comentariu ${SEMN} cu semn`,                // comentariu de rand
    "/* bloc de comentariu",                           //
    ` * inca unul ${SEMN} aici`,                       // bloc
    ` si randul care inchide ${SEMN} tot bloc */`,     // ⚠ bloc, desi nu incepe cu *
    `const b = <p>text ${SEMN} in JSX</p>;`,           // cod, ajunge pe ecran
  ].join("\n");

  const gasite = stari(mostra);
  const cate = { cod: 0, sir: 0, rand: 0, bloc: 0 };
  for (const [, st] of gasite) cate[st] += 1;

  assert.deepEqual(
    cate,
    { cod: 1, sir: 1, rand: 1, bloc: 2 },
    "Daca lexerul se strica si crede ca tot e comentariu, harta de mai jos iese"
      + " goala si proba trece pe vecie fara sa apere nimic. Randul care inchide"
      + " blocul nu incepe cu `*`: o potrivire pe prefix il numeste gresit.",
  );
});

test("niciun semn lung in textele vazute de comerciant, in panourile de curier", () => {
  const harta: Record<string, string[]> = {};
  for (const f of panouriDeCurier()) {
    const text = readFileSync(join(PANOURI, f), "utf8").replace(/\r\n/g, "\n");
    if (!text.includes(SEMN)) continue;
    const peEcran = stari(text)
      .filter(([, st]) => st === COD || st === SIR)
      .map(([poz]) => `:${nrRand(text, poz)}`);
    if (peEcran.length > 0) harta[f] = peEcran;
  }

  assert.deepEqual(
    harta,
    {},
    "Un semn lung a ajuns inapoi intr-un text pe care il vede comerciantul."
      + " Pune virgula cand tine loc de apozitie, `·` cand imbina doua bucati"
      + " de date, si `-` cand e semn de valoare lipsa.",
  );
});

/*
 * ═══ ZONA INTEGRARI, ADAUGATA PE 22.09.2026 ═══
 *
 * Cerinta „fara semn lung" nu se opreste la curieri; el a cerut-o pentru TOT ce
 * citeste un comerciant. Masurat in ziua aia, ecranele de integrari aveau 33 de
 * semne pe ecran: descrierile paginilor de DHL si FedEx, cele patru randuri de
 * evenimente de la Google Ads si de la Meta, comutatorul „Platile nu sunt reale"
 * repetat la Netopia, iPay, Klarna si Revolut, si noua la SmartBill.
 *
 * ⚠ POPULATIA SE INTREABA DE LA DOSAR, nu se scrie ca lista. Un ecran de
 * integrare nou se recunoaste singur dupa doua semne pe care le are prin
 * constructie: ori sta pe ruta `/dashboard/features`, ori e un `*ConfigClient`,
 * ori poarta legatura de intoarcere catre `/dashboard/features`. Asa intra in
 * plasa si Mailchimp, Brevo si Klaviyo, care isi scriu antetul de mana si n-ar
 * fi fost prinse de niciun sufix. Aceeasi lectie ca la `EmagAwbModal` mai jos:
 * o lista nu stie ce NU e in ea.
 */

const RUTA_INTEGRARI = "src/app/(dashboard)/dashboard/features";

/** `@/x` sau `./x` -> fisierul de pe disc, sau `null` daca e un pachet din `node_modules`. */
function fisierulImportat(spec: string, dinFisier: string): string | null {
  let baza: string;
  if (spec.startsWith("@/")) baza = join("src", spec.slice(2));
  else if (spec.startsWith(".")) baza = join(dirname(dinFisier), spec);
  else return null;
  for (const capat of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(baza + capat)) return baza + capat;
  }
  return null;
}

/**
 * Ecranele de integrari: rutele de sub `/dashboard/features` PLUS tot ce
 * importa ele, de-a lungul intregului lant.
 *
 * ⚠ SE INTREABA IMPORTURILE, NU NUMELE FISIERELOR. Prima scriere culegea
 * `*ConfigClient.tsx` plus fisierele care poarta legatura de intoarcere catre
 * `/dashboard/features`. Aratau ca o populatie buna si nu erau: `TrendyolClient`,
 * `OlxClient`, `PepitaClient`, `AboutYouCategoryMapping` si inca zece nu au
 * sufixul si nu scriu ei legatura (o scrie `IntegrationHeader`). Treizeci si trei
 * de semne lungi stateau chiar acolo, pe ecrane de integrari, si proba trecea.
 *
 * Un fisier la care ajunge o ruta de integrari E un ecran de integrari. Asta nu
 * se poate uita la scrierea urmatorului.
 */
function ecraneDeIntegrare(): string[] {
  const start: string[] = [];
  const subDosare = (dir: string) => {
    for (const intrare of readdirSync(dir, { withFileTypes: true })) {
      const cale = join(dir, intrare.name);
      if (intrare.isDirectory()) subDosare(cale);
      else if (intrare.name.endsWith(".tsx")) start.push(cale);
    }
  };
  subDosare(RUTA_INTEGRARI);

  const vazute = new Set(start);
  const coada = [...start];
  while (coada.length) {
    const cale = coada.pop()!;
    let text: string;
    try { text = readFileSync(cale, "utf8"); } catch { continue; }
    for (const m of text.matchAll(/from\s+"([^"]+)"/g)) {
      const tinta = fisierulImportat(m[1], cale);
      if (tinta && !vazute.has(tinta)) { vazute.add(tinta); coada.push(tinta); }
    }
  }
  /* Doar `.tsx`: semnele din `.ts` care ajung pe ecran vin oricum prin ele. */
  return [...vazute].filter((c) => c.endsWith(".tsx")).sort();
}

test("niciun semn lung in textele vazute de comerciant, pe ecranele de INTEGRARI", () => {
  const ecrane = ecraneDeIntegrare();

  /*
    Fara asta, un dosar mutat ar face proba sa treaca peste o multime goala.
    Pragul e pus sub masuratoarea din 22.09.2026 (155 de fisiere), ca sa nu pice
    la fiecare componenta scoasa, dar destul de sus cat sa prinda lantul rupt.
  */
  assert.ok(ecrane.length > 100, `am gasit doar ${ecrane.length} ecrane de integrare; ruta s-a mutat?`);

  const harta: Record<string, string[]> = {};
  for (const cale of ecrane) {
    const text = readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
    if (!text.includes(SEMN)) continue;
    const peEcran = stari(text)
      .filter(([, st]) => st === COD || st === SIR)
      .map(([poz]) => `:${nrRand(text, poz)}`);
    if (peEcran.length > 0) harta[cale.split("\\").join("/")] = peEcran;
  }

  assert.deepEqual(
    harta,
    {},
    "Un semn lung a ajuns inapoi intr-un text de pe ecranele de integrari."
      + " Pune doua puncte cand ce urmeaza lamureste ce a fost inainte, virgula"
      + " cand tine loc de apozitie, si `·` cand imbina doua bucati de date.",
  );
});

/*
 * Proba care apara chiar greseala facuta pe 14.09: `EmagAwbModal` emitea AWB-uri
 * si nu era pazit de nimic, fiindca lista se scria din prefixe si el nu incepea
 * cu niciunul. O lista nu stie ce NU e in ea; trebuie intrebat dosarul.
 */
test("orice panou de AWB sau de ridicare din dosar e pazit de plasa", () => {
  const pazite = new Set(panouriDeCurier());
  const nepazite = readdirSync(PANOURI)
    .filter((f) => /(AwbModal|PickupModal)\.tsx$/.test(f))
    .filter((f) => !pazite.has(f))
    .sort();

  assert.deepEqual(
    nepazite,
    [],
    "Un panou de AWB sau de ridicare nu e pazit de plasa de mai sus. Daca numele"
      + " lui nu incepe cu un curier, adauga-l in `SUPLIMENTARE`, altfel semnul"
      + " lung se poate intoarce acolo fara ca nimeni sa afle.",
  );
});
