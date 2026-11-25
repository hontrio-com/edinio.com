"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { eZonaDeCont } from "@/lib/cont/zona";

/**
 * Randeaza continutul peste tot in magazin, DAR NU in zona de cont.
 *
 * ⚠⚠ DE CE EXISTA. Layoutul vitrinei incarca pe fiecare pagina pixelii ALESI DE
 * COMERCIANT (Meta, TikTok, Google), iar cand bannerul de cookie-uri e stins din
 * panou `bypass={!requireConsent}` ii incarca fara nicio apasare. Paginile de
 * cont sunt copiii aceluiasi layout, deci pana acum mosteneau tot.
 *
 * Ce ajungea acolo nu e putin:
 *   - adresa paginii, care poarta identificatorul comenzii, pleaca din oficiu
 *     catre toti trei (`fbq('track','PageView')` trimite `dl`);
 *   - pe ecranul de intrare exista un camp `type="email"`, iar potrivirea
 *     avansata AUTOMATA, pe care comerciantul o bifeaza la Meta, culege exact
 *     asemenea campuri de pe pagina. Adica adresa de email a cumparatorului,
 *     inainte de orice apasare.
 *
 * Zona de cont nu e o vitrina, e o zona personala. Acolo nu au ce cauta scripturi
 * alese de altcineva.
 *
 * ⚠ DE CE NU UN `layout.tsx` SUB `cont/`: un layout copil se cuibareste in cel
 * parinte, nu-l inlocuieste. Nu poate sterge ce a randat parintele. Iar un layout
 * nu primeste calea, si proxy-ul nu pune niciun antet cu ea. Singurul loc care
 * stie calea si poate refuza randarea e o componenta de client.
 *
 * ⚠ La hidratare raspundem PESIMIST („suntem in cont"), din acelasi motiv pentru
 * care o face si `DoarInMagazinReal`: pixelii trag `PageView` la montare, deci un
 * „nu" gresit ar fi trimis evenimentul inainte sa dispara.
 */
export function DoarInAfaraContului({ slug, children, niciDupaIesire = false }: {
  slug: string;
  children: React.ReactNode;
  /**
   * Pentru PIXELI si eticheta Google: un document incarcat in zona de cont nu ii mai primeste deloc, nici dupa
   * ce omul iese din ea fara reincarcare. Butonul de contact nu o cere: el trebuie sa apara la iesire.
   */
  niciDupaIesire?: boolean;
}) {
  const cale = usePathname();
  /*
   * ⚠ UN DOCUMENT INCARCAT IN ZONA DE CONT NU MAI PRIMESTE PIXELI DELOC (25.11.2026, gasit la recenzie). Din
   * zona de cont se putea iesi si fara reincarcare (un `<Link>`, un `router.push`): pixelii se montau atunci in
   * ACELASI document, iar la „Inapoi” ramaneau vii in zona de cont, unde numararea paginilor dupa istoric
   * (pornita din oficiu la GA4 si la pixelul Meta) trimite adresa cu identificatorul comenzii. Scriptul unui
   * pixel odata incarcat nu mai poate fi scos din pagina; singura cale e sa nu fie incarcat.
   *
   * Legaturile din ecranele contului care duc in magazin sunt de aceea `<a>` (incarcare completa, ca
   * `ActiuneCont` la intrare), deci masuratoarea nu pierde nimic pe drumurile obisnuite. Regula de aici e plasa
   * de dedesubt, pentru orice iesire fara reincarcare care ar aparea de acum incolo.
   *
   * Starea se citeste o singura data, din adresa cu care s-a incarcat documentul: pe server e „nu”, iar in
   * browser, la hidratare, e „da” numai cand si calea e in zona de cont, deci cele doua desene sunt aceleasi.
   */
  const [incarcatInCont] = useState(() => typeof window !== "undefined" && eZonaDeCont(window.location.pathname, slug));
  if (cale === null) return null;
  if (eZonaDeCont(cale, slug)) return null;
  if (niciDupaIesire && incarcatInCont) return null;
  return <>{children}</>;
}

