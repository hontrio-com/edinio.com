import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { deCeNuSePoateAwbPropriu } from "./awb-propriu";

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
export async function poartaAwbPropriu(businessId: string, orderId: string): Promise<string | null> {
  return poartaCuBaza(createAdminClient(), businessId, orderId);
}

/**
 * Chiar poarta, cu baza data din afara.
 *
 * ⚠ EXISTA CA SA POATA FI PROBATA CU O BAZA ADEVARATA-FALSA, nu ca sa aiba cineva de ales
 * clientul: `poartaAwbPropriu` ii da mereu pe cel de sistem. Probele care conteaza aici sunt
 * cele despre CITIRE — ca se cere si `business_id`, ca o eroare cade INCHIS — si niciuna nu se
 * poate scrie daca clientul e ferecat inauntru.
 */
export async function poartaCuBaza(
  admin: ReturnType<typeof createAdminClient>, businessId: string, orderId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("orders")
    .select("order_source, payment_status")
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

  const rand = data as unknown as { order_source: unknown; payment_status: string | null };
  return deCeNuSePoateAwbPropriu(rand);
}
