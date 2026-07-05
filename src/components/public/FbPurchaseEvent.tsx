"use client";

import { useEffect } from "react";
import {
  fbTrack, ttqTrack, gtagEvent, gtagRaw,
  fbAdvancedMatch, ttqIdentify, splitName, type PixelUser,
} from "@/lib/marketing";

interface Props {
  orderId: string;
  total: number;
  googleTagId?: string;
  googleAdsConversionLabel?: string;
  fbPixelId?: string;
  ttPixelId?: string;
  customer?: PixelUser & { name?: string | null };
  numItems?: number;
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
 * - Advanced Matching (hashed email/phone/name) is sent right before the
 *   conversion to lift Event Match Quality.
 */
export function FbPurchaseEvent({
  orderId, total, googleTagId, googleAdsConversionLabel, fbPixelId, ttPixelId, customer, numItems,
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
    const items = Math.max(1, numItems || 1);

    // Advanced Matching (only meaningful with PII; helpers no-op otherwise).
    const user: PixelUser | undefined = customer && {
      email: customer.email,
      phone: customer.phone,
      country: customer.country,
      ...splitName(customer.name),
    };
    if (fbPixelId && user) fbAdvancedMatch(fbPixelId, user);
    if (ttPixelId && user) ttqIdentify(user);

    // Meta — Purchase (eventID = orderId for CAPI dedup).
    fbTrack("Purchase", { value, currency: "RON", num_items: items }, { eventID: orderId });

    // TikTok — on COD-heavy markets (RO) the confirmed order IS the conversion,
    // so we fire both the order and the payment intent, sharing one event_id.
    ttqTrack("PlaceAnOrder", { value, currency: "RON" }, { eventID: orderId });
    ttqTrack("CompletePayment", { value, currency: "RON" }, { eventID: orderId });

    // GA4 — purchase (transaction_id doubles as the dedup key).
    gtagEvent("purchase", { currency: "RON", value, transaction_id: orderId });

    // Google Ads — conversion event (needs the conversion label).
    if (googleTagId && googleAdsConversionLabel) {
      gtagRaw("event", "conversion", {
        send_to: `${googleTagId}/${googleAdsConversionLabel}`,
        value,
        currency: "RON",
        transaction_id: orderId,
      });
    }
  }, [orderId, total, googleTagId, googleAdsConversionLabel, fbPixelId, ttPixelId, customer, numItems]);

  return null;
}
