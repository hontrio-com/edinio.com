"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isIP } from "node:net";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMetaPixelId, type MarketingConfig } from "@/lib/marketing-config";
import { clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { storeBaseUrl } from "@/lib/seo";
import { trimiteLaMeta, verificaTokenul } from "@/lib/facebook/capi";
import type { ConfigCapi } from "@/lib/orders/meta-comanda";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CONVERSIONS API DIN PANOU: TOKENUL, CODUL DE TEST, STAREA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ TOKENUL NU SE INTOARCE NICIODATA IN BROWSER. `getMetaCapiStare` spune doar DACA e salvat. Scrierea se
  face cu service role, dupa ce proprietatea magazinului e dovedita cu clientul utilizatorului (acelasi tipar
  ca la Google Merchant).

  ⚠ TOKENUL SE VERIFICA LA META INAINTE DE SALVARE (`verificaTokenul` citeste pixelul cu el). Un token gresit
  salvat ar fi facut fiecare eveniment sa fie refuzat in tacere.

  ⚠ SI CAND S-A SCHIMBAT PIXELUL. Tokenul tine minte pixelul pe care a fost verificat (`pixel_id`). Schimbarea
  Pixel ID-ului stinge `facebook_capi_activ` (vezi `saveMarketingConfig`), iar reaprinderea cere verificarea
  tokenului pe pixelul NOU, chiar daca nu s-a lipit altul.
*/

type Rezultat = { success: true } | { error: string };

async function magazinulUtilizatorului(businessId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  return biz ? { ok: true } : { error: "Magazin negasit" };
}

async function citesteSetarile(businessId: string) {
  const { data, error } = await createAdminClient()
    .from("store_settings").select("marketing_config, meta_capi_config").eq("business_id", businessId).maybeSingle();
  if (error) throw new Error(`Setarile nu s-au putut citi: ${error.message}`);
  return {
    marketing: (data?.marketing_config ?? {}) as MarketingConfig,
    capi: (data?.meta_capi_config ?? null) as ConfigCapi | null,
  };
}

export interface StareMetaCapi {
  tokenSalvat: boolean;
  /** Evenimentele pleaca de pe server. Tokenul salvat dar stins = Pixel ID-ul s-a schimbat de la verificare. */
  activ: boolean;
  testEventCode: string;
  ultimaTrimitereLa: string | null;
  ultimaEroare: string | null;
  ultimaEroareLa: string | null;
}

export async function getMetaCapiStare(businessId: string): Promise<StareMetaCapi | { error: string }> {
  const acces = await magazinulUtilizatorului(businessId);
  if ("error" in acces) return acces;
  const { marketing, capi } = await citesteSetarile(businessId);
  return {
    tokenSalvat: !!capi?.access_token?.trim(),
    activ: !!capi?.access_token?.trim() && marketing.facebook_capi_activ === true,
    testEventCode: capi?.test_event_code ?? "",
    ultimaTrimitereLa: capi?.ultima_trimitere_la ?? null,
    ultimaEroare: capi?.ultima_eroare ?? null,
    ultimaEroareLa: capi?.ultima_eroare_la ?? null,
  };
}

export async function saveMetaCapi(
  businessId: string,
  intrare: { token?: string; testEventCode?: string },
): Promise<Rezultat> {
  const acces = await magazinulUtilizatorului(businessId);
  if ("error" in acces) return acces;
  const { marketing, capi } = await citesteSetarile(businessId);
  const pixelId = parseMetaPixelId(marketing.facebook_pixel_id);
  if (!pixelId) return { error: "Salveaza mai intai Pixel ID-ul: tokenul Conversions API trimite evenimente in pixelul acela." };

  const tokenNou = (intrare.token ?? "").trim();
  const token = tokenNou || capi?.access_token?.trim() || "";
  if (!token) return { error: "Lipseste tokenul Conversions API. Il generezi in Events Manager -> pixelul tau -> Setari -> Conversions API." };
  if (tokenNou && (tokenNou.length > 1000 || /\s/.test(tokenNou))) return { error: "Tokenul nu arata a token Meta. Copiaza-l intreg, fara spatii." };
  /* Tokenul nou, sau cel vechi pe un pixel pe care n-a fost verificat. */
  if (tokenNou || capi?.pixel_id !== pixelId || marketing.facebook_capi_activ !== true) {
    const v = await verificaTokenul(pixelId, token);
    if (!v.ok) return { error: `Meta a refuzat tokenul pentru pixelul ${pixelId}: ${v.mesaj}. Genereaza-l din setarile ACESTUI pixel.` };
  }
  const cod = (intrare.testEventCode ?? "").trim();
  if (cod && !/^TEST\w{1,40}$/i.test(cod)) return { error: "Codul de test are forma TEST12345 (Events Manager -> Test events)." };

  const admin = createAdminClient();
  const configNoua: ConfigCapi = {
    ...(capi ?? {}),
    access_token: token,
    pixel_id: pixelId,
    ...(cod ? { test_event_code: cod } : { test_event_code: undefined }),
    /* Un token nou incepe cu starea curata: eroarea veche era a tokenului vechi. */
    ...(tokenNou ? { ultima_eroare: undefined, ultima_eroare_la: undefined } : {}),
  };
  const { error: e1 } = await admin.from("store_settings")
    .update({ meta_capi_config: configNoua as never, marketing_config: { ...marketing, facebook_capi_activ: true } as never })
    .eq("business_id", businessId);
  if (e1) return { error: `Nu s-a putut salva: ${e1.message}` };
  revalidatePath("/dashboard/features/facebook-pixel");
  return { success: true };
}

export async function removeMetaCapi(businessId: string): Promise<Rezultat> {
  const acces = await magazinulUtilizatorului(businessId);
  if ("error" in acces) return acces;
  const { marketing } = await citesteSetarile(businessId);
  const { facebook_capi_activ: _stins, ...restul } = marketing;
  void _stins;
  const { error } = await createAdminClient().from("store_settings")
    .update({ meta_capi_config: null as never, marketing_config: restul as never })
    .eq("business_id", businessId);
  if (error) return { error: `Nu s-a putut sterge: ${error.message}` };
  revalidatePath("/dashboard/features/facebook-pixel");
  return { success: true };
}

/**
 * Un eveniment `PageView` DE TEST, vizibil in Events Manager -> Test events.
 *
 * ⚠ NUMAI cu codul de test salvat: fara el, evenimentul ar intra in datele reale ale pixelului si ar strica
 * rapoartele comerciantului. Documentatia: evenimentele cu `test_event_code` apar in Test Events.
 */
export async function trimiteEvenimentDeTestMeta(businessId: string): Promise<{ success: true; primite: number } | { error: string }> {
  const acces = await magazinulUtilizatorului(businessId);
  if ("error" in acces) return acces;
  const { marketing, capi } = await citesteSetarile(businessId);
  const pixelId = parseMetaPixelId(marketing.facebook_pixel_id);
  const token = capi?.access_token?.trim();
  if (!pixelId || !token) return { error: "Salveaza intai Pixel ID-ul si tokenul Conversions API." };
  if (!capi?.test_event_code) return { error: "Pune codul de test din Events Manager -> Test events, ca evenimentul sa nu intre in datele reale." };

  const { data: biz } = await createAdminClient().from("businesses").select("slug, custom_domain").eq("id", businessId).maybeSingle();
  if (!biz) return { error: "Magazin negasit" };
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  const r = await trimiteLaMeta({ pixelId, token, testEventCode: capi.test_event_code }, [{
    event_name: "PageView",
    event_time: Math.floor(Date.now() / 1000),
    event_id: `test-${Date.now()}`,
    action_source: "website",
    event_source_url: storeBaseUrl(biz as { slug: string; custom_domain: string | null }),
    user_data: {
      client_user_agent: h.get("user-agent") ?? "Edinio (eveniment de test)",
      ...(isIP(ip) ? { client_ip_address: ip } : {}),
    },
  }]);
  if (!r.ok) return { error: `Meta a refuzat evenimentul de test: ${r.mesaj}` };
  return { success: true, primite: r.primite };
}
