import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { PostaConfigClient } from "@/components/dashboard/PostaConfigClient";
import { getPostaPlajaAction } from "@/lib/actions/posta.actions";
import type { PostaConfig } from "@/lib/posta/client";

export default async function PostaPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * ⚠ `mascheazaConfig` inlocuieste parola cu un substituent inainte sa ajunga in
   * browser. Fara ea, parola contului de Posta ar pleca in HTML-ul paginii la
   * fiecare incarcare.
   */
  const config = (mascheazaConfig("posta_config", settings?.posta_config) as PostaConfig | null) ?? null;

  /* Plaja sta in tabel separat, nu in config: alocarea ei e o scriere concurenta. */
  const rPlaja = await getPostaPlajaAction(business.id);
  const plaja = rPlaja.ok ? rPlaja.plaja : null;

  return <PostaConfigClient businessId={business.id} initialConfig={config} initialPlaja={plaja} />;
}
