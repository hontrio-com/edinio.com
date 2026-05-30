"use client";

import { useEffect, useRef } from "react";

interface Props {
  webmSrc: string;
  className?: string;
}

export function TransparentVideo({ webmSrc, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const needsCanvasRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Check if browser supports WebM alpha (Chrome/Firefox do, Safari doesn't)
    const supportsWebMAlpha = (() => {
      const v = document.createElement("video");
      return v.canPlayType('video/webm; codecs="vp9"') === "probably";
    })();

    if (supportsWebMAlpha) {
      // Browser supports WebM alpha natively, just show the video
      video.style.display = "";
      canvas.style.display = "none";
      return;
    }

    // Safari/iOS fallback: render to canvas and remove black background
    needsCanvasRef.current = true;
    video.style.position = "absolute";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    canvas.style.display = "";

    function render() {
      if (!video || !canvas || video.paused || video.ended) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = frame.data;

      // Make dark pixels transparent (chroma-key black)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = r * 0.299 + g * 0.587 + b * 0.114;

        if (brightness < 30) {
          // Near-black: fully transparent
          data[i + 3] = 0;
        } else if (brightness < 60) {
          // Dark: fade out gradually
          data[i + 3] = Math.round(((brightness - 30) / 30) * 255);
        }
      }

      ctx.putImageData(frame, 0, 0);
      rafRef.current = requestAnimationFrame(render);
    }

    video.addEventListener("play", () => {
      rafRef.current = requestAnimationFrame(render);
    });

    if (!video.paused) {
      rafRef.current = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className={className} style={{ position: "relative" }}>
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-auto"
      >
        <source src={webmSrc} type="video/webm" />
      </video>
      <canvas
        ref={canvasRef}
        className="w-full h-auto"
        style={{ display: "none" }}
      />
    </div>
  );
}
