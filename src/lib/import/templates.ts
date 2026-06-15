// Downloadable CSV templates. Column headers match EXACTLY what each source
// adapter reads, so a filled-in template imports cleanly:
//  - shopify: native Shopify product export columns (grouped by Handle).
//  - woo: native WooCommerce product export columns.
//  - generic: Edinio's simple columns (auto-mapped by header name).
// Rows use CRLF + are written with a UTF-8 BOM at download time (Excel-friendly).

export interface ImportTemplate {
  filename: string;
  csv: string;
}

export const IMPORT_TEMPLATES: Record<"generic" | "shopify" | "woo", ImportTemplate> = {
  generic: {
    filename: "edinio-sablon-generic.csv",
    csv: [
      "Name,Price,Compare at price,Description,SKU,Category,Tags,Images,Stock,Weight (kg)",
      'Tricou bumbac,79.99,99.99,"Tricou din bumbac 100%, comod.",TRICOU-001,Imbracaminte,"bumbac,vara","https://exemplu.ro/tricou-1.jpg,https://exemplu.ro/tricou-2.jpg",50,0.2',
      "Cana ceramica,29.99,,Cana de 350 ml.,CANA-002,Accesorii,cadou,https://exemplu.ro/cana.jpg,100,0.3",
    ].join("\r\n"),
  },
  shopify: {
    filename: "edinio-sablon-shopify.csv",
    csv: [
      "Handle,Title,Body (HTML),Vendor,Product Category,Type,Tags,Published,Option1 Name,Option1 Value,Variant SKU,Variant Grams,Variant Inventory Qty,Variant Price,Variant Compare At Price,Image Src,Image Position,SEO Title,SEO Description,Status",
      'tricou-bumbac,Tricou bumbac,"<p>Tricou din bumbac 100%.</p>",Brandul Meu,Apparel & Accessories,Tricouri,"bumbac,vara",TRUE,Marime,M,TRICOU-M,200,50,79.99,99.99,https://exemplu.ro/tricou.jpg,1,Tricou bumbac,"Tricou comod din bumbac.",active',
      'tricou-bumbac,,,,,,,,Marime,L,TRICOU-L,200,30,79.99,99.99,,,,,',
    ].join("\r\n"),
  },
  woo: {
    filename: "edinio-sablon-woocommerce.csv",
    csv: [
      "Type,SKU,Name,Published,Is featured?,Short description,Description,Regular price,Sale price,Categories,Tags,Images,In stock?,Stock,Weight (kg)",
      'simple,TRICOU-001,Tricou bumbac,1,0,Tricou comod din bumbac,"<p>Tricou din bumbac 100%.</p>",99.99,79.99,Imbracaminte > Tricouri,"bumbac,vara",https://exemplu.ro/tricou.jpg,1,50,0.2',
    ].join("\r\n"),
  },
};
