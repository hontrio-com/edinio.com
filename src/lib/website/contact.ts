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
