import type { CSSProperties, ReactNode } from "react";
import type { BlockStyle } from "@/lib/pages/blocks.types";

const PAD: Record<string, string> = {
  none: "py-0",
  sm: "py-4",
  md: "py-8",
  lg: "py-14",
  xl: "py-20",
};
const WIDTH: Record<NonNullable<BlockStyle["width"]>, string> = {
  narrow: "max-w-3xl",
  container: "max-w-6xl",
  full: "max-w-none",
};
const ALIGN: Record<NonNullable<BlockStyle["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/**
 * Shared wrapper for content blocks. Applies padding (preset or custom px),
 * optional background color, max width, text alignment and optional text color
 * from the block's `style`. Hero / spacer / divider manage their own spacing.
 */
export function BlockShell({
  style,
  children,
  innerClassName,
}: {
  style?: BlockStyle;
  children: ReactNode;
  innerClassName?: string;
}) {
  const isCustomPad = style?.padding === "custom";
  const pad = isCustomPad ? "" : (PAD[style?.padding ?? "md"] ?? PAD.md);
  const width = WIDTH[style?.width ?? "container"];
  const align = ALIGN[style?.align ?? "left"];

  const sectionStyle: CSSProperties = {};
  if (style?.bg) sectionStyle.backgroundColor = style.bg;
  if (isCustomPad) {
    const p = Math.max(0, style?.paddingCustom ?? 32);
    sectionStyle.paddingTop = p;
    sectionStyle.paddingBottom = p;
  }

  const innerStyle: CSSProperties | undefined = style?.textColor ? { color: style.textColor } : undefined;

  return (
    <section className={pad} style={Object.keys(sectionStyle).length ? sectionStyle : undefined}>
      <div className={`mx-auto w-full px-4 ${width} ${align} ${innerClassName ?? ""}`} style={innerStyle}>
        {children}
      </div>
    </section>
  );
}
