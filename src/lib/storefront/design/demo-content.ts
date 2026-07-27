import type { MenuItem } from "@/lib/pages/menu";
import type { CartItem } from "@/components/storefront/cart/CartProvider";
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
 * Sase, nu patru cate fotografii avem: randurile si grilele arata patru carduri
 * deodata si ar ramane subtiri cu mai putine. Doua fotografii se repeta cu alta
 * configuratie, cum se intampla si in magazinele reale.
 *
 * Cateva au pret taiat, ca sa se vada si eticheta de reducere.
 */
const DEMO_PRODUSE: [string, number, number | null, string][] = [
  ["Laptop 15.6 inch, Intel, Windows 11", 2499, 2999, "/demo/produs-laptop.webp"],
  ["Telefon 6.9 inch, 256 GB, portocaliu", 5799, null, "/demo/produs-telefon.webp"],
  ["Televizor Smart 4K, 55 inch", 1899, 2349, "/demo/produs-televizor.webp"],
  ["Consola de jocuri, editie digitala", 2299, null, "/demo/produs-consola.webp"],
  ["Telefon 6.9 inch, 512 GB, portocaliu", 6499, 6999, "/demo/produs-telefon.webp"],
  ["Laptop 15.6 inch, 32 GB RAM", 3199, null, "/demo/produs-laptop.webp"],
];

/**
 * Cosul demonstrativ pentru miniaturile cosului si ale formularului de comanda.
 *
 * Trei linii: una cu varianta aleasa (ca sa se vada randul in plus de sub nume),
 * una cu doua bucati (ca sa se vada butoanele de cantitate lucrand pe un numar
 * mai mare de unu) si una simpla.
 *
 * Nu trece niciodata prin `CartProvider`: cosul real se tine in localStorage, iar
 * miniatura ruleaza pe aceeasi origine cu magazinul, deci ar ateriza in cosul
 * comerciantului. Vezi `CartDemoProvider`.
 */
export function demoCartItems(): CartItem[] {
  return [
    { productId: "demo_prod_0", slug: "exemplu-0", name: DEMO_PRODUSE[0][0], price: DEMO_PRODUSE[0][1], imageUrl: DEMO_PRODUSE[0][3], quantity: 1 },
    { productId: "demo_prod_1", slug: "exemplu-1", name: DEMO_PRODUSE[1][0], price: DEMO_PRODUSE[1][1], imageUrl: DEMO_PRODUSE[1][3], quantity: 1, variantTitle: "256 GB / Portocaliu" },
    { productId: "demo_prod_3", slug: "exemplu-3", name: DEMO_PRODUSE[3][0], price: DEMO_PRODUSE[3][1], imageUrl: DEMO_PRODUSE[3][3], quantity: 2 },
  ];
}

/** Transportul si pragul folosite in miniaturi, alese ca sa se vada si bara de progres. */
export const DEMO_TRANSPORT = 19.99;
export const DEMO_PRAG_TRANSPORT_GRATUIT = 15000;

/**
 * Produsul demonstrativ al paginii de produs, cu blocurile de continut care merg
 * cu el.
 *
 * Trei fotografii ale ACELUIASI produs, nu trei produse diferite: fara ele, banda
 * de miniaturi, sagetile, bulinele si contorul „1 din 3" — adica jumatate din ce
 * deosebeste designurile de galerie — n-ar aparea deloc. Sunt aceleasi imagini
 * folosite de pagina de prezentare a platformei, deci nu adauga niciun fisier nou.
 *
 * Are pret taiat (eticheta de reducere), variante cu doua optiuni (butoanele de
 * alegere), specificatii si stoc urmarit cu putine bucati ramase, ca miniatura sa
 * arate zona de cumparare plina, nu un caz degenerat.
 */
export function demoProductPage(businessId: string) {
  // Titlul combinatiei e cheia dupa care pagina de produs o gaseste: valorile
  // alese, in ordinea optiunilor, unite cu „ / ".
  const combinatii = [
    ["Alb rece / 1 bucata", "149", "299"],
    ["Alb rece / 2 bucati", "269", "598"],
    ["Alb cald / 1 bucata", "149", "299"],
    ["Alb cald / 2 bucati", "269", "598"],
  ].map(([title, price, compare], i) => ({
    id: `demo_combo_${i}`,
    title,
    price,
    compare_at_price: compare,
    sku: `DEMO-00${i + 1}`,
    stock_quantity: String(6 - i),
    image: "",
    enabled: true,
  }));

  const product = {
    id: "demo_pdp",
    business_id: businessId,
    name: "Lampa solara stradala, 8 LED-uri, panou solar integrat",
    slug: "exemplu-pagina-produs",
    description:
      "<p>Lampa se incarca ziua de la soare si porneste singura la lasarea intunericului. Panoul solar e integrat, deci nu ai nevoie de cabluri sau priza. Rezista la ploaie si inghet, iar telecomanda inclusa iti lasa la indemana intensitatea si temporizarea.</p>",
    price: 149,
    compare_at_price: 299,
    images: [
      "/demo/ImaginePrincipala.webp",
      "/demo/ImagineSecundara1.webp",
      "/demo/ImagineSecundara2.webp",
    ],
    category: DEMO_CATEGORY_NAMES[3],
    is_featured: true,
    is_active: true,
    is_bundle: false,
    track_inventory: true,
    stock_quantity: 6,
    sort_order: 0,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    external_id: null,
    sku: "DEMO-001",
    source: null,
    tags: [],
    shipping_class: null,
    weight_grams: 1200,
    page_sections: {
      short_description:
        "<p>Se incarca de la soare, porneste singura la apus si lumineaza toata noaptea. Fara cabluri, fara curent, fara intretinere.</p>",
      specifications: [
        { label: "Panou solar", value: "Integrat, incarcare automata" },
        { label: "LED-uri", value: "8 de mare putere" },
        { label: "Senzor de lumina", value: "Pornire automata la intuneric" },
        { label: "Rezistenta", value: "Rezistenta la apa, pentru exterior" },
        { label: "Telecomanda", value: "Inclusa" },
      ],
      variants: {
        enabled: true,
        options: [
          { id: "demo_opt_0", name: "Culoare", values: ["Alb rece", "Alb cald"] },
          { id: "demo_opt_1", name: "Pachet", values: ["1 bucata", "2 bucati"] },
        ],
        combinations: combinatii,
      },
    },
  };

  /**
   * Blocurile de pagina de produs conduse de `page_content`. Se suprapun peste
   * cele reale ale magazinului, dupa acelasi tipar ca meniul si bannerele: un
   * magazin care n-a completat estimarea de livrare ar vedea altfel jumatate din
   * miniatura fata de unul care a completat-o, deci n-ar mai compara designuri.
   */
  const pageContent = {
    trust_badges_enabled: true,
    delivery_estimate: { enabled: true, min_days: 2, max_days: 4 },
    price_range_display: { enabled: false },
    button_effect: "none",
    show_quality_badge: true,
    show_social_proof: false,
  };

  return { product, pageContent };
}

export function demoProducts(businessId: string) {
  return DEMO_PRODUSE.map(([name, price, vechi, imagine], i) => ({
    id: `demo_prod_${i}`,
    business_id: businessId,
    name,
    slug: `exemplu-${i}`,
    description: "Descriere scurta a produsului, asa cum va aparea in magazinul tau.",
    price,
    compare_at_price: vechi,
    images: [imagine],
    category: DEMO_CATEGORY_NAMES[0],
    is_featured: true,
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
