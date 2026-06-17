import { BlockShell } from "../BlockShell";
import { SandboxEmbed } from "./SandboxEmbed";
import { sanitizeCss } from "@/lib/pages/sanitize-css";
import type { HtmlBlock } from "@/lib/pages/blocks.types";

/**
 * Custom-code block with three render modes:
 *  - raw  (admin-approved): injected directly into the page DOM.
 *  - js present (any user): isolated in a sandboxed iframe (SandboxEmbed).
 *  - safe HTML/CSS only:     injected inline (html is sanitized upstream for the
 *                            public route; in the editor it is the owner's own input).
 */
export function HtmlBlockView({ block }: { block: HtmlBlock }) {
  const hasJs = (block.js ?? "").trim().length > 0;

  if (block.raw && block.rawApprovedBy) {
    return (
      <BlockShell style={block.style}>
        {block.css ? <style dangerouslySetInnerHTML={{ __html: sanitizeCss(block.css) }} /> : null}
        <div dangerouslySetInnerHTML={{ __html: block.html ?? "" }} />
        {block.js ? <script dangerouslySetInnerHTML={{ __html: block.js }} /> : null}
      </BlockShell>
    );
  }

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
