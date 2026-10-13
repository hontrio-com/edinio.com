import { createAdminClient } from "@/lib/supabase/admin";
import { MESAJ_STAREA_IN_EASYSALES, procesataInEasySales } from "@/lib/orders/origin";

/**
 * Portile din Edinio pentru comenzile vitrinei procesate in easySales (planul, §5.3).
 *
 * ═══ CE SE POATE DE AICI, SI CE NU ═══
 *
 *   starea         NU, dupa trimitere (vine din easySales). Inainte de trimitere, numai anularea:
 *                  declansatorul o trece `anulata_inainte` si nu mai pleaca nimic;
 *   editarea       liniile si adresa NU, dupa trimitere (ar ramane altfel la ei);
 *   stergerea      NU, dupa trimitere (la ei comanda ramane);
 *   plata          DA: e contabilitatea Edinio; la o plata online marcata „platita", comanda
 *                  chiar trebuie sa plece (declansatorul o pune in coada).
 *
 * ⚠ CAD INCHIS: daca legatura nu se poate citi, nu se lasa nimic sa treaca. O apasare amanata cu
 * un minut costa mai putin decat o comanda schimbata aici si procesata altfel acolo.
 *
 * Fisierul NU e „use server": se cheama din actiuni, dupa garda proprietarului.
 */

export const STARI_INAINTE_DE_TRIMITERE: ReadonlySet<string> = new Set(["asteapta_plata", "de_trimis"]);

const MESAJ_NECITITA = "Nu am putut verifica legătura comenzii cu easySales. Încearcă din nou peste câteva momente.";

async function stareaLegaturii(orderId: string): Promise<{ stare: string | null } | null> {
  const { data, error } = await createAdminClient().from("easysales_comenzi").select("stare")
    .eq("order_uuid", orderId).eq("directie", "iesire").maybeSingle();
  if (error) return null;
  return { stare: (data as { stare?: string } | null)?.stare ?? null };
}

/** Paza starii (`updateOrder`). `null` = trece. */
export async function refuzaStareaEasySales(
  orderSource: unknown, orderId: string, statusNou: string, statusVechi: string | null,
): Promise<string | null> {
  if (!procesataInEasySales(orderSource) || statusNou === statusVechi) return null;
  const leg = await stareaLegaturii(orderId);
  if (!leg) return MESAJ_NECITITA;
  if (statusNou === "cancelled" && (leg.stare === null || STARI_INAINTE_DE_TRIMITERE.has(leg.stare))) return null;
  return MESAJ_STAREA_IN_EASYSALES;
}

/** Paza editarii si a stergerii. `null` = trece (comanda inca netrimisa sau neprocesata acolo). */
export async function refuzaModificareaEasySales(
  orderSource: unknown, orderId: string, ce: "editarea" | "stergerea",
): Promise<string | null> {
  if (!procesataInEasySales(orderSource)) return null;
  const leg = await stareaLegaturii(orderId);
  if (!leg) return MESAJ_NECITITA;
  if (leg.stare === null || STARI_INAINTE_DE_TRIMITERE.has(leg.stare)) return null;
  return ce === "stergerea"
    ? "Comanda a fost trimisă în easySales și nu se poate șterge de aici: acolo rămâne. Anuleaz-o în easySales sau cu „Anulează în easySales”."
    : "Comanda a fost trimisă în easySales: produsele și adresa se schimbă acolo. Modificate aici, n-ar ajunge la ei.";
}
