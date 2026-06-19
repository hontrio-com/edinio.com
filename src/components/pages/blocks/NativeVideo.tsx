"use client";

import { useEffect, useRef } from "react";

/**
 * Player for self-hosted (uploaded) videos. A small client leaf so autoplay
 * works reliably: browsers only allow autoplay when the video is muted, and
 * React does not dependably reflect the `muted` attribute in server HTML — so we
 * also force the muted *property* via a ref and kick off playback on mount.
 */
export function NativeVideo({
  src,
  poster,
  controls = true,
  autoplay = false,
  loop = false,
  muted = false,
}: {
  src: string;
  poster?: string;
  controls?: boolean;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const mustMute = muted || autoplay;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = mustMute;
    if (autoplay) {
      // Autoplay can still be refused (e.g. data-saver); ignore the rejection.
      el.play().catch(() => {});
    }
  }, [mustMute, autoplay, src]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      controls={controls}
      autoPlay={autoplay}
      loop={loop}
      muted={mustMute}
      playsInline
      preload={autoplay ? "auto" : "metadata"}
      className="absolute inset-0 w-full h-full object-contain"
    />
  );
}
