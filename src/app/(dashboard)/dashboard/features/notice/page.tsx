import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { NoticeConfigClient } from "@/components/dashboard/NoticeConfigClient";
import type { NoticeConfig } from "@/lib/notice";

export default async function NoticePage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const noticeConfig: NoticeConfig = (settings?.notice_config as NoticeConfig | null) ?? {
    enabled: false,
    api_token: "",
    strip_diacritics: true,
    triggers: {},
  };

  return <NoticeConfigClient businessId={business.id} initialConfig={noticeConfig} />;
}
