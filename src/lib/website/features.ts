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
  benefits: string[];
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
    benefits: ["Magazin complet", "Design modern", "Mobile Friendly", "Gata de vânzare"],
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
    benefits: [
      "Curieri",
      "Plată cu cardul",
      "Facturare",
      "Integrare cu marketplace-urile tale preferate",
      "Marketing",
    ],
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
    benefits: ["AWB automat", "Facturi automate", "Email", "SMS", "Automatizări"],
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
    benefits: [
      "Coșuri abandonate",
      "Cupoane",
      "Email Marketing",
      "SMS Marketing",
      "Wheel of Fortune",
    ],
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
    benefits: ["Mentenanță gratuită", "Actualizări", "Backup", "Securitate", "Suport"],
    image: {
      base: "/features/mentenanta",
      alt: "Mentenanță, securitate și asistență Edinio",
      hint: "Scut + dashboard + operator suport",
    },
  },
];
