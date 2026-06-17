"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Renders untrusted custom HTML/CSS/JS inside a sandboxed <iframe srcdoc>.
 *
 * The sandbox grants `allow-scripts` + `allow-popups` but deliberately NOT
 * `allow-same-origin`, so the embed runs in an opaque origin: it cannot read the
 * store's cookies, localStorage, DOM or hijack the cart/checkout. The iframe
 * auto-resizes to its content height via a nonce-tagged postMessage handshake.
 */
export function SandboxEmbed({
  html,
  css,
  js,
  minHeight = 60,
}: {
  html?: string;
  css?: string;
  js?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const nonce = useId();
  const [height, setHeight] = useState(minHeight);

  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>html,body{margin:0;padding:0;}body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}${css ?? ""}</style>
</head><body>${html ?? ""}
<script>(function(){
function post(){try{var h=Math.max(document.documentElement.scrollHeight||0,document.body.scrollHeight||0);parent.postMessage({__edinioEmbed:'${nonce}',height:h},'*');}catch(e){}}
window.addEventListener('load',post);window.addEventListener('resize',post);
if(window.ResizeObserver){try{new ResizeObserver(post).observe(document.body);}catch(e){}}
setTimeout(post,60);setTimeout(post,300);setTimeout(post,1200);
})();<\/script>
${js ? `<script>try{${js}}catch(e){if(window.console)console.error(e);}<\/script>` : ""}
</body></html>`;

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const data = e.data as { __edinioEmbed?: string; height?: number } | null;
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      if (!data || data.__edinioEmbed !== nonce) return;
      const h = Number(data.height);
      if (h > 0) setHeight(Math.max(minHeight, Math.ceil(h)));
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [minHeight, nonce]);

  return (
    <iframe
      ref={ref}
      title="Continut personalizat"
      sandbox="allow-scripts allow-popups allow-forms"
      srcDoc={srcDoc}
      className="w-full block"
      style={{ height, border: 0 }}
      scrolling="no"
    />
  );
}
