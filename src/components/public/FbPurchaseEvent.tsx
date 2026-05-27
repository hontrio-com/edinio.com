"use client";

import { useEffect } from "react";
import { fbTrack, ttqTrack, gtagEvent } from "@/lib/marketing";

export function FbPurchaseEvent({ orderId, total }: { orderId: string; total: number }) {
  useEffect(() => {
    fbTrack("Purchase", { value: total, currency: "RON", order_id: orderId });
    ttqTrack("CompletePayment", { value: total, currency: "RON", order_id: orderId });
    gtagEvent("purchase", { currency: "RON", value: total, transaction_id: orderId });
  }, [orderId, total]);

  return null;
}
