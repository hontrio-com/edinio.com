/**
 * Subsolul site-ului de prezentare.
 *
 * ═══ COLOANELE SUNT ALE CLIENTULUI ═══
 *
 * Coloanele, ordinea lor și fiecare etichetă au fost date cuvânt cu cuvânt
 * (2026-08-09). Nu se rescriu și nu se reordonează fără să întrebi.
 *
 * ⚠ ERAU PATRU, SUNT TREI din 04.09.2026: „Industrii" a plecat odată cu
 * paginile ei, tot la cererea clientului. Vezi nota din dreptul locului gol.
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

import { EMAIL, TELEFON } from "./contact";

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
      { label: "Mentenanță gratuită", href: "/mentenanta-gratuita" },
      /*
        ⚠ `/migrare` EXISTĂ PE RAMURA ASTA, DAR A FOST ȘTEARSĂ PE `main` (2c138eb).

        Pagina stătea în `app/(landing)/migrare` — o pagină de campanie, în afara
        site-ului. S-a refăcut și a trecut în `app/(website)/migrare`, lângă
        celelalte; adresa a rămas aceeași, fiindcă grupurile de rute nu apar în ea.

        La unirea cu `main` sunt doar două ieșiri: ori se păstrează pagina, ori
        rândul ăsta (plus cele două linkuri din `nav.ts`) trebuie dus altundeva.
        Dacă se uită, proba din `footer.test.ts` cade — dinadins: mai bine se
        oprește suita decât să apară un link mort în subsolul FIECĂREI pagini.
      */
      { label: "Migrare gratuită", href: "/migrare" },
    ],
  },
  {
    title: "Resurse",
    links: [
      { label: "Termeni și condiții", href: "/termeni" },
      { label: "Politica de confidențialitate", href: "/confidentialitate" },
      { label: "Politica Cookies", href: "/cookies" },
      /* ⚠ Eticheta trebuie sa ramana literal „Setari Cookies": politica de cookie-uri o
         numeste asa, si un text care trimite la un buton inexistent e mai rau decat lipsa lui. */
      { label: "Setări Cookies", href: "/cookies/setari" },
      /* A luat locul Roadmap-ului; `/roadmap` redirecționează permanent aici. */
      { label: "Blog", href: "/blog" },
      { label: "Întrebări frecvente", href: "/intrebari-frecvente" },
    ],
  },
  /*
    ⚠ AICI ERA COLOANA „INDUSTRII", cu patru legături scrise de client:
    „Magazin online Haine și Modă", „…Electronice", „…Piese auto" și
    „…Mobilier și decor". A plecat pe 04.09.2026, odată cu paginile.

    Adresele răspund acum 410 (`src/app/industrii/route.ts`), iar subsolul e pe
    FIECARE pagină a site-ului: lăsată, coloana ar fi trimis patru legături
    moarte de peste tot. Nu e o curățenie tehnică — clientul a cerut ștergerea,
    după ce pe 30.08 ceruse tocmai păstrarea lor.

    Clientul a ales ca locul să rămână gol, nu să fie umplut cu altceva. Textele
    nu s-au rescris și nu s-au mutat: n-ar fi avut unde duce. Grila din
    `Footer.tsx` a trecut de la cinci coloane la patru.
  */
  {
    title: "Contact",
    links: [
      /* Numărul și adresa vin din `contact.ts`, nu scrise aici: aceleași valori
         apar și în banda de sub întrebările frecvente. Două copii s-ar despărți
         la prima schimbare de număr, și amândouă ar arăta la fel de corect. */
      { prefix: "Telefon:", label: TELEFON.label, href: TELEFON.href, extern: true },
      { prefix: "Email:", label: EMAIL.label, href: EMAIL.href, extern: true },
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
