/**
 * Îndemnul din articol.
 *
 * ⚠ DE CE NU E DE AJUNS BANDA DE FINAL A SITE-ULUI. Toate articolele se
 * terminau cu aceeași bandă. Potrivit pentru o pagină de prezentare, slab pentru
 * un articol: cine tocmai a citit despre curierat are alt pas următor decât cine
 * a citit despre facturare. Un îndemn potrivit cu textul de deasupra lui e
 * jumătate din motivul comercial pentru care se ține un blog.
 *
 * ⚠ PRESETĂRILE SUNT ÎN COD, NU ÎN BAZĂ. Adresele și textele lor se schimbă
 * odată cu paginile către care duc, iar în bază s-ar fi învechit tăcut: o
 * presetare care trimite la o pagină ștearsă e un buton către 404. Aici,
 * ștergerea paginii sparge compilarea, sau măcar se vede la o căutare.
 */

export type TipIndemn = "preturi" | "start" | "migrare" | "contact" | "propriu";

export interface IndemnArticol {
  tip: TipIndemn;
  /** Peste presetare, când articolul cere altceva. */
  titlu?: string;
  text?: string;
  eticheta?: string;
  /** Doar pentru `propriu`. */
  adresa?: string;
}

interface Presetare {
  titlu: string;
  text: string;
  eticheta: string;
  adresa: string;
}

const PRESETARI: Record<Exclude<TipIndemn, "propriu">, Presetare> = {
  preturi: {
    titlu: "Vezi cât costă",
    text: "Toate integrările sunt incluse în orice plan: curieri, plăți cu cardul și facturare.",
    eticheta: "Vezi prețurile",
    adresa: "/preturi",
  },
  start: {
    titlu: "Deschide-ți magazinul azi",
    text: "15 zile gratuit, fără card de credit. Anulezi oricând.",
    eticheta: "Începe gratuit",
    adresa: "/start",
  },
  migrare: {
    titlu: "Ai deja un magazin în altă parte?",
    text: "Îl mutăm noi, cu produse, clienți și comenzi. Nu pierzi nimic din ce ai strâns.",
    eticheta: "Vezi cum se mută",
    adresa: "/migrare",
  },
  contact: {
    titlu: "Vrei să întrebi ceva?",
    text: "Îți răspunde un om, nu un robot.",
    eticheta: "Scrie-ne",
    adresa: "/contact",
  },
};

export const NUMELE_TIPURILOR: Record<TipIndemn, string> = {
  preturi: "Prețuri",
  start: "Începe gratuit",
  migrare: "Migrare",
  contact: "Contact",
  propriu: "Al meu (scriu eu tot)",
};

/**
 * Îndemnul gata de desenat, sau `null` când articolul n-are unul.
 *
 * ⚠ `null` PENTRU UN „PROPRIU" INCOMPLET. Un îndemn cu buton fără adresă e un
 * buton care nu duce nicăieri — mai rău decât lipsa lui, fiindcă cititorul apasă
 * și nu se întâmplă nimic, iar el crede că site-ul e stricat.
 */
export function indemnDeAratat(brut: unknown): Presetare | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const i = brut as IndemnArticol;
  if (!i.tip) return null;

  if (i.tip === "propriu") {
    const adresa = (i.adresa ?? "").trim();
    const eticheta = (i.eticheta ?? "").trim();
    const titlu = (i.titlu ?? "").trim();
    if (!adresa || !eticheta || !titlu) return null;
    return { titlu, text: (i.text ?? "").trim(), eticheta, adresa };
  }

  const p = PRESETARI[i.tip];
  if (!p) return null;
  return {
    titlu: (i.titlu ?? "").trim() || p.titlu,
    text: (i.text ?? "").trim() || p.text,
    eticheta: (i.eticheta ?? "").trim() || p.eticheta,
    adresa: p.adresa,
  };
}
