import { notFound } from "next/navigation";

/**
 * Orice adresa de sub magazin pe care n-o revendica nicio alta ruta.
 *
 * Fara ea, `caian-textile.ro/aaa/bbb` nu se potrivea cu nimic din `[slug]` —
 * `[pageSlug]` prinde un singur segment — deci cadea pe 404-ul RADACINII, cu
 * titlul, descrierea si og-ul platformei pe domeniul comerciantului. Exact
 * lucrul pe care il reparam, ramas neacoperit pentru adresele cu doua sau mai
 * multe segmente.
 *
 * Ruta nu fura nimic: in App Router, segmentele statice bat parametrul, iar
 * parametrul bate captura-tot. `magazin/<categorie>`, `politici/<tip>`,
 * `product/<slug>` si paginile proprii raman ale lor; aici ajunge doar ce n-a
 * vrut nimeni.
 */
export default function RestNegasit() {
  notFound();
}
