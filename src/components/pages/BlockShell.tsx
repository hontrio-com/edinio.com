import type { ReactNode } from "react";
import type { BlockStyle } from "@/lib/pages/blocks.types";

const PAD: Record<NonNullable<BlockStyle["padding"]>, string> = {
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
 * Shared wrapper for content blocks. Applies padding, optional background color,
 * max width and text alignment from the block's `style`. Hero / spacer / divider
 * manage their own spacing and skip this shell.
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
  const pad = PAD[style?.padding ?? "md"];
  const width = WIDTH[style?.width ?? "container"];
  const align = ALIGN[style?.align ?? "left"];
  return (
    <section className={pad} style={style?.bg ? { backgroundColor: style.bg } : undefined}>
      <div className={`mx-auto w-full px-4 ${width} ${align} ${innerClassName ?? ""}`}>{children}</div>
    </section>
  );
}
