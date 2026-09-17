import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { logError } from "@/lib/error-logger";
import { parseTikTokPixelId, type MarketingConfig } from "@/lib/marketing-config";
import { PLATFORM_ORIGIN } from "@/lib/seo";
import { adresaEAMagazinului } from "@/lib/pixeli/adresa-magazin";
import { trimiteLaTikTok } from "@/lib/tiktok/capi";
import { citesteCerereaTikTok, evenimentTikTokDinBrowser } from "@/lib/tiktok/eveniment-browser";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  EVENIMENTELE DE PALNIE, SI PRIN EVENTS API
  ═══════════════════════════════════════════════════════════════════════════════

  Browserul cheama capatul asta dupa fiecare `ttq.track(...)` de palnie, cu ACELASI `event_id`, numai cand
  magazinul are Events API (vezi `trimiteSiServeruluiTikTok` din `lib/marketing.ts`). TikTok deduplica pe
  `event_source_id` + `event` + `event_id`, si recomanda tocmai perechea: „we recommend advertisers set up
  both TikTok Pixel SDK and Events API to ensure maximum data coverage”.

  ⚠ RASPUNSUL NU ASTEAPTA TIKTOK: 204 imediat, trimiterea dupa raspuns. Aceeasi hotarare ca la Meta.
*/

export const runtime = "nodejs";

/** Magazinul se citeste o data pe minut pe instanta: fiecare vizualizare de produs trece pe aici. */
const MS_CACHE = 60_000;
type Magazin = { slug: string; custom_domain: string | null; businessId: string; pixelId: string; token: string } | null;
const cache = new Map<string, { magazin: Magazin; pana: number }>();

async function magazinul(slug: string): Promise<Magazin> {
  const acum = Date.now();
  const tinut = cache.get(slug);
  if (tinut && tinut.pana > acum) return tinut.magazin;
  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("id, slug, custom_domain").eq("slug", slug).maybeSingle();
  let magazin: Magazin = null;
  if (biz) {
    const { data: s } = await admin.from("store_settings").select("marketing_config, tiktok_capi_config").eq("business_id", biz.id).maybeSingle();
    const mc = (s?.marketing_config ?? null) as MarketingConfig | null;
    const capi = (s?.tiktok_capi_config ?? null) as { access_token?: string } | null;
    const pixelId = parseTikTokPixelId(mc?.tiktok_pixel_id);
    const token = capi?.access_token?.trim();
    if (pixelId && token && mc?.tiktok_capi_activ === true) {
      magazin = { slug: biz.slug, custom_domain: biz.custom_domain, businessId: biz.id, pixelId, token };
    }
  }
  if (cache.size > 500) cache.clear();
  cache.set(slug, { magazin, pana: acum + MS_CACHE });
  return magazin;
}

/** Un refuz al lor se scrie in jurnal o data la zece minute pe magazin, nu la fiecare vizita. */
const ultimulJurnal = new Map<string, number>();

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`tiktok-eveniment:${ip}`, 240, 60_000)) return new NextResponse(null, { status: 429 });

  let corp: unknown;
  try {
    const text = await req.text();
    if (text.length > 16_000) return new NextResponse(null, { status: 413 });
    corp = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const cerere = citesteCerereaTikTok(corp);
  if ("refuz" in cerere) return new NextResponse(null, { status: 400 });

  const magazin = await magazinul(cerere.magazin);
  /* Magazin fara Events API: nu e o eroare a vizitatorului, deci 204, nu 4xx. */
  if (!magazin) return new NextResponse(null, { status: 204 });
  if (!adresaEAMagazinului(cerere.url, magazin, new URL(PLATFORM_ORIGIN).hostname)) {
    return new NextResponse(null, { status: 400 });
  }

  const eveniment = evenimentTikTokDinBrowser(cerere, {
    ip,
    userAgent: req.headers.get("user-agent"),
    ttclid: req.cookies.get("ttclid")?.value,
    ttp: req.cookies.get("_ttp")?.value,
  });
  /* Fara niciun semn despre om (nici `ttclid`, nici `_ttp`, nici IP) nu e nimic de trimis: 204, nu eroare. */
  if ("refuz" in eveniment) return new NextResponse(null, { status: 204 });

  dupaRaspuns(async () => {
    const r = await trimiteLaTikTok({ pixelId: magazin.pixelId, token: magazin.token }, [eveniment]);
    if (r.ok) return;
    const acum = Date.now();
    if ((ultimulJurnal.get(magazin.businessId) ?? 0) > acum - 600_000) return;
    ultimulJurnal.set(magazin.businessId, acum);
    await logError({
      action: "tiktok.capi.eveniment", severity: "warning", businessId: magazin.businessId,
      message: `TikTok a refuzat ${eveniment.event}: ${r.mesaj}`, details: { cod: r.cod, tokenInvalid: r.tokenInvalid, trecator: r.trecator },
    });
  }, "tiktok.capi.eveniment", magazin.businessId);

  return new NextResponse(null, { status: 204 });
}
