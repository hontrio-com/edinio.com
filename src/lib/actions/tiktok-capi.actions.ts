"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTikTokPixelId, type MarketingConfig } from "@/lib/marketing-config";
import { intreabaDespreToken } from "@/lib/tiktok/capi";
import type { ConfigCapiTikTok } from "@/lib/orders/tiktok-comanda";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  TIKTOK EVENTS API DIN PANOU: TOKENUL SI STAREA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ TOKENUL NU SE INTOARCE NICIODATA IN BROWSER. `getTikTokCapiStare` spune doar DACA e salvat. Scrierea se
  face cu service role, dupa ce proprietatea magazinului e dovedita cu clientul utilizatorului.

  ⚠ TIKTOK N-ARE UN CAPAT DE VERIFICARE A TOKENULUI PENTRU UN PIXEL. La Meta, `verificaTokenul` citeste chiar
  pixelul cu tokenul dat, deci un token gresit nu intra in baza. Aici singurul raspuns sigur e `40105`
  („Invalid or incorrect access token”), pe `/user/info/`; orice altceva poate insemna doar ca tokenul e
  facut din Events Manager si n-are drepturi acolo. Deci:
    - `40105`  -> nu se salveaza, cu mesajul lor;
    - restul   -> se salveaza, iar panoul arata ce a raspuns TikTok si spune ca adevarul se vede la prima
                  trimitere (`ultima_eroare`).
  Un refuz inventat ar fi oprit un token bun; o salvare tacuta ar fi ascuns unul rau.
*/

type Rezultat = { success: true; avertisment?: string } | { error: string };

async function magazinulUtilizatorului(businessId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  return biz ? { ok: true } : { error: "Magazin negasit" };
}

async function citesteSetarile(businessId: string) {
  const { data, error } = await createAdminClient()
    .from("store_settings").select("marketing_config, tiktok_capi_config").eq("business_id", businessId).maybeSingle();
  if (error) throw new Error(`Setarile nu s-au putut citi: ${error.message}`);
  return {
    marketing: (data?.marketing_config ?? {}) as MarketingConfig,
    capi: (data?.tiktok_capi_config ?? null) as ConfigCapiTikTok | null,
  };
}

export interface StareTikTokCapi {
  tokenSalvat: boolean;
  /** Evenimentele pleaca de pe server. Tokenul salvat dar stins = Pixel ID-ul s-a schimbat de la salvare. */
  activ: boolean;
  ultimaTrimitereLa: string | null;
  ultimaEroare: string | null;
  ultimaEroareLa: string | null;
}

export async function getTikTokCapiStare(businessId: string): Promise<StareTikTokCapi | { error: string }> {
  const acces = await magazinulUtilizatorului(businessId);
  if ("error" in acces) return acces;
  const { marketing, capi } = await citesteSetarile(businessId);
  return {
    tokenSalvat: !!capi?.access_token?.trim(),
    activ: !!capi?.access_token?.trim() && marketing.tiktok_capi_activ === true,
    ultimaTrimitereLa: capi?.ultima_trimitere_la ?? null,
    ultimaEroare: capi?.ultima_eroare ?? null,
    ultimaEroareLa: capi?.ultima_eroare_la ?? null,
  };
}

export async function saveTikTokCapi(businessId: string, intrare: { token?: string }): Promise<Rezultat> {
  const acces = await magazinulUtilizatorului(businessId);
  if ("error" in acces) return acces;
  const { marketing, capi } = await citesteSetarile(businessId);
  const pixelId = parseTikTokPixelId(marketing.tiktok_pixel_id);
  if (!pixelId) return { error: "Salveaza mai intai Pixel ID-ul: tokenul Events API trimite evenimente in pixelul acela." };

  const tokenNou = (intrare.token ?? "").trim();
  const token = tokenNou || capi?.access_token?.trim() || "";
  if (!token) return { error: "Lipseste tokenul. Il generezi in TikTok Events Manager: pixelul tau -> Settings -> Generate access token." };
  if (tokenNou && (tokenNou.length > 1000 || /\s/.test(tokenNou))) {
    return { error: "Tokenul nu arata a token TikTok. Copiaza-l intreg, fara spatii." };
  }

  let avertisment: string | undefined;
  const raspuns = await intreabaDespreToken(token);
  if (raspuns.stare === "rau") {
    return { error: `TikTok a refuzat tokenul: ${raspuns.mesaj}. Genereaza altul din Events Manager, la pixelul ${pixelId}.` };
  }
  if (raspuns.stare === "nesigur") {
    avertisment = "Tokenul a fost salvat, dar TikTok n-a confirmat: se vede la prima achizitie trimisa.";
  }

  const admin = createAdminClient();
  const configNoua: ConfigCapiTikTok = {
    ...(capi ?? {}),
    access_token: token,
    pixel_id: pixelId,
    /* Un token nou incepe cu starea curata: eroarea veche era a tokenului vechi. */
    ...(tokenNou ? { ultima_eroare: undefined, ultima_eroare_la: undefined } : {}),
  };
  const { error } = await admin.from("store_settings")
    .update({ tiktok_capi_config: configNoua as never, marketing_config: { ...marketing, tiktok_capi_activ: true } as never })
    .eq("business_id", businessId);
  if (error) return { error: `Nu s-a putut salva: ${error.message}` };
  revalidatePath("/dashboard/features/tiktok-pixel");
  return avertisment ? { success: true, avertisment } : { success: true };
}

export async function removeTikTokCapi(businessId: string): Promise<Rezultat> {
  const acces = await magazinulUtilizatorului(businessId);
  if ("error" in acces) return acces;
  const { marketing } = await citesteSetarile(businessId);
  const { tiktok_capi_activ: _stins, ...restul } = marketing;
  void _stins;
  const { error } = await createAdminClient().from("store_settings")
    .update({ tiktok_capi_config: null as never, marketing_config: restul as never })
    .eq("business_id", businessId);
  if (error) return { error: `Nu s-a putut sterge: ${error.message}` };
  revalidatePath("/dashboard/features/tiktok-pixel");
  return { success: true };
}
