import type { SupabaseClient } from "@supabase/supabase-js";
import { poateAvansaLaConfirmat } from "@/lib/order-progress";
import { maybeMarkMailchimpOrderPaid } from "@/lib/mailchimp-sync";
import { maybeMarkBrevoOrderPaid } from "@/lib/brevo-sync";
import { factureazaDupaPlata } from "@/lib/invoice-on-payment";
import { logError } from "@/lib/error-logger";

/**
 * „Comanda asta e platita" — un singur loc, pentru toate procesatoarele.
 *
 * ═══ DE CE ═══
 *
 * Erau cinci implementari ale aceleiasi reguli: Stripe, Revolut, Klarna, iPay
 * (retur) si iPay (reconciliere). Se despartisera deja, si nu marunt:
 *
 *   * Stripe verifica `error` si intorcea esec; Revolut si Klarna il verificau
 *     doar cat sa NU trimita efectele secundare, dar raspundeau `paid` oricum —
 *     deci procesatorul spunea „incasat", clientul vedea „platit", si in baza
 *     scria „neplatit". iPay nici nu se uita la rezultat.
 *   * Stripe avansa statusul doar din `pending` (`poateAvansaLaConfirmat`);
 *     Revolut si Klarna scriau `confirmed` NECONDITIONAT, deci o comanda deja
 *     `shipped` se intorcea la `confirmed` daca sosea o re-livrare de webhook.
 *   * Numai Stripe folosea `.select()` ca sa afle daca randul CHIAR s-a schimbat,
 *     deci numai el nu retrimitea facturile la o re-livrare.
 *
 * Trei purtari diferite pentru aceeasi propozitie. De aceea sta aici.
 */

export type RezultatPlata =
  /** Randul s-a schimbat ACUM. Efectele secundare au plecat o singura data. */
  | { fel: "platita-acum" }
  /** Era deja platita: re-livrare de webhook, sau doua cai deodata. Nimic de facut. */
  | { fel: "deja-platita" }
  /** Baza n-a confirmat. Apelantul NU are voie sa-i spuna clientului „platit". */
  | { fel: "esuat"; error: string };

export interface ComandaDePlatit {
  id: string;
  businessId: string;
}

/**
 * Marcheaza comanda platita, idempotent, si declanseaza o SINGURA data ce urmeaza
 * dupa plata (Mailchimp, Brevo, facturarea automata).
 *
 * `campuriSuplimentare` e pentru id-ul de la procesator (`revolut_order_id`,
 * `klarna_order_id`, …), care se scrie in aceeasi instructiune.
 */
export async function finalizeazaPlataComenzii(
  admin: SupabaseClient,
  comanda: ComandaDePlatit,
  campuriSuplimentare: Record<string, unknown> = {},
): Promise<RezultatPlata> {
  const comun: Record<string, unknown> = {
    ...campuriSuplimentare,
    payment_status: "paid",
    updated_at: new Date().toISOString(),
  };

  /*
   * ═══ AVANSAREA STATUSULUI SE FACE DIN `WHERE`, NU DINTR-O CITIRE ═══
   *
   * Revolut si Klarna scriau `status: "confirmed"` NECONDITIONAT, si nu din
   * neglijenta: obiectul primit nici nu purta statusul curent, deci n-aveau ce
   * intreba. Efectul era ca o re-livrare de webhook peste o comanda deja
   * `shipped` o dadea inapoi la `confirmed` — marfa plecata aparea ca nelivrata.
   *
   * Solutia evidenta ar fi fost sa citim statusul intai. Dar intre citire si
   * scriere el se poate schimba (panou, lot, alt webhook), si am fi scris pe o
   * valoare invechita — aceeasi cursa pe care am scos-o din tranzitia comenzii.
   *
   * Asa ca decizia sta in `WHERE`: prima incercare avanseaza DOAR daca randul e
   * inca `pending`. Daca nu s-a potrivit nimic, a doua marcheaza plata fara sa
   * atinga statusul. Exact, fara citire, si fara fereastra intre ele.
   */
  const { data: avansate, error: eAvans } = await admin
    .from("orders")
    .update({ ...comun, status: "confirmed" })
    .eq("id", comanda.id)
    .eq("status", "pending")
    .neq("payment_status", "paid")
    .select("id");
  if (eAvans) return await raporteazaEsecul(comanda, eAvans);
  if (avansate && avansate.length > 0) {
    return dupaPlata(comanda, "confirmed");
  }

  const { data: schimbate, error } = await admin
    .from("orders")
    .update(comun)
    .eq("id", comanda.id)
    .neq("payment_status", "paid")
    .select("id, status");
  if (error) return await raporteazaEsecul(comanda, error);

  if (!schimbate || schimbate.length === 0) return { fel: "deja-platita" };
  return dupaPlata(comanda, (schimbate[0] as { status?: string | null }).status ?? "");
}

/**
 * Banii au intrat la procesator, dar baza nu stie.
 *
 * E cea mai urata stare posibila si TREBUIE sa se vada: altfel comanda ramane
 * „neplatita" pentru comerciant, in timp ce clientul are extrasul care spune
 * contrariul. Apelantul primeste un esec, deci nu-i mai poate spune „platit".
 */
async function raporteazaEsecul(
  comanda: ComandaDePlatit,
  error: { message: string; code?: string },
): Promise<RezultatPlata> {
  await logError({
    action: "finalizeazaPlataComenzii",
    message: `Plata a reusit la procesator, dar comanda NU s-a putut marca platita: ${error.message}`,
    details: { orderId: comanda.id, code: error.code },
    businessId: comanda.businessId,
    severity: "critical",
  });
  return { fel: "esuat", error: "Plata a reusit, dar nu am putut actualiza comanda. Contacteaza magazinul." };
}

/** Ce urmeaza dupa plata, o SINGURA data — randul chiar s-a schimbat acum. */
function dupaPlata(comanda: ComandaDePlatit, status: string): RezultatPlata {
  void maybeMarkMailchimpOrderPaid(comanda.id);
  void maybeMarkBrevoOrderPaid(comanda.id);
  factureazaDupaPlata(comanda.businessId, comanda.id, status, "paid");
  return { fel: "platita-acum" };
}
