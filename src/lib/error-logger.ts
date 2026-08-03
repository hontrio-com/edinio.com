"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

interface LogErrorParams {
  action: string;
  message: string;
  details?: Record<string, unknown>;
  userId?: string;
  userEmail?: string;
  businessId?: string;
  severity?: "info" | "warning" | "error" | "critical";
}

/**
 * Log an error to the error_logs table (fire-and-forget).
 *
 * Client de SISTEM, nu cel de cerere. Politica tabelului e `TO authenticated`,
 * deci pe caile publice — comenzi, cotatii, cosuri abandonate, adica exact acolo
 * unde se intampla banii — insertul era refuzat de RLS. `supabase-js` nu arunca:
 * pune eroarea in `error`, iar `catch`-ul de mai jos nu prindea nimic. Rezultatul
 * a fost un jurnal care parea gol si care a fost citit ca dovada ca nu s-a
 * intamplat nimic: zero intrari nu insemnau zero incidente, ci zero scrieri.
 *
 * Volumul ramane marginit de plafonul de incercari pe IP al fiecarui endpoint
 * public (10/minut), acelasi rationament ca la `jurnalizeazaOfertele`.
 */
/** Cat se scrie dintr-un camp de text. Peste atat nu mai afli nimic in plus. */
const MAX_MESAJ = 500;
/** Cat ocupa `details` serializat. 8 MB e limita de corp a unei cereri. */
const MAX_DETALII = 4000;

export async function logError(params: LogErrorParams) {
  try {
    const supabase = createAdminClient();
    /*
     * Se TAIE inainte de scriere.
     *
     * De cand insertul chiar reuseste (client de sistem), `message` si `details`
     * vin uneori direct de pe cai publice anonime — de exemplu lista de id-uri
     * dintr-un cos, care nu e plafonata nicaieri. Fara taiere, o singura cerere
     * poate scrie un rand de cateva megaocteti, iar plafonul pe IP e o harta in
     * memorie, deci per instanta.
     */
    const detalii = JSON.stringify(params.details ?? {});
    await supabase.from("error_logs").insert({
      action: String(params.action).slice(0, 120),
      message: String(params.message ?? "").slice(0, MAX_MESAJ),
      details: (detalii.length > MAX_DETALII
        ? { taiat: true, marime: detalii.length, inceput: detalii.slice(0, MAX_DETALII) }
        : (params.details ?? {})) as Record<string, Json>,
      user_id: params.userId ?? null,
      user_email: params.userEmail ?? null,
      business_id: params.businessId ?? null,
      severity: params.severity ?? "error",
    });
  } catch {
    // Silent fail — logging should never break the app
  }
}
