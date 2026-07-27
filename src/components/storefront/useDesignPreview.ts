"use client";

import { useEffect, useState } from "react";
import {
  PREVIEW_MESSAGE,
  SECTION_ATTR,
  isPreviewMessage,
} from "@/lib/storefront/design/preview-protocol";
import type { ResolvedStyle, StoreDesign } from "@/lib/storefront/design/types";

/**
 * Designul efectiv al paginii: cel salvat, sau cel trimis live de editor.
 *
 * Cand magazinul e deschis in iframe-ul editorului (`?preview=1`), fiecare
 * schimbare de varianta, de ordine sau de culoare ajunge aici prin `postMessage`
 * si se aplica imediat. Nu se salveaza nimic si nu se reincarca pagina —
 * catalogul e deja in browser.
 *
 * In afara preview-ului hook-ul nu face nimic: returneaza ce a primit.
 */
export function useDesignPreview(
  initialDesign: StoreDesign,
  initialStyle: ResolvedStyle,
  enabled: boolean,
): { design: StoreDesign; style: ResolvedStyle } {
  const [override, setOverride] = useState<{ design: StoreDesign; style: ResolvedStyle } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function onMessage(event: MessageEvent) {
      // Acelasi origin, mereu: editorul si magazinul stau pe acelasi domeniu.
      if (event.origin !== window.location.origin) return;
      if (!isPreviewMessage(event.data)) return;

      const msg = event.data;
      if (msg[PREVIEW_MESSAGE] === "design") {
        setOverride({ design: msg.design, style: msg.style });
      } else if (msg[PREVIEW_MESSAGE] === "scrollTo") {
        document
          .querySelector(`[${SECTION_ATTR}="${CSS.escape(msg.sectionId)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    // Click pe o sectiune in preview -> selectie in lista din editor.
    //
    // Clicul se OPRESTE aici: previzualizarea e o imagine a magazinului, nu
    // magazinul. Lasat sa treaca, un link din header ducea iframe-ul pe alta
    // pagina, iar legatura cu editorul se rupea definitiv — previzualizarea
    // ramanea inghetata pana la reincarcarea ecranului.
    function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest(`[${SECTION_ATTR}]`);
      const id = target?.getAttribute(SECTION_ATTR);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      window.parent.postMessage({ [PREVIEW_MESSAGE]: "select", sectionId: id }, window.location.origin);
    }

    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    window.parent.postMessage({ [PREVIEW_MESSAGE]: "ready" }, window.location.origin);

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
    };
  }, [enabled]);

  return override ?? { design: initialDesign, style: initialStyle };
}
