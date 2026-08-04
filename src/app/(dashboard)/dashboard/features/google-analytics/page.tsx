import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { GoogleAnalyticsClient } from "@/components/dashboard/GoogleAnalyticsClient";
import { getGaStatus, getGaDashboard, getGaRealtime } from "@/lib/actions/google-analytics.actions";
import { GOOGLE_ANALYTICS_LIVE } from "@/lib/google-analytics/types";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function GoogleAnalyticsPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(1).single();
  if (!biz) redirect("/dashboard");

  // OAuth (account connect + in-app reports) is live for everyone (Google
  // verification approved 2026-07-21); GOOGLE_ANALYTICS_LIVE is now a kill-switch.
  // The manual Measurement ID path was always public.
  const { data: profile } = await supabase.from("users_profile").select("role").eq("id", user.id).single();
  const available = GOOGLE_ANALYTICS_LIVE || profile?.role === "admin";

  const statusRes = await getGaStatus(biz.id);
  const status = "error" in statusRes ? null : statusRes;

  // Preload the default dashboard (28 zile) + realtime for OAuth-connected
  // stores (manual mode has no Data API access).
  const [dashRes, rtRes] = status?.connected && !status.manual
    ? await Promise.all([getGaDashboard(biz.id, 28), getGaRealtime(biz.id)])
    : [null, null];

  return (
    <div className="p-6 max-w-5xl">
      <IntegrationHeader id="google-analytics" description="Vezi traficul, sursele și conversiile magazinului direct din contul tău Google Analytics." />
      <GoogleAnalyticsClient
        businessId={biz.id}
        status={status}
        available={available}
        initialDashboard={dashRes && "data" in dashRes ? dashRes.data : null}
        initialRealtime={rtRes && "data" in rtRes ? rtRes.data : null}
      />
    </div>
  );
}
