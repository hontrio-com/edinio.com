import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import type { TrendyolConfig } from "./types";

/**
 * Scrie NUMAI campurile atinse, si le imbina in Postgres, pe randul incuiat.
 *
 * ═══ ⚠ CITIRE-MODIFICARE-SCRIERE PIERDE SCRIERI, SI SE VEDE ABIA MAI TARZIU ═══
 *
 * Toate scrierile de configurare Trendyol faceau:
 *
 *     citeste `trendyol_config`
 *     { ...vechi, ...petic }
 *     scrie TOT obiectul inapoi
 *
 * Iar in acelasi JSON stau lucruri scrise de oameni DIFERITI, in acelasi timp:
 *
 *   comerciantul       adresa de expediere, curierul, comutatoarele
 *   cronul de comenzi  cursorul per vitrina, `last_sync_at`
 *   reconcilierea      `reconcile_page`
 *   webhook-ul         `webhook_id`, `webhook_secret`, `needs_reconnect`
 *
 * Deci:
 *
 *   10:00:00.0  cronul citeste configul (cursor = A)
 *   10:00:00.1  omul citeste configul   (cursor = A)
 *   10:00:00.2  cronul scrie cursor = B
 *   10:00:00.3  omul scrie setarile, cu cursorul A din citirea lui
 *
 * Cursorul B DISPARE. Fereastra de comenzi se intoarce in trecut si reciteste, sau — mai
 * rau, la `catalog_citit_la` si la marcajele care se scriu O SINGURA DATA — se pierde ceva
 * ce nu se mai reface niciodata.
 *
 * ⚠ `jsonb_merge_config` face imbinarea IN POSTGRES, pe randul luat cu `for update`, si stie
 * si sa pastreze secretele criptate (`campuri_secrete` are pentru Trendyol `api_key`,
 * `api_secret` si `webhook_secret`). Exista de la reparatia eMAG si e generica: primeste
 * numele coloanei.
 *
 * ⚠ CAMPUL GOLIT SE TRIMITE `null`, NU LIPSA. Intr-o imbinare, cheia absenta inseamna „las-o
 * cum e". `undefined` dispare la serializare, deci un camp pe care omul l-a sters ar fi
 * ramas pe loc. Cititorii iau deja `null` drept lipsa.
 */
type Admin = SupabaseClient<Database>;

export async function patchTrendyolConfig(
  admin: Admin, businessId: string, patch: Partial<TrendyolConfig>,
): Promise<boolean> {
  /* ⚠ Peticul gol nu se trimite: ar rescrie randul degeaba, iar fiecare scriere goala e inca
     o sansa sa calce o salvare concurenta pe alta integrare. */
  if (Object.keys(patch).length === 0) return true;

  const { error } = await admin.rpc("jsonb_merge_config", {
    p_business_id: businessId,
    p_column: "trendyol_config",
    p_patch: patch as never,
  });

  /*
   * ⚠ EROAREA SE SPUNE, dar NU se arunca: se cheama din cron, dupa lucrari care CHIAR au
   * reusit. O exceptie ar rupe trecerea si ar pierde si ce a mers. Tacuta cu totul insa, ar
   * fi chiar tiparul vanat: marcajul nu avanseaza, fereastra reciteste la nesfarsit aceleasi
   * comenzi, si nimic nu spune de ce.
   */
  if (error) {
    await logError({
      action: "trendyol.config",
      message: `peticul de configurare nu s-a scris: ${error.message}`,
      details: { businessId, campuri: Object.keys(patch) },
      businessId, severity: "warning",
    });
    return false;
  }
  return true;
}
