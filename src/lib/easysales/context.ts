import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { depozitDinSupabase } from "./depozit";
import type { ContextEasySales } from "./client";

/**
 * Contextul de lucru al unui magazin: depozitul, configurarea DECRIPTATA si firul pentru jurnal.
 *
 * ⚠ Trei raspunsuri, si nu se confunda (lectia OLX, 29.08.2026):
 *   `gata`        se poate lucra;
 *   `deconectat`  configurarea spune limpede ca nu e conectat: lucrarile n-au unde pleca;
 *   `eroare`      n-am putut citi: o pana a bazei NU e o deconectare, deci nu se sterge nimic.
 */
export type RezultatContext =
  | { fel: "gata"; ctx: ContextEasySales }
  | { fel: "deconectat" }
  | { fel: "eroare"; mesaj: string };

export async function incarcaContextul(
  admin: SupabaseClient<Database>, businessId: string, corelatie?: string | null,
): Promise<RezultatContext> {
  const dep = depozitDinSupabase(admin);
  try {
    const cfg = await dep.citesteConfig(businessId);
    if (!cfg.connected) return { fel: "deconectat" };
    return { fel: "gata", ctx: { dep, businessId, cfg, corelatie: corelatie ?? null } };
  } catch (e) {
    return { fel: "eroare", mesaj: (e as Error).message };
  }
}
