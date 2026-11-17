import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { EasybillConfigClient } from "@/components/dashboard/EasybillConfigClient";
import { SECRETE_EASYBILL, type EasybillConfig } from "@/lib/easybill/config";

/*
 * Configurarea easybill. Parola pleaca spre browser MASCATA (goala, cu `_completate`): e secretul
 * comerciantului si n-are ce cauta in payload-ul paginii.
 *
 * ⚠ MASCATA DE DOUA ORI, dinadins. `mascheazaConfig` stie doar campurile din `CAMPURI_SECRETE`;
 * pana cand `easybill_config` intra acolo, ar fi lasat parola sa treaca. Al doilea strat goleste
 * campurile din `SECRETE_EASYBILL` oricum.
 */
function mascata(brut: unknown): EasybillConfig | null {
  const m = mascheazaConfig("easybill_config", brut);
  if (!m || !brut || typeof brut !== "object") return null;
  const sursa = brut as Record<string, unknown>;
  const completate: Record<string, boolean> = { ...(m._completate ?? {}) };
  const iesire: Record<string, unknown> = { ...m };
  for (const camp of SECRETE_EASYBILL) {
    const v = sursa[camp];
    completate[camp] = typeof v === "string" ? v.length > 0 : v != null;
    iesire[camp] = "";
  }
  return { ...iesire, _completate: completate } as unknown as EasybillConfig;
}

export default async function EasybillPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = mascata((settings as { easybill_config?: unknown } | null)?.easybill_config);

  return <EasybillConfigClient businessId={business.id} initialConfig={config} />;
}
