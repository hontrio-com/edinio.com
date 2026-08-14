/**
 * „Adresa asta e chiar cea pe care o avem deja?"
 *
 * ═══ ⚠ DE CE NU SE COMPARA SIRURILE DIRECT ═══
 *
 * Catalogul compune adresa din starea controalelor, intr-o ordine fixa a
 * parametrilor. Bara de adrese poate avea aceiasi parametri in ALTA ordine: un
 * link trimis pe WhatsApp, o adresa scrisa de mana, o revenire din istoric. O
 * comparatie pe sir ar fi vazut o schimbare acolo unde nu e nici una si ar fi
 * navigat degeaba — dus-intors la server, derulare pierduta, pentru nimic.
 *
 * Deci se compara FORMA CANONICA: calea, plus parametrii sortati.
 *
 * ═══ ⚠ DE CE E O FUNCTIE PURA, INTR-UN FISIER PROPRIU ═══
 *
 * Fiindca inlocuieste un `ref` care tinea minte ultima adresa ceruta — si care
 * s-a desincronizat. Simptomul masurat in productie pe 14.08: de pe pagina 2 nu
 * se mai putea ajunge NICIODATA pe pagina 1, nici din butonul `Inapoi`, nici
 * apasand chiar pe numarul 1, si nu pleca nicio cerere de retea. Inainte de asta,
 * acelasi `ref` facuse paginarea sa OSCILEZE intre doua pagini.
 *
 * O copie a starii de navigare poate ramane in urma. Adresa din bara nu poate:
 * ea E starea. Iar o functie pura se poate proba, spre deosebire de un `ref`
 * ascuns intr-un efect.
 */

/** Calea plus parametrii SORTATI — forma in care doua adresa egale arata la fel. */
function canonic(u: URL): string {
  const p = [...u.searchParams.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("&");
  /* Slashul de la sfarsit nu schimba pagina: `/magazin/` si `/magazin` sunt una. */
  const cale = u.pathname.replace(/\/+$/, "") || "/";
  return `${cale}${p ? `?${p}` : ""}`;
}

/**
 * `tinta` (relativa sau absoluta) descrie aceeasi pagina ca `acum`?
 *
 * `acum` se da explicit ca sa se poata proba; in aplicatie e `window.location.href`.
 */
export function aceeasiAdresa(tinta: string, acum: string): boolean {
  try {
    const baza = new URL(acum);
    return canonic(new URL(tinta, baza)) === canonic(baza);
  } catch {
    /* Adresa necitibila: mai bine navigam degeaba decat sa ramanem intepeniti —
       exact starea din care s-a nascut fisierul asta. */
    return false;
  }
}
