"use client";

import { useEffect } from "react";
import { fbTrack, ttqTrack, gtagEvent } from "@/lib/marketing";

interface Props {
  orderId: string;
  total: number;
  googleTagId?: string;
  googleAdsConversionLabel?: string;
}

export function FbPurchaseEvent({ orderId, total, googleTagId, googleAdsConversionLabel }: Props) {
  useEffect(() => {
    fbTrack("Purchase", { value: total, currency: "RON", order_id: orderId });
    ttqTrack("CompletePayment", { value: total, currency: "RON", order_id: orderId });
    gtagEvent("purchase", { currency: "RON", value: total, transaction_id: orderId });

    // Google Ads conversion event — requires Conversion Label
    if (googleTagId && googleAdsConversionLabel) {
      if (typeof window === "undefined") return;
      const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
      if (typeof gtag === "function") {
        gtag("event", "conversion", {
          send_to: `${googleTagId}/${googleAdsConversionLabel}`,
          value: total,
          currency: "RON",
          transaction_id: orderId,
        });
      }
    }
  }, [orderId, total, googleTagId, googleAdsConversionLabel]);

  return null;
}
