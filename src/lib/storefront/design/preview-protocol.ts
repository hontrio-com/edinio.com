import type { ResolvedStyle, StoreDesign } from "./types";

/**
 * Protocolul dintre editor si preview-ul din iframe.
 *
 * Editorul si magazinul stau pe aceeasi origine (`proxy.ts` sare peste
 * redirectarile de domeniu cand vede `?preview=1`, tocmai ca iframe-ul sa nu fie
 * blocat de `X-Frame-Options`). Comunica prin `postMessage`, nu prin reincarcare:
 * catalogul e deja in browser, deci o schimbare de varianta sau de culoare se
 * vede instant, fara sa se salveze nimic.
 *
 * Ambele capete verifica originea. Mesajele poarta un marcaj propriu ca sa nu se
 * incurce cu ce mai trimit extensiile de browser sau alte biblioteci.
 */

export const PREVIEW_MESSAGE = "__edinioDesign";

/** Editor -> preview: designul de randat acum. */
export interface PreviewDesignMessage {
  [PREVIEW_MESSAGE]: "design";
  design: StoreDesign;
  style: ResolvedStyle;
}

/** Editor -> preview: adu sectiunea in dreptul ochilor. */
export interface PreviewScrollMessage {
  [PREVIEW_MESSAGE]: "scrollTo";
  sectionId: string;
}

/** Preview -> editor: sunt montat, trimite-mi designul curent. */
export interface PreviewReadyMessage {
  [PREVIEW_MESSAGE]: "ready";
}

/** Preview -> editor: vizitatorul a dat click pe o sectiune. */
export interface PreviewSelectMessage {
  [PREVIEW_MESSAGE]: "select";
  sectionId: string;
}

export type PreviewMessage =
  | PreviewDesignMessage
  | PreviewScrollMessage
  | PreviewReadyMessage
  | PreviewSelectMessage;

export function isPreviewMessage(data: unknown): data is PreviewMessage {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>)[PREVIEW_MESSAGE] === "string"
  );
}

/** Atributul pus pe fiecare sectiune randata, ca preview-ul sa stie ce s-a atins. */
export const SECTION_ATTR = "data-st-section";
