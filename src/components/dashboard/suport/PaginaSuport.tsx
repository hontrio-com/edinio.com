import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { SuportChatClient, type SuportMascat } from "@/components/dashboard/SuportChatClient";
import { SECRETE_SUPORT, furnizorPornit, type FurnizorSuport, type SuportConfig } from "@/lib/suport/config";
import { citesteSuportDinBaza } from "@/lib/suport/server";
import { parseCookieBannerConfig } from "@/lib/cookie-consent";
import { curataContClientConfig } from "@/lib/cont/config";
import { storeBaseUrl } from "@/lib/seo";

/*
 * Pagina unui furnizor de chat, pe server: aceeasi pentru Tidio, tawk.to, Intercom si Zendesk. Cele patru
 * rute (`dashboard/features/<furnizor>/page.tsx`) doar o cheama cu furnizorul lor.
 *
 * ⚠ MASCATA DE DOUA ORI, dinadins (ca la theMarketer): `mascheazaConfig` stie doar campurile din
 * `CAMPURI_SECRETE`; al doilea strat goleste oricum campurile din `SECRETE_SUPORT`. O nepotrivire intre
 * cele doua liste nu are voie sa trimita o cheie de semnare in browser.
 *
 * ⚠ Configurarea se citeste cu cheia de serviciu: magazinul e al omului (`getCachedBusinessWithSettings`
 * cauta dupa `user_id`), iar citita cu clientul lui ar veni cu secretele cifrate, bune de nimic la salvare.
 */
function mascata(brut: SuportConfig | null): SuportMascat | null {
  const m = mascheazaConfig("suport_config", brut);
  if (!m || !brut) return null;
  const sursa = brut as unknown as Record<string, unknown>;
  const completate: Record<string, boolean> = { ...(m._completate ?? {}) };
  const iesire: Record<string, unknown> = { ...m };
  for (const camp of SECRETE_SUPORT) {
    const v = sursa[camp];
    completate[camp] = typeof v === "string" ? v.length > 0 : v != null;
    delete iesire[camp];
  }
  return { ...iesire, _completate: completate } as unknown as SuportMascat;
}

export async function PaginaSuport({ furnizor }: { furnizor: FurnizorSuport }) {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  let brut: SuportConfig | null = null;
  let eroareCitire = false;
  try {
    brut = await citesteSuportDinBaza(business.id);
  } catch {
    eroareCitire = true;
  }

  const { data: biz } = await createAdminClient()
    .from("businesses")
    .select("slug, custom_domain, whatsapp, phone, features")
    .eq("id", business.id)
    .maybeSingle();
  const magazin = (biz ?? null) as {
    slug?: string | null; custom_domain?: string | null; whatsapp?: string | null; phone?: string | null;
    features?: { floating_whatsapp?: boolean; floating_call?: boolean } | null;
  } | null;

  const setari = (settings ?? null) as { cookie_banner_config?: unknown; cont_client_config?: unknown } | null;
  const domeniu = (magazin?.custom_domain ?? "").trim();
  const features = magazin?.features ?? {};
  /* Aceeasi regula ca in vitrina (`MiniStoreRenderer`): WhatsApp porneste singur cand exista numarul. */
  const areContactRapid =
    (features.floating_whatsapp !== false && !!magazin?.whatsapp) || (features.floating_call === true && !!magazin?.phone);

  return (
    <SuportChatClient
      businessId={business.id}
      furnizor={furnizor}
      initial={mascata(brut)}
      pornit={furnizorPornit(brut)}
      bannerPornit={parseCookieBannerConfig(setari?.cookie_banner_config).enabled}
      conturiPeDomeniu={!!domeniu && curataContClientConfig(setari?.cont_client_config).enabled}
      areContactRapid={areContactRapid}
      adresaMagazinului={magazin?.slug ? storeBaseUrl({ slug: magazin.slug, custom_domain: domeniu || null }) : "/"}
      eroareCitire={eroareCitire}
    />
  );
}
