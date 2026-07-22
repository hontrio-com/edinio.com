import type { Block, ColumnsBlock, ColumnItem } from "./blocks.types";
import { newBlockId } from "./blocks.types";

/**
 * Pure tree helpers for the custom-page block model. Shared by the editor
 * (PageBuilder), the public sanitizer (prepare-blocks) and the server actions.
 *
 * A page is a flat list of blocks with ONE level of nesting: a `columns` block
 * can hold child blocks per column, in `items[i].blocks`. These helpers walk and
 * immutably mutate that tree by block id (ids are globally unique).
 */

/**
 * A columns block is "flexible" (freely composed nested blocks) when at least
 * one of its column items carries a `blocks` array. Otherwise it is a "classic"
 * columns block using the flat heading/html/image/button fields (legacy pages).
 */
export function isFlexibleColumns(block: ColumnsBlock): boolean {
  return (block.items ?? []).some((it) => Array.isArray(it.blocks));
}

/** Width-ratio presets (single row). Kept here so editor + renderer agree. */
const TPL_FR: Record<string, string> = {
  "1-1": "1fr 1fr", "1-2": "1fr 2fr", "2-1": "2fr 1fr",
  "1-1-1": "1fr 1fr 1fr", "2-1-1": "2fr 1fr 1fr", "1-2-1": "1fr 2fr 1fr", "1-1-2": "1fr 1fr 2fr",
};

/** grid-template-columns for a given per-row count + optional width-ratio template. */
export function gridTemplateFor(perRow: number, template?: string): string {
  const fr = TPL_FR[template ?? ""];
  // A ratio template only applies when its track count matches the row width.
  if (fr && fr.split(" ").length === perRow) return fr;
  return `repeat(${Math.max(1, perRow)}, minmax(0, 1fr))`;
}

/** Cells per row (grid track count) for a columns block. */
export function columnsPerRow(block: ColumnsBlock): number {
  if (block.perRow && block.perRow > 0) return block.perRow;
  const fr = TPL_FR[block.template ?? ""];
  if (fr) return fr.split(" ").length; // legacy blocks: infer from the ratio template
  return block.count ?? 2;
}

/** Full grid-template-columns string for a columns block (ratios or an equal grid). */
export function columnsGridTemplate(block: ColumnsBlock): string {
  return gridTemplateFor(columnsPerRow(block), block.template);
}

/** The nested child list of a given column index (always an array, never undefined). */
export function columnBlocks(block: ColumnsBlock, columnIndex: number): Block[] {
  const it = (block.items ?? [])[columnIndex];
  return Array.isArray(it?.blocks) ? it!.blocks! : [];
}

/** Depth-first list of every block on the page, nested children included. */
export function flattenBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  const visit = (bs: Block[]) => {
    for (const b of bs) {
      out.push(b);
      if (b.type === "columns") {
        for (const it of b.items ?? []) if (Array.isArray(it.blocks)) visit(it.blocks);
      }
    }
  };
  visit(blocks);
  return out;
}

/** Find a block anywhere in the tree by id. */
export function findBlock(blocks: Block[], id: string | null): Block | null {
  if (!id) return null;
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.type === "columns") {
      for (const it of b.items ?? []) {
        if (Array.isArray(it.blocks)) {
          const hit = findBlock(it.blocks, id);
          if (hit) return hit;
        }
      }
    }
  }
  return null;
}

/**
 * Apply `fn` to whichever sibling array directly contains `id` — either the
 * top-level list or a column's child list. Returns the same reference when
 * nothing changed (so callers can rely on referential equality).
 */
function transformSiblings(
  blocks: Block[],
  id: string,
  fn: (siblings: Block[], index: number) => Block[],
): Block[] {
  const idx = blocks.findIndex((b) => b.id === id);
  if (idx >= 0) return fn(blocks, idx);

  let changed = false;
  const next = blocks.map((b) => {
    if (b.type !== "columns" || !b.items) return b;
    let itemChanged = false;
    const items = b.items.map((it) => {
      if (!Array.isArray(it.blocks)) return it;
      const nb = transformSiblings(it.blocks, id, fn);
      if (nb !== it.blocks) { itemChanged = true; return { ...it, blocks: nb }; }
      return it;
    });
    if (!itemChanged) return b;
    changed = true;
    return { ...b, items } as Block;
  });
  return changed ? next : blocks;
}

export function updateBlockInTree(blocks: Block[], id: string, patch: Partial<Block>): Block[] {
  return transformSiblings(blocks, id, (sib, i) =>
    sib.map((b, k) => (k === i ? ({ ...b, ...patch } as Block) : b)));
}

export function removeBlockFromTree(blocks: Block[], id: string): Block[] {
  return transformSiblings(blocks, id, (sib, i) => sib.filter((_, k) => k !== i));
}

export function moveBlockInTree(blocks: Block[], id: string, dir: -1 | 1): Block[] {
  return transformSiblings(blocks, id, (sib, i) => {
    const j = i + dir;
    if (j < 0 || j >= sib.length) return sib;
    const n = sib.slice();
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
}

export function duplicateBlockInTree(blocks: Block[], id: string): Block[] {
  return transformSiblings(blocks, id, (sib, i) => {
    const n = sib.slice();
    n.splice(i + 1, 0, cloneBlockWithNewIds(sib[i]));
    return n;
  });
}

/** Insert at a position in the top-level list (index clamped). */
export function insertAtTop(blocks: Block[], index: number, block: Block): Block[] {
  const n = blocks.slice();
  const at = index < 0 || index > n.length ? n.length : index;
  n.splice(at, 0, block);
  return n;
}

/** Insert into a specific column of a flexible columns block (index clamped). */
export function insertIntoColumn(
  blocks: Block[],
  columnBlockId: string,
  columnIndex: number,
  index: number,
  block: Block,
): Block[] {
  return blocks.map((b) => {
    if (b.id !== columnBlockId || b.type !== "columns") return b;
    const items = (b.items ?? []).slice();
    while (items.length <= columnIndex) items.push({ blocks: [] });
    const it = items[columnIndex];
    const list = Array.isArray(it.blocks) ? it.blocks.slice() : [];
    const at = index < 0 || index > list.length ? list.length : index;
    list.splice(at, 0, block);
    items[columnIndex] = { ...it, blocks: list };
    return { ...b, items } as Block;
  });
}

/** Deep clone a block with brand-new ids (including nested column children). */
export function cloneBlockWithNewIds(block: Block): Block {
  const clone = JSON.parse(JSON.stringify(block)) as Block;
  const reid = (b: Block) => {
    b.id = newBlockId();
    if (b.type === "columns") {
      for (const it of b.items ?? []) if (Array.isArray(it.blocks)) it.blocks.forEach(reid);
    }
  };
  reid(clone);
  return clone;
}

/**
 * Convert one classic column (flat heading/html/image/button) into the
 * equivalent nested blocks, preserving the merchant's content when they opt in
 * to flexible columns. Order matches the classic renderer: image, heading, text, button.
 */
export function classicItemToBlocks(item: ColumnItem): Block[] {
  const out: Block[] = [];
  const style = { padding: "sm" as const, width: "full" as const };
  if (item.image) out.push({ id: newBlockId(), type: "image", src: item.image, alt: item.heading ?? "", rounded: true, widthPct: 100, align: "left", style });
  if (item.heading) out.push({ id: newBlockId(), type: "heading", text: item.heading, level: 3, size: "md", style: { ...style, align: "left" } });
  if (item.html) out.push({ id: newBlockId(), type: "text", html: item.html, style });
  if (item.buttonLabel) out.push({ id: newBlockId(), type: "button", label: item.buttonLabel, href: item.buttonHref, variant: "outline", size: "md", rounded: "lg", style: { ...style, align: "left" } });
  return out;
}
