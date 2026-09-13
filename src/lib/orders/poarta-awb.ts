import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { motivContInactiv } from "@/lib/subscription-server";
import { awburiDinRand, deCeNuSePoateAwbPropriu, type CurierPropriu } from "./awb-propriu";

/* ═══════════════════════════════════════════════════════════════════════════
   POARTA CARE REFUZA CU ADEVARAT AWB-UL PROPRIU
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ DE CE O POARTA SINGURA, SI NU CATE UN `if` IN FIECARE ACTIUNE. Sunt saisprezece curieri.
   O regula copiata de saisprezece ori se dezbina la primul curier nou: cine il adauga copiaza
   fisierul de langa, si daca acela e cel fara `if`, poarta lipseste tacut exact acolo.
   `poarta-awb.test.ts` cere ca fiecare actiune de emitere sa cheme functia asta, deci uitarea
   nu mai e cu putinta — nici azi, nici la al saptesprezecelea curier.

   ⚠ SI DE CE ISI CITESTE SINGURA COMANDA, desi apelantul o are deja in mana.
   Fiindca fiecare curier isi are propriul `select`, iar cel din generarea in MASA nici nu cerea
   `order_source` — asa a si scapat prima oara. O poarta care se bizuie pe ce a cerut apelantul
   se stinge tacut in ziua in care cineva ingusteaza o lista de coloane pentru viteza. Costa o
   citire in plus pe fiecare AWB emis, adica nimic fata de un colet trimis de doua ori.
*/

/**
 * De ce nu se poate emite AWB propriu pe comanda asta, sau `null` daca se poate.
 *
 * ⚠ CADE INCHIS. Daca citirea din baza pica, raspunsul e „nu se poate", nu „se poate":
 * intrebarea la care nu stim raspunsul e „coletul asta e deja dus de altcineva?", iar
 * ghicitul ei gresit costa un al doilea transport. Oricum, actiunea care ne-a chemat isi
 * citeste si ea comanda imediat dupa, deci o baza cazuta o oprea si pe ea.
 */
/**
 * ⚠ `curier` E OPTIONAL, si nu din comoditate.
 *
 * Cei saptesprezece curieri proprii se prezinta cu cheia lor, ca poarta sa nu-i
 * blocheze pe propriul lor AWB (altfel anularea si reemiterea ar fi imposibile).
 * Dar exista si emitatori care NU au coloana pe `orders`: eMAG isi tine AWB-ul in
 * tabelul lui (`emag_awb`) si scrie pe comanda doar `tracking_number`, camp comun
 * tuturor curierilor, deci nefolosibil ca identitate.
 *
 * Un asemenea emitator nu se poate recunoaste pe sine, si nici nu are nevoie: ce
 * trebuie oprit e sa NU plece al doilea colet peste unul deja expediat de altcineva.
 * Fara curier, bucla refuza pe AWB-ul oricarui curier propriu, ceea ce e exact regula
 * care ii lipsea.
 */
export async function poartaAwbPropriu(
  businessId: string, orderId: string, curier?: CurierPropriu,
): Promise<string | null> {
  /*
   * ⚠ INTAI CONTUL, apoi comanda. Blocarea din layout-ul de dashboard e o
   * redirectionare de PAGINA, deci nu atinge actiunile de server: un magazin cu
   * abonamentul neplatit putea emite mai departe AWB-uri reale, facturate prin
   * integrarea platformei, dintr-o fila ramasa deschisa. Vezi `subscription-server.ts`.
   */
  const contInactiv = await motivContInactiv(businessId);
  if (contInactiv) return contInactiv;

  return poartaCuBaza(createAdminClient(), businessId, orderId, curier);
}

/*
 * ⚠ LISTA SE SCRIE PE FATA, CA S-O POATA CITI `verifica:coloane` (13.09.2026).
 *
 * Pana azi selectul se compunea cu sablon: `.select(`… ${coloanelePortii().join(", ")}`)`.
 * Corect la rulare, dar INVIZIBIL pentru `scripts/tests/coloane-cerute-exista.mjs`: prima
 * lui trecere cere ghilimele imediat dupa `.select(` (`:157`), a doua cere un nume de
 * constanta (`:174`), si un sablon cu accente grave nu e niciuna. Deci tocmai selectul cu
 * pedeapsa cea mai mare nu era aparat de nimic.
 *
 * ⚠ CE COSTA O COLOANA GRESITA AICI. PostgREST nu ignora un nume necunoscut: pica INTREAGA
 * interogare, cu `42703`. Poarta cade inchis dinadins, deci raspunsul devine „Comanda nu
 * s-a putut verifica acum" la TOTI cei saptesprezece curieri deodata, nu doar la cel nou.
 * Exact incidentul din 03.09.2026 pentru care s-a scris unealta.
 *
 * ⚠ SI NU E O A DOUA SURSA DE ADEVAR. `poarta-awb.test.ts` compara lista de aici cu
 * `coloanelePortii()`, adica exact cu harta curierilor: daca cineva adauga al optsprezecelea
 * curier si uita randul de aici, proba cade inainte de push.
 */
const COLOANE_POARTA =
  "order_source, payment_status, status, "
  + "cargus_awb_number, colete_awb_number, dhl_awb_number, dpd_awb_number, "
  + "ecolet_awb_number, fan_courier_awb_number, fedex_awb_number, gls_awb_number, "
  + "innoship_awb_number, packeta_packet_id, pallex_awb_number, posta_awb_number, "
  + "sameday_awb_number, shipo_awb_number, smartship_awb_number, ups_awb_number, "
  + "woot_awb_number, ecolet_order_to_send_id";

/**
 * Chiar poarta, cu baza data din afara.
 *
 * ⚠ EXISTA CA SA POATA FI PROBATA CU O BAZA ADEVARATA-FALSA, nu ca sa aiba cineva de ales
 * clientul: `poartaAwbPropriu` ii da mereu pe cel de sistem. Probele care conteaza aici sunt
 * cele despre CITIRE — ca se cere si `business_id`, ca o eroare cade INCHIS — si niciuna nu se
 * poate scrie daca clientul e ferecat inauntru.
 */
export async function poartaCuBaza(
  admin: ReturnType<typeof createAdminClient>, businessId: string, orderId: string, curier?: CurierPropriu,
): Promise<string | null> {
  const { data, error } = await admin
    .from("orders")
    /* ⚠ Coloanele de AWB ale TUTUROR curierilor, PLUS martorii expedierilor pornite si
       neconfirmate inca (vezi `COLOANE_MARTOR`): poarta trebuie sa poata spune si
       „coletul asta e deja dus de altcineva", nu doar „e al marketplace-ului".
       Scrisa pe fata, si tinuta in pas cu harta de proba. Vezi `COLOANE_POARTA`. */
    .select(COLOANE_POARTA)
    /* ⚠ SI PE MAGAZIN, nu doar pe `id`: citim cu cheia de serviciu, deci RLS nu ne mai apara,
       iar `orderId` vine din browser. Fara filtru, poarta ar raspunde despre comanda altcuiva. */
    .eq("id", orderId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    await logError({
      action: "awb/poarta",
      message: `comanda nu s-a putut citi la poarta AWB: ${error.message}`,
      details: { orderId }, businessId, severity: "error",
    });
    return "Comanda nu s-a putut verifica acum. Încearcă din nou peste câteva clipe.";
  }

  /*
   * ⚠ O COMANDA NEGASITA NU SE REFUZA AICI. Nu e treaba portii sa spuna „negasita": actiunea
   * care urmeaza o citeste ea insasi si da mesajul ei, cu numele curierului in el. Iar un refuz
   * de aici ar fi ascuns cauza adevarata in spatele unui text despre AWB-uri.
   */
  if (!data) return null;

  const rand = data as unknown as Record<string, unknown>;
  const awburi = awburiDinRand(rand);

  return deCeNuSePoateAwbPropriu({
    order_source: rand.order_source,
    payment_status: (rand.payment_status ?? null) as string | null,
    status: (rand.status ?? null) as string | null,
    awburi,
  }, curier);
}
