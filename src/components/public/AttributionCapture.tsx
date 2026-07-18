"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/storefront/attribution";

// Records where a storefront visit came from (utm / referrer / ad click id), so
// the order carries its origin. First-party only — runs once per full page load.
export function AttributionCapture() {
  useEffect(() => { captureAttribution(); }, []);
  return null;
}
