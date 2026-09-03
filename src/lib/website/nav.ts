import type { LucideIcon } from "lucide-react";
import type { LogoKey } from "./logos";
import {
  Car,
  Cpu,
  PawPrint,
  Pill,
  Shirt,
  Sofa,
  Sparkles,
} from "lucide-react";

/**
 * Meniul site-ului de prezentare, intr-un singur loc.
 *
 * Sursa unica pentru: mega menu (desktop), meniul de telefon, footer si rutele
 * paginilor noi. Cand adaugi o intrare aici:
 *   1. adauga si pagina in `src/app/(website)/`
 *   2. daca e un segment NOU de nivel intai (ex. `/integrari`), adauga-l in
 *      `NON_STORE_SEGMENTS` din `src/lib/segmente-rezervate.ts` — altfel
 *      proxy-ul il trateaza ca slug de magazin si face o interogare Supabase la
 *      fiecare cerere, iar proba sitemapului platformei (`sitemap.test.ts`)
 *      cade, fiindca sitemapul ar anunta o adresa nedovedita a platformei.
 *
 * Textele sunt cu diacritice: e text de fatada, iar lipsa lor se vede.
 */

/**
 * O intrare dintr-un panou al mega menu-ului.
 *
 * ⚠ N-ARE ICONITA, din 30.08. Avea `icon: LucideIcon`, desenata intr-un patrat
 * de 36px la fiecare rand. Clientul a numit tiparul „vibe coded" si avea
 * dreptate: e sablonul pe care il scoate orice unealta. Amanuntul, in `MegaItem`.
 *
 * Campul n-a fost lasat „pentru mai tarziu": nefolosit, ar fi tinut in pachetul
 * barei de sus sase iconite Lucide, pe fiecare pagina a site-ului, degeaba.
 */
export interface NavItem {
  label: string;
  href: string;
  description: string;
  /** Eticheta mica de langa titlu, ex. "Gratuit". Verde, folosita rar. */
  badge?: string;
}

export interface NavColumn {
  heading: string;
  items: NavItem[];
}

export interface NavLink {
  label: string;
  href: string;
}

/** O comparatie cu un concurent. Fara sigla: numele lor rimane doar text. */
export interface NavCompare {
  /** Numele concurentului, exact cum se scrie. */
  name: string;
  href: string;
  /** Un rand, pentru mega menu. */
  description: string;
  /**
   * Titlul paginii de comparație, cel mare.
   *
   * ⚠ NU e „Edinio vs X" — aia e eticheta de deasupra. Titlul spune ce se câștigă
   * din comparație, nu cine cu cine se compară. Textele sunt ale clientului
   * (13.08), date cuvânt cu cuvânt.
   */
  titlu: string;
  /** Fraza de sub titlu. Tot a clientului (13.08). */
  lead: string;
}

/** Panoul de promovare din dreapta unui mega menu. */
export interface NavFeatured {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  /**
   * Siglele din panou, ca CHEI din `PROVIDER_LOGOS`, nu ca adrese de fisier.
   *
   * ⚠ ERAU ADRESE, si asta le tinea in afara socotelii de marime. Fiecare sigla
   * are in `logos.ts` raportul cutiei si cat cerneala are desenul in ea, iar de
   * acolo se scoate marimea la care PARE egala cu vecinele. Cu adrese scrise de
   * mana, panoul le desena pe toate la aceeasi INALTIME - si atunci Stripe, care
   * e un cuvant lung, arata de cateva ori mai mare decat Sameday, care e patrat.
   *
   * Ca si cheie, sigla trece prin `Logo`, deci si `invert` (Netopia e desenata
   * alb, pentru fundal inchis) vine de acolo, nu mai e scris aici.
   */
  logos?: LogoKey[];

}

/* ─── Soluție eCommerce ──────────────────────────────────────────────────── */

/**
 * ⚠ DOUĂ ȘI DOUĂ, nu una și trei — cerut de client (13.08).
 *
 * Coloana „Vinde" avea trei intrări: magazinul, plățile cu cardul și curierii.
 * Ultimele două au fost șterse cu totul, și a rămas una singură lângă o coloană
 * cu trei — o treaptă vizibilă în panou.
 *
 * ⚠ „Integrări" A TRECUT LA „VINDE", și nu la întâmplare: chiar plățile și
 * curierii, cele două scoase de acolo, trăiesc acum în biblioteca de integrări.
 * Coloana spune tot ce spunea și înainte, doar că printr-o singură ușă.
 */
export const SOLUTION_COLUMNS: NavColumn[] = [
  {
    heading: "Vinde",
    items: [
      {
        /*
          ⚠ DUCE LA PAGINA DE START, nu la o pagină a lui — cerut de client
          (13.08): „nu mai facem o pagină separată, că nu are rost". Pagina de
          start CHIAR e pagina despre magazinul online, deci intrarea nu trimite
          nicăieri în plus, doar acasă.
        */
        label: "Magazin online",
        href: "/",
        description: "Magazin complet, pregătit pentru vânzare din prima zi.",
      },
      {
        label: "Integrări",
        href: "/integrari",
        description: "Facturare, marketing, curieri și plăți într-un singur loc.",
      },
    ],
  },
  {
    heading: "Crește",
    items: [
      {
        label: "Optimizare",
        href: "/optimizare",
        description: "Pagini rapide și optimizate pentru Google.",
      },
      {
        label: "Mentenanță gratuită",
        href: "/mentenanta-gratuita",
        description: "Mentenanță și asistență fără costuri suplimentare.",
        badge: "Inclus",
      },
    ],
  },
];

/**
 * Paginile de industrie.
 *
 * `h1` e scris de mână, nu construit din `label`: genitivul romanesc nu se
 * deduce dintr-un substantiv (spui "de piese auto" dar "pentru animale de
 * companie"), iar o pagina de SEO cu titlul stropsit face mai mult rau decat
 * bine.
 */
export interface Industry {
  label: string;
  slug: string;
  icon: LucideIcon;
  /** Cum apare in titlul din Google, dupa "Creare magazin online ...". */
  seoTitle: string;
  h1: string;
  lead: string;
}

export const INDUSTRIES: Industry[] = [
  {
    label: "Piese auto",
    slug: "piese-auto",
    icon: Car,
    seoTitle: "piese auto",
    h1: "Creare magazin online de piese auto",
    lead: "Cataloage mari, coduri de piesă și compatibilități. Import din fișier, căutare care iartă greșelile de tastare și filtre pe specificații.",
  },
  {
    label: "Haine și modă",
    slug: "haine",
    icon: Shirt,
    seoTitle: "haine",
    h1: "Creare magazin online de haine",
    lead: "Mărimi și culori ca variante, stoc separat pe fiecare, retururi simple. Exact ce cere un magazin de haine, fără module în plus.",
  },
  {
    label: "Cosmetice",
    slug: "cosmetice",
    icon: Sparkles,
    seoTitle: "cosmetice",
    h1: "Creare magazin online de cosmetice",
    lead: "Ingrediente, gramaje și seturi la pachet. Recenzii și recomandări, ca să crească valoarea coșului.",
  },
  {
    label: "Mobilier și decor",
    slug: "mobila",
    icon: Sofa,
    seoTitle: "mobilier",
    h1: "Creare magazin online de mobilier",
    lead: "Produse voluminoase, tarife de livrare pe clase de transport și termene diferite pe categorii.",
  },
  {
    label: "Electronice",
    slug: "electronice",
    icon: Cpu,
    seoTitle: "electronice",
    h1: "Creare magazin online de electronice",
    lead: "Specificații tehnice, garanții și coduri EAN. Filtre pe caracteristici și comparație între produse.",
  },
  {
    label: "Animale de companie",
    slug: "petshop",
    icon: PawPrint,
    seoTitle: "petshop",
    h1: "Creare magazin online pentru animale de companie",
    lead: "Comenzi care se repetă, gramaje diferite și livrare rapidă. Pachete și reduceri la cantitate.",
  },
  {
    label: "Suplimente",
    slug: "suplimente",
    icon: Pill,
    seoTitle: "suplimente",
    h1: "Creare magazin online de suplimente",
    lead: "Gramaje, termene de valabilitate și pachete pe cure. Etichete clare, așa cum cer regulile de prezentare.",
  },
];

export const INDUSTRY_LINKS: NavLink[] = INDUSTRIES.map((i) => ({
  label: i.label,
  href: `/industrii/${i.slug}`,
}));

/*
 * ⚠ INDUSTRIILE AU IESIT DIN MEGA MENU pe 30.08, cerut de client.
 *
 * Aici era `MENU_INDUSTRY_LINKS`, lista scurta care umplea a treia coloana a
 * panoului. A plecat odata cu coloana, din `MegaPanels` si din `MobileNav`.
 *
 * ⚠ PAGINILE RAMAN, SI RAMAN LEGATE. Subsolul are o rubrica „Industrii" cu
 * patru intrari, iar subsolul e pe fiecare pagina a site-ului. Deci scoaterea
 * din meniu nu le face orfane si nu le scoate din indexul Google. Verificat
 * inainte de taiere, tocmai fiindca asta ar fi fost urmarea nevazuta.
 *
 * `INDUSTRIES` si `INDUSTRY_LINKS` raman: le folosesc paginile `/industrii`,
 * `/industrii/[industrie]` si subsolul.
 */

export const SOLUTION_FEATURED: NavFeatured = {
  eyebrow: "Totul inclus",
  title: "Peste 25 de integrări, pregătite din prima zi",
  description:
    "Curieri, plăți, facturare și marketing. Le activezi cu un comutator, fără programator.",
  href: "/integrari",
  cta: "Vezi toate integrările",
  /*
   * Șase, nu opt: pe trei coloane rămân lizibile. Restul sunt pe /integrari.
   *
   * ⚠ Cate una din fiecare categorie din descriere: curierat, plati, facturare.
   *
   * Capcanele de fisier care erau notate aici — Netopia desenata alb, Cargus cu
   * 215KB de imagine matriceala inglobata — sunt acum tinute in `logos.ts`,
   * unde stau si rapoartele. De aceea aici raman doar cheile.
   */
  logos: ["fanCourier", "sameday", "dpd", "netopia", "stripe", "smartbill"],
};

/* ─── De ce noi ──────────────────────────────────────────────────────────── */

/**
 * Comparații cu platformele concurente.
 *
 * Publicitatea comparativă e reglementată: fiecare afirmație trebuie să fie
 * verificabilă și să compare aceleași caracteristici. Textele de mai jos sunt
 * formulate ca diferențiatori, nu ca denigrare, si rimane de confirmat cu
 * clientul inainte de lansare.
 */
export const COMPETITORS: NavCompare[] = [
  {
    name: "Shopify",
    href: "/vs/shopify",
    description: "Magazin pregătit pentru România, fără aplicații suplimentare.",
    titlu: "O alternativă românească la Shopify",
    lead:
      "Edinio pune într-un singur loc magazinul, integrările locale, mentenanța și asistența de care ai nevoie.",
  },
  {
    name: "Cartum",
    href: "/vs/cartum",
    description: "Mai multă flexibilitate și personalizare pentru magazinul tău.",
    titlu: "O platformă construită în jurul afacerii tale.",
    lead:
      "Am pus cele două platforme față în față ca să poți vedea mai ușor ce variantă se potrivește magazinului tău.",
  },
  {
    name: "Wix",
    href: "/vs/wix",
    description: "Construit special pentru magazine online, nu doar pentru website-uri.",
    titlu: "Când vrei să vinzi online, ai nevoie de mai mult decât un website.",
    lead:
      "Vezi diferențele dintre cele două atunci când scopul principal este să vinzi produse online.",
  },
  {
    name: "WooCommerce",
    href: "/vs/woocommerce",
    description: "Fără hosting, pluginuri și actualizări de administrat.",
    titlu: "Fără grija pluginurilor, update-urilor și mentenanței.",
    lead:
      "Compară o platformă administrată integral cu un magazin în care hostingul, extensiile și întreținerea tehnică trebuie gestionate separat.",
  },
  {
    name: "OpenCart",
    href: "/vs/opencart",
    description: "Fără programator pentru fiecare modificare.",
    titlu: "Mai puține configurări. Mai simplu de administrat.",
    lead:
      "Descoperă cum se compară Edinio cu OpenCart pentru un antreprenor care nu vrea să se ocupe de partea tehnică.",
  },
  {
    name: "Magento",
    href: "/vs/magento",
    description: "Mai rapid de lansat și mai ușor de administrat.",
    titlu: "Mai rapid de lansat. Mai simplu de administrat.",
    lead:
      "Descoperă diferențele dintre Edinio și Magento atunci când vrei un magazin online fără o infrastructură complicată.",
  },
];

export const COMPARE_FEATURED: NavFeatured = {
  eyebrow: "Treci la Edinio",
  title: "Migrare gratuită din orice platformă",
  description: "Îți mutăm produsele, categoriile și clienții. Tu nu pierzi nicio comandă.",
  href: "/migrare",
  cta: "Cere migrarea",
};

/* ─── Resurse ────────────────────────────────────────────────────────────── */

export const RESOURCES_FEATURED: NavFeatured = {
  eyebrow: "Ai nevoie de ajutor",
  title: "Vorbești cu un om, nu cu un robot",
  description: "Suport 7 zile din 7, pe chat, e-mail sau telefon. Răspundem în aceeași zi.",
  href: "/contact",
  cta: "Scrie-ne",
};

export const RESOURCES: NavItem[] = [
  {
    label: "Centru de ajutor",
    href: "/ajutor",
    description: "Ghiduri pas cu pas pentru fiecare funcție a platformei.",
  },
  {
    /*
      A luat locul „Roadmap" (cerut 2026-08-09: se înlocuiește definitiv).
      Pagina e aceeași, redenumită, iar `/roadmap` redirecționează permanent
      către `/blog` din `next.config.ts` — altfel orice link vechi ar da 404.
    */
    label: "Blog",
    href: "/blog",
    description: "Ghiduri despre vânzarea online și noutățile platformei.",
  },
  {
    label: "Întrebări frecvente",
    href: "/intrebari-frecvente",
    description: "Răspunsuri scurte la ce ne întrebați cel mai des.",
  },
  {
    label: "Migrare magazin",
    href: "/migrare",
    description: "Mutăm produsele și comenzile din platforma actuală.",
    badge: "Gratuit",
  },
];

/* ─── Bara de sus ────────────────────────────────────────────────────────── */

export type MenuId = "solutie" | "de-ce-noi" | "resurse";

/** Intrările din bară. `menu` deschide un panou; `href` e link simplu. */
export type TopNavEntry = { label: string } & ({ menu: MenuId } | { href: string });

export const TOP_NAV: TopNavEntry[] = [
  { label: "Soluție eCommerce", menu: "solutie" },
  { label: "De ce noi?", menu: "de-ce-noi" },
  /*
    Duce la PAGINA, nu la ancora de pe pagina de start (cerut 2026-08-11).

    Cat timp `/preturi` era doar o coajă veche, ancora era alegerea buna: te
    ducea direct la grila. Acum pagina are grila, tabelul de comparatie si
    contactul, adica mai mult decat sectiunea — iar ancora te trimitea pe pagina
    de start si te lasa acolo, cu restul nevazut.

    Are si un efect care nu se vede de aici: intrarea din bara se APRINDE cand
    esti pe ea. `SiteHeader` marcheaza activ cu `!href.includes("#") && pathname
    === href`, deci cu ancora nu se aprindea niciodata.
  */
  { label: "Prețuri", href: "/preturi" },
  { label: "Resurse", menu: "resurse" },
  { label: "Contact", href: "/contact" },
];

/**
 * Prefixele de cale pentru fiecare panou, ca să marcăm intrarea activă când
 * omul e deja pe una din paginile ei.
 */
export const MENU_PREFIXES: Record<MenuId, string[]> = {
  solutie: [
    /*
      ⚠ „/" NU INTRĂ AICI, deși intrarea „Magazin online" duce acum acolo.
      Potrivirea de mai jos e `pathname === prefix || pathname.startsWith(prefix + "/")`,
      iar cu „/" în listă ORICE pagină de pe site ar fi marcat „Soluție eCommerce"
      ca fiind cea deschisă. Pagina de start nu aparține niciunui panou.
    */
    "/integrari",
    "/optimizare",
    "/mentenanta-gratuita",
  ],
  "de-ce-noi": ["/vs"],
  resurse: ["/ajutor", "/blog", "/intrebari-frecvente", "/migrare"],
};
