import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { SagaConfigClient } from "@/components/dashboard/SagaConfigClient";
import { mascheazaConfigSaga } from "@/lib/saga/config";

/*
 * Configurarea SAGA Web. Cheia de acces pleaca spre browser MASCATA (goala, cu `_completate`): e
 * secretul comerciantului si n-are ce cauta in payload-ul paginii.
 *
 * ⚠ `mascheazaConfigSaga`, nu doar `mascheazaConfig`: cea comuna mascheaza numai campurile din
 * `CAMPURI_SECRETE`, iar `saga_config` intra acolo abia la legarea comuna. Pana atunci, singura,
 * ar fi lasat cheia sa coboare in clar.
 */
export default async function SagaPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = mascheazaConfigSaga((settings as { saga_config?: unknown } | null)?.saga_config ?? null);

  return <SagaConfigClient businessId={business.id} initialConfig={config} />;
}
