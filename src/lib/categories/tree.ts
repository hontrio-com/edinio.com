/**
 * Pure helpers for the merchant category hierarchy (categories table:
 * adjacency list via parent_id). Shared by the dashboard management UI,
 * the product form dropdown and any other consumer that needs the tree.
 *
 * Defensive by design: a node whose parent is missing from the list, that
 * points at itself, or that sits on a parent cycle is promoted to a root
 * instead of silently disappearing — management UIs must always show every
 * row. The returned structure is a proper forest (each node placed exactly
 * once), so callers can recurse over it without their own guards. All
 * traversals are iterative, so pathological depths cannot overflow the stack.
 * Sibling order is the input order — callers sort the list up front.
 */

export interface CategoryTreeNode {
  id: string;
  parent_id: string | null;
}

export interface CategoryForest<T extends CategoryTreeNode> {
  roots: T[];
  /** Direct children per category id; ids without children have no entry. */
  childrenOf: Map<string, T[]>;
}

export function buildCategoryForest<T extends CategoryTreeNode>(list: T[]): CategoryForest<T> {
  const ids = new Set(list.map((c) => c.id));
  const rawChildren = new Map<string, T[]>();
  const roots: T[] = [];
  for (const c of list) {
    if (c.parent_id !== null && c.parent_id !== c.id && ids.has(c.parent_id)) {
      const arr = rawChildren.get(c.parent_id);
      if (arr) arr.push(c);
      else rawChildren.set(c.parent_id, [c]);
    } else {
      roots.push(c);
    }
  }

  const childrenOf = new Map<string, T[]>();
  const visited = new Set<string>();
  const place = (root: T) => {
    if (visited.has(root.id)) return;
    visited.add(root.id);
    const stack: T[] = [root];
    while (stack.length) {
      const node = stack.pop()!;
      const kids = (rawChildren.get(node.id) ?? []).filter((k) => !visited.has(k.id));
      if (kids.length === 0) continue;
      for (const k of kids) visited.add(k.id);
      childrenOf.set(node.id, kids);
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
  };
  for (const r of roots) place(r);
  // Anything still unplaced sits on a parent cycle — promote it (in input
  // order) and let the visited filter drop the edge that closes the cycle.
  for (const c of list) {
    if (!visited.has(c.id)) {
      roots.push(c);
      place(c);
    }
  }
  return { roots, childrenOf };
}

export interface FlatCategoryNode<T extends CategoryTreeNode> {
  node: T;
  /** 0 for roots, +1 per level below. */
  depth: number;
}

/** Depth-first flatten in display order: each root followed by its subtree. */
export function flattenCategoryForest<T extends CategoryTreeNode>(list: T[]): FlatCategoryNode<T>[] {
  const { roots, childrenOf } = buildCategoryForest(list);
  const out: FlatCategoryNode<T>[] = [];
  const stack: FlatCategoryNode<T>[] = [];
  for (let i = roots.length - 1; i >= 0; i--) stack.push({ node: roots[i], depth: 0 });
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    const kids = childrenOf.get(cur.node.id) ?? [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i], depth: cur.depth + 1 });
  }
  return out;
}

/** The category itself plus every descendant, any depth (cycle-safe). */
export function collectSubtreeIds<T extends CategoryTreeNode>(list: T[], rootId: string): Set<string> {
  const { childrenOf } = buildCategoryForest(list);
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const k of childrenOf.get(id) ?? []) {
      if (!out.has(k.id)) {
        out.add(k.id);
        stack.push(k.id);
      }
    }
  }
  return out;
}

/** Lowercased, diacritics-stripped text for tolerant matching. */
export function normalizeSearchText(input: string): string {
  return input.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim();
}

export interface CategorySearchResult {
  /** Nodes to render: every match plus its ancestors and its descendants. */
  visibleIds: Set<string>;
  matchCount: number;
}

/** Diacritics/case-insensitive name search. Returns null for an empty query. */
export function searchCategoryForest<T extends CategoryTreeNode & { name: string }>(
  list: T[],
  query: string,
): CategorySearchResult | null {
  const q = normalizeSearchText(query);
  if (!q) return null;

  const { childrenOf } = buildCategoryForest(list);
  const parentOf = new Map<string, string>();
  for (const [pid, kids] of childrenOf) {
    for (const k of kids) parentOf.set(k.id, pid);
  }

  const visibleIds = new Set<string>();
  let matchCount = 0;
  for (const c of list) {
    if (!normalizeSearchText(c.name).includes(q)) continue;
    matchCount++;
    // Ancestors up to the root. Stopping at an already-visible node is safe:
    // its own ancestors were added when it became visible.
    let cur: string | undefined = c.id;
    while (cur !== undefined && !visibleIds.has(cur)) {
      visibleIds.add(cur);
      cur = parentOf.get(cur);
    }
    // The whole subtree under the match.
    const stack = [c.id];
    while (stack.length) {
      const id = stack.pop()!;
      for (const k of childrenOf.get(id) ?? []) {
        if (!visibleIds.has(k.id)) {
          visibleIds.add(k.id);
          stack.push(k.id);
        }
      }
    }
  }
  return { visibleIds, matchCount };
}
