/**
 * Cat cantareste, in grame, o bucata configurata.
 *
 * ═══ ⚠ CE SE INTAMPLA CAND NU O ADUNA NIMENI ═══
 *
 * `Optiune.grame` era parsat, compilat si trimis vitrinei, dar nu-l citea nimeni. Deci o cana cu
 * cutie de lemn, un blat de masa cu picioare de fonta si o rama cu sticla antireflex cantareau
 * la curier EXACT cat produsul gol din catalog — la toti saisprezece. Cotatia pleca pe greutatea
 * mica, AWB-ul declara greutatea mica, iar curierul cantareste coletul la depozit si refactureaza
 * banda adevarata. Diferenta o plateste comerciantul, si nu apare nicaieri in panou.
 *
 * ═══ ⚠ ACEEASI STARE CA PRETUL, NU O SOCOTEALA PARALELA ═══
 *
 * Un camp ascuns de reguli nu plateste (`pret.ts`, pasul 3) — si atunci nu are voie nici sa
 * cantareasca. Socotite pe multimi diferite, cele doua ar fi divergit la prima regula noua, si
 * divergenta s-ar fi vazut ca „ambalajul pe care nu l-a ales nimeni ingreuneaza coletul": tocmai
 * clasa de defect pe care motorul de reguli o inchide de doua ori pentru pret.
 *
 * Se trece deci prin CHIAR `aplicaRegulile`, si se sare peste noduri cu CHIAR `esteAscuns`.
 *
 * ═══ GRAMELE SUNT PER BUCATA ═══
 *
 * Ce iese de aici e greutatea UNEI bucati configurate, la fel cum `pret.ts` da pretul unitar.
 * Inmultirea cu cantitatea liniei se face acolo unde se stie cantitatea — in `cart-weight.ts`,
 * odata cu `products.weight_grams`, ca sa existe o singura adunare de greutate in tot proiectul.
 */

import type { Compilat } from "./compileaza";
import {
  areOptiuni, optiuneaDupaId, toateNodurile, type Definitie, type Nod, type Optiune,
} from "./definitie";
import { aplicaRegulile, esteAscuns, type Stare } from "./reguli";
import { eNumarBun } from "./unitati";
import { normalizeazaValori, type Valori } from "./valori";

/**
 * Gramele adaugate de alegerile facute.
 *
 * ⚠ Nu arunca niciodata, si nu intoarce niciodata altceva decat un numar finit si pozitiv.
 * O valoare venita de la client, un compilat vechi sau un rand editat de mana nu au voie sa
 * doboare nici pagina de produs, nici emiterea unui AWB.
 */
export function grameleConfiguratiei(compilat: Compilat | undefined, brut: unknown): number {
  const definitie = compilat?.definitie;
  if (!definitie) return 0;
  const stare = aplicaRegulile(definitie, compilat?.reguli ?? [], normalizeazaValori(brut));
  return gramelePeStare(definitie, stare);
}

/**
 * Aceeasi socoteala, pornita de la starea pe care a asezat-o deja motorul de reguli.
 *
 * O foloseste cine a rulat deja motorul si nu are de ce sa-l ruleze a doua oara.
 */
export function gramelePeStare(definitie: Definitie, stare: Stare): number {
  let grame = 0;
  for (const nod of toateNodurile(definitie)) {
    if (!areOptiuni(nod)) continue;
    /*
     * ⚠ Se verifica si aici, desi `aplicaRegulile` goleste valorile campurilor ascunse — exact
     * ca la pret. Greutatea nu are voie sa depinda de faptul ca altcineva a golit valorile
     * inainte: apelantul care aduce o stare de aiurea primeste tot raspunsul corect.
     */
    if (esteAscuns(definitie, stare, nod.id)) continue;
    for (const o of optiunileAlese(nod, stare.valori)) {
      /*
       * ⚠ Numai gramele POZITIVE se aduna. Publicarea refuza deja o greutate negativa
       * (`grame_optiune_nevalid`), dar o versiune compilata inainte de regula aceea inca poate
       * purta una — si scazuta din colet ar fi facut comanda mai usoara decat produsul gol.
       * Aceeasi hotarare ca la `weight_grams` negativ din catalog, in `cart-weight.ts`.
       */
      if (eNumarBun(o.grame) && o.grame > 0) grame += o.grame;
    }
  }
  // Zeci de optiuni cu numere uriase pot da `Infinity`; trimis mai departe, ar fi ajuns in cererea
  // catre curier ca greutate a coletului.
  return eNumarBun(grame) && grame > 0 ? grame : 0;
}

/**
 * Optiunile alese pe un nod.
 *
 * ⚠ Scrisa aici, nu imprumutata din `pret.ts`: acolo e o functie privata, si exportata ar fi
 * legat doua module care trebuie sa se poata schimba separat. Regula e insa aceeasi, si probele
 * din `greutate.test.ts` o tin lipita de purtarea pretului.
 */
function optiunileAlese(nod: Nod, valori: Valori): Optiune[] {
  if (!areOptiuni(nod)) return [];
  const v = valori[nod.id];
  const ids = v?.f === "alegere" ? [v.v] : v?.f === "alegeri" ? v.v : [];
  return ids.map((id) => optiuneaDupaId(nod, id)).filter((o): o is Optiune => !!o);
}
