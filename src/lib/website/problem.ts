/**
 * Secțiunea „Problema" de pe pagina de acasă.
 *
 * Textele stau aici ca să se schimbe fără să umbli în JSX, ca la
 * `lib/website/features.ts`.
 *
 * Imaginile sunt substituenți: ca să pui una adevărată, completezi `image.src` și
 * caseta gri dispare singură. Cât `src` lipsește se afișează `hint`, adică exact
 * ce imagine așteptăm acolo, ca să nu se piardă ideea până vine fișierul.
 */

/**
 * Titlul, rupt de mână în două rânduri.
 *
 * Lăsat într-un singur șir, se rupea unde apuca — fix peste mijlocul propoziției
 * a doua. Aici toată puterea stă în cele două afirmații puse una sub alta: laudă,
 * apoi palmă. Fiecare intrare din listă e un rând.
 *
 * Ruptura e o decizie de CONȚINUT, nu de stil: mărimea, grosimea, culoarea și
 * centrarea rămân identice cu ale titlului de la „Soluția".
 */
export const PROBLEM_TITLE = [
  "Produsul tău este bun.",
  "Magazinul online lasă de dorit.",
];

export const PROBLEM_LEAD =
  "Un client nu ar trebui să îți scrie pentru fiecare detaliu. Ar trebui să găsească produsele, informațiile și opțiunile de comandă într-un singur loc.";

export interface ProblemCard {
  /** Cheie stabilă pentru `key`, chiar dacă se schimbă titlul. */
  id: string;
  title: string;
  description: string;
  /**
   * Desen făcut de noi, în locul unei poze. Cardul cu `art` nu mai are `image`.
   *
   * - `messages` — firul de întrebări în bule iMessage
   * - `channels` — produsele împrăștiate pe trei rețele
   * - `product` — o pagină de produs cu tot ce dă încredere
   */
  art?: "messages" | "channels" | "product";
  image?: {
    /** Lipsește => se afișează substituentul. */
    src?: string;
    alt: string;
    /** Ce trebuie să arate imaginea. Se vede pe substituent. */
    hint: string;
  };
}

/**
 * Mesajele din primul card, desenate ca bule iMessage.
 *
 * Patru. Au fost trei o vreme, după ce a patra fusese scoasă fiindcă firul arăta
 * înghesuit — dar aia era lungă și se rupea în două rânduri. Cea de acum, „Pot să
 * plătesc cu cardul?", încape pe un rând, deci intră fără să strângă nimic.
 * Măsurat: firul ajunge la 213px într-un slot de 261.
 *
 * Nu există niciun răspuns printre ele, dinadins. Asta e tot cardul: întrebările
 * vin, iar tu ești singurul canal.
 *
 * Patru oameni diferiți, nu unul care scrie de patru ori — de aia fiecare mesaj
 * are alt chip.
 *
 * Lungimile contează mai mult decât ordinea: ultima e cea mai lungă, fiindcă stă
 * cel mai jos și se vede întreagă la orice lățime. Cele de deasupra se taie de
 * marginea cardului pe ecrane înguste, ca într-un fir derulat.
 *
 * ═══ POZELE SE ARATĂ ÎNTREGI, FĂRĂ APROPIERE ═══
 *
 * A fost o vreme când fiecare avea propria apropiere, calculată ca să iasă toate
 * capetele cam de aceeași mărime. N-a mers, și motivul merită scris ca să nu se
 * reia: pozele sunt fotografiate de la distanțe diferite, iar ca să egalezi
 * capetele trebuie să tai din fiecare altceva. Rezultatul se vede exact ca ce a
 * reclamat clientul — „unul e mai apropiat, altul mai depărtat".
 *
 * Acum toate patru se arată ÎNTREGI, la aceeași scară. Nu mai există nimic de
 * reglat per poză, deci nu mai are cum să iasă una altfel decât celelalte.
 * Chipurile sunt mai mici așa, dar la un cerc de 28px oricum se citește doar
 * silueta — iar patru cercuri care se poartă la fel se văd mult mai bine decât
 * patru încadrate „optim" fiecare în felul lui.
 *
 * Pozele sunt pătrate, cercul e pătrat, deci `object-cover` nu taie nimic din ele
 * în afară de colțuri. Dacă vreodată intră o poză care NU e pătrată, aici trebuie
 * revenit: aia chiar s-ar tăia.
 */
export interface ProblemMessage {
  text: string;
  /** Numele expeditorului, pentru cititoarele de ecran. */
  name: string;
  /** Pătrată. Se afișează întreagă, fără apropiere — vezi nota de mai sus. */
  photo: string;
}

export const PROBLEM_MESSAGES: ProblemMessage[] = [
  {
    text: "Bună ziua! Cum pot comanda?",
    name: "Andreea M.",
    photo: "/avatars/avatar1.webp",
  },
  {
    text: "Aveți produsul acesta pe stoc?",
    name: "Ionuț P.",
    photo: "/avatars/avatar2.webp",
  },
  {
    text: "Pot să plătesc cu cardul?",
    name: "Maria D.",
    photo: "/avatars/avatar4.webp",
  },
  {
    text: "Unde pot vedea mai multe produse?",
    name: "Radu C.",
    photo: "/avatars/avatar3.webp",
  },
];

/**
 * Canalele din al doilea card: fiecare cu sigla lui și cu două produse.
 *
 * Produsele sunt grupate pe categorii, câte una pe canal — scule pe Facebook,
 * mobilă pe Instagram, electronice pe WhatsApp. Nu e obligatoriu, dar așa se
 * citește ca trei locuri diferite cu marfă diferită, nu ca aceleași trei poze
 * mutate dintr-o parte în alta.
 *
 * Siglele sunt mărci înregistrate și se folosesc NEATINSE: fără recolorare, fără
 * efecte, fără chenar care să sugereze parteneriat. Secțiunea descrie o
 * problemă, nu o colaborare, deci uzul e descriptiv — dar numai cât timp
 * logo-urile rămân așa cum sunt.
 */
export interface ProblemChannel {
  id: string;
  name: string;
  logo: string;
  /** Exact două. Vezi `ScatteredProducts` pentru de ce nu merge un număr variabil. */
  products: string[];
}

const PRODUSE = "/problema/produse";

export const PROBLEM_CHANNELS: ProblemChannel[] = [
  {
    id: "facebook",
    name: "Facebook",
    logo: "/social/facebook.svg",
    products: [`${PRODUSE}/ProdusDemoFacebook1.webp`, `${PRODUSE}/ProdusDemoFacebook2.webp`],
  },
  {
    id: "instagram",
    name: "Instagram",
    logo: "/social/instagram.svg",
    products: [`${PRODUSE}/ProdusDemoInstagram1.webp`, `${PRODUSE}/ProdusDemoInstagram2.webp`],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    logo: "/social/whatsapp.svg",
    products: [`${PRODUSE}/ProdusDemoWhatsApp1.webp`, `${PRODUSE}/ProdusDemoWhatsApp2.webp`],
  },
];

/**
 * Produsul din al treilea card: o pagină de produs care are tot ce trebuie.
 *
 * Cardul vorbește despre încredere, iar încrederea se vede din DETALII, nu dintr-o
 * afirmație: preț cu TVA scris lângă el, recenzii cu număr, variantele la vedere,
 * un buton limpede. De aia ilustrația e o pagină de produs completă, nu un
 * simbol.
 *
 * `image.src` lipsește până vine poza; atunci se vede substituentul.
 */
export const PROBLEM_PRODUCT = {
  name: "Emporio Armani Stronger with You",
  price: "350,00 lei",
  priceNote: "TVA inclus",
  /** Media, pe cinci. Jumătățile se desenează, vezi `TrustedProduct`. */
  rating: 4.5,
  reviews: 115,
  variantLabel: "Volum",
  variants: ["30 ml", "100 ml", "200 ml"],
  /** Care variantă e aleasă. O pagină fără nimic ales arată neterminată. */
  selectedVariant: 1,
  cta: "Adaugă în coș",
  /**
   * Rândul de sub buton.
   *
   * ═══ DEPINDE DE O INTEGRARE CARE ÎNCĂ NU EXISTĂ ═══
   *
   * La data la care a fost scris (2026-08-06), TBI Bank NU era integrat în
   * platformă: logo-ul stătea nefolosit în `import_icons` și în cod nu exista
   * nicio urmă de el. Clientul a confirmat că integrarea vine ȘI că va fi
   * disponibilă înainte de lansarea noului site de prezentare.
   *
   * Deci rândul rămâne — dar ORDINEA contează: pe o pagină comercială, „plătește
   * în rate cu tbi bank" se citește ca o promisiune că platforma o poate face.
   * Dacă la momentul unirii cu `main` integrarea încă nu e gata, rândul se scoate
   * până atunci; e o singură proprietate.
   */
  installments: {
    label: "Plătește în rate cu",
    logo: "/import_icons/logoTBI.webp",
  },
  image: {
    src: `${PRODUSE}/ProdusDemoCard3.webp` as string | undefined,
    alt: "Pagină de produs cu preț, recenzii și variante",
    hint: "Parfum Emporio Armani",
  },
};

/**
 * Trei carduri, fiecare pentru altă durere: întrebările care se repetă, produsele
 * împrăștiate, încrederea care lipsește. Nu cinci și nu cincisprezece — trei se
 * rețin.
 */
export const PROBLEM_CARDS: ProblemCard[] = [
  {
    id: "comenzi",
    title: "Aceleași întrebări, în fiecare zi.",
    description:
      "Cum comand? Este în stoc? Pot plăti cu cardul? Totul începe de la zero cu fiecare client.",
    art: "messages",
  },
  {
    id: "imprastiate",
    title: "Produsele tale sunt împrăștiate peste tot.",
    description:
      "Câteva sunt pe Facebook, altele pe Instagram, iar restul sunt trimise doar la cerere prin mesaje.",
    art: "channels",
  },
  {
    id: "incredere",
    title: "Clienții au nevoie de încredere ca să comande.",
    description:
      "Dacă produsul, variantele și informațiile importante nu sunt prezentate clar, clientul ezită și poate renunța la comandă.",
    art: "product",
  },
];
