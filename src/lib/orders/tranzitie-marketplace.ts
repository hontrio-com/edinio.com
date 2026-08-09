import type { SupabaseClient } from "@supabase/supabase-js";
import { logError } from "@/lib/error-logger";

/**
 * Ciclul de viata al unei comenzi venite de pe marketplace — prin ACELASI motor
 * ca panoul si loturile.
 *
 * ═══ DE CE ═══
 *
 * Trendyol si About You scriau direct in `orders`:
 *
 *     admin.from("orders").update({ status: edinioStatus, ... })
 *
 * Deci: Trendyol anuleaza -> statusul devine `cancelled` -> STOCUL RAMANE
 * CONSUMAT. Cuponul la fel, marcajele la fel. Tot ce am construit pentru panou
 * (`aplica_tranzitia_comenzii`) era ocolit tocmai de sursa de comenzi pe care n-o
 * controlam si care anuleaza cel mai des.
 *
 * Si e mai rau de ieri, nu mai bine: pana ieri comenzile de marketplace nici nu
 * scriau `stoc_rezervat`, deci n-avea ce sa se elibereze oricum. Acum scriu —
 * motorul AR functiona. Lipsea doar conducta.
 *
 * Un singur loc pentru amandoua, din acelasi motiv ca la
 * [[finalizare-plata]]: cinci copii ale regulii de plata se despartisera deja, si
 * doua copii ale acesteia ar apuca-o pe acelasi drum.
 */
export async function tranzitieComandaMarketplace(
  admin: SupabaseClient,
  p: {
    orderId: string;
    businessId: string;
    /** Statusul Edinio derivat din cel al marketplace-ului. */
    status: string;
    /** `trendyol` / `aboutyou` — intra in jurnal. */
    sursa: string;
    /** Campuri care NU tin de ciclul de viata (ex. numarul de urmarire). */
    campuriSuplimentare?: Record<string, unknown>;
  },
): Promise<boolean> {
  /*
   * Campurile care nu tin de ciclu se scriu INAINTE si separat.
   *
   * Numarul de urmarire nu are nicio legatura cu stocul sau cu cuponul, si nu
   * merita bagat in tranzactia de tranzitie: daca aia pica, numarul ramas scris e
   * inofensiv si se rescrie oricum la sincronizarea urmatoare.
   */
  if (p.campuriSuplimentare && Object.keys(p.campuriSuplimentare).length > 0) {
    const { error } = await admin
      .from("orders")
      .update({ ...p.campuriSuplimentare, updated_at: new Date().toISOString() })
      .eq("id", p.orderId)
      .eq("business_id", p.businessId);
    if (error) {
      await logError({
        action: `${p.sursa}/tranzitie`,
        message: `campurile auxiliare nu s-au putut scrie: ${error.message}`,
        details: { orderId: p.orderId }, businessId: p.businessId, severity: "warning",
      });
    }
  }

  const { data, error } = await admin.rpc("aplica_tranzitia_comenzii" as never, {
    p_order_id: p.orderId,
    p_status: p.status,
    // Marketplace-ul nu schimba starea platii: comenzile vin deja platite, iar
    // rambursarea se reflecta prin STATUS (`refunded`), nu prin `payment_status`.
    p_payment_status: null,
    p_business_id: p.businessId,
  } as never);

  const rez = data as { gasit?: boolean; stoc?: string; negative?: unknown[] } | null;
  if (error || rez?.gasit !== true) {
    await logError({
      action: `${p.sursa}/tranzitie`,
      message: error?.message ?? "tranzitia comenzii n-a raspuns valid",
      details: { orderId: p.orderId, status: p.status, raspuns: rez },
      businessId: p.businessId,
      severity: "critical",
    });
    return false;
  }

  if (rez.stoc === "necunoscut") {
    // Comanda e dinainte de `stoc_rezervat` (sau a fost creata cand marketplace-ul
    // inca nu-l scria): stocul NU s-a dat inapoi si trebuie corectat de mana.
    await logError({
      action: `${p.sursa}/tranzitie`,
      message: "Comanda e dinainte de inregistrarea stocului rezervat; stocul NU s-a dat inapoi automat.",
      details: { orderId: p.orderId }, businessId: p.businessId, severity: "warning",
    });
  }
  if (Array.isArray(rez.negative) && rez.negative.length > 0) {
    await logError({
      action: `${p.sursa}/tranzitie`,
      message: "Reactivarea comenzii de marketplace a cerut mai mult stoc decat exista.",
      details: { orderId: p.orderId, negative: rez.negative }, businessId: p.businessId, severity: "warning",
    });
  }
  return true;
}
