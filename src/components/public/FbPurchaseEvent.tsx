"use client";

import { useEffect } from "react";
import { fbTrack, ttqTrack, gtagEvent, gtagRaw } from "@/lib/marketing";
import type { ContinutPixel } from "@/lib/facebook/pixel-continut";
import type { ContinutTikTok } from "@/lib/tiktok/continut";
import { conversieCumparare } from "@/lib/google-ads/conversie";

interface Props {
  orderId: string;
  total: number;
  googleTagId?: string;
  googleAdsConversionLabel?: string;
  fbPixelId?: string;
  ttPixelId?: string;
  numItems?: number;
  items?: { item_id?: string; item_name: string; price: number; quantity: number }[];
  /** Valorile GA4 (fara transport si taxe, dupa documentatie). Lipsa lor = totalul, ca inainte. */
  ga4?: { value: number; shipping: number; tax: number };
  /**
   * Continutul pentru Meta, cu ID-urile din CATALOG (ale variantelor), rezolvate pe server. Lipsa lui = ID-urile
   * produselor, ca inainte.
   */
  continutMeta?: ContinutPixel;
  /** Continutul pentru TikTok, cu aceleasi ID-uri de catalog. Lipsa lui = ID-urile produselor, ca inainte. */
  continutTikTok?: ContinutTikTok;
  /** ID-ul de conversie Google Ads (`AW-…`). Fara el nu pleaca nicio conversie Ads. */
  googleAdsConversionId?: string;
  /**
   * Datele omului pentru enhanced conversions, HASH-UITE pe server (`sha256_email_address`,
   * `sha256_phone_number`). Se pun cu `gtag('set', 'user_data', …)` INAINTEA conversiei.
   */
  utilizatorGoogle?: { sha256_email_address?: string; sha256_phone_number?: string };
}

/**
 * Fires the purchase conversion on the confirmation page across every pixel.
 *
 * Robustness notes:
 * - Trackers go through the shared queue (src/lib/marketing.ts): the pixel
 *   scripts load lazily behind the consent gate, so an effect that runs before
 *   they exist would otherwise drop the event. Queued calls also mean the
 *   conversion only actually fires once a pixel loads — i.e. under consent (or
 *   when the merchant disabled the banner), which is the correct GDPR behaviour.
 * - `eventID = orderId` gives Pixel↔server (CAPI/Events API) deduplication and,
 *   with the localStorage guard below, prevents a refresh from double-counting.
 * - Potrivirea avansata NU mai pleaca de aici: la amandoua pixelele, datele omului se hash-uiesc pe server
 *   si intra in codul de baza (`window.__edinioAM` la Meta, `window.__edinioTTAM` la TikTok), inaintea
 *   oricarui eveniment. Vezi `FacebookPixel` si `TikTokPixel`.
 */
export function FbPurchaseEvent({
  orderId, total, googleTagId, googleAdsConversionId, googleAdsConversionLabel, utilizatorGoogle,
  fbPixelId, ttPixelId, numItems, items, ga4, continutMeta, continutTikTok,
}: Props) {
  useEffect(() => {
    if (!orderId) return;

    // Dedup: never fire the same order's conversion twice (refresh / re-mount).
    const key = `edinio_purch_${orderId}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, String(Date.now()));
    } catch { /* storage blocked — fall through, eventID still dedups server-side */ }

    const value = Number(total) || 0;
    const line = items ?? [];
    const itemCount = Math.max(1, numItems || line.reduce((s, i) => s + (i.quantity || 1), 0) || 1);

    // Per-item payloads (GA4 / Meta / TikTok shapes). Item-level revenue and the
    // product reports depend on these — without them GA4 Monetization stays empty.
    const gaItems = line.map((i) => ({ item_id: i.item_id, item_name: i.item_name, price: i.price, quantity: i.quantity }));
    const fbContentIds = continutMeta?.content_ids ?? line.map((i) => i.item_id).filter((x): x is string => !!x);
    const fbContents = continutMeta?.contents ?? line.map((i) => ({ id: i.item_id, quantity: i.quantity, item_price: i.price }));
    /* ⚠ Fara `content_type` cand cosul amesteca variante cunoscute cu grupuri: vezi `continutPixel`. */
    const fbContentType = continutMeta ? continutMeta.content_type : "product";
    /*
     * ⚠ `content_type` STA LANGA EVENIMENT, nu in fiecare articol: asa arata exemplul lor. Inainte era pus
     * inauntru, unde TikTok nu-l citeste. Vezi `lib/tiktok/continut.ts`.
     */
    const ttContents = continutTikTok?.contents
      ?? line.flatMap((i) => (i.item_id ? [{ content_id: i.item_id, content_name: i.item_name, price: i.price, quantity: i.quantity }] : []));
    const ttContentIds = continutTikTok?.content_ids ?? line.map((i) => i.item_id).filter((x): x is string => !!x);
    const ttContentType = continutTikTok ? continutTikTok.content_type : "product";

    // Meta — Purchase (eventID = orderId for CAPI dedup).
    fbTrack("Purchase", {
      value, currency: "RON", num_items: itemCount,
      ...(fbContentIds.length ? { ...(fbContentType ? { content_type: fbContentType } : {}), content_ids: fbContentIds, contents: fbContents } : {}),
    }, { eventID: orderId });

    /*
     * ⚠ TikTok: UN SINGUR `Purchase` (18.09.2026). Trimiteam `PlaceAnOrder` SI `CompletePayment`, adica doua
     * conversii pe aceeasi comanda, iar lista lor de azi (18 evenimente web) n-are niciunul din cele doua
     * nume: plata incheiata e `Purchase`, cu acelasi obiectiv de optimizare (`SHOPPING`).
     */
    ttqTrack("Purchase", {
      value, currency: "RON", num_items: itemCount,
      ...(ttContentIds.length ? { ...(ttContentType ? { content_type: ttContentType } : {}), content_ids: ttContentIds, contents: ttContents } : {}),
    }, { eventID: orderId });

    // GA4 — purchase with items[] (item-level revenue + Monetization reports).
    /*
      ⚠ `value` FARA transport si taxe, `shipping` si `tax` separat: asa cere documentatia GA4 la
      `purchase`, si asa trimite si serverul (`valoriGa4`). Meta, TikTok si Google Ads raman pe total:
      hotararea din 17.09.2026 priveste doar GA4.
    */
    gtagEvent("purchase", {
      currency: "RON", transaction_id: orderId,
      ...(ga4 ? { value: ga4.value, shipping: ga4.shipping, tax: ga4.tax } : { value }),
      ...(gaItems.length ? { items: gaItems } : {}),
    });

    /*
     * ⚠ ENHANCED CONVERSIONS, INAINTEA CONVERSIEI. Documentatia: „Configure and add the following script on
     * your conversion page where the Google Ads event snippet is installed”, iar `set` trebuie sa apuce sa
     * ruleze inaintea evenimentului. Valorile sunt deja hash-uite pe server: vezi `lib/google-ads/date-client.ts`.
     */
    if (utilizatorGoogle && (utilizatorGoogle.sha256_email_address || utilizatorGoogle.sha256_phone_number)) {
      gtagRaw("set", "user_data", utilizatorGoogle);
    }

    /*
     * ⚠ Conversia pleaca la ID-ul `AW-…`, nu la tagul Google al magazinului (care poate fi un GA4). Forma o
     * hotaraste `conversieCumparare`, care intoarce `null` cand lipseste ceva: atunci nu se trimite nimic.
     */
    const conversie = conversieCumparare(googleAdsConversionId ?? googleTagId, googleAdsConversionLabel, {
      orderId, valoare: value, moneda: "RON",
    });
    if (conversie) gtagRaw("event", "conversion", conversie);
  }, [orderId, total, googleTagId, googleAdsConversionId, googleAdsConversionLabel, utilizatorGoogle, fbPixelId, ttPixelId, numItems, items, ga4, continutMeta, continutTikTok]);

  return null;
}
