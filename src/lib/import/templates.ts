// Downloadable CSV templates. Column headers match EXACTLY what each source
// adapter reads, so a filled-in template imports cleanly:
//  - shopify: native Shopify product export columns (grouped by Handle).
//  - woo: native WooCommerce product export columns.
//  - generic: Edinio's full column set (auto-mapped by header name) — covers
//    everything the product form has: specificatii, upsell, dimensiuni, SEO etc.
// Rows use CRLF + are written with a UTF-8 BOM at download time (Excel-friendly).

export interface ImportTemplate {
  filename: string;
  csv: string;
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// Full generic column set — keep in sync with OUR_FIELDS / FIELD_SYNONYMS and the
// export route (src/app/api/products/export/route.ts) for round-trip imports.
const GENERIC_HEADERS = [
  "Nume", "Pret", "Pret vechi", "Descriere scurta", "Descriere", "SKU", "EAN", "Brand", "Categorie",
  "Etichete", "Imagini", "Stoc", "Prag stoc redus", "Status stoc", "Greutate",
  "Lungime (cm)", "Latime (cm)", "Inaltime (cm)", "Clasa transport", "Publicat", "Recomandat",
  "Specificatii", "Upsell - mod", "Upsell 2 buc - valoare", "Upsell 2 buc - eticheta",
  "Upsell 3 buc - valoare", "Upsell 3 buc - eticheta", "Slug", "ID extern",
  "Titlu SEO", "Descriere SEO", "Optiuni variante", "Variante",
];

export const IMPORT_TEMPLATES: Record<"generic" | "shopify" | "woo", ImportTemplate> = {
  generic: {
    filename: "edinio-sablon-generic.csv",
    csv: toCsv([
      GENERIC_HEADERS,
      [
        "Tricou bumbac", "79.99", "99.99", "Tricou comod din bumbac",
        "Tricou din bumbac 100%, comod si racoros.", "TRICOU-001", "5941234567890", "Brandul Meu",
        "Imbracaminte > Tricouri",
        "bumbac,vara", "https://exemplu.ro/tricou-1.jpg | https://exemplu.ro/tricou-2.jpg",
        "50", "5", "in stoc", "200 g", "70", "50", "1", "Voluminoase", "Da", "Da",
        "Material: 100% bumbac | Model: Unisex", "procent", "10", "Popular", "15", "Cea mai buna oferta",
        "tricou-bumbac", "TRICOU-001", "Tricou bumbac comod", "Tricou din bumbac 100%, comod.",
        "Marime: S, M, L",
        "S | pret=79.99 | sku=TRICOU-S | stoc=20 | activ=da | imagine=https://exemplu.ro/tricou-1.jpg\nM | pret=79.99 | sku=TRICOU-M | stoc=15 | activ=da\nL | pret=84.99 | sku=TRICOU-L | stoc=10 | activ=da",
      ],
      [
        "Cana ceramica", "29.99", "", "", "Cana de 350 ml.", "CANA-002", "", "",
        "Accesorii",
        "cadou", "https://exemplu.ro/cana.jpg", "100", "", "in stoc", "300 g", "", "", "", "",
        "Da", "Nu", "Capacitate: 350 ml | Material: Ceramica", "suma", "27", "2+ bucati", "", "",
        "cana-ceramica", "CANA-002", "", "", "", "",
      ],
    ]),
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
