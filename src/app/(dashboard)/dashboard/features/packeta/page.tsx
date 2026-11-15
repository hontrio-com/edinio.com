import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { PacketaConfigClient } from "@/components/dashboard/PacketaConfigClient";
import type { PacketaConfig } from "@/lib/packeta/client";

export default async function PacketaPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * ⚠ `mascheazaConfig` inlocuieste AMBELE credentiale cu un substituent inainte
   * sa ajunga in browser. La Packeta sunt doua lucruri diferite — `api_password`
   * (32 hex, in corpul XML) si `api_key` (16 caractere, in calea fluxurilor) — si
   * niciuna n-are ce cauta in HTML-ul paginii.
   */
  const config = (mascheazaConfig("packeta_config", settings?.packeta_config) as PacketaConfig | null) ?? null;

  /*
   * Curierii pe care magazinul ii are deja pornit pe cont propriu. Servesc doar
   * avertismentului de suprapunere: acelasi curier poate ajunge in checkout si
   * direct, si prin Innoship, si prin Packeta.
   */
  const activ = (c: unknown, ...campuri: string[]) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return !!o.enabled && campuri.every((k) => !!String(o[k] ?? "").trim());
  };
  const activiDirect = [
    activ(settings?.cargus_config, "username", "subscription_key") ? "cargus" : "",
    activ(settings?.dpd_config, "username", "client_id") ? "dpd" : "",
    activ(settings?.fan_courier_config, "username", "client_id") ? "fan-courier" : "",
    activ(settings?.sameday_config, "username") ? "sameday" : "",
    activ(settings?.gls_config, "username", "client_number") ? "gls" : "",
    activ(settings?.posta_config, "username", "cod_trimitere") ? "posta" : "",
  ].filter(Boolean);

  return <PacketaConfigClient businessId={business.id} initialConfig={config} activiDirect={activiDirect} />;
}
