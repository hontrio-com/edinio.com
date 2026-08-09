/**
 * Subsolul site-ului de prezentare.
 *
 * ═══ COLOANELE SUNT ALE CLIENTULUI ═══
 *
 * Cele patru coloane, ordinea lor și fiecare etichetă au fost date cuvânt cu
 * cuvânt (2026-08-09). Nu se rescriu și nu se reordonează fără să întrebi.
 *
 * ═══ DATELE FIRMEI AU FOST SCOASE ═══
 *
 * Subsolul avea denumirea, CUI-ul și sediul. Cerute afară, cu motivul „oricum o
 * să apară în Politici". Verificat că e adevărat înainte de a le șterge: apar în
 * `/termeni` (denumire, CUI, sediu social) și în `/confidentialitate` — deci
 * identificarea comerciantului rămâne accesibilă de pe site, ceea ce contează și
 * pentru procesatorii de plăți.
 *
 * ⚠ Dacă vreodată se rescriu paginile alea, datele TREBUIE să rămână undeva
 * accesibil. Nu le scoate de acolo fără să le pui în altă parte.
 */

export interface FooterLink {
  label: string;
  href: string;
  /**
   * Cuvântul dinaintea etichetei („Telefon:", „Email:"), afișat stins și ÎN
   * AFARA linkului.
   *
   * Clientul a cerut rândurile scrise chiar așa. Puse în interiorul linkului,
   * apăsarea pe cuvântul „Telefon:" ar fi format numărul — ținta de apăsare
   * trebuie să fie doar numărul, nu eticheta lui.
   */
  prefix?: string;
  /** Adevărat pentru `tel:` / `mailto:`, care nu trec prin router. */
  extern?: boolean;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Platformă",
    links: [
      { label: "Creare magazin online", href: "/magazin-online" },
      { label: "Integrare plăți cu cardul", href: "/plati-cu-cardul" },
      { label: "Integrare curieri", href: "/curieri" },
      { label: "Mentenanță gratuită", href: "/mentenanta-gratuita" },
      { label: "Migrare gratuită", href: "/migrare" },
    ],
  },
  {
    title: "Resurse",
    links: [
      { label: "Termeni și condiții", href: "/termeni" },
      { label: "Politica de confidențialitate", href: "/confidentialitate" },
      { label: "Politica Cookies", href: "/cookies" },
      /* A luat locul Roadmap-ului; `/roadmap` redirecționează permanent aici. */
      { label: "Blog", href: "/blog" },
      { label: "Întrebări frecvente", href: "/intrebari-frecvente" },
    ],
  },
  {
    /*
      Adresele vin din `INDUSTRIES` (`nav.ts`), unde sunt și slug-urile folosite
      de mega menu. Etichetele de aici sunt însă ALE CLIENTULUI, mai lungi decât
      cele din meniu („Magazin online Haine și Modă", nu „Haine și modă"): în
      subsol ele sunt și text de căutare, nu doar etichete de listă.
    */
    title: "Industrii",
    links: [
      { label: "Magazin online Haine și Modă", href: "/industrii/haine" },
      { label: "Magazin online Electronice", href: "/industrii/electronice" },
      { label: "Magazin online Piese auto", href: "/industrii/piese-auto" },
      { label: "Magazin online Mobilier și decor", href: "/industrii/mobila" },
      { label: "Magazin online Bijuterii", href: "/industrii/bijuterii" },
    ],
  },
  {
    title: "Contact",
    links: [
      { prefix: "Telefon:", label: "0750 456 809", href: "tel:+40750456809", extern: true },
      {
        prefix: "Email:",
        label: "contact@edinio.com",
        href: "mailto:contact@edinio.com",
        extern: true,
      },
      { label: "Ia legătura cu noi", href: "/contact" },
      { label: "Centru de ajutor", href: "/ajutor" },
    ],
  },
];

/**
 * Rețelele sociale.
 *
 * Siglele sunt fișierele pe care le avem deja în depozit. Nu s-a desenat niciun
 * traseu nou: o siglă de marcă scrisă din memorie iese aproape sigur greșit.
 *
 * ⚠ TIKTOK A TREBUIT DECUPAT.
 *
 * `integrations/tiktok-pixel.svg` nu e o iconiță, e ansamblul complet: nota PLUS
 * cuvântul „TikTok" dedesubt. Într-un pătrat de 36px lângă Facebook și Instagram
 * ieșea o siglă cu text ilizibil sub ea — se vede în captura de la prima formă.
 *
 * `social/tiktok.svg` sunt primele cinci trasee ale aceluiași fișier (nota), cu
 * `viewBox` strâns pe caseta lor măsurată în browser: x 178.9→621.2,
 * y 70.5→570.4. Fișierul original rămâne neatins — acolo, în lista de
 * integrări, ansamblul cu text e forma corectă.
 *
 * `inaltime` e reglată PE OCHI, nu egalizată pe arie ca la siglele din tabelul
 * de comparație: Facebook și Instagram sunt insigne pline, iar nota TikTok e o
 * formă subțire care, la aceeași înălțime, arată mai mică decât ele.
 */
export interface SocialLink {
  label: string;
  href: string;
  src: string;
  /** Lățime / înălțime, măsurat pe `viewBox`. */
  ratio: number;
  inaltime: number;
}

export const SOCIAL_LINKS: SocialLink[] = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/edinio.ecommerce/",
    src: "/social/facebook.svg",
    ratio: 1,
    inaltime: 20,
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/edinio.romania/",
    src: "/social/instagram.svg",
    ratio: 1,
    inaltime: 20,
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@edinio.com",
    src: "/social/tiktok.svg",
    ratio: 442.3 / 499.9,
    inaltime: 20,
  },
];
