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
 * ═══ DESCRIERILE SUNT ALE CLIENTULUI ═══
 *
 * Toate cele 65, date cuvânt cu cuvânt (09.09.2026). Nu se rescriu. Înainte erau
 * puse de mine; le-a înlocuit pe toate deodată.
 *
 * ⚠ DOUĂ ABATERI de la lista lui, amândouă cerute sau spuse:
 *   1. `smso`: s-a adăugat punctul de la final. Lipsea din lista trimisă,
 *      celelalte 64 îl au, iar proba „descrierile sunt o propoziție" îl cere.
 *   2. `postaRomana`: textul trimis spunea „expedieri interne ȘI
 *      INTERNAȚIONALE". Integrarea e numai internă, scris cu majuscule în
 *      `posta/expediere.ts` („NUMAI INTERN"), tipul `AdresaPosta` n-are câmp de
 *      țară, iar la checkout internaționalul iese DOAR pe DPD
 *      (`shipping.actions.ts`). Arătat clientului, el a cerut „lasă doar
 *      intern", deci au căzut două cuvinte.
 *
 * ⚠ DESCRIEREA INTRĂ ȘI ÎN CĂUTAREA DE PE PAGINĂ (`textDeCautare`), nu doar sub
 * siglă: un cuvânt scos din ea scoate integrarea de la căutarea aceea. Textul
 * nou al lui TBI nu mai conține „rate", nici cel al lui EuPlătesc, deci niciunul
 * din cele două nu mai iese la „plăți în rate" (chiar exemplul din bara de căutare).
 *
 * Ce mai păzesc probele peste textele astea: între 30 și 110 semne (peste 110
 * textul trece de patru rânduri și umflă rândul de carduri), punct la final,
 * diacritice, și fără superlative nesusținute.
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
  /** O propoziție. E a clientului: vezi nota din capul fișierului, nu se rescrie. */
  descriere: string;
}

export const INTEGRARI: Integrare[] = [
  /* ── Curieri ───────────────────────────────────────────────────────────── */
  {
    cheie: "fanCourier",
    categorie: "curieri",
    stare: "activa",
    descriere: "Pregătești livrările FAN Courier direct din Edinio, de la AWB până la tracking.",
  },
  {
    cheie: "dpd",
    categorie: "curieri",
    stare: "activa",
    descriere: "Generezi AWB-uri DPD pentru livrări interne și internaționale direct din Edinio.",
  },
  {
    cheie: "cargus",
    categorie: "curieri",
    stare: "activa",
    descriere: "Generezi AWB-uri prin Cargus și gestionezi expedierile direct din comenzile tale.",
  },
  {
    cheie: "sameday",
    categorie: "curieri",
    stare: "activa",
    descriere: "Oferi livrare prin curier sau easybox, cu alegerea lockerului direct la checkout.",
  },
  {
    cheie: "gls",
    categorie: "curieri",
    stare: "activa",
    descriere: "Trimiți comenzile prin GLS și generezi AWB-urile direct din magazin.",
  },
  {
    cheie: "woot",
    categorie: "curieri",
    stare: "activa",
    descriere: "Compari ofertele mai multor curieri și alegi varianta potrivită pentru fiecare colet.",
  },
  {
    cheie: "coleteOnline",
    categorie: "curieri",
    stare: "activa",
    descriere: "Vezi mai multe opțiuni de livrare și alegi curierul potrivit pentru fiecare colet.",
  },
  {
    cheie: "ecolet",
    categorie: "curieri",
    stare: "activa",
    descriere: "Centralizezi mai mulți curieri și pregătești expedierile dintr-un singur loc.",
  },
  {
    cheie: "pallex",
    categorie: "curieri",
    stare: "activa",
    descriere: "Trimiți mărfuri paletizate prin rețeaua Pall-Ex direct din fluxul magazinului.",
  },
  {
    cheie: "dhl",
    categorie: "curieri",
    stare: "activa",
    descriere: "Pregătești expedieri internaționale prin DHL direct din comenzile magazinului.",
  },
  {
    cheie: "fedex",
    categorie: "curieri",
    stare: "activa",
    descriere: "Conectezi FedEx pentru livrările internaționale și gestionezi expedierile din Edinio.",
  },
  {
    cheie: "ups",
    categorie: "curieri",
    stare: "activa",
    descriere: "Conectezi UPS pentru livrări naționale și internaționale direct din magazin.",
  },
  {
    cheie: "postaRomana",
    categorie: "curieri",
    stare: "activa",
    descriere: "Folosești serviciile Poștei Române pentru expedieri interne.",
  },
  {
    cheie: "packeta",
    categorie: "curieri",
    stare: "activa",
    descriere: "Oferi livrare la adresă, punct pick-up sau locker prin rețeaua Packeta.",
  },
  {
    cheie: "innoship",
    categorie: "curieri",
    stare: "activa",
    descriere: "Automatizezi alegerea curierului și gestionezi livrările dintr-un singur flux.",
  },
  {
    cheie: "smartship",
    categorie: "curieri",
    stare: "activa",
    descriere: "Centralizezi expedierile mai multor curieri și le gestionezi dintr-un singur loc.",
  },
  {
    cheie: "shipo",
    categorie: "curieri",
    stare: "activa",
    descriere: "Alegi curierul potrivit fiecărui colet și creezi AWB-ul direct din comandă.",
  },

  /* ── Plăți online ──────────────────────────────────────────────────────── */
  {
    cheie: "stripe",
    categorie: "plati",
    stare: "activa",
    descriere: "Accepți plăți online cu cardul prin Stripe direct în checkout-ul magazinului.",
  },
  {
    cheie: "netopia",
    categorie: "plati",
    stare: "activa",
    descriere: "Conectezi NETOPIA pentru plăți online și opțiunile de rate ale băncilor partenere.",
  },
  {
    cheie: "ipay",
    categorie: "plati",
    stare: "activa",
    descriere: "Accepți plăți online prin soluția eCommerce a Băncii Transilvania.",
  },
  {
    cheie: "klarna",
    categorie: "plati",
    stare: "activa",
    descriere: "Le oferi clienților opțiunea să plătească mai târziu sau în rate prin Klarna.",
  },
  {
    cheie: "revolut",
    categorie: "plati",
    stare: "activa",
    descriere: "Conectezi Revolut Business pentru procesarea plăților online ale comenzilor.",
  },
  {
    cheie: "ingWebPay",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Le oferi clienților plata online prin serviciul eCommerce ING WebPay.",
  },
  {
    cheie: "payu",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Conectezi PayU pentru a procesa plățile online direct din magazin.",
  },
  {
    cheie: "euplatesc",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Le oferi clienților plata online prin procesatorul românesc EuPlătesc.",
  },
  {
    cheie: "tbi",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Le permiți clienților să aleagă finanțarea tbi direct la cumpărare.",
  },
  {
    cheie: "unicredit",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Conectezi serviciul eCommerce UniCredit direct la checkout-ul magazinului.",
  },
  {
    cheie: "viva",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Adaugi Smart Checkout în magazin pentru metodele de plată disponibile în Viva.com.",
  },
  {
    cheie: "libraPay",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Le oferi clienților plata cu cardul prin soluția eCommerce Libra Internet Bank.",
  },
  {
    cheie: "bcr",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Accepți plăți online prin GP Webpay, soluția Global Payments disponibilă prin BCR.",
  },
  {
    cheie: "saltBank",
    categorie: "plati",
    stare: "in-curand",
    descriere: "Conectezi plățile EuPlătesc cu încasarea direct în contul tău Salt Business.",
  },

  /* ── Facturare ─────────────────────────────────────────────────────────── */
  {
    cheie: "smartbill",
    categorie: "facturare",
    stare: "activa",
    descriere: "Emiți facturi din comenzile Edinio și le trimiți clienților prin SmartBill.",
  },
  {
    cheie: "oblio",
    categorie: "facturare",
    stare: "activa",
    descriere: "Generezi facturi, proforme și storno în Oblio folosind datele din comenzi.",
  },
  {
    cheie: "fgo",
    categorie: "facturare",
    stare: "activa",
    descriere: "Conectezi FGO și generezi documentele folosind automat datele comenzii.",
  },
  {
    cheie: "saga",
    categorie: "facturare",
    stare: "in-curand",
    descriere: "Trimiți datele comenzilor către SAGA și reduci introducerea manuală în contabilitate.",
  },
  {
    cheie: "facturis",
    categorie: "facturare",
    stare: "in-curand",
    descriere: "Generezi documente și sincronizezi datele comerciale cu Facturis.",
  },
  {
    cheie: "easybill",
    categorie: "facturare",
    stare: "in-curand",
    descriere: "Generezi documentele EasyBill direct folosind datele din fiecare comandă.",
  },
  {
    cheie: "factureaza",
    categorie: "facturare",
    stare: "in-curand",
    descriere: "Transformi comenzile în facturi fără să copiezi manual clientul și produsele.",
  },

  /* ── Marketplace ───────────────────────────────────────────────────────── */
  {
    cheie: "olx",
    categorie: "marketplace",
    stare: "activa",
    descriere: "Publici produsele pe OLX și păstrezi informațiile sincronizate cu magazinul tău.",
  },
  {
    cheie: "aboutYou",
    categorie: "marketplace",
    stare: "activa",
    descriere: "Sincronizezi produsele, stocurile și comenzile cu ABOUT YOU Seller Center.",
  },
  {
    cheie: "trendyol",
    categorie: "marketplace",
    stare: "activa",
    descriere: "Publici produsele pe Trendyol și sincronizezi stocurile și comenzile.",
  },
  {
    cheie: "emag",
    categorie: "marketplace",
    stare: "activa",
    descriere: "Conectezi catalogul magazinului cu eMAG pentru produse, oferte și comenzi.",
  },
  /* ⚠ CE MERGE AZI STA INAINTEA LUI „In curând", in fiecare rubrica. Vezi nota din panou si
     `ordinea-integrarilor.test.ts`, care cade daca o integrare livrata ramane sub una anuntata. */
  {
    cheie: "pepita",
    categorie: "marketplace",
    stare: "activa",
    descriere: "Conectezi catalogul Edinio cu Pepita Marketplace pentru listarea produselor.",
  },
  {
    cheie: "altex",
    categorie: "marketplace",
    stare: "in-curand",
    descriere: "Listezi produsele pe Altex Marketplace și gestionezi comenzile mai ușor din Edinio.",
  },
  {
    cheie: "cel",
    categorie: "marketplace",
    stare: "in-curand",
    descriere: "Listezi produsele pe CEL.ro Marketplace și centralizezi mai ușor comenzile.",
  },
  {
    cheie: "okazii",
    categorie: "marketplace",
    stare: "in-curand",
    descriere: "Conectezi catalogul magazinului cu Okazii.ro pentru listarea produselor.",
  },
  {
    cheie: "compari",
    categorie: "marketplace",
    stare: "in-curand",
    descriere: "Listezi produsele în Compari.ro și aduci vizitatorii interesați direct în magazin.",
  },
  {
    cheie: "baseLinker",
    categorie: "marketplace",
    stare: "in-curand",
    descriere: "Sincronizezi comenzile și stocurile dintre Edinio și canalele gestionate în BaseLinker.",
  },

  /* ── Marketing ─────────────────────────────────────────────────────────── */
  {
    cheie: "facebookPixel",
    categorie: "marketing",
    stare: "activa",
    descriere: "Trimiți către Meta acțiunile importante din magazin, de la vizualizare până la cumpărare.",
  },
  {
    cheie: "tiktokPixel",
    categorie: "marketing",
    stare: "activa",
    descriere: "Urmărești ce fac vizitatorii după reclamele TikTok, până la cumpărarea finală.",
  },
  {
    cheie: "googleAds",
    categorie: "marketing",
    stare: "activa",
    descriere: "Măsori comenzile generate de reclame și trimiți valoarea conversiilor către Google Ads.",
  },
  {
    cheie: "googleMerchant",
    categorie: "marketing",
    stare: "activa",
    descriere: "Sincronizezi catalogul cu Merchant Center, inclusiv prețurile și disponibilitatea produselor.",
  },
  {
    cheie: "facebookCatalog",
    categorie: "marketing",
    stare: "activa",
    descriere: "Sincronizezi produsele cu Meta pentru reclame dinamice pe Facebook și Instagram.",
  },
  {
    cheie: "optinMonster",
    categorie: "marketing",
    stare: "in-curand",
    descriere: "Afișezi pop-up-uri și formulare targetate pentru abonări, oferte și recuperarea vizitatorilor.",
  },

  /* ── Statistici ────────────────────────────────────────────────────────── */
  {
    cheie: "googleAnalytics",
    categorie: "statistici",
    stare: "activa",
    descriere: "Urmărești produsele văzute, coșurile, checkout-urile și cumpărăturile în Google Analytics.",
  },

  /* ── Email marketing ───────────────────────────────────────────────────── */
  {
    cheie: "mailchimp",
    categorie: "email",
    stare: "activa",
    descriere: "Sincronizezi clienții și comenzile cu Mailchimp pentru segmente și automatizări eCommerce.",
  },
  {
    cheie: "brevo",
    categorie: "email",
    stare: "activa",
    descriere: "Conectezi Brevo pentru email marketing, automatizări și segmentarea clienților magazinului.",
  },
  {
    cheie: "klaviyo",
    categorie: "email",
    stare: "activa",
    descriere: "Folosești istoricul de cumpărături pentru segmente și fluxuri automate în Klaviyo.",
  },
  {
    cheie: "theMarketer",
    categorie: "email",
    stare: "in-curand",
    descriere: "Conectezi magazinul cu theMarketer pentru email, SMS și recomandări de produse.",
  },

  /* ── SMS ───────────────────────────────────────────────────────────────── */
  {
    cheie: "notice",
    categorie: "sms",
    stare: "activa",
    descriere: "Trimiți notificări SMS automate despre comenzi direct prin Notice.ro.",
  },
  {
    cheie: "smso",
    categorie: "sms",
    stare: "activa",
    descriere: "Notifici clienții prin SMS atunci când apar schimbări importante la comandă.",
  },

  /* ── Suport clienți ────────────────────────────────────────────────────── */
  {
    cheie: "tidio",
    categorie: "suport",
    stare: "in-curand",
    descriere: "Adaugi chat Tidio în magazin pentru răspunsuri rapide și automatizări de suport.",
  },
  {
    cheie: "intercom",
    categorie: "suport",
    stare: "in-curand",
    descriere: "Conectezi Intercom pentru conversații, tichete și fluxuri de suport direct în magazin.",
  },
  {
    cheie: "zendesk",
    categorie: "suport",
    stare: "in-curand",
    descriere: "Centralizezi mesajele și tichetele clienților în Zendesk pentru un suport mai ușor de urmărit.",
  },
  {
    cheie: "tawkto",
    categorie: "suport",
    stare: "in-curand",
    descriere: "Adaugi live chat în magazin și răspunzi vizitatorilor în timp real prin tawk.to.",
  },
];

/**
 * ═══ SINONIME DE CĂUTARE ═══
 *
 * Cuvinte care intră în indexul de căutare, dar NU se văd pe pagină. Rostul lor:
 * descrierea e text de vânzare, nu listă de cuvinte-cheie, iar cine caută
 * „ramburs" nu caută o frază frumoasă, caută dacă poate lua banii la livrare.
 *
 * ⚠ DE CE EXISTĂ. Când clientul a înlocuit toate cele 65 de descrieri
 * (09.09.2026), căutarea s-a subțiat fără ca ceva să se plângă: „card" a căzut
 * de la 9 integrări la 2, iar „ramburs", „curierat" și „whatsapp" au căzut la
 * ZERO. Cuvintele stăteau numai în descriere, iar descrierea e a lui și se
 * schimbă. Aici stau separat, ca textul lui să se poată rescrie oricând fără să
 * ia căutarea cu el.
 *
 * ⚠ UN SINONIM E O PROMISIUNE. Cine caută „ramburs" și vede cardul unui curier
 * crede că poate încasa la livrare prin el. Deci fiecare cuvânt de aici are în
 * spate cod care chiar face lucrul ăla, verificat pe CORPUL cererii, nu pe tip.
 * Trei curieri NU au ramburs și nu-l primesc: DHL (`dhl/servicii.ts`: „EXISTA CA
 * SI COD, SI NU SE VINDE DIN ROMANIA"), FedEx (`fedex/client.ts`
 * `RAMBURS_INDISPONIBIL`, care chiar oprește emiterea) și Pall-Ex
 * (`pallex/client.ts`: „nu exista ramburs. Niciun camp"). Cinci n-au urmărire,
 * deci n-o primesc: FAN Courier, DPD, Cargus, Woot, Colete Online. Cei
 * doisprezece care o au sunt exact cei cu cron în `vercel.json` și cu coloană
 * `*_status_checked_at` în schemă.
 *
 * ⚠ NIMIC PE „ÎN CURÂND". O integrare nelivrată n-are cod, deci n-are cum să
 * aibă dovadă: acolo un sinonim ar descrie o promisiune. Sinonimele ei se adaugă
 * în același commit cu codul, ca migrațiile.
 *
 * ⚠ POTRIVIREA E PE SUBȘIR, deci nu se scrie aici ce se găsește deja prin nume,
 * descriere sau rubrică. „internațional" nu e în listă fiindcă e deja în textul
 * clientului. Dar „curierat" NU e subșir în „curieri", deci trebuie scris.
 */
export const SINONIME_CATEGORIE: Record<CategorieId, string[]> = {
  /* Toate trei sunt adevărate despre toți cei 17, Pall-Ex inclusiv. „colet" NU
     intră: Pall-Ex e rețea de marfă PALETIZATĂ, nu curier de colete. Nici „awb":
     un cuvânt de rubrică trebuie să fie adevărat la TOȚI, iar Pall-Ex scoate
     borderou de paleți. */
  curieri: ["curierat", "livrare", "expediere"],
  /*
    ⚠ ASTA REPARĂ CEA MAI STRICATĂ CĂUTARE DE PE PAGINĂ, și e mai veche decât
    textele noi. Se cere ca FIECARE cuvânt scris să apară undeva, iar „plata"
    (singular) nu e în textul niciunuia dintre cele CINCI procesatoare care merg:
    Stripe zice „plăți", Netopia „plăți", iPay „plăți", Klarna „plătească",
    Revolut „plăților". Măsurat: „plata online" întorcea patru carduri, și toate
    patru NELIVRATE. Omul care scria cel mai firesc lucru din lume vedea numai
    promisiuni. E o formă gramaticală a etichetei „Plăți online", deci nu adaugă
    nicio afirmație nouă.
  */
  plati: ["plata"],
  /* Aceeași poveste, mai mică: „Facturare" dă „factura" și „facturare" la toate
     șapte, dar „facturi" doar la patru. Tot o formă a etichetei. */
  facturare: ["facturi"],
  /* Nimic: „comenzi", „stoc", „produse" sunt adevărate doar la o parte din cele
     zece, deci stau pe integrare, nu pe rubrică. */
  marketplace: [],
  marketing: [],
  statistici: [],
  /* „newsletter" și „campanii" descriu ce face platforma LOR. Edinio le trimite
     clienți și comenzi; scrisorile le trimit ei. */
  email: [],
  /* „whatsapp" e adevărat doar la Notice.ro, deci stă pe ea. */
  sms: [],
  /* Toate patru sunt nelivrate. */
  suport: [],
};

/**
 * Sinonimele fiecărei integrări. Cheile care lipsesc n-au nevoie de niciunul:
 * ce s-ar fi scris acolo se găsește deja prin nume, descriere sau rubrică.
 *
 * `Partial<Record<LogoKey, …>>` ar îngădui o cheie care nu e în catalog; proba
 * „sinonimele stau pe integrări care există" o prinde.
 */
export const SINONIME: Partial<Record<LogoKey, string[]>> = {
  /* ── Curieri ───────────────────────────────────────────────────────────────
     `ramburs`: verificat pe corpul cererii de AWB (`cod`, `CashRepayment`,
     `CODAmount`, `cashOnDelivery`, `repayment`…), nu pe tip.
     `locker`/`punct`/`ridicare`: numai cei din `CURIERI_CU_LOCKERE`
     (`shipping.actions.ts`), adică acolo unde CUMPĂRĂTORUL alege punctul la
     checkout. Woot are puncte, dar le alege comerciantul după comandă, deci nu.
     `urmarire`/`tracking`: numai cei doisprezece cu cron de tracking. */
  fanCourier: ["ramburs", "fanbox", "locker", "punct", "ridicare"],
  dpd: ["ramburs", "locker", "punct", "ridicare"],
  cargus: ["ramburs", "locker", "punct", "ridicare"],
  sameday: ["ramburs", "awb", "urmarire", "tracking", "punct", "ridicare"],
  gls: ["ramburs", "locker", "parcelshop", "punct", "ridicare", "urmarire", "tracking"],
  woot: ["ramburs", "awb"],
  coleteOnline: ["ramburs", "awb"],
  ecolet: ["ramburs", "awb", "urmarire", "tracking"],
  /* Fără `ramburs` și fără `awb`: aici unitatea e PARTIDA, iar documentul e
     borderou de paleți. Vezi `pallex/client.ts`. */
  pallex: ["urmarire", "tracking"],
  dhl: ["awb", "urmarire", "tracking", "expres"],
  fedex: ["awb", "urmarire", "tracking", "expres"],
  ups: ["ramburs", "awb", "urmarire", "tracking", "expres", "locker", "punct", "ridicare"],
  /* `oficiu`, nu `easybox`: punctul Poștei e post-restant, iar cumpărătorul
     citește „Ridicare de la oficiu poștal". Cine scrie „easybox" caută un dulap. */
  postaRomana: ["ramburs", "awb", "urmarire", "tracking", "oficiu", "punct", "ridicare"],
  packeta: ["ramburs", "awb", "urmarire", "tracking", "ridicare"],
  innoship: ["ramburs", "awb", "urmarire", "tracking", "locker", "punct", "ridicare"],
  /* Singurul cu DOUĂ rețele de lockere, easybox și FANbox, cu nomenclatoare
     diferite. Vezi nota din `getLockers`. */
  smartship: ["ramburs", "awb", "urmarire", "tracking", "locker", "easybox", "fanbox", "punct", "ridicare"],
  shipo: ["ramburs", "urmarire", "tracking", "locker", "punct", "ridicare"],

  /* ── Plăți online ──────────────────────────────────────────────────────────
     Doar cele CINCI livrate. `card` lipsește la Stripe (e deja în descriere) și
     la Klarna, care nu e card: e cumpără-acum-plătește-mai-târziu, singura
     dintre cele cinci fără „Card" în eticheta din `payment-methods.ts`.
     `rate` NU e la niciuna: Stripe închide lista pe `["card"]`, iar Netopia
     primește `installments: 0` scris în cod. */
  stripe: ["procesator"],
  netopia: ["card", "cardul", "procesator", "checkout"],
  ipay: ["card", "cardul", "procesator", "checkout", "banca"],
  klarna: ["procesator", "checkout"],
  revolut: ["card", "cardul", "procesator", "checkout"],

  /* ── Facturare ─────────────────────────────────────────────────────────────
     Numai cele trei livrate, și numai documentele care chiar se emit.
     „contabilitate" nu intră nicăieri: Edinio emite documente, contabilitatea o
     face omul în programul lui. Nici „e-factura"/„ANAF": nu există modul SPV,
     iar `lib/anaf/` caută firma după CUI, la comenzile pe persoană juridică. */
  smartbill: ["proforma", "storno"],
  oblio: ["proforma"],
  fgo: ["storno"],

  /* ── Marketplace ───────────────────────────────────────────────────────────
     OLX ține anunțuri, nu comenzi, și nu sincronizează stocul: la zero STINGE
     anunțul (`olx/sync.ts`). */
  olx: ["anunturi"],
  emag: ["stoc"],
  pepita: ["stoc", "comenzi"],

  /* ── Marketing și statistici ───────────────────────────────────────────────
     `shopping`: scope-ul Content al Merchant API e chiar permisiunea „Shopping"
     de pe ecranul de consimțământ (`google-merchant/oauth.ts`), iar produsele se
     împing acolo. Cuvântul căzuse la ZERO, și e chiar numele produsului.
     `feed` numai la Meta: acolo chiar există generator RSS
     (`facebook/catalog-feed.ts`). Google Merchant merge pe Content API, fără
     feed scos de noi. */
  googleMerchant: ["shopping"],
  facebookCatalog: ["feed"],
  googleAnalytics: ["ga4"],

  /* ── Email marketing ───────────────────────────────────────────────────────
     `newsletter`: cuvântul cădea la ZERO. Nu e o afirmație despre ce face
     Edinio, ci despre la ce folosești unealta după ce îi trimitem clienții și
     comenzile. theMarketer NU-l primește: e nelivrată. */
  mailchimp: ["newsletter"],
  brevo: ["newsletter"],
  klaviyo: ["newsletter"],

  /* ── SMS ───────────────────────────────────────────────────────────────────
     ⚠ `whatsapp` e o capabilitate LIVRATĂ pe care textul nou n-o mai spune:
     `notice.ts` face `POST /whatsapp/send`, chemat din `notice-notify.ts`. Fără
     rândul ăsta, WhatsApp nu apare NICĂIERI pe site-ul de prezentare.
     `abandonat`: amândouă trimit SMS de coș abandonat
     (`abandoned-cart.actions.ts`). */
  notice: ["whatsapp", "abandonat"],
  smso: ["abandonat"],
};

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
 * Ce se ia în seamă la căutare: numele, descrierea, rubrica și sinonimele.
 *
 * Rubrica intră dinadins: cine scrie „curier" se așteaptă să vadă toți curierii,
 * chiar dacă niciunul nu are cuvântul în nume.
 *
 * Sinonimele intră din același motiv, dar pentru cuvintele pe care descrierea
 * nu le mai spune. Vezi blocul lor de mai sus: nu sunt text de pagină, sunt
 * cuvinte de căutare, și fiecare are în spate o capabilitate din cod.
 */
export function textDeCautare(integrare: Integrare): string {
  const categorie = CATEGORII.find((c) => c.id === integrare.categorie);
  return faraDiacritice(
    [
      numele(integrare),
      integrare.descriere,
      categorie?.eticheta ?? "",
      (SINONIME[integrare.cheie] ?? []).join(" "),
      SINONIME_CATEGORIE[integrare.categorie].join(" "),
    ].join(" "),
  );
}

/**
 * Cuvintele de legătură, scoase din căutare.
 *
 * ⚠ DE CE. Potrivirea cere ca FIECARE cuvânt scris să apară undeva. Asta e bine
 * pentru cuvinte care spun ceva, și rău pentru „de": „punct de ridicare"
 * întorcea UN singur curier din zece, fiindcă doar textul lui FAN Courier
 * conținea din întâmplare grupul de litere „de" (în „de la AWB"). Ceilalți nouă
 * ofereau exact același lucru și cădeau pe o prepoziție.
 *
 * Nu e o listă de oprire de motor de căutare, e scurtă dinadins: doar cuvinte
 * care nu deosebesc NICIODATĂ o integrare de alta. Un cuvânt scos din greșeală
 * de aici lărgește rezultatele, nu le taie, deci greșeala e în partea blândă.
 */
const CUVINTE_DE_LEGATURA = new Set([
  "de", "cu", "la", "in", "pe", "din", "si", "sau", "prin", "pentru", "ca",
  "un", "o", "a", "al", "ale", "lui", "se", "isi", "iti",
]);

/**
 * Adevărat dacă integrarea răspunde la ce s-a scris în bara de căutare.
 *
 * ⚠ SE POTRIVESC CUVINTELE, NU FRAZA. Prima formă căuta tot ce se scrisese ca pe
 * un singur șir, iar defectul a ieșit din chiar exemplul din bara de căutare:
 * „plăți în rate" întorcea ZERO. Cuvintele există toate, dar nu una lângă alta,
 * în ordinea aia, în același text.
 *
 * Un om nu scrie un citat, scrie cuvintele care îi vin. Deci: fiecare cuvânt
 * trebuie să apară undeva, oriunde, în oricare ordine. Afară de cele de
 * legătură, care nu spun nimic despre ce caută omul.
 *
 * ⚠ Dacă a scris DOAR cuvinte de legătură, se poartă ca o căutare goală și nu
 * filtrează nimic. Altfel „de" ar fi întors zero, iar pagina ar fi arătat
 * ecranul „nu găsim nimic" pentru o prepoziție.
 */
export function potrivire(integrare: Integrare, cautare: string): boolean {
  const scrise = faraDiacritice(cautare).split(/\s+/).filter(Boolean);
  const cuvinte = scrise.filter((c) => !CUVINTE_DE_LEGATURA.has(c));
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
