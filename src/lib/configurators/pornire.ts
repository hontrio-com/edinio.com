/**
 * De la ce pret porneste un produs configurabil, si cum se scrie asta pe card.
 *
 * ═══ ⚠ „PRETUL DE PORNIRE” INSEAMNA CONFIGURATIA IMPLICITA, NU PRETUL DE BAZA ═══
 *
 * Cardul din grila trebuie sa arate acelasi numar pe care il vede cumparatorul in clipa in care
 * deschide pagina produsului. Pagina se deschide cu implicitele comerciantului (`useConfigurator`
 * le seamana la montare), deci pretul de acolo e pretul configuratiei IMPLICITE — nu `price`.
 *
 * Luat din `price`, cardul ar fi mintit exact pe produsele pentru care exista configuratorul: o
 * rama al carei pret se calculeaza din suprafata are `price` 0 sau 1 leu in catalog, iar grila ar
 * fi scris „0 lei” langa un produs care costa 340. Invers, un configurator cu baza „produs” si un
 * material implicit scump ar fi aratat 175 pe card si 260 pe pagina — adica plangerea „pretul din
 * grila nu e cel de pe pagina”, clasa de defect pe care auditul de preturi a inchis-o de patruzeci
 * de ori.
 *
 * ═══ ⚠ CAND NU SE POATE SOCOTI, IESE `null` — NU PRETUL DE BAZA ═══
 *
 * Un configurator care cere o gravura, fara implicit, nu are niciun pret la care se poate cumpara
 * ceva: orice cifra am scrie pe card ar fi un pret pe care cumparatorul nu-l poate obtine. `null`
 * spune „nu stim”, iar cardul cade atunci pe pretul simplu, dar tot cu „De la” — fiindca „de la”
 * ramane adevarat, si fara configurare produsul chiar nu se vinde.
 *
 * Aceeasi hotarare ca in `pret.ts`: nimic nu cade pe zero si nimic nu cade pe pretul de baza,
 * fiindca amandoua inseamna marfa data mai ieftin decat costa.
 */

import type { Compilat } from "./compileaza";
import { verificaRaspunsul } from "./raspuns";
import { configuratiaImplicita } from "./validare";

/**
 * Pretul configuratiei implicite, sau `null` daca nu se poate socoti.
 *
 * ⚠ `pretProdus` trebuie sa fie un pret la care produsul CHIAR se poate cumpara, nu `products.price`.
 * Pagina de produs trimite pretul variantei alese (`comboUnitPrice`); proiectorul trimite minimul
 * vandabil al intervalului (`getProductPriceRange`), fiindca „De la” inseamna cel mai ieftin drum.
 * Pretul de baza al unui produs cu variante nu e niciunul dintre ele.
 *
 * ⚠ NEROTUNJIT LA BAN, ca peste tot in motor (vezi nota de pe `Descompunere.unitar`). Rotunjirea
 * comerciala a comerciantului — „pretul se rotunjeste la 5 lei” — e deja aplicata inauntru;
 * rotunjirea la bani se face abia la afisare, prin `formatPrice`.
 *
 * ⚠ NU ARUNCA NICIODATA. Se cheama din proiector, peste sute de produse dintr-un lot: o forma
 * compilata stricata pe UN produs n-are voie sa doboare proiectia celorlalte. Ce nu se intelege
 * iese ca `null`, adica „nu stim de la cat porneste”, si cardul spune atunci ce stie.
 */
export function pretulDePornire(compilat: Compilat, pretProdus: number): number | null {
  try {
    if (!compilat || typeof compilat !== "object" || !compilat.definitie) return null;
    /*
     * ⚠ UN PRET DE PRODUS CARE NU E NUMAR SE REFUZA AICI, nu se lasa pe seama motorului.
     *
     * `calculeazaPretul` scrie `baza = eNumarBun(pretProdus) ? pretProdus : 0` — o alegere buna
     * pentru el, fiindca acolo baza poate fi si „fara”. Chemat cu `NaN` de aici, insa, iese pe
     * usa cu succes si cu unitarul 0, iar cardul ar fi scris „De la 0 lei” pe un produs de 340.
     * `NaN` ajunge usor: `Number(p.price)` peste o coloana care s-a intors ca text stricat.
     * Aceeasi familie cu `Number(null)` care golea feedurile de Facebook.
     */
    if (typeof pretProdus !== "number" || !Number.isFinite(pretProdus)) return null;
    const implicit = configuratiaImplicita(compilat.definitie);
    const verdict = verificaRaspunsul(compilat, implicit, pretProdus);
    /*
     * ⚠ Un verdict prost NU se traduce in pretul de baza. Verdictul e prost tocmai cand mai e
     * ceva de completat sau de ales, deci pretul de baza ar fi fost pretul unei configuratii care
     * nu se poate comanda.
     */
    if (!verdict.ok) return null;
    return verdict.unitar;
  } catch {
    return null;
  }
}
