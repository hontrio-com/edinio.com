import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { logError } from "@/lib/error-logger";
import { parseMetaPixelId, type MarketingConfig } from "@/lib/marketing-config";
import { PLATFORM_ORIGIN } from "@/lib/seo";
import { trimiteLaMeta } from "@/lib/facebook/capi";
import { citesteCererea, evenimentDinBrowser, adresaEAMagazinului } from "@/lib/facebook/eveniment-browser";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  EVENIMENTELE DE PALNIE, SI PRIN CONVERSIONS API
  ═══════════════════════════════════════════════════════════════════════════════

  Browserul cheama capatul asta dupa fiecare `fbq('track', ...)` de palnie, cu ACELASI `eventID`, numai
  cand magazinul are Conversions API (vezi `trimiteSiServerului` din `lib/marketing.ts`). Meta pastreaza
  un singur eveniment din pereche. Documentatia: „The Conversions API allows you to share website events
  that the Pixel may lose due to network connectivity issues or page loading errors.”

  ⚠ RASPUNSUL NU ASTEAPTA META: 204 imediat, trimiterea dupa raspuns (`dupaRaspuns`). Vizitatorul nu
  plateste in viteza pentru masuratoare.

  ⚠ CE NU FACE: nu primeste `Purchase` (vine de pe server, din comanda) si nu primeste datele omului din
  corp. Vezi `eveniment-browser.ts`.
*/

export const runtime = "nodejs";

/** Magazinul se citeste o data pe minut pe instanta: fiecare vizualizare de produs trece pe aici. */
const MS_CACHE = 60_000;
type Magazin = { slug: string; custom_domain: string | null; businessId: string; pixelId: string; token: string; testEventCode: string | null } | null;
const cache = new Map<string, { magazin: Magazin; pana: number }>();

async function magazinul(slug: string): Promise<Magazin> {
  const acum = Date.now();
  const tinut = cache.get(slug);
  if (tinut && tinut.pana > acum) return tinut.magazin;
  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("id, slug, custom_domain").eq("slug", slug).maybeSingle();
  let magazin: Magazin = null;
  if (biz) {
    const { data: s } = await admin.from("store_settings").select("marketing_config, meta_capi_config").eq("business_id", biz.id).maybeSingle();
    const mc = (s?.marketing_config ?? null) as MarketingConfig | null;
    const capi = (s?.meta_capi_config ?? null) as { access_token?: string; test_event_code?: string } | null;
    const pixelId = parseMetaPixelId(mc?.facebook_pixel_id);
    const token = capi?.access_token?.trim();
    if (pixelId && token && mc?.facebook_capi_activ === true) {
      magazin = {
        slug: biz.slug, custom_domain: biz.custom_domain, businessId: biz.id,
        pixelId, token, testEventCode: capi?.test_event_code?.trim() || null,
      };
    }
  }
  if (cache.size > 500) cache.clear();
  cache.set(slug, { magazin, pana: acum + MS_CACHE });
  return magazin;
}

/** Un refuz al lui Meta se scrie in jurnal o data la zece minute pe magazin, nu la fiecare vizita. */
const ultimulJurnal = new Map<string, number>();

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`meta-eveniment:${ip}`, 240, 60_000)) return new NextResponse(null, { status: 429 });

  let corp: unknown;
  try {
    const text = await req.text();
    if (text.length > 16_000) return new NextResponse(null, { status: 413 });
    corp = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const cerere = citesteCererea(corp);
  if ("refuz" in cerere) return new NextResponse(null, { status: 400 });

  const magazin = await magazinul(cerere.magazin);
  /* Magazin fara Conversions API: nu e o eroare a vizitatorului, deci 204, nu 4xx. */
  if (!magazin) return new NextResponse(null, { status: 204 });
  if (!adresaEAMagazinului(cerere.event_source_url, magazin, new URL(PLATFORM_ORIGIN).hostname)) {
    return new NextResponse(null, { status: 400 });
  }

  const eveniment = evenimentDinBrowser(cerere, {
    ip,
    userAgent: req.headers.get("user-agent"),
    fbp: req.cookies.get("_fbp")?.value,
    fbc: req.cookies.get("_fbc")?.value,
  });
  if ("refuz" in eveniment) return new NextResponse(null, { status: 400 });

  dupaRaspuns(async () => {
    const r = await trimiteLaMeta({ pixelId: magazin.pixelId, token: magazin.token, testEventCode: magazin.testEventCode }, [eveniment]);
    if (r.ok) return;
    const acum = Date.now();
    if ((ultimulJurnal.get(magazin.businessId) ?? 0) > acum - 600_000) return;
    ultimulJurnal.set(magazin.businessId, acum);
    await logError({
      action: "meta.capi.eveniment", severity: "warning", businessId: magazin.businessId,
      message: `Meta a refuzat ${eveniment.event_name}: ${r.mesaj}`, details: { cod: r.cod, subcod: r.subcod, tokenInvalid: r.tokenInvalid },
    });
  }, "meta.capi.eveniment", magazin.businessId);

  return new NextResponse(null, { status: 204 });
}
