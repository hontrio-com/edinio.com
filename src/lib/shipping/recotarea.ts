/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DE CE SE CERE O COTATIE NOUA, SI CE I SE SPUNE CUMPARATORULUI (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ DE CE STAU AICI, SI NU IN `order.actions.ts` UNDE SUNT FOLOSITE
 *
 * Fisierul acela incepe cu `"use server"`, si acolo regula e mai stransa decat pare: exporturile
 * pur de TIP (`type`, `interface`) se sterg la compilare si sunt ingaduite, dar orice export de
 * VALOARE trebuie sa fie o functie async. Un `const` si o functie sincrona sunt valori.
 *
 * Puse acolo, buildul cade cu „Only async functions are allowed to be exported in a `use server`
 * file", iar modulul intreg ramane FARA NICIUN EXPORT: toate importurile de `placeOrder`,
 * `deleteOrder`, `updateOrderDetails` si celelalte cad in lant. O eroare a mea a produs
 * nouasprezece, dintre care optsprezece erau doar ecouri.
 *
 * ⚠ Si `tsc` NU spune nimic despre asta. Compilarea trecuse curat; doar Turbopack impune regula.
 * Deci un lot care se opreste la typecheck poate parea bun si sa nu se poata desfasura deloc.
 */

/**
 * Cat de mult poate fi marfa comandata peste suma de ramburs SEMNATA, fara sa se ceara recotare.
 *
 * ⚠ Cat o rotunjire, nu o linie de comanda. Larga, ar fi fost o portita cu numele de toleranta:
 * cine subdeclara ar fi cerut cotatia cu exact atat mai putin.
 *
 * ⚠ SI DIRECTIA CONTEAZA. Variatia cinstita intre cotare si comanda COBOARA marfa (oferte
 * acordate pe server, pachete desfacute, linii scoase din stoc), deci acolo suma semnata iese mai
 * mare si trece. Cade doar cazul invers, care e chiar atacul. Aceeasi forma ca la greutate: mai
 * usor trece, mai greu cade.
 */
export const TOLERANTA_RAMBURS_LEI = 1;

/**
 * Suma de ramburs pe care o cer cotarii cele doua formulare din magazin.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ EXTRAOPTIUNILE INTRA IN SUMA, altfel comanda e refuzata    (04.10.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La comanda, serverul confrunta suma semnata cu `subtotal + extrasTotal - discountAmount`.
 * Formularele trimiteau doar marfa, fara extraoptiuni, deci orice comanda cu ramburs care bifa o
 * extraoptiune mai scumpa decat `TOLERANTA_RAMBURS_LEI` iesea „subdeclarata" si era refuzata cu
 * „Suma incasata la livrare nu mai e cea...". Reincarcarea nu ajuta: browserul cerea din nou
 * aceeasi suma. Masurat pe productie: JHBijuterii („Deschidere colet la livrare", 5 lei) si
 * Suporti-Numar („Comanda cu Prioritate", 5 lei), diferenta de exact 5 lei la fiecare refuz.
 *
 * ⚠ DE CE PAREA INTAMPLATOR. Podeaua din catalog (`subtotalMaximDinCatalog`) socoteste produsele
 * la pretul de lista. La pret pe trepte (2 x 45 fata de 2 x 50) ea acoperea extraoptiunea si
 * comanda trecea; la o singura bucata cadea. Un cupon de cativa lei o ascundea la fel.
 *
 * ⚠ REDUCEREA NU SE SCADE AICI, dinadins. Serverul o scade din marfa lui, deci o suma care n-o
 * scade iese doar mai MARE, si directia aceea trece mereu. Scazuta pe client, o reducere socotita
 * altfel decat pe server ar fi refuzat comenzi cinstite pe cativa bani.
 */
export function rambursulDeCotat(marfa: number, extraoptiuni: number): number {
  const m = Number.isFinite(marfa) ? Math.max(0, marfa) : 0;
  const e = Number.isFinite(extraoptiuni) ? Math.max(0, extraoptiuni) : 0;
  return Math.round((m + e) * 100) / 100;
}

/** Cauzele pentru care o comanda nu se poate incheia cu cotatia pe care o poarta. */
export type CauzaRecotarii = "greutate" | "fara-tarif" | "plan" | "ramburs";

/**
 * Mesajul unei recotari, pe fiecare cauza in parte.
 *
 * ⚠ SCRIS O SINGURA DATA, chemat de doua ori. Cele doua checkout-uri sunt copii una alteia pana la
 * declaratiile de tip, care sunt si ele duplicate in acelasi fisier. Fiecare text scris pe loc s-ar
 * fi departat de perechea lui la prima cauza noua, si atunci un checkout i-ar fi spus adevarul
 * cumparatorului iar celalalt nu.
 *
 * ⚠ SI FIECARE CAUZA ISI PRIMESTE TEXTUL EI. Pana pe 14.09.2026 ternarul deosebea o singura cauza,
 * deci orice cauza noua ar fi primit „cosul s-a schimbat", o propozitie falsa spusa omului, care
 * si-ar fi cautat in cos o schimbare care nu exista.
 */
export function mesajulRecotarii(motiv: CauzaRecotarii): {
  jurnal: string;
  catreClient: string;
} {
  /*
   * ⚠ `ramburs` e singura cauza care NU vine din verdictul tokenului: ea se vede abia la apelant,
   * unde serverul stie marfa adevarata. Bagata sub `plan`, i-ar fi spus cumparatorului ca si-a
   * schimbat serviciul de livrare, cand el a schimbat suma incasata la usa.
   */
  if (motiv === "ramburs") {
    return {
      jurnal: "Signed COD amount is lower than the real goods value",
      catreClient: "Suma incasata la livrare nu mai e cea pentru care am calculat transportul. "
        + "Reincarca pagina si incearca din nou.",
    };
  }
  if (motiv === "fara-tarif") {
    return {
      jurnal: "Quote signature failed and the store declares no default shipping cost",
      catreClient: "Nu am putut confirma costul livrarii. Reincarca pagina si incearca din nou.",
    };
  }
  if (motiv === "plan") {
    return {
      jurnal: "Claimed shipping service does not match the signed quote",
      catreClient: "Serviciul de livrare ales nu mai e cel pentru care am calculat pretul. "
        + "Reincarca pagina si alege din nou.",
    };
  }
  return {
    jurnal: "Ordered cart is heavier than the quoted one",
    catreClient: "Cosul s-a schimbat de cand am calculat transportul. "
      + "Reincarca pagina ca sa afli costul livrarii.",
  };
}
