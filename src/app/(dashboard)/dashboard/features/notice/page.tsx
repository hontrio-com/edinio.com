import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { NoticeConfigClient } from "@/components/dashboard/NoticeConfigClient";
import type { NoticeConfig } from "@/lib/notice";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function NoticePage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const noticeConfig: NoticeConfig = (mascheazaConfig("notice_config", settings?.notice_config) as NoticeConfig | null) ?? {
    enabled: false,
    api_token: "",
    strip_diacritics: true,
    triggers: {},
  };

  return <NoticeConfigClient businessId={business.id} initialConfig={noticeConfig} />;
}
