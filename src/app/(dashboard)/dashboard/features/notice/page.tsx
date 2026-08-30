import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { NoticeConfigClient } from "@/components/dashboard/NoticeConfigClient";
import type { NoticeConfig } from "@/lib/notice";

export default async function NoticePage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * `notice_config` se citeste cu service role, spre deosebire de celelalte
   * pagini de integrari.
   *
   * Motivul e SINGURUL camp criptat pe care comerciantul trebuie sa-l VADA:
   * `webhook_secret`. Nu e o credentiala catre notice.ro, ci partea secreta din
   * URL-ul pe care el il copiaza in contul lui (`NoticeConfigClient` il compune
   * la l.165), si tocmai de aceea nu e in `CAMPURI_SECRETE` — mascat, campul
   * n-ar mai avea ce afisa. Din 2026-08-05 vederea `store_settings` nu mai
   * decripteaza pentru `authenticated`, deci pe clientul comerciantului ar sosi
   * `enc.v1.…` si pagina ar afisa un URL de webhook fals: notice.ro l-ar accepta,
   * dar `/api/notice/webhook` cauta magazinul dupa `notice_config->>webhook_secret`
   * cu service role, adica dupa valoarea DECRIPTATA, si n-ar potrivi niciodata
   * nimic. Rezultatul: rapoartele de livrare si mesajele primite s-ar pierde in
   * tacere, cu integrarea aratand „configurata".
   *
   * Acelasi drum il face deja `getNoticeConfig` din notice.actions.ts, apelat de
   * client dupa conectarea WhatsApp — aici era singurul loc ramas pe drumul vechi,
   * si e chiar cel de la incarcarea paginii.
   *
   * PROPRIETATEA, fiindca service role ocoleste RLS: `business` vine din
   * `getCachedBusinessWithSettings`, care interogheaza cu clientul comerciantului
   * filtrat pe `user_id`, iar `user` e sesiunea curenta.
   *
   * `mascheazaConfig` ramane OBLIGATORIU peste rezultat: service role decripteaza
   * TOT, deci fara el `api_token`-ul ar pleca in clar spre browser — exact gaura
   * pentru care s-a scris migratia.
   */
  const { data: rand } = await createAdminClient()
    .from("store_settings")
    .select("notice_config")
    .eq("business_id", business.id)
    .single();

  const noticeConfig: NoticeConfig = (mascheazaConfig("notice_config", rand?.notice_config) as NoticeConfig | null) ?? {
    enabled: false,
    api_token: "",
    strip_diacritics: true,
    triggers: {},
  };

  return <NoticeConfigClient businessId={business.id} initialConfig={noticeConfig} />;
}
