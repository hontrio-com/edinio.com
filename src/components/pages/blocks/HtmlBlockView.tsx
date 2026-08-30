import { BlockShell } from "../BlockShell";
import { SandboxEmbed } from "./SandboxEmbed";
import { sanitizeCss } from "@/lib/pages/sanitize-css";
import type { HtmlBlock } from "@/lib/pages/blocks.types";

/**
 * Custom-code block with two render modes:
 *  - js present (any user): isolated in a sandboxed iframe (SandboxEmbed).
 *  - safe HTML/CSS only:     injected inline (html is sanitized upstream for the
 *                            public route; in the editor it is the owner's own input).
 *
 * A EXISTAT si un al treilea regim, „raw aprobat de admin", care injecta HTML si
 * `<script>` nefiltrate direct in pagina publica. A fost ELIMINAT (04.08.2026):
 * poarta lui era `users_profile.role`, o coloana scriibila de orice utilizator,
 * deci un singur UPDATE transforma constructorul de pagini intr-un XSS stocat
 * catre toti cumparatorii magazinului. Codul personalizat ramane posibil, dar
 * numai prin SandboxEmbed. NU readauga aceasta ramura: chiar si HTML „doar
 * markup" executa `<img onerror=...>` cand e pus prin innerHTML.
 */
export function HtmlBlockView({ block }: { block: HtmlBlock }) {
  const hasJs = (block.js ?? "").trim().length > 0;

  if (hasJs) {
    return (
      <BlockShell style={block.style}>
        <SandboxEmbed html={block.html} css={block.css} js={block.js} />
      </BlockShell>
    );
  }

  return (
    <BlockShell style={block.style}>
      {block.css ? <style dangerouslySetInnerHTML={{ __html: sanitizeCss(block.css) }} /> : null}
      <div dangerouslySetInnerHTML={{ __html: block.html ?? "" }} />
    </BlockShell>
  );
}
