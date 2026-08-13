import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  Car,
  CircleHelp,
  Cpu,
  Gauge,
  LifeBuoy,
  Newspaper,
  PawPrint,
  Pill,
  Plug,
  ShieldCheck,
  Shirt,
  Sofa,
  Sparkles,
  Store,
} from "lucide-react";

/**
 * Meniul site-ului de prezentare, intr-un singur loc.
 *
 * Sursa unica pentru: mega menu (desktop), meniul de telefon, footer si rutele
 * paginilor noi. Cand adaugi o intrare aici:
 *   1. adauga si pagina in `src/app/(website)/`
 *   2. daca e un segment NOU de nivel intai (ex. `/integrari`), adauga-l in
 *      `NON_STORE_SEGMENTS` din `src/proxy.ts` — altfel proxy-ul il trateaza ca
 *      slug de magazin si face o interogare Supabase la fiecare cerere.
 *
 * Textele sunt cu diacritice: e text de fatada, iar lipsa lor se vede.
 */

export interface NavItem {
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
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
  /** Fraza de deschidere a paginii de comparatie. */
  lead: string;
}

/** Panoul de promovare din dreapta unui mega menu. */
export interface NavFeatured {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  /** Sigle afisate in panou (cai din /public). */
  logos?: {
    src: string;
    alt: string;
    /**
     * Inverseaza culorile siglei.
     *
     * Pentru fisierele desenate ALB, facute pentru fundal inchis: pe cartonul
     * alb al meniului ar fi invizibile. Merge doar la sigle monocrome.
     */
    invert?: boolean;
  }[];
}

/* ─── Soluție eCommerce ──────────────────────────────────────────────────── */

export const SOLUTION_COLUMNS: NavColumn[] = [
  {
    heading: "Vinde",
    items: [
      {
        label: "Magazin online",
        href: "/magazin-online",
        icon: Store,
        description: "Magazin complet, pregătit pentru vânzare din prima zi.",
      },
    ],
  },
  {
    heading: "Crește",
    items: [
      {
        label: "Integrări",
        href: "/integrari",
        icon: Plug,
        description: "Facturare, marketing, curieri și plăți într-un singur loc.",
      },
      {
        label: "Optimizare",
        href: "/optimizare",
        icon: Gauge,
        description: "Pagini rapide și optimizate pentru Google.",
      },
      {
        label: "Mentenanță gratuită",
        href: "/mentenanta-gratuita",
        icon: ShieldCheck,
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

/**
 * Industriile care intra in mega menu, in ordinea ceruta de client.
 *
 * Lista e scrisa explicit, nu taiata din `INDUSTRIES` cu un `slice`: asa, cine
 * reordoneaza lista mare maine nu schimba din greseala ce se vede in meniu.
 *
 * ⚠ PATRU, nu sase. Erau sase - cate incap fara ca aceasta coloana sa fie mai
 * inalta decat restul panoului - dar doua dintre ele, „Sport si fitness" si
 * „Bijuterii", au fost scoase cu totul la cererea clientului (13.08). Coloana e
 * acum mai scurta. Daca se vrea inapoi la sase, se aleg doua dintre cele ramase
 * pe /industrii: cosmetice, petshop, suplimente.
 *
 * Un slug gresit opreste build-ul, in loc sa scoata tacut o intrare din meniu.
 */
const MENU_INDUSTRY_SLUGS = ["haine", "electronice", "piese-auto", "mobila"];

export const MENU_INDUSTRY_LINKS: NavLink[] = MENU_INDUSTRY_SLUGS.map((slug) => {
  const industry = INDUSTRIES.find((i) => i.slug === slug);
  if (!industry) {
    throw new Error(
      `MENU_INDUSTRY_SLUGS: nu exista industria "${slug}" in INDUSTRIES.`,
    );
  }
  return { label: industry.label, href: `/industrii/${industry.slug}` };
});

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
   * Alese si pentru cum arata fisierul, nu doar pentru brand. Doua capcane
   * gasite in `public/integrations/`:
   *   - `netopia.svg` e desenat ALB (`.st0{fill:#FFFFFF}`), pentru fundal
   *     inchis. Pe cartonul alb de aici e complet invizibil.
   *   - `cargus.svg` are 215KB de imagine matriceala inglobata si la 28px
   *     devine o pata.
   * Cele de mai jos sunt inchise sau colorate pe fundal transparent, deci se
   * citesc pe alb. Cate una din fiecare categorie din descriere: curierat,
   * plati, facturare.
   */
  logos: [
    { src: "/integrations/fan-courier.svg", alt: "FAN Courier" },
    { src: "/integrations/sameday.webp", alt: "Sameday" },
    { src: "/integrations/dpd.svg", alt: "DPD" },
    /* Desenata alb, pentru fundal inchis. Inversata, ca sa se vada pe alb. */
    { src: "/integrations/netopia.svg", alt: "Netopia", invert: true },
    { src: "/integrations/stripe.svg", alt: "Stripe" },
    { src: "/integrations/smartbill.webp", alt: "SmartBill" },
  ],
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
    lead: "Shopify e o platformă solidă, gândită în primul rând pentru piața americană. Diferența se vede la curierii din România, la e-Factura și la costul total, unde Edinio nu îți cere o aplicație plătită separat pentru fiecare pas.",
  },
  {
    name: "Cartum",
    href: "/vs/cartum",
    description: "Mai multă flexibilitate și personalizare pentru magazinul tău.",
    lead: "Amândouă sunt platforme la cheie pentru piața locală. Diferența e la editorul vizual pe secțiuni, la variantele de design și la facturarea automată, incluse la Edinio.",
  },
  {
    name: "Wix",
    href: "/vs/wix",
    description: "Construit special pentru magazine online, nu doar pentru website-uri.",
    lead: "Wix e făcut întâi pentru site-uri de prezentare, cu un magazin adăugat pe deasupra. Edinio e construit invers: comanda, stocul și livrarea sunt în centru, nu într-un modul separat.",
  },
  {
    name: "WooCommerce",
    href: "/vs/woocommerce",
    description: "Fără hosting, pluginuri și actualizări de administrat.",
    lead: "WooCommerce îți dă control complet, în schimbul întreținerii. Cu Edinio nu ai pluginuri de actualizat, hosting de plătit sau versiuni care se ceartă între ele după fiecare update.",
  },
  {
    name: "OpenCart",
    href: "/vs/opencart",
    description: "Fără programator pentru fiecare modificare.",
    lead: "OpenCart cere de obicei un programator pentru fiecare modificare. La Edinio schimbi design, secțiuni, prețuri și pagini singur, din editor, și vezi rezultatul pe loc.",
  },
  {
    name: "Magento",
    href: "/vs/magento",
    description: "Mai rapid de lansat și mai ușor de administrat.",
    lead: "Magento acoperă cazuri foarte complexe, cu un buget de agenție pe măsură. Edinio acoperă ce are nevoie un magazin din România, la preț de abonament lunar.",
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
    icon: LifeBuoy,
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
    icon: Newspaper,
    description: "Ghiduri despre vânzarea online și noutățile platformei.",
  },
  {
    label: "Întrebări frecvente",
    href: "/intrebari-frecvente",
    icon: CircleHelp,
    description: "Răspunsuri scurte la ce ne întrebați cel mai des.",
  },
  {
    label: "Migrare magazin",
    href: "/migrare",
    icon: ArrowRightLeft,
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
    "/magazin-online",
    "/integrari",
    "/optimizare",
    "/mentenanta-gratuita",
    "/industrii",
  ],
  "de-ce-noi": ["/vs"],
  resurse: ["/ajutor", "/blog", "/intrebari-frecvente", "/migrare"],
};
