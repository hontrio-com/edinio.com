/**
 * Categorii din taxonomia Google, alese pentru comertul online din Romania, cu ID-ul lor OFICIAL.
 *
 * Sursa: `https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt`, versiunea
 * 2021-09-21, pastrata in `date/taxonomy-with-ids.en-US.txt` ca o proba sa poata verifica fiecare
 * pereche fara retea.
 *
 * ═══ ⚠⚠ DE CE AU ID (17.09.2026) ═══
 *
 * Lista era de CAI scrise de mana, iar 5 din 77 nu existau in taxonomia Google (de pilda „Health &
 * Beauty > Personal Care > Fragrances", in loc de „... > Cosmetics > Perfume & Cologne”). Masurat pe
 * productie: la `mokka`, toate cele 7 produse mapate pe calea aceea aveau `google_category_unrecognized`
 * de la Google, pe fiecare destinatie. Se trimite acum ID-ul, care nu depinde de limba feedului si nu
 * se poate scrie gresit, iar o proba compara fiecare pereche cu fisierul oficial.
 */
export const CATEGORII_GOOGLE: ReadonlyArray<readonly [number, string]> = [
  // Apparel & Accessories
  [166, "Apparel & Accessories"],
  [1604, "Apparel & Accessories > Clothing"],
  [212, "Apparel & Accessories > Clothing > Shirts & Tops"],
  [2271, "Apparel & Accessories > Clothing > Dresses"],
  [204, "Apparel & Accessories > Clothing > Pants"],
  [1581, "Apparel & Accessories > Clothing > Skirts"],
  [207, "Apparel & Accessories > Clothing > Shorts"],
  [5598, "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets"],
  [213, "Apparel & Accessories > Clothing > Underwear & Socks"],
  [208, "Apparel & Accessories > Clothing > Sleepwear & Loungewear"],
  [5322, "Apparel & Accessories > Clothing > Activewear"],
  [182, "Apparel & Accessories > Clothing > Baby & Toddler Clothing"],
  [187, "Apparel & Accessories > Shoes"],
  [188, "Apparel & Accessories > Jewelry"],
  [201, "Apparel & Accessories > Jewelry > Watches"],
  [3032, "Apparel & Accessories > Handbags, Wallets & Cases > Handbags"],
  [167, "Apparel & Accessories > Clothing Accessories"],
  [178, "Apparel & Accessories > Clothing Accessories > Sunglasses"],
  [173, "Apparel & Accessories > Clothing Accessories > Hats"],
  [169, "Apparel & Accessories > Clothing Accessories > Belts"],
  // Health & Beauty
  [469, "Health & Beauty"],
  [2915, "Health & Beauty > Personal Care"],
  [473, "Health & Beauty > Personal Care > Cosmetics"],
  [477, "Health & Beauty > Personal Care > Cosmetics > Makeup"],
  [567, "Health & Beauty > Personal Care > Cosmetics > Skin Care"],
  [474, "Health & Beauty > Personal Care > Cosmetics > Bath & Body"],
  [486, "Health & Beauty > Personal Care > Hair Care"],
  [479, "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne"],
  [526, "Health & Beauty > Personal Care > Oral Care"],
  [525, "Health & Beauty > Health Care > Fitness & Nutrition > Vitamins & Supplements"],
  // Home & Garden
  [536, "Home & Garden"],
  [638, "Home & Garden > Kitchen & Dining"],
  [6070, "Home & Garden > Kitchen & Dining > Cookware & Bakeware"],
  [672, "Home & Garden > Kitchen & Dining > Tableware"],
  [730, "Home & Garden > Kitchen & Dining > Kitchen Appliances"],
  [696, "Home & Garden > Decor"],
  [569, "Home & Garden > Linens & Bedding > Bedding"],
  [574, "Home & Garden > Bathroom Accessories"],
  [594, "Home & Garden > Lighting"],
  [630, "Home & Garden > Household Supplies"],
  [436, "Furniture"],
  [443, "Furniture > Chairs"],
  [6392, "Furniture > Tables"],
  [460, "Furniture > Sofas"],
  [6433, "Furniture > Beds & Accessories"],
  [6356, "Furniture > Cabinets & Storage"],
  // Electronics
  [222, "Electronics"],
  [267, "Electronics > Communications > Telephony > Mobile Phones"],
  [264, "Electronics > Communications > Telephony > Mobile Phone Accessories"],
  [328, "Electronics > Computers > Laptops"],
  [279, "Electronics > Electronics Accessories > Computer Accessories"],
  [543626, "Electronics > Audio > Audio Components > Headphones & Headsets > Headphones"],
  [249, "Electronics > Audio > Audio Components > Speakers"],
  [404, "Electronics > Video > Televisions"],
  [276, "Electronics > Electronics Accessories > Power > Batteries"],
  [259, "Electronics > Electronics Accessories > Cables"],
  [1294, "Electronics > Video Game Consoles"],
  [4745, "Electronics > Computers > Tablet Computers"],
  [142, "Cameras & Optics > Cameras"],
  // Toys, Baby, Sports
  [1253, "Toys & Games > Toys"],
  [3793, "Toys & Games > Games"],
  [537, "Baby & Toddler"],
  [2847, "Baby & Toddler > Baby Toys & Activity Equipment"],
  [548, "Baby & Toddler > Diapering"],
  [561, "Baby & Toddler > Nursing & Feeding"],
  [988, "Sporting Goods"],
  [990, "Sporting Goods > Exercise & Fitness"],
  [1011, "Sporting Goods > Outdoor Recreation"],
  // Food
  [422, "Food, Beverages & Tobacco > Food Items"],
  [413, "Food, Beverages & Tobacco > Beverages"],
  // Other common
  [2, "Animals & Pet Supplies > Pet Supplies"],
  [922, "Office Supplies"],
  [5710, "Arts & Entertainment > Hobbies & Creative Arts"],
  [784, "Media > Books"],
  [1167, "Hardware > Tools"],
  [5181, "Luggage & Bags"],
  [5613, "Vehicles & Parts > Vehicle Parts & Accessories"],
];

/** Caile, pentru selectorul din panou (forma de dinainte a listei). */
export const GOOGLE_CATEGORIES: string[] = CATEGORII_GOOGLE.map(([, cale]) => cale);

const ID_DUPA_CALE = new Map<string, number>(CATEGORII_GOOGLE.map(([id, cale]) => [cale, id]));

/**
 * ⚠ CAILE GRESITE DIN LISTA VECHE, ramase salvate in maparile comerciantilor (`category_map`) si in
 * produse. Nu se sterge nimic din ce au ales: la trimitere se traduc in categoria pe care o voiau.
 */
export const CAI_VECHI_GRESITE: Readonly<Record<string, number>> = {
  "Health & Beauty > Personal Care > Fragrances": 479,
  "Health & Beauty > Health Care > Vitamins & Supplements": 525,
  "Electronics > Computers > Computer Accessories": 279,
  "Electronics > Audio > Audio Components > Headphones": 543626,
  "Electronics > Cameras & Optics > Cameras": 142,
};

const CALE_DUPA_ID = new Map<number, string>(CATEGORII_GOOGLE.map(([id, cale]) => [id, cale]));

/**
 * Calea de AFISAT pentru o valoare salvata: o cale veche gresita devine cea corecta.
 *
 * ⚠ Fara asta, selectorul din panou n-ar fi gasit valoarea salvata printre optiuni si ar fi aratat
 * „nemapat”, desi comerciantul alesese ceva, iar la o salvare s-ar fi pierdut alegerea lui.
 */
export function caleaDeAfisat(valoare: string | null | undefined): string {
  const v = String(valoare ?? "").trim();
  const id = CAI_VECHI_GRESITE[v];
  return id !== undefined ? (CALE_DUPA_ID.get(id) ?? v) : v;
}

/**
 * Valoarea care pleaca la Google in `googleProductCategory`.
 *
 * Un ID ramane ID. O cale cunoscuta (sau una din cele 5 gresite de odinioara) devine ID-ul ei. Orice
 * alt text scris de comerciant pleaca asa cum l-a scris: Google il poate recunoaste, iar daca nu,
 * spune asta in problemele produsului, nu se pierde nimic in tacere.
 */
export function categorieGooglePentruTrimitere(valoare: string | null | undefined): string | undefined {
  const v = String(valoare ?? "").trim();
  if (!v) return undefined;
  if (/^\d+$/.test(v)) return v;
  const id = ID_DUPA_CALE.get(v) ?? CAI_VECHI_GRESITE[v];
  return id !== undefined ? String(id) : v;
}
