"use client";

import { useEffect } from "react";
import { platformFbq } from "./PlatformMetaPixel";

/** Fires a platform Meta Pixel event on mount. Renders nothing. */
export function PlatformEvent({ event, data }: { event: string; data?: Record<string, unknown> }) {
  useEffect(() => {
    platformFbq(event, data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
