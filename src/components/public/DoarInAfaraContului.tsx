"use client";

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
export function DoarInAfaraContului({ slug, children }: { slug: string; children: React.ReactNode }) {
  const cale = usePathname();
  if (cale === null) return null;
  if (eZonaDeCont(cale, slug)) return null;
  return <>{children}</>;
}

