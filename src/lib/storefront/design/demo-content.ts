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
 * Douasprezece, nu patru cate fotografii avem: randurile si grilele arata patru
 * carduri deodata si ar ramane subtiri cu mai putine, iar pagina de catalog se
 * alege tocmai dupa cum arata filtrele si bara de paginare — cu sase produse
 * dintr-o singura categorie si fara atribute, cele trei modele ar fi aratat
 * identic si exact ce le deosebeste ar fi lipsit din cardul din care alege
 * comerciantul. Fotografiile se repeta cu alta configuratie, cum se intampla si
 * in magazinele reale.
 *
 * Cateva au pret taiat, ca sa se vada si eticheta de reducere.
 *
 * Atributele sunt alese ca sa TREACA regula de calitate a fatetelor: fiecare
 * valoare apare la cel putin doua produse, altfel fateta ei cade si miniatura ar
 * ramane iar goala. Vezi `lib/storefront/catalog/facets.ts`.
 */
interface DemoProdus {
  nume: string;
  pret: number;
  vechi: number | null;
  imagine: string;
  categorie: number;
  brand: string;
  material: string;
  garantie: string;
  culoare: string;
}

const DEMO_PRODUSE: DemoProdus[] = [
  { nume: "Laptop 15.6 inch, Intel, Windows 11", pret: 2499, vechi: 2999, imagine: "/demo/produs-laptop.webp", categorie: 0, brand: "Nordic", material: "Aluminiu", garantie: "24 luni", culoare: "Gri" },
  { nume: "Telefon 6.9 inch, 256 GB, portocaliu", pret: 5799, vechi: null, imagine: "/demo/produs-telefon.webp", categorie: 0, brand: "Aurora", material: "Sticla", garantie: "24 luni", culoare: "Portocaliu" },
  { nume: "Televizor Smart 4K, 55 inch", pret: 1899, vechi: 2349, imagine: "/demo/produs-televizor.webp", categorie: 1, brand: "Vela", material: "Plastic", garantie: "24 luni", culoare: "Negru" },
  { nume: "Consola de jocuri, editie digitala", pret: 2299, vechi: null, imagine: "/demo/produs-consola.webp", categorie: 4, brand: "Nordic", material: "Plastic", garantie: "12 luni", culoare: "Alb" },
  { nume: "Telefon 6.9 inch, 512 GB, portocaliu", pret: 6499, vechi: 6999, imagine: "/demo/produs-telefon.webp", categorie: 0, brand: "Aurora", material: "Sticla", garantie: "24 luni", culoare: "Portocaliu" },
  { nume: "Laptop 15.6 inch, 32 GB RAM", pret: 3199, vechi: null, imagine: "/demo/produs-laptop.webp", categorie: 0, brand: "Nordic", material: "Aluminiu", garantie: "24 luni", culoare: "Gri" },
  { nume: "Televizor Smart 4K, 43 inch", pret: 1499, vechi: 1799, imagine: "/demo/produs-televizor.webp", categorie: 1, brand: "Vela", material: "Plastic", garantie: "12 luni", culoare: "Negru" },
  { nume: "Consola de jocuri, editie completa", pret: 2899, vechi: null, imagine: "/demo/produs-consola.webp", categorie: 4, brand: "Vela", material: "Plastic", garantie: "12 luni", culoare: "Alb" },
  { nume: "Laptop 14 inch, ultraportabil", pret: 4299, vechi: 4799, imagine: "/demo/produs-laptop.webp", categorie: 0, brand: "Aurora", material: "Aluminiu", garantie: "24 luni", culoare: "Argintiu" },
  { nume: "Telefon 6.1 inch, 128 GB", pret: 3499, vechi: null, imagine: "/demo/produs-telefon.webp", categorie: 0, brand: "Nordic", material: "Sticla", garantie: "12 luni", culoare: "Negru" },
  { nume: "Televizor Smart 4K, 65 inch", pret: 3299, vechi: 3899, imagine: "/demo/produs-televizor.webp", categorie: 1, brand: "Aurora", material: "Aluminiu", garantie: "24 luni", culoare: "Argintiu" },
  { nume: "Consola portabila, 512 GB", pret: 1999, vechi: null, imagine: "/demo/produs-consola.webp", categorie: 4, brand: "Vela", material: "Plastic", garantie: "12 luni", culoare: "Alb" },
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
    { productId: "demo_prod_0", slug: "exemplu-0", name: DEMO_PRODUSE[0].nume, price: DEMO_PRODUSE[0].pret, imageUrl: DEMO_PRODUSE[0].imagine, quantity: 1 },
    { productId: "demo_prod_1", slug: "exemplu-1", name: DEMO_PRODUSE[1].nume, price: DEMO_PRODUSE[1].pret, imageUrl: DEMO_PRODUSE[1].imagine, quantity: 1, variantTitle: "256 GB / Portocaliu" },
    { productId: "demo_prod_3", slug: "exemplu-3", name: DEMO_PRODUSE[3].nume, price: DEMO_PRODUSE[3].pret, imageUrl: DEMO_PRODUSE[3].imagine, quantity: 2 },
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
    tags: ["exterior", "solar"],
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
      // Blocurile pe care doar unele variante de design le arata: fara ele,
      // designul care le pune in valoare ar aparea gol tocmai in miniatura dupa
      // care se alege.
      quantity_tiers: {
        enabled: true,
        mode: "percent",
        tier2_price: 0,
        tier2_percent: 10,
        tier2_badge: "Cel mai ales",
        tier3_price: 0,
        tier3_percent: 15,
        tier3_badge: "Pret pe bucata cel mai mic",
      },
      google: { brand: "Lumina", gtin: "5941234567890" },
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
  return DEMO_PRODUSE.map((p, i) => ({
    id: `demo_prod_${i}`,
    business_id: businessId,
    name: p.nume,
    slug: `exemplu-${i}`,
    description: "Descriere scurta a produsului, asa cum va aparea in magazinul tau.",
    price: p.pret,
    compare_at_price: p.vechi,
    images: [p.imagine],
    category: DEMO_CATEGORY_NAMES[p.categorie],
    is_featured: true,
    is_active: true,
    is_bundle: false,
    track_inventory: false,
    stock_quantity: null,
    sort_order: i,
    created_at: new Date(0).toISOString(),
    /*
     * Atributele care alimenteaza fatetele din miniatura paginii de catalog.
     *
     * Aceleasi trei surse ca in magazinele reale: optiunile de varianta,
     * brandul din atributele de marketplace si specificatiile. Fara ele,
     * miniatura ar fi aratat o coloana de filtre goala langa o grila, adica
     * exact ce deosebeste cele trei modele ar fi lipsit din cardul din care
     * alege comerciantul.
     */
    page_sections: {
      variants: { enabled: true, options: [{ id: "culoare", name: "Culoare", values: [p.culoare] }] },
      google: { brand: p.brand },
      specifications: [
        { label: "Material", value: p.material },
        { label: "Garantie", value: p.garantie },
      ],
    },
    weight_grams: null,
  }));
}
