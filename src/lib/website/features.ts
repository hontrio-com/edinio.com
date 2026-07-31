/**
 * Cardurile de funcții de pe pagina de acasă.
 *
 * Textele sunt cele finale, date de client. Imaginile sunt încă substituenți: ca
 * să pui una adevărată, completezi `image.src` și caseta gri dispare singură.
 * Cât `src` lipsește, se afișează `hint`, adică exact ce imagine așteptăm acolo,
 * ca să nu se piardă ideea până vine fișierul.
 *
 * Ordinea din listă e ordinea din teanc. Primul card e cel mai important, el
 * apare primul și stă cel mai mult sub ochi.
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
    /** Lipseste => se afiseaza substituentul. */
    src?: string;
    alt: string;
    /** Ce trebuie sa arate imaginea. Se vede pe substituent. */
    hint: string;
  };
}

export const FEATURE_CARDS: FeatureCard[] = [
  {
    id: "magazin",
    kicker: "Creează un magazin online complet",
    title: "Lansează un magazin online complet în doar câteva minute.",
    description:
      "Tot ce ai nevoie pentru a începe să vinzi online este deja pregătit: produse, categorii, variante, checkout și administrare simplă.",
    benefits: ["Magazin complet", "Design modern", "Mobile Friendly", "Gata de vânzare"],
    image: {
      src: "/features/magazin.webp",
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
      src: "/features/integrari.webp",
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
      src: "/features/automatizari.webp",
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
      src: "/features/vanzari.webp",
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
      alt: "Mentenanță, securitate și asistență Edinio",
      hint: "Scut + dashboard + operator suport",
    },
  },
];
