import { cacheLife } from "next/cache";

/**
 * Anul curent, pentru dreptul de autor din subsoluri.
 *
 * DE CE NU DIRECT `new Date().getFullYear()`. Cu `cacheComponents`, orice
 * valoare care se poate schimba intre randari opreste prerandarea paginii —
 * inclusiv anul. Un subsol prezent pe toate paginile de prezentare ar fi
 * impiedicat, singur, prerandarea intregului site.
 *
 * `use cache` rezolva exact asta: valoarea se calculeaza o data si se
 * prerandeaza cu pagina. `cacheLife("days")` e potrivit — anul se schimba o
 * data pe an, iar in noaptea de Anul Nou subsolul poate ramane in urma cel mult
 * o zi, ceea ce nu deranjeaza pe nimeni.
 *
 * Componentele CLIENT (`FooterLegal` din magazin, `DemoSection`) nu au nevoie de
 * asta: acolo `new Date()` ruleaza in browser, nu la prerandare.
 */
export async function anulCurent(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}
