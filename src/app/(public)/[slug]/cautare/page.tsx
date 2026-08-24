import type { Metadata } from "next";
import { metadataMagazin, RandeazaMagazin } from "@/lib/storefront/catalog/pagina-magazin";

/**
 * Pagina de rezultate ale căutării.
 *
 * ═══ ⚠ DE CE E O PAGINĂ, ȘI NU UN FILTRU PE PAGINA PRINCIPALĂ ═══
 *
 * Până acum, Enter în bara de căutare adăuga `?q=…` în adresă și lăsa omul exact
 * unde era: pe pagina principală, cu eroul, cu rândurile de produse, cu tot. Așa a
 * raportat-o eSAFE, cuvânt cu cuvânt: „sunt tot pe pagina principală”. Lista de
 * sugestii se închidea, și nu se întâmpla nimic altceva.
 *
 * Rezultatele au nevoie de exact ce are catalogul — grilă, filtre, fațete, ordonare,
 * paginare — de aceea pagina asta NU e scrisă separat: e același randor, cu un steag.
 * O a doua copie a acelorași șapte sute de rânduri s-ar fi despărțit de prima la
 * prima schimbare, iar despărțirea nu s-ar fi văzut: două pagini care arată la fel
 * și se poartă altfel.
 *
 * ═══ ⚠ EXISTĂ PENTRU ORICE MAGAZIN, INDIFERENT DE DESIGN ═══
 *
 * Catalogul e o alegere de design: unele magazine își țin produsele pe pagina
 * principală și atunci `/magazin` redirectează. Căutarea NU e o alegere — bara e în
 * toate cele șapte design-uri. Legată de aceeași condiție, Enter ar fi dus la o
 * pagină adevărată la unii comercianți și înapoi peste erou la alții, adică chiar
 * defectul raportat, reparat doar pe jumătate. De aceea `esteCautare` sare peste
 * acel redirect, și e singurul lucru pe care îl schimbă în afară de indexare.
 */

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return metadataMagazin({ slug, sp, esteCautare: true });
}

export default async function PaginaCautare({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return RandeazaMagazin({ slug, sp, esteCautare: true });
}
