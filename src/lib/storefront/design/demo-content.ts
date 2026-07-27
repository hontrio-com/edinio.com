import type { MenuItem } from "@/lib/pages/menu";
import type { StoreCategoryNode } from "@/lib/storefront/store-content.types";

/**
 * Continutul demonstrativ folosit de miniaturile din catalogul de design-uri.
 *
 * Miniaturile arata DESIGNUL, nu marfa. Randate cu datele reale ale
 * magazinului, jumatate dintre ele ieseau goale: un comerciant fara bannere
 * vedea un hero alb, unul cu doua categorii nu vedea bara laterala, iar unul
 * fara pagini avea header-ele fara meniu — adica exact design-urile pe care
 * trebuia sa le compare aratau toate la fel.
 *
 * Identitatea magazinului (logo, culori, fonturi, nume) ramane a lui: alegerea
 * trebuie sa se simta a magazinului sau, doar continutul e imprumutat.
 */

/** Logo folosit doar cand magazinul inca nu are unul al lui. */
export const DEMO_LOGO = "/demo/logo.webp";

/** Bannere demonstrative — fisiere din `public/demo`, servite ca orice imagine locala. */
export const DEMO_BANNERS = [
  "/demo/banner-1.webp",
  "/demo/banner-2.webp",
  "/demo/banner-3.webp",
];

/**
 * Categorii demonstrative, cu imaginile lor.
 *
 * Sase, exact pragul cerut de design-urile cu bara laterala: destule cat varianta
 * sa se vada intreaga, si putine cat randurile sa ramana generoase langa banner.
 */
const DEMO_CATEGORII = [
  ["Electronice", "/demo/categorie-electronice.webp"],
  ["Electrocasnice", "/demo/categorie-electrocasnice.webp"],
  ["Fashion", "/demo/categorie-fashion.webp"],
  ["Casa si gradina", "/demo/categorie-casa-gradina.webp"],
  ["Sport si timp liber", "/demo/categorie-sport.webp"],
  ["Auto", "/demo/categorie-auto.webp"],
] as const;

export const DEMO_CATEGORY_NAMES = DEMO_CATEGORII.map(([name]) => name);

export const DEMO_CATEGORIES: StoreCategoryNode[] = DEMO_CATEGORII.map(([name, image], i) => ({
  id: `demo_cat_${i}`,
  name,
  parent_id: null,
  image_url: image,
  sort_order: i,
}));

/** Meniu demonstrativ, ca header-ele si footerele sa nu apara fara navigare. */
export const DEMO_MENU: MenuItem[] = [
  { id: "demo_m1", label: "Acasa", type: "home" },
  { id: "demo_m2", label: "Despre noi", type: "link", target: "#" },
  { id: "demo_m3", label: "Livrare", type: "link", target: "#" },
  { id: "demo_m4", label: "Contact", type: "link", target: "#" },
];

/**
 * Produse demonstrative.
 *
 * Forma e cea a randurilor din `products` pe care le asteapta cardurile; ce nu
 * se vede intr-o miniatura (stoc, greutate, sectiuni) ramane la valorile
 * neutre.
 */
export function demoProducts(businessId: string) {
  const nume = [
    "Produsul tau, aici",
    "Alt produs de exemplu",
    "Inca un exemplu",
    "Al patrulea produs",
    "Al cincilea produs",
    "Al saselea produs",
    "Al saptelea produs",
    "Al optulea produs",
  ];
  return nume.map((name, i) => ({
    id: `demo_prod_${i}`,
    business_id: businessId,
    name,
    slug: `exemplu-${i}`,
    description: "Descriere scurta a produsului, asa cum va aparea in magazinul tau.",
    price: 99 + i * 40,
    // Cateva cu pret taiat, ca sa se vada si eticheta de reducere.
    compare_at_price: i % 3 === 0 ? 149 + i * 40 : null,
    images: [DEMO_CATEGORIES[i % DEMO_CATEGORIES.length].image_url],
    category: DEMO_CATEGORY_NAMES[i % DEMO_CATEGORY_NAMES.length],
    is_featured: i < 4,
    is_active: true,
    is_bundle: false,
    track_inventory: false,
    stock_quantity: null,
    sort_order: i,
    created_at: new Date(0).toISOString(),
    page_sections: null,
    weight_grams: null,
  }));
}
