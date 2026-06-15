// Dispatch a parsed CSV to the right source adapter, producing canonical
// StagedProduct[]. mapping is only used by the generic adapter.

import type { ParsedCsv } from "../csv";
import type { ColumnMapping, ImportOptions, ImportSource, StagedProduct } from "../types";
import { shopifyToStaged } from "./shopify-csv";
import { wooToStaged } from "./woo-csv";
import { genericToStaged } from "./generic-csv";

export function toStagedProducts(
  source: ImportSource,
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  options: ImportOptions,
): StagedProduct[] {
  switch (source) {
    case "shopify_csv":
      return shopifyToStaged(parsed, options);
    case "woo_csv":
      return wooToStaged(parsed, options);
    case "generic_csv":
      return genericToStaged(parsed, mapping, options);
    default:
      return [];
  }
}
