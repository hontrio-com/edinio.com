"use client";

import { useEffect, useState } from "react";
import {
  PREVIEW_MESSAGE,
  SECTION_ATTR,
  isPreviewMessage,
} from "@/lib/storefront/design/preview-protocol";
import { primaCutie } from "@/lib/storefront/design/scroll-target";
import type { ResolvedStyle, StoreDesign } from "@/lib/storefront/design/types";

/**
 * Designul efectiv al paginii: cel salvat, sau cel trimis live de editor.
 *
 * Cand magazinul e deschis in iframe-ul editorului de DESIGN, fiecare schimbare
 * de varianta, de ordine sau de culoare ajunge aici prin `postMessage` si se
 * aplica imediat. Nu se salveaza nimic si nu se reincarca pagina — catalogul e
 * deja in browser.
 *
 * ⚠ `esteEditorDesign`, NU „e deschisa cu `?preview=1`". Steagul acela il pune
 * si „Editeaza magazinul", un iframe simplu care nu asculta niciun mesaj. Legat
 * de el, hook-ul asta ii aplica blocarea de clicuri de mai jos si ii transforma
 * previzualizarea intr-o poza pe care nu se poate apasa nimic — nici pe un
 * produs, nici pe cos, nici pe meniu. Vezi `preview-protocol.ts`.
 *
 * In rest hook-ul nu face nimic: returneaza ce a primit.
 */
export function useDesignPreview(
  initialDesign: StoreDesign,
  initialStyle: ResolvedStyle,
  esteEditorDesign: boolean,
): { design: StoreDesign; style: ResolvedStyle } {
  const [override, setOverride] = useState<{ design: StoreDesign; style: ResolvedStyle } | null>(null);

  useEffect(() => {
    if (!esteEditorDesign) return;

    function onMessage(event: MessageEvent) {
      // Acelasi origin, mereu: editorul si magazinul stau pe acelasi domeniu.
      if (event.origin !== window.location.origin) return;
      if (!isPreviewMessage(event.data)) return;

      const msg = event.data;
      if (msg[PREVIEW_MESSAGE] === "design") {
        setOverride({ design: msg.design, style: msg.style });
      } else if (msg[PREVIEW_MESSAGE] === "scrollTo") {
        // `primaCutie`, nu direct elementul: invelisul de sectiune are
        // `display: contents` si nu genereaza cutie, deci `scrollIntoView()` pe
        // el returneaza imediat, fara sa deruleze nimic. Vezi `scroll-target.ts`.
        primaCutie(document.querySelector(`[${SECTION_ATTR}="${CSS.escape(msg.sectionId)}"]`))
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    /*
     * TOT ce se poate apasa se opreste aici. Previzualizarea e o IMAGINE a
     * magazinului, nu magazinul.
     *
     * Lasat sa treaca, un click ducea iframe-ul pe alta pagina, si acolo nu mai
     * exista nici design trimis prin postMessage, nici marcaje de sectiune:
     * legatura cu editorul se rupea definitiv, iar previzualizarea ramanea
     * inghetata pe politica de confidentialitate pana la reincarcarea ecranului.
     *
     * ⚠ Blocarea nu se mai limiteaza la interiorul sectiunilor. Exact elementele
     * din AFARA lor erau iesirile ramase deschise — bannerul de cookie-uri,
     * butonul flotant de telefon, bara de cos de pe mobil — si tocmai ele
     * navigheaza. Aici nu se pierde nimic: in editorul de design nu exista nimic
     * de apasat cu folos, doar sectiuni de ales.
     */
    function opreste(event: Event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Click pe o sectiune -> selectie in lista din editor.
    function onClick(event: MouseEvent) {
      opreste(event);
      const id = (event.target as HTMLElement | null)
        ?.closest(`[${SECTION_ATTR}]`)
        ?.getAttribute(SECTION_ATTR);
      if (!id) return;
      window.parent.postMessage({ [PREVIEW_MESSAGE]: "select", sectionId: id }, window.location.origin);
    }

    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    // Enter intr-o caseta de cautare sau de newsletter trimite formularul, si
    // asta navigheaza fara sa treaca vreodata printr-un click.
    document.addEventListener("submit", opreste, true);
    window.parent.postMessage({ [PREVIEW_MESSAGE]: "ready" }, window.location.origin);

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", opreste, true);
    };
  }, [esteEditorDesign]);

  return override ?? { design: initialDesign, style: initialStyle };
}
