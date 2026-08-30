/**
 * Cele trei căi directe de contact, într-un singur loc.
 *
 * ═══ DE CE UN FIȘIER PENTRU TREI VALORI ═══
 *
 * Numărul și adresa apar acum în DOUĂ locuri: subsolul fiecărei pagini și banda
 * de sub întrebările frecvente. Scrise de mână a doua oară, se despart la prima
 * schimbare de număr — și nimeni nu observă, fiindcă amândouă arată la fel de
 * corect. E aceeași lecție ca la `intrebariStructurate()` din `faq.ts`.
 *
 * ⚠ `href` și `label` sunt lucruri DIFERITE la telefon: se apelează
 * `+40750456809` (formă internațională, singura pe care o formează corect un
 * telefon de oriunde), dar se scrie `0750 456 809`, cum îl citește un om.
 */

export interface CaleDeContact {
  /** Ce scrie pe ecran. */
  label: string;
  href: string;
  /** `tel:` și `mailto:` NU trec prin `next/link` — vezi nota din `Footer.tsx`. */
  extern: boolean;
}

export const TELEFON: CaleDeContact = {
  label: "0750 456 809",
  href: "tel:+40750456809",
  extern: true,
};

export const EMAIL: CaleDeContact = {
  label: "contact@edinio.com",
  href: "mailto:contact@edinio.com",
  extern: true,
};

/** Pagina de contact. Singura dintre cele trei care e o pagină a site-ului. */
export const FORMULAR: CaleDeContact = {
  label: "Scrie-ne un mesaj",
  href: "/contact",
  extern: false,
};

/**
 * WhatsApp, pe același număr ca telefonul.
 *
 * ⚠ `wa.me` cere numărul FĂRĂ `+` și fără spații — o formă în plus față de cele
 * două de sus. De aceea se scrie aici, o dată, și nu se compune de fiecare dată
 * din `TELEFON.href`: a treia formă a aceluiași număr e exact locul în care apare
 * a treia greșeală.
 *
 * Era scris de mână și în `StickyContact.tsx`. Acum vine tot de aici.
 */
export const WHATSAPP: CaleDeContact = {
  label: "Mesaj pe WhatsApp",
  href: "https://wa.me/40750456809",
  extern: true,
};

/** Verdele oficial WhatsApp. Singurul loc unde se scrie. */
export const VERDE_WHATSAPP = "#25D366";

/**
 * Programul de asistență, dat de client 2026-08-11.
 *
 * ⚠ ÎNCHIDE O CONTRAZICERE care era pe site: subsolul spunea „suport 7 zile din
 * 7", iar `/contact` „Luni - Vineri, 09:00 - 18:00". Două afirmații despre
 * același lucru, pe aceeași pagină, iar cea din subsol apare pe TOATE paginile.
 * Forma de acum le împacă: șapte zile, cu ore.
 *
 * Se scrie ÎNTR-UN SINGUR LOC dinadins. Un program apare, de obicei, în trei-
 * patru locuri și se schimbă în două — iar clientul care sună la 19:00 fiindcă
 * așa scria undeva e o promisiune încălcată, nu o greșeală de redactare.
 */
export const PROGRAM = {
  /*
   * Bucățile stau separat, iar formele se construiesc din ele.
   *
   * Motivul e o cerere din 30.08: în centrul de ajutor programul trebuie citit
   * curgător, „de Luni până Duminică între orele 08:00 și 20:00”, nu cu liniuțe.
   * Din `"Luni - Duminică"` nu se poate scoate fraza aia fără să tai șirul cu
   * un `split`, iar un `split` pe un text scris de om se rupe tăcut la prima
   * schimbare de cratimă. Așa, fiecare formă se scrie o dată și pornește din
   * aceleași patru valori.
   */
  ziIntai: "Luni",
  ziUltima: "Duminică",
  oraDeschidere: "08:00",
  oraInchidere: "20:00",

  /** „Luni - Duminică”, pentru tabele și etichete. */
  get zile(): string {
    return `${this.ziIntai} - ${this.ziUltima}`;
  },
  /** „08:00 - 20:00”, pentru tabele și etichete. */
  get ore(): string {
    return `${this.oraDeschidere} - ${this.oraInchidere}`;
  },
  /** Rândul întreg, pentru un singur loc de afișare. */
  get intreg(): string {
    return `${this.zile}, ${this.ore}`;
  },
  /** Fraza întreagă, pentru unde se citește ca o propoziție, nu ca o etichetă. */
  get fraza(): string {
    return `Suntem disponibili de ${this.ziIntai} până ${this.ziUltima} între orele ${this.oraDeschidere} și ${this.oraInchidere}.`;
  },
};
