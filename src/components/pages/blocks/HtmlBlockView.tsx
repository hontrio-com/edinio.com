import { BlockShell } from "../BlockShell";
import { SandboxEmbed } from "./SandboxEmbed";
import { sanitizeCss } from "@/lib/pages/sanitize-css";
import { cereIzolare, inchideCss } from "@/lib/pages/cod-personalizat";
import type { HtmlBlock } from "@/lib/pages/blocks.types";

/**
 * Custom-code block. Regimul il hotaraste `cereIzolare` (vezi
 * `lib/pages/cod-personalizat.ts`):
 *  - cod activ (JS, `<script>`, formulare, `on...=`): cadru izolat (SandboxEmbed);
 *  - doar HTML/CSS: in pagina, cu HTML-ul curatat pe server si CSS-ul inchis in bloc.
 *
 * ⚠⚠ IN EDITOR, MEREU IZOLAT (25.09.2026). Previzualizarea punea HTML-ul
 * NECURATAT direct in panou („e codul proprietarului”). Dar panoul il deschide
 * si un administrator care intra in contul comerciantului: un `<img onerror>`
 * ar fi rulat atunci in sesiunea administratorului. In cadrul izolat nu poate
 * atinge nimic.
 *
 * A EXISTAT si un regim „raw aprobat de admin”, care injecta HTML si `<script>`
 * nefiltrate direct in pagina publica. ELIMINAT (04.08.2026); nu se readauga.
 */
export function HtmlBlockView({ block, preview }: { block: HtmlBlock; preview?: boolean }) {
  if (preview || cereIzolare(block.html, block.js)) {
    return (
      <BlockShell style={block.style}>
        <SandboxEmbed html={block.html} css={block.css} js={block.js} />
      </BlockShell>
    );
  }

  const scop = `[data-cod="${block.id.replace(/[^\w-]/g, "")}"]`;
  const css = block.css ? sanitizeCss(inchideCss(block.css, scop)) : "";
  return (
    <BlockShell style={block.style}>
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <div data-cod={block.id.replace(/[^\w-]/g, "")} dangerouslySetInnerHTML={{ __html: block.html ?? "" }} />
    </BlockShell>
  );
}
