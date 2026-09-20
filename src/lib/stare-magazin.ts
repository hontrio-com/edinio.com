/*
  Ce culoare are bulina de langa adresa magazinului, din bara laterala.

  ⚠ Sta in modulul lui, nu in componenta: e o regula despre magazin, si trebuie
  sa se poata proba fara sa randeze nimeni o bara laterala intreaga.
*/
export type MagazinPentruStare = {
  is_published: boolean | null;
  custom_domain: string | null;
  custom_domain_healthy: boolean | null;
};

/**
 * Starea magazinului, in trei culori (cerute de proprietar, 20.09.2026).
 *
 * ⚠ ORDINEA CONTEAZA. „Nepublicat" se judeca INAINTEA domeniului: pe un magazin
 * nepublicat, un domeniu cazut nu e problema lui de rezolvat azi, iar o bulina
 * rosie l-ar fi trimis sa repare DNS pentru un magazin care oricum nu e deschis.
 *
 * ⚠ `custom_domain_healthy === null` inseamna „neverificat", nu „cazut": pana la
 * prima verificare, bulina ramane verde. Altfel fiecare domeniu nou ar fi aratat
 * rosu in primele minute de la adaugare.
 */
export function stareMagazin(business: MagazinPentruStare | null): {
  culoare: string; text: string;
} {
  if (!business?.is_published) {
    return { culoare: "bg-warning", text: "Magazin nepublicat" };
  }
  if (business.custom_domain && business.custom_domain_healthy === false) {
    return { culoare: "bg-destructive", text: "Domeniul nu raspunde" };
  }
  return { culoare: "bg-success", text: "Publicat si functional" };
}
