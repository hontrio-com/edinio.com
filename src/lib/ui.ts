// Tokenized class string for native <select> elements, matching the <Input>
// primitive (h-9, same border/focus ring). A single source for the stopgap
// until native selects are migrated to the shadcn <Select> — a separate,
// verified phase (no <Select> call-site exists in the app yet to copy from).
export const selectCls =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";
