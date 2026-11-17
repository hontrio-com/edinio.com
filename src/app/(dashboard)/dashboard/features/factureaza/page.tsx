import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FactureazaConfigClient } from "@/components/dashboard/FactureazaConfigClient";
import { mascheazaFactureaza } from "@/lib/factureaza/config";

/*
 * Configurarea Factureaza.ro. Cheia API pleaca spre browser MASCATA (goala, cu `_completate`): e
 * secretul comerciantului si n-are ce cauta in payload-ul paginii.
 *
 * ⚠ `mascheazaFactureaza`, nu `mascheazaConfig` direct: aceea mascheaza doar ce e in
 * `CAMPURI_SECRETE`, iar `factureaza_config` intra acolo prin legarea comuna. Asa, cheia nu pleaca
 * nici inainte de legare, nici daca intrarea s-ar pierde la o rescriere.
 */
export default async function FactureazaPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = mascheazaFactureaza((settings as { factureaza_config?: unknown } | null)?.factureaza_config);

  return <FactureazaConfigClient businessId={business.id} initialConfig={config} />;
}
