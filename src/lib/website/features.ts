/**
 * Cardurile de funcții de pe pagina de acasă.
 *
 * Textele sunt cele finale, date de client.
 *
 * Ordinea din listă e ordinea din teanc. Primul card e cel mai important, el
 * apare primul și stă cel mai mult sub ochi.
 *
 * ═══ IMAGINILE VIN ÎN TREI MĂRIMI ═══
 *
 * `image.base` NU e o cale de fișier, ci rădăcina lor: din `/features/magazin`
 * ies `/features/magazin-720.webp`, `-1080` și `-1440`, iar browserul alege.
 *
 * Motivul e concret. Loader-ul proiectului lasă neatinse imaginile locale — trece
 * prin el doar ce e pe R2 — deci `next/image` nu produce niciun `srcset` pentru
 * ele: orice dispozitiv primea fișierul întreg. Cu masterele de 1800x1350, un
 * telefon descărca cinci imagini pe care le afișa la 280px și ținea în memorie
 * 46MB de bitmap decodat. Cu varianta de 720, aceleași cinci fac 7,4MB.
 *
 * Lățimile nu sunt alese din burtă. Caseta imaginii, măsurată pe scara de ecrane:
 *   360 -> 224   640 -> 464   1023 -> 847 (maximul)   1024 -> 371   1280+ -> 467
 * Cel mai mare NU e pe desktop, ci chiar sub pragul `lg`, unde cardul e încă pe o
 * coloană. De acolo vine varianta de 1440: 847 la două puncte pe pixel.
 *
 * Ca să adaugi o imagine nouă, pui masterul (4:3, minim 1440 lățime) și rulezi
 * aceeași redimensionare în trei pași. Cât `base` lipsește, se vede `hint`-ul.
 */

export interface FeatureCard {
  /** Cheie stabilă pentru `key`, chiar dacă se schimbă titlul. */
  id: string;
  /** Rândul mic de deasupra titlului: tema cardului. */
  kicker: string;
  title: string;
  description: string;
  /**
   * Lista cu bife de sub descriere.
   *
   * Erau pastile într-un rând care se rupea. Clientul le-a cerut scoase
   * (2026-08-06): o listă cu bife spune același lucru, dar se citește dintr-o
   * privire, în loc să oblige ochiul să sară de la o pastilă la alta.
   *
   * PATRU, exact, la fiecare card. Se afișează două pe rând (vezi `Features.tsx`),
   * deci patru înseamnă un pătrat plin. Cu trei sau cu cinci, ultimul rând rămâne
   * pe jumătate gol și se vede. Dacă un card chiar are nevoie de a cincea funcție,
   * se schimbă mai întâi aranjarea, nu se adaugă doar în listă.
   */
  checks: string[];
  /**
   * Butonul cardului. Fiecare card trimite la pagina LUI, nu la una comună —
   * altfel butonul e ornament, nu o cale mai departe.
   *
   * ═══ TEXTELE SUNT ALE CLIENTULUI, ȘI AU FOST PUSE LA LOC ═══
   *
   * S-au încercat o dată etichetele scurte din mega-meniu — „Magazin online",
   * „Integrări", „Curieri și AWB" — cu argumentul că site-ul ar trebui să spună un
   * singur nume per pagină. Clientul le-a respins (2026-08-06) și a cerut înapoi
   * formele lungi. Nu le schimba din nou fără să întrebi.
   *
   * Ce a rămas din încercarea aia e partea care chiar aranja butoanele: toate au
   * ACEEAȘI lățime, socotită după cea mai lungă etichetă. Vezi `Features.tsx`.
   *
   * Un lucru de știut, ca să nu se piardă: „Vezi mai multe detalii" e link fără
   * sens scos din context — un cititor de ecran care listează linkurile paginii
   * citește atât. Nu e o eroare de reparat peste decizia clientului, e un cost
   * pe care merită să-l știe cine se uită aici.
   */
  cta: { label: string; href: string };
  image: {
    /** Radacina, fara sufixul de marime. Lipseste => se afiseaza substituentul. */
    base?: string;
    alt: string;
    /** Ce trebuie sa arate imaginea. Se vede pe substituent. */
    hint: string;
  };
}

/** Marimile generate pentru fiecare imagine. Vezi nota de sus. */
export const FEATURE_IMAGE_WIDTHS = [720, 1080, 1440];

export const FEATURE_CARDS: FeatureCard[] = [
  {
    id: "magazin",
    kicker: "Creează un magazin online complet",
    title: "Lansează un magazin online complet în doar câteva minute.",
    description:
      "Tot ce ai nevoie pentru a începe să vinzi online este deja pregătit: produse, categorii, variante, checkout și administrare simplă.",
    checks: [
      "Magazin „la cheie”",
      "Design modern",
      "Mobile Friendly",
      "Conform legislației în vigoare",
    ],
    cta: { label: "Vezi mai multe detalii", href: "/magazin-online" },
    image: {
      base: "/features/magazin",
      alt: "Magazin online Edinio pe desktop și pe telefon",
      hint: "Homepage premium + telefon",
    },
  },
  {
    id: "integrari",
    kicker: "Toate integrările într-un singur loc",
    title: "Activează toate integrările în doar câteva click-uri.",
    description:
      "Curieri, plăți online, facturare, marketplace-uri și marketing. Totul este integrat direct în Edinio.",
    checks: [
      "Curieri",
      "Plată cu cardul",
      "Integrare Marketplace",
      "Integrare soft de facturare",
    ],
    cta: { label: "Vezi toate integrările", href: "/integrari" },
    image: {
      base: "/features/integrari",
      alt: "Integrările Edinio, conectate între ele",
      hint: "Toate logo-urile conectându-se spre Edinio",
    },
  },
  {
    id: "automatizari",
    kicker: "Automatizează întreaga afacere",
    title: "Economisește timp cu automatizări inteligente.",
    description:
      "Facturile, AWB-urile, notificările și multe alte procese repetitive se realizează automat.",
    checks: [
      "Generare factură automat",
      "Generare AWB automat",
      "Trimitere automată mail",
      "Trimitere notificări prin SMS",
    ],
    /* Nu exista pagina „Automatizari". `/curieri` e cea mai apropiata: AWB-ul
       generat automat e chiar prima automatizare din lista. */
    cta: { label: "Vezi toți curierii", href: "/curieri" },
    image: {
      base: "/features/automatizari",
      alt: "Fluxul automat: comandă, factură, AWB, livrare",
      hint: "Flux animat: Comandă → Factură → AWB → Livrare",
    },
  },
  {
    id: "vanzari",
    kicker: "Crește vânzările",
    title: "Instrumente construite pentru mai multe vânzări.",
    description:
      "Folosește funcții dedicate comerțului online pentru a atrage clienți și pentru a crește rata de conversie.",
    checks: [
      "Recuperare coșuri abandonate",
      "Cupoane de reducere",
      "Email Marketing",
      "SMS Marketing",
    ],
    /* CEA MAI SLABA POTRIVIRE din cele cinci, si merita stiut. Cardul e despre
       unelte de vanzare — cosuri abandonate, cupoane, marketing — iar
       `/optimizare` e despre pagini rapide si Google. Nu exista o pagina despre
       unelte de crestere; asta e cea mai apropiata din coloana „Creste" a
       meniului. Daca se face vreodata o pagina de marketing, aici se schimba. */
    cta: { label: "Vezi cum optimizăm magazinul", href: "/optimizare" },
    image: {
      base: "/features/vanzari",
      alt: "Panoul de marketing din Edinio",
      hint: "Dashboard marketing",
    },
  },
  {
    id: "tehnic",
    kicker: "Noi ne ocupăm de partea tehnică",
    title: "Tu vinzi. Noi ne ocupăm de restul.",
    description:
      "Actualizările, securitatea, mentenanța și asistența sunt incluse permanent, fără costuri suplimentare.",
    checks: [
      "Mentenanță gratuită",
      "Asistență non-stop",
      "Securitate",
      "Actualizări constante",
    ],
    cta: { label: "Vezi ce include mentenanța", href: "/mentenanta-gratuita" },
    image: {
      base: "/features/mentenanta",
      alt: "Mentenanță, securitate și asistență Edinio",
      hint: "Scut + dashboard + operator suport",
    },
  },
];
