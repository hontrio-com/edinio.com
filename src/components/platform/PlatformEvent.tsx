"use client";

import { useEffect } from "react";
import { platformFbq } from "./PlatformMetaPixel";
import { platformTtq } from "./PlatformTikTokPixel";

/** Fires a platform Meta Pixel event on mount. Renders nothing. */
export function PlatformEvent({ event, data }: { event: string; data?: Record<string, unknown> }) {
  useEffect(() => {
    platformFbq(event, data);
    platformTtq(event, data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
