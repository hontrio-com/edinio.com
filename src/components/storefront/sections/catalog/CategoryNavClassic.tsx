"use client";

import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { NavigareCategorii } from "./NavigareCategorii";

/**
 * Navigarea pe categorii de pe pagina principala, varianta classic.
 *
 * Banda insasi sta in `NavigareCategorii`, impreuna cu pagina de catalog: pana
 * acum erau doua implementari, iar cea de pe catalog nu stia de imaginile
 * categoriilor. Aici a ramas doar ce e propriu paginii principale — retragerea
 * de pe ecran lat cand hero-ul arata deja aceleasi categorii.
 */
export function CategoryNavClassic() {
  const { heroAreCategorii } = useStorefront();
  // Cu un hero de categorii deasupra, banda ar fi a doua oara acelasi lucru pe
  // ecran lat; pe telefon hero-ul nu le arata, deci acolo ramane.
  return <NavigareCategorii className={heroAreCategorii ? "mb-6 lg:hidden" : "mb-6"} />;
}
