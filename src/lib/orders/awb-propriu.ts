import { livrareaEDusaDeMarketplace } from "./origin";

/* ═══════════════════════════════════════════════════════════════════════════
   CAND NU SE EMITE AWB PROPRIU, SI DE CE
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ MODULUL ASTA E PUR SI E FOLOSIT DE AMANDOUA STRATURILE: ecranul comenzii il cheama ca sa
   nu arate butoane care oricum ar fi refuzate, iar `poarta-awb.ts` il cheama pe server ca sa
   refuze CU ADEVARAT. Despartite, ar fi doua adevaruri despre aceeasi comanda — si cel de pe
   ecran ar fi crezut.

   ⚠ SI DE ACEEA NU IMPORTA NIMIC DE PE SERVER. Un `createAdminClient` aici l-ar face
   neimportabil dintr-o componenta de client, iar ecranul ar ramane cu propria lui copie a
   regulii. Citirea din baza sta in `poarta-awb.ts`, singurul care are voie sa fie server.
*/

/** Comanda, cat trebuie ca sa se poata hotari. */
export interface ComandaLaPoartaAwb {
  order_source: unknown;
  payment_status: string | null;
}

export const MOTIV_DUS_DE_EI =
  "Coletul e dus de curierul contractat de Pepita, cu eticheta lor. Un AWB propriu ar însemna "
  + "a doua etichetă pe același pachet și un al doilea transport plătit, iar clientul ar putea "
  + "fi taxat de două ori. Dacă eticheta lor întârzie, cere-o din panoul Pepita.";

export const MOTIV_PLATA_NECONFIRMATA =
  "Plata acestei comenzi nu e confirmată, iar la ea nu se încasează nimic la livrare: banii "
  + "vin înainte, direct la tine. Verifică încasarea, marchează comanda ca plătită, și atunci "
  + "se poate emite AWB.";

/**
 * Modurile de plata Pepita la care banii TREBUIE sa fie deja veniti.
 *
 * ⚠ `cod` NU E AICI, dinadins: acolo curierul comerciantului chiar incaseaza la usa, deci o
 * comanda neplatita e starea normala, nu un semn de alarma.
 */
const PLATI_IN_AVANS = new Set(["transfer", "creditcard"]);

/**
 * De ce nu se poate emite AWB propriu pe comanda asta, sau `null` daca se poate.
 *
 * ═══ ⚠ DOUA REFUZURI, DIN DOUA MOTIVE CARE NU SE AMESTECA ═══
 *
 * 1. LIVRAREA E A LOR. La Pepita Delivery (orice `delivery_mod` care incepe cu `gls`) coletul
 *    pleaca prin GLS-ul contractat de ei, cu eticheta lor. Rambursul era aparat de mult —
 *    `rambursDeIncasat` intoarce zero — dar ETICHETA nu era, iar generarea in masa doar SAREA
 *    peste randurile astea. Pe ecranul comenzii butonul se putea inca apasa.
 *
 *    ⚠ Aici nu mai exista portita „daca eticheta lor n-a venit, macar sa poata expedia".
 *    A fost cantarita si scoasa: leacul unei etichete care nu vine e la Pepita, nu la al doilea
 *    curier. Un al doilea transport pe acelasi colet nu repara nimic, costa, si poate ajunge la
 *    client de doua ori.
 *
 * 2. BANII NU AU VENIT INCA. La `transfer` si `creditcard`, plata e in avans si nu trece prin
 *    curier: rambursul e zero. Deci un AWB emis cat timp plata nu e confirmata trimite marfa
 *    fara niciun ban si fara nicio incasare la usa.
 *
 *    ⚠ SI NU E UN ZID: comerciantul deschide extrasul, marcheaza comanda ca platita, si poarta
 *    se ridica. Verificarea ramane un gest ANUME, nu ceva sarit din grabă.
 */
export function deCeNuSePoateAwbPropriu(o: ComandaLaPoartaAwb): string | null {
  if (livrareaEDusaDeMarketplace(o.order_source)) return MOTIV_DUS_DE_EI;

  const src = o.order_source as { marketplace?: unknown; pepita_payment_mode?: unknown } | null;
  if (src?.marketplace !== "pepita") return null;

  const mod = typeof src.pepita_payment_mode === "string" ? src.pepita_payment_mode : null;
  if (!mod || !PLATI_IN_AVANS.has(mod)) return null;

  /*
   * ⚠ SE CITESTE `orders.payment_status`, NU steagul scris de ingest.
   *
   * Ala spune ce ne-au zis EI si nu se mai schimba niciodata — Pepita nu are drum inapoi, deci
   * o plata sosita maine n-ar avea cum sa ne ajunga. Coloana comenzii e singura pe care omul o
   * poate misca dupa ce s-a uitat in extras, deci ea e cea care ridica poarta.
   */
  return o.payment_status === "paid" ? null : MOTIV_PLATA_NECONFIRMATA;
}

/** Se poate emite AWB propriu pe comanda asta? Forma scurta, pentru ecrane. */
export function sePoateAwbPropriu(o: ComandaLaPoartaAwb): boolean {
  return deCeNuSePoateAwbPropriu(o) === null;
}
