/**
 * Catalogul de integrări arătat în „Biblioteca de integrări", pe `/integrari`.
 *
 * ═══ DE UNDE VINE LISTA ═══
 *
 * Din hub-ul de integrări al PANOULUI,
 * `src/app/(dashboard)/dashboard/features/page.tsx`. Acolo e adevărul: ce se
 * poate activa azi are `id`, ce e doar anunțat are `soon`.
 *
 * ⚠ **Lista de acolo e mai nouă decât ramura asta.** Cele 34 de servicii anunțate
 * au intrat pe `main` (comit `a4a015c`, 2026-08-11), iar `website-redesign` e mult
 * în urmă. Catalogul de aici e cel de pe `main`, transcris — fiindcă asta vede
 * clientul în panoul lui, și n-are sens ca site-ul să arate mai puțin.
 *
 * ⚠ **LA UNIREA CU `main`: panoul trebuie să citească DE AICI.** Azi sunt două
 * liste ale aceluiași lucru, iar a doua integrare livrată le desparte: în panou
 * apare fără lacăt, pe site rămâne „În curând". `integrari-catalog.test.ts` are o
 * probă care întreabă chiar fișierul panoului și cade dacă el are ceva ce lipsește
 * de aici — dar ea păzește doar o direcție, și numai atât timp cât fișierul e în
 * arbore.
 *
 * ═══ DESCRIERILE SUNT PUSE DE MINE ═══
 *
 * ⚠ Toate cele 65. Nu sunt textele clientului, iar el le rescrie de fiecare dată
 * (vezi regula lui de gust: cere variante, le respinge, apoi dă textul cuvânt cu
 * cuvânt). Sunt scrise ca să poată fi înlocuite una câte una, fără să se atingă
 * nimic altceva.
 *
 * Regula pe care am ținut-o: descrii CE FACE serviciul și ce face Edinio cu el,
 * nu cât e de bun. Fără superlative și fără comparații („cel mai folosit", „cel
 * mai mare") — alea sunt afirmații care trebuie susținute, iar aici n-ar avea cum.
 * Singura excepție e eMAG, unde „cel mai mare marketplace din România" e un fapt
 * necontestat de piață.
 */

import { PROVIDER_LOGOS, type LogoKey } from "./logos";

/**
 * Rubricile, în ordinea în care i-ar folosi unui magazin: întâi cum trimiți și
 * cum încasezi, apoi cum vinzi mai mult, la urmă cum vorbești cu clientul.
 *
 * Aceleași nume ca în panou, cu două abateri notate acolo unde apar, ca omul să
 * nu învețe o împărțire pe site și alta înăuntru.
 */
export const CATEGORII = [
  { id: "curieri", eticheta: "Curieri" },
  /* Panoul spune „Procesatori de plăți". Aici e „Plăți online", ca în banda de
     pe pagina de start (`LOGO_GROUPS`) și ca în meniu. De ales una singură. */
  { id: "plati", eticheta: "Plăți online" },
  { id: "facturare", eticheta: "Facturare" },
  { id: "marketplace", eticheta: "Marketplace" },
  { id: "marketing", eticheta: "Marketing" },
  { id: "statistici", eticheta: "Statistici" },
  { id: "email", eticheta: "Email marketing" },
  { id: "sms", eticheta: "SMS" },
  { id: "suport", eticheta: "Suport clienți" },
] as const;

export type CategorieId = (typeof CATEGORII)[number]["id"];

/**
 * `activa` se poate conecta azi; `in-curand` e anunțată, dar nelivrată.
 *
 * ⚠ Deosebirea nu e cosmetică. În panou, un card cu LACĂT înseamnă „există, dar
 * nu ai TU acces"; „ÎN CURÂND" înseamnă „nu e făcută încă". Pe site rămâne doar a
 * doua, și trebuie să se citească limpede: cine crede că o integrare merge și
 * descoperă că nu, a luat o decizie de cumpărare pe o informație greșită.
 */
export type Stare = "activa" | "in-curand";

export interface Integrare {
  cheie: LogoKey;
  categorie: CategorieId;
  stare: Stare;
  /** O propoziție. Vezi avertismentul din capul fișierului: e pusă de mine. */
  descriere: string;
}

export const INTEGRARI: Integrare[] = [
  /* ── Curieri ───────────────────────────────────────────────────────────── */
  {
    cheie: "fanCourier",
    categorie: "curieri",
    stare: "activa",
    descriere: "AWB generat automat la fiecare comandă, cu urmărirea coletului până la livrare.",
  },
  {
    cheie: "dpd",
    categorie: "curieri",
    stare: "activa",
    descriere: "Expedieri în țară și în străinătate, cu AWB și ramburs direct din panou.",
  },
  {
    cheie: "cargus",
    categorie: "curieri",
    stare: "activa",
    descriere: "AWB automat, ridicare programată și urmărirea coletelor, fără să ieși din Edinio.",
  },
  {
    cheie: "sameday",
    categorie: "curieri",
    stare: "activa",
    descriere: "Curier și rețeaua easybox: clientul își alege lockerul chiar la finalizarea comenzii.",
  },
  {
    cheie: "gls",
    categorie: "curieri",
    stare: "activa",
    descriere: "Livrări în România și în Europa, cu AWB emis automat din comandă.",
  },
  {
    cheie: "woot",
    categorie: "curieri",
    stare: "activa",
    descriere: "Broker de curierat: compari tarifele mai multor curieri și alegi pentru fiecare colet.",
  },
  {
    cheie: "coleteOnline",
    categorie: "curieri",
    stare: "activa",
    descriere: "Broker de curierat cu tarife negociate, pentru colete în țară și în afara ei.",
  },
  {
    cheie: "ecolet",
    categorie: "curieri",
    stare: "activa",
    descriere: "Broker de curierat: un singur cont, mai mulți curieri, AWB emis din panou.",
  },
  {
    cheie: "pallex",
    categorie: "curieri",
    stare: "activa",
    descriere: "Rețea de paleți, pentru marfa care nu încape într-un colet obișnuit.",
  },
  {
    cheie: "dhl",
    categorie: "curieri",
    stare: "activa",
    descriere: "Livrări internaționale expres, cu urmărire până la destinație.",
  },
  {
    cheie: "fedex",
    categorie: "curieri",
    stare: "activa",
    descriere: "Transport internațional expres, pentru comenzile care pleacă din țară.",
  },
  {
    cheie: "ups",
    categorie: "curieri",
    stare: "activa",
    descriere: "Livrări expres în țară și internațional, cu urmărire pe tot drumul.",
  },
  {
    cheie: "postaRomana",
    categorie: "curieri",
    stare: "activa",
    descriere: "Acoperire poștală în toată țara, inclusiv în localitățile mici.",
  },
  {
    cheie: "packeta",
    categorie: "curieri",
    stare: "activa",
    descriere: "Rețea de puncte de ridicare din Europa Centrală și de Est.",
  },
  {
    cheie: "innoship",
    categorie: "curieri",
    stare: "activa",
    descriere: "Alege singură curierul potrivit pentru fiecare comandă, după reguli pe care le pui tu.",
  },
  {
    cheie: "smartship",
    categorie: "curieri",
    stare: "activa",
    descriere: "Administrarea expedierilor peste mai mulți curieri, dintr-un singur loc.",
  },
  {
    cheie: "shipo",
    categorie: "curieri",
    stare: "activa",
    descriere: "Compară tarifele curierilor și emite AWB-ul pentru cel ales.",
  },

  /* ── Plăți online ──────────────────────────────────────────────────────── */
  {
    cheie: "stripe",
    categorie: "plati",
    stare: "activa",
    descriere: "Plăți cu cardul, cu banii decontați direct în contul tău bancar.",
  },
  {
    cheie: "netopia",
    categorie: "plati",
    stare: "activa",
    descriere: "Procesator românesc de plăți cu cardul, cu plata în rate și portofele digitale.",
  },
  {
    cheie: "ipay",
    categorie: "plati",
    stare: "activa",
    descriere: "Plăți cu cardul prin Banca Transilvania, cu decontare în contul tău.",
  },
  {
    cheie: "klarna",
    categorie: "plati",
    stare: "activa",
    descriere: "Clientul cumpără acum și plătește mai târziu sau în rate; tu încasezi integral.",
  },
  {
    cheie: "revolut",
    categorie: "plati",
    stare: "activa",
    descriere: "Plăți cu cardul cu comisioane mici și decontare rapidă.",
  },
  {
    cheie: "ingWebPay",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Procesatorul de plăți al ING, pentru magazinele cu cont la ei.",
  },
  {
    cheie: "payu",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Procesator de plăți cu acoperire în toată Europa Centrală și de Est.",
  },
  {
    cheie: "euplatesc",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Procesator românesc de plăți cu cardul, cu plata în rate.",
  },
  {
    cheie: "tbi",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Plata în rate, cu cererea aprobată online, fără drum la bancă.",
  },
  {
    cheie: "unicredit",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Plăți cu cardul prin UniCredit, cu decontare în contul tău.",
  },
  {
    cheie: "viva",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Plăți cu cardul pentru toată Europa, dintr-un singur cont.",
  },
  {
    cheie: "libraPay",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Procesatorul de plăți al Libra Internet Bank.",
  },
  {
    cheie: "bcr",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Plăți cu cardul prin Banca Comercială Română.",
  },
  {
    cheie: "saltBank",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Plăți cu cardul de la banca digitală a grupului Banca Transilvania.",
  },

  /* ── Facturare ─────────────────────────────────────────────────────────── */
  {
    cheie: "smartbill",
    categorie: "facturare",
    stare: "activa",
    descriere: "Factura pleacă singură la client, în clipa în care comanda e plătită.",
  },
  {
    cheie: "oblio",
    categorie: "facturare",
    stare: "activa",
    descriere: "Facturi și storno emise automat, cu seriile și numerele din contul tău.",
  },
  {
    cheie: "fgo",
    categorie: "facturare",
    stare: "activa",
    descriere: "Facturare automată la fiecare comandă, cu produsele și TVA-ul luate din coș.",
  },
  {
    cheie: "saga",
    categorie: "facturare",
    stare: "in-curand",
    descriere: "Programul de contabilitate folosit de mii de firme din România.",
  },
  {
    cheie: "facturis",
    categorie: "facturare",
    stare: "in-curand",
    descriere: "Facturare și gestiune, cu documentele emise direct din comenzi.",
  },
  {
    cheie: "easybill",
    categorie: "facturare",
    stare: "in-curand",
    descriere: "Facturi emise automat, fără să treci nimic dintr-un program în altul.",
  },
  {
    cheie: "factureaza",
    categorie: "facturare",
    stare: "in-curand",
    descriere: "Facturare online, cu documentele legate de comenzile din magazin.",
  },

  /* ── Marketplace ───────────────────────────────────────────────────────── */
  {
    cheie: "olx",
    categorie: "marketplace",
    stare: "activa",
    descriere: "Produsele tale, publicate automat pe OLX, cu stocul ținut la zi.",
  },
  {
    cheie: "aboutYou",
    categorie: "marketplace",
    stare: "activa",
    descriere: "Vinzi haine și încălțăminte pe o platformă de modă din toată Europa.",
  },
  {
    cheie: "trendyol",
    categorie: "marketplace",
    stare: "activa",
    descriere: "Publici produsele pe marketplace-ul Trendyol, cu stocul sincronizat automat.",
  },
  {
    cheie: "emag",
    categorie: "marketplace",
    stare: "activa",
    descriere: "Cel mai mare marketplace din România, cu produsele și stocul din magazinul tău.",
  },
  {
    cheie: "altex",
    categorie: "marketplace",
    stare: "in-curand",
    descriere: "Marketplace-ul retailerului de electronice Altex.",
  },
  {
    cheie: "cel",
    categorie: "marketplace",
    stare: "in-curand",
    descriere: "Marketplace românesc generalist, cu public propriu.",
  },
  {
    cheie: "okazii",
    categorie: "marketplace",
    stare: "in-curand",
    descriere: "Marketplace românesc generalist, cu vânzare la preț fix sau prin licitație.",
  },
  {
    cheie: "pepita",
    categorie: "marketplace",
    stare: "in-curand",
    descriere: "Marketplace românesc, cu produsele tale listate automat.",
  },
  {
    cheie: "compari",
    categorie: "marketplace",
    stare: "in-curand",
    descriere: "Comparator de prețuri: trimite cumpărători direct în magazinul tău.",
  },
  {
    cheie: "baseLinker",
    categorie: "marketplace",
    stare: "in-curand",
    descriere: "Administrezi comenzile de pe toate canalele de vânzare într-un singur loc.",
  },

  /* ── Marketing ─────────────────────────────────────────────────────────── */
  {
    cheie: "facebookPixel",
    categorie: "marketing",
    stare: "activa",
    descriere: "Măsori ce fac vizitatorii veniți din reclame și le poți arăta din nou produsele.",
  },
  {
    cheie: "tiktokPixel",
    categorie: "marketing",
    stare: "activa",
    descriere: "Urmărești ce se întâmplă după o reclamă TikTok, până la comanda plasată.",
  },
  {
    cheie: "googleAds",
    categorie: "marketing",
    stare: "activa",
    descriere: "Trimiți comenzile înapoi în Google Ads, ca să vezi care reclamă chiar vinde.",
  },
  {
    cheie: "googleMerchant",
    categorie: "marketing",
    stare: "activa",
    descriere: "Produsele intră în Google Shopping, cu prețul și stocul actualizate singure.",
  },
  {
    cheie: "facebookCatalog",
    categorie: "marketing",
    stare: "activa",
    descriere: "Catalogul pleacă singur către Meta, pentru reclame cu produse pe Facebook și Instagram.",
  },
  {
    cheie: "optinMonster",
    categorie: "marketing",
    stare: "in-curand",
    descriere: "Ferestre și formulare care transformă vizitatorii în abonați.",
  },

  /* ── Statistici ────────────────────────────────────────────────────────── */
  {
    cheie: "googleAnalytics",
    categorie: "statistici",
    stare: "activa",
    descriere: "Vezi de unde vin vizitatorii și pe unde se pierd până la comandă.",
  },

  /* ── Email marketing ───────────────────────────────────────────────────── */
  {
    cheie: "mailchimp",
    categorie: "email",
    stare: "activa",
    descriere: "Clienții ajung singuri în listele tale, cu tot cu ce au cumpărat.",
  },
  {
    cheie: "brevo",
    categorie: "email",
    stare: "activa",
    descriere: "Campanii de email și automatizări, pe o listă care se completează din comenzi.",
  },
  {
    cheie: "klaviyo",
    categorie: "email",
    stare: "activa",
    descriere: "Segmentezi clienții după ce cumpără și le trimiți mesajele potrivite.",
  },
  {
    cheie: "theMarketer",
    categorie: "email",
    stare: "in-curand",
    descriere: "Email, SMS și recomandări de produse, într-un singur instrument.",
  },

  /* ── SMS ───────────────────────────────────────────────────────────────── */
  {
    cheie: "notice",
    categorie: "sms",
    stare: "activa",
    descriere: "SMS, WhatsApp și apeluri: clientul află singur în ce stadiu e comanda.",
  },
  {
    cheie: "smso",
    categorie: "sms",
    stare: "activa",
    descriere: "SMS-uri cu numele magazinului tău ca expeditor, la fiecare schimbare de status.",
  },

  /* ── Suport clienți ────────────────────────────────────────────────────── */
  {
    cheie: "tidio",
    categorie: "suport",
    stare: "in-curand",
    descriere: "Fereastră de chat pe magazin, cu răspunsuri automate la întrebările obișnuite.",
  },
  {
    cheie: "intercom",
    categorie: "suport",
    stare: "in-curand",
    descriere: "Chat, tichete și mesaje automate către clienți, într-un singur loc.",
  },
  {
    cheie: "zendesk",
    categorie: "suport",
    stare: "in-curand",
    descriere: "Sistem de tichete pentru cererile clienților, cu istoricul fiecărei discuții.",
  },
  {
    cheie: "tawkto",
    categorie: "suport",
    stare: "in-curand",
    descriere: "Chat pe magazin, cu istoricul conversațiilor și răspunsuri gata scrise.",
  },
];

/** Numele afișat al unei integrări. Vine din bibliotecă, nu se scrie de două ori. */
export function numele(integrare: Integrare): string {
  return PROVIDER_LOGOS[integrare.cheie].name;
}

/**
 * Textul după care se caută o integrare, pregătit pentru comparație.
 *
 * Fără diacritice și cu litere mici, ca „plati" să găsească „Plăți" — altfel
 * jumătate din căutări cad pe o literă pe care omul n-o scrie. Se taie DOAR
 * semnele combinatorii (`\p{M}`), nu tot ce nu e ASCII: aceeași regulă ca la
 * căutarea din magazine, unde varianta lacomă mânca și cifrele din nume.
 */
export function faraDiacritice(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim();
}

/**
 * Ce se ia în seamă la căutare: numele, descrierea și rubrica.
 *
 * Rubrica intră dinadins: cine scrie „curier" se așteaptă să vadă toți curierii,
 * chiar dacă niciunul nu are cuvântul în nume.
 */
export function textDeCautare(integrare: Integrare): string {
  const categorie = CATEGORII.find((c) => c.id === integrare.categorie);
  return faraDiacritice(
    `${numele(integrare)} ${integrare.descriere} ${categorie?.eticheta ?? ""}`,
  );
}

/**
 * Adevărat dacă integrarea răspunde la ce s-a scris în bara de căutare.
 *
 * ⚠ SE POTRIVESC CUVINTELE, NU FRAZA. Prima formă căuta tot ce se scrisese ca pe
 * un singur șir, iar defectul a ieșit din chiar exemplul din bara de căutare:
 * „plăți în rate" întorcea ZERO. Cuvintele există toate — „plăți" e rubrica,
 * „rate" e în descrierea lui Netopia și a lui TBI — dar nu una lângă alta, în
 * ordinea aia, în același text.
 *
 * Un om nu scrie un citat, scrie cuvintele care îi vin. Deci: fiecare cuvânt
 * trebuie să apară undeva, oriunde, în oricare ordine.
 */
export function potrivire(integrare: Integrare, cautare: string): boolean {
  const cuvinte = faraDiacritice(cautare).split(/\s+/).filter(Boolean);
  if (cuvinte.length === 0) return true;
  const text = textDeCautare(integrare);
  return cuvinte.every((c) => text.includes(c));
}

/**
 * Aceeași listă, cu cele care merg azi înaintea celor anunțate.
 *
 * Cerut de client (2026-08-13) pentru „Toate". Rostul e limpede: cine intră pe
 * pagină vrea să știe întâi ce POATE folosi. Amestecate, primele nouă carduri
 * erau curieri — dintre care doi anunțați — și pagina începea cu o promisiune.
 *
 * Sortare STABILĂ: `Array.prototype.sort` e stabil peste tot din ES2019, deci
 * ordinea pe rubrici din `INTEGRARI` rămâne întreagă înăuntrul fiecărei grupe.
 * Se aplică și când e aleasă o singură rubrică — acolo n-are ce schimba, fiindcă
 * lista e deja scrisă cu activele întâi, dar așa regula stă într-un singur loc.
 */
export function ordonate(lista: Integrare[]): Integrare[] {
  return [...lista].sort(
    (a, b) => (a.stare === "activa" ? 0 : 1) - (b.stare === "activa" ? 0 : 1),
  );
}

/** Câte integrări are fiecare rubrică. */
export function numarPeCategorie(): Record<CategorieId, number> {
  const numar = Object.fromEntries(CATEGORII.map((c) => [c.id, 0])) as Record<
    CategorieId,
    number
  >;
  for (const integrare of INTEGRARI) numar[integrare.categorie] += 1;
  return numar;
}

export const NUMAR_ACTIVE = INTEGRARI.filter((i) => i.stare === "activa").length;
export const NUMAR_IN_CURAND = INTEGRARI.filter((i) => i.stare === "in-curand").length;
