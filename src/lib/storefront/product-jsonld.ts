import { isValidGtin, normalizeGtin } from "@/lib/gtin";
import { textCurat } from "./date-structurate";
import { getProductPriceRange } from "@/lib/utils/product-price";
import {
  combinatiiActiveUnice, comboEpuizat, comboUnitPrice, esteMarime, parseVariants,
  toateCombinatiileEpuizate, VARIANT_TITLE_SEP, type VariantCombo, type VariantsData,
} from "@/lib/storefront/variants";

/**
 * Numele de optiune → proprietatea schema.org care ii corespunde.
 *
 * Se potriveste doar ce se poate potrivi CU CERTITUDINE. Numele reale din baza
 * sunt neregulate — „Mărime " cu spatiu la coada, „MARIME", „Marimea", dar si
 * „Model", „Gramaj", „Tip print", „Bicarbonato" si unul complet gol. Pentru cele
 * care nu se potrivesc nu se inventeaza nimic: `variesBy` ramane fara ele, iar
 * varianta isi pastreaza doar identificatorii. O proprietate ghicita gresit e o
 * afirmatie falsa despre marfa, nu o imbogatire.
 */
function proprietateaOptiunii(nume: string): "color" | "size" | "material" | null {
  const curat = nume.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim();
  if (!curat) return null;
  if (curat === "culoare" || curat === "color" || curat === "culori") return "color";
  if (curat === "material") return "material";
  // `esteMarime` stie deja formele de marime folosite in magazine; „Dimensiune"
  // si „Capacitate" descriu tot marimea articolului.
  if (esteMarime(nume) || curat === "dimensiune" || curat === "dimensiuni" || curat === "capacitate") return "size";
  return null;
}

/**
 * Valorile unei combinatii, desfacute pe optiuni.
 *
 * Titlul se compune din valori legate cu „ / ", in ORDINEA optiunilor, deci se
 * poate desface la loc. Daca numarul nu se potriveste — o valoare care contine
 * chiar separatorul, un titlu scris de mana la import — nu se ghiceste nimic:
 * mai bine o varianta fara `color`/`size` decat una cu culoarea pusa in marime.
 */
function valoriPeOptiune(variants: VariantsData, combo: VariantCombo): Record<string, string> | null {
  const bucati = combo.title.split(VARIANT_TITLE_SEP);
  if (bucati.length !== variants.options.length) return null;
  const out: Record<string, string> = {};
  variants.options.forEach((o, i) => {
    const prop = proprietateaOptiunii(o.name);
    if (prop) out[prop] = bucati[i].trim();
  });
  return out;
}

// Computed once at module load (not during render — keeps callers pure).
const PRICE_VALID_UNTIL = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * schema.org Product JSON-LD for a storefront product. Shared by the product
 * route (/[slug]/product/[slug]) and the One Product Store homepage so both emit
 * identical, valid structured data. `productUrl` is the page's canonical URL (the
 * homepage URL in OPS mode, the product URL otherwise).
 */
export function buildProductJsonLd(
  product: {
    /** Folosit ca `productGroupID` cand nu exista SKU pe produs. */
    id?: string | null;
    name: string;
    description: string | null;
    price: number | null;
    images: unknown;
    sku?: string | null;
    track_inventory?: boolean;
    stock_quantity?: number | null;
    created_at?: string | null;
    /** Sectiunile produsului: starea de stoc aleasa din editor + combinatiile de variante. */
    page_sections?: unknown;
  },
  productUrl: string,
  /** REZERVA pentru brand: numele magazinului. Brandul produsului bate. */
  brand: string,
  /**
   * ⚠ `min`/`max` sunt ZILELE DE TRANZIT, si sunt `null` cand comerciantul nu a
   * declarat niciun termen de livrare.
   *
   * Atunci nu se emite deloc `deliveryTime` — acelasi rationament ca la taxa de
   * retur, cateva randuri mai jos: un termen pe care omul nu l-a scris nicaieri
   * si pe care pagina lui nu-l arata e o promisiune facuta in numele lui. Pana
   * acum se emitea „1-3 zile" pentru oricine avea estimarea stinsa, adica pentru
   * 53 din cele 70 de magazine publicate — si nici macar nu era implicitul
   * propriului editor, care e 2-4.
   *
   * `handlingMin`/`handlingMax` sunt zilele de PROCESARE (cat sta comanda la
   * magazin pana pleaca la curier). Lipsa lor inseamna zero, nu „0-1": Google
   * socoteste termenul afisat ca procesare + tranzit, iar un 0-1 pus din oficiu
   * peste intervalul pe care il arata pagina publica o zi in plus fata de
   * casuta „Estimare livrare" de pe acelasi ecran.
   *
   * Zilele se calculeaza intr-un singur loc, `@/lib/shipping/delivery-time`, de
   * unde le ia si casuta de pe pagina produsului.
   */
  shipping: { cost: number; min: number | null; max: number | null; handlingMin?: number; handlingMax?: number },
  /**
   * Pachetul nu se poate cumpara (o componenta lipseste sau s-a terminat).
   *
   * Se PRIMESTE, nu se deduce: componentele nu sunt in `products`, iar un pachet
   * se scrie cu `track_inventory: false`, deci toate conditiile de mai jos sunt
   * false pe orice pachet — microdatele declarau „InStock" fix cand pagina avea
   * butonul stins. Ambii apelanti au componentele la indemana.
   */
  indisponibil = false,
) {
  const images = product.images as string[] | null;
  /*
   * ⚠ ETICHETA DEVINE SPATIU, NU SIR GOL (30.08.2026)
   *
   * Se taia cu `replace(/<[^>]+>/g, "")` — deci `…de cazare.</p><h3>Beneficii:</h3>` iesea
   * „…de cazare.Beneficii:", si `<br>` dintre puncte lipea „premium✔ Material". Masurat: 1654 din
   * cele 3061 de produse cu variante au blocuri lipite asa, si 1645 au `<br>`.
   *
   * ⚠ SAPTE ALTE LOCURI DIN DEPOZIT O FACEAU DEJA CUM TREBUIE — Trendyol, OLX, eMAG, Facebook,
   * Google Merchant, importul, si chiar `textCurat` de alaturi, al carui comentariu descrie fix
   * defectul asta. Fisierul de fata era exceptia. Nota buna nu trecuse peste drum.
   *
   * `textCurat` scoate si spatiul ramas inaintea punctuatiei, si taie la hotar de cuvant.
   */
  const desc = product.description ? textCurat(product.description, 500) : product.name;
  // Aceeasi regula de stoc ca pagina de produs: marcajul „Stoc epuizat" /
  // „Precomanda" din editor bate inventarul. Fara el, o pagina cu butonul stins
  // declara „InStock" in datele structurate si Google trimite clienti pe ea.
  const stockStatus = (product.page_sections as { stock_status?: string } | null)?.stock_status ?? "in_stock";
  const varianteJsonLd = parseVariants(product.page_sections ?? null);
  const priceRange = getProductPriceRange(Number(product.price) || 0, product.page_sections ?? null);
  const outOfStock = stockStatus === "out_of_stock"
    || (product.track_inventory === true && product.stock_quantity === 0)
    // Un produs variabil fara nicio combinatie de vanzare nu se poate cumpara, dar
    // declara „InStock", si Google trimite clienti pe o pagina cu butonul stins.
    || indisponibil
    || priceRange.faraOferta
    // Stocul combinatiilor conteaza DOAR cand produsul isi urmareste stocul, ca pe
    // randul de deasupra si ca in amandoua feedurile (`facebook/catalog-feed.ts`,
    // `google-merchant/mapping.ts`). Fara conditia asta, 171 de produse publicate
    // de la un singur magazin ar fi declarat `OutOfStock` in microdate in timp ce
    // feedul le trimite „in stoc" catre acelasi Merchant Center: zerourile lor vin
    // din valoarea implicita a importului, iar comerciantul a stins tocmai
    // urmarirea stocului.
    || (product.track_inventory === true && toateCombinatiileEpuizate(varianteJsonLd));
  const availability = outOfStock
    ? "https://schema.org/OutOfStock"
    : stockStatus === "preorder"
      ? "https://schema.org/PreOrder"
      : "https://schema.org/InStock";
  // `validFrom` = date the price became valid. Google recommends it for merchant
  // listings (bounds a price/sale window) and Search Console warns when it's
  // absent. We don't track price-change time, so use the product's creation date
  // (always <= priceValidUntil, as Google requires); fall back to today.
  const validFrom = (typeof product.created_at === "string" && product.created_at)
    ? product.created_at.slice(0, 10)
    : TODAY;

  // Pretul publicat vine din intervalul vandabil, pe AMANDOUA ramurile.
  // Ramura cu interval il folosea de mult; cea simpla publica pretul de BAZA, iar
  // pe ANTIFOANE asta insemna 156,80 lei catre Google pentru un produs care se
  // vinde cu 438 — pagina si microdatele contrazicandu-se pe acelasi ecran, adica
  // exact motivul de suspendare din Merchant Center.
  /*
   * Identificatorii de produs: codul de bare si codul de fabricant.
   *
   * Comerciantul le scrie in formularul de produs, la Organizare, si ajung in
   * `page_sections.google`. De acolo le citeau feedul Google Merchant si feedul
   * Facebook, dar NU si pagina publica: produsul se afisa fara niciun
   * identificator in datele structurate, iar Merchant nu avea cu ce sa confirme
   * ce trimite feedul. De asta erau probleme la aprobare.
   *
   * Un GTIN gresit e mai rau decat lipsa lui — duce la respingere, nu la
   * ignorarea campului — deci se verifica cifra de control inainte, cu aceeasi
   * functie ca feedurile. Cel care nu trece nu se scrie, iar comerciantul vede
   * ca lipseste si il corecteaza.
   */
  const google = (product.page_sections as { google?: { gtin?: string; mpn?: string; brand?: string } } | null)?.google;
  const gtin = isValidGtin(google?.gtin) ? normalizeGtin(google?.gtin) : null;
  const mpn = (google?.mpn ?? "").trim();

  /*
   * ═══ BRANDUL PRODUSULUI, NU NUMELE MAGAZINULUI ═══
   *
   * Pagina publica declara pana acum ca `brand` numele MAGAZINULUI, chiar cand
   * comerciantul scrisese un producator real la Organizare. Feedurile foloseau
   * de mult valoarea lui (`mapping.ts:109`, `catalog-feed.ts:111`), deci pagina
   * si feedul spuneau lucruri diferite despre acelasi articol: feedul „ARDON",
   * pagina „eSAFE".
   *
   * Nu era un caz rar. Masurat: 6150 din 7880 de produse active publicate au
   * brand propriu — 78%. Adica pentru majoritatea catalogului, Google primea
   * doua raspunsuri la aceeasi intrebare, iar cel de pe pagina era gresit:
   * magazinul care vinde Portwest nu e producatorul lui.
   *
   * Aceeasi ordine ca in feeduri: brandul produsului, apoi numele magazinului.
   * Argumentul `brand` ramane REZERVA, nu valoarea impusa — de aia nici nu s-a
   * schimbat semnatura, si amandoi apelantii (pagina de produs si magazinul cu
   * un singur produs) se repara odata.
   *
   * ⚠ RAMANE o nepotrivire mica: feedul Merchant mai are intre cele doua o
   * valoare implicita pe magazin (`google_merchant_config.brand_default`), pe
   * care pagina n-o citeste. O au TREI magazine din 127, si conteaza doar la
   * produsele fara brand propriu. N-am adus coloana aia pe o pagina publica
   * dinadins: tine si datele de conectare la Merchant, iar riscul nu merita
   * pentru trei magazine.
   */
  const brandProdus = (google?.brand ?? "").trim() || brand;

  // Combinatiile vandabile, cate una pe titlu. Se calculeaza O DATA si se
  // folosesc de doua ori: la numarul de oferte si la forma cu variante de mai jos.
  const combos = combinatiiActiveUnice(varianteJsonLd);

  // Cate oferte anuntam: exact combinatiile vandabile, cate una pe titlu. Numarate
  // altfel (`enabled !== false`, fara dedup) declaram catre Google mai multe
  // oferte decat exista de vanzare.
  const offerCount = combos.length;

  const shippingDetails = {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: shipping.cost, currency: "RON" },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "RO" },
    /* Se declara doar ce a spus comerciantul. Vezi nota de la parametru. */
    ...(shipping.min !== null && shipping.max !== null
      ? {
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: {
              "@type": "QuantitativeValue",
              minValue: shipping.handlingMin ?? 0,
              maxValue: shipping.handlingMax ?? 0,
              unitCode: "DAY",
            },
            transitTime: { "@type": "QuantitativeValue", minValue: shipping.min, maxValue: shipping.max, unitCode: "DAY" },
          },
        }
      : {}),
  };
  // Fereastra de 14 zile e cea legala (dreptul de retragere), deci se poate
  // declara. Taxa de retur NU: nu exista camp in care comerciantul sa o
  // introduca, iar deducerea ei din costul de LIVRARE anunta public o politica
  // pe care el n-a spus-o niciodata (livrare gratuita nu inseamna retur gratuit).
  const hasMerchantReturnPolicy = {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "RO",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 14,
    returnMethod: "https://schema.org/ReturnByMail",
    // Google cere campul; fara el listarea pierde imbogatirea cu politica de
    // retur. Costul returului nu se mai deduce din pragul de transport gratuit —
    // sunt doua lucruri diferite — ci ramane pe situatia legala uzuala: clientul
    // plateste returul daca se razgandeste (OUG 34/2014, art. 13 alin. 3).
    returnFees: "https://schema.org/ReturnShippingFees",
  };

  /*
   * ═══ VARIANTELE CU COD PROPRIU DEVIN `ProductGroup` + `hasVariant` ═══
   *
   * Reclamat de un comerciant: completase „Cod EAN" la toate cele sapte culori
   * ale unei huse, si niciunul nu aparea in datele structurate. Verificat: nu
   * aparea, si nici nu avea unde. Pagina citea DOAR codul de la nivel de produs
   * (`page_sections.google.gtin`), iar acolo campul era gol — celelalte sapte
   * coduri nu erau atinse de nicio linie.
   *
   * Dar chiar completat, campul de produs n-ar fi rezolvat nimic: un GTIN
   * identifica un articol anume, nu o familie. Codul culorii „Gri" pus pe o
   * pagina care vinde si „Bej" e o afirmatie falsa. Iar in forma de pana acum —
   * un singur `Offer`, sau un `AggregateOffer` — nu exista loc pentru sapte
   * coduri diferite. Lipsea structura, nu doar citirea.
   *
   * `ProductGroup` e singura forma schema.org care le tine: fiecare varianta
   * devine un `Product` cu identificatorii, pretul si disponibilitatea EI.
   *
   * ═══ DE CE NU LA TOATE PRODUSELE CU VARIANTE ═══
   *
   * 2489 de produse active au doua sau mai multe combinatii, dar doar 186 au
   * coduri pe ele (masurat). La celelalte ~2300, `ProductGroup` ar adauga
   * structura fara sa adauge niciun FAPT nou — aceleasi preturi si aceeasi
   * disponibilitate, spuse mai complicat — in schimbul unei schimbari de forma
   * pe tot catalogul, adica exact felul de modificare care umple Search Console
   * si care se descopera tarziu.
   *
   * Deci comutarea se face doar cand chiar aduce ceva: cel putin o varianta
   * vandabila cu GTIN valid. Pragul se poate largi mai tarziu (preturi per
   * varianta, SKU-uri distincte); ce nu se poate face inapoi e un catalog
   * intreg mutat pe o forma noua fara sa fi urmarit nimeni ce iese.
   *
   * ⚠ Un GTIN care nu trece cifra de control NU se scrie, ca peste tot: un cod
   * gresit duce la RESPINGERE, unul lipsa doar saraceste listarea.
   */

  const areCoduriPeVariante = combos.some((c) => isValidGtin(c.gtin));
  const caGrupDeVariante = !!varianteJsonLd && combos.length >= 2 && areCoduriPeVariante;

  if (caGrupDeVariante && varianteJsonLd) {
    /*
     * `productGroupID` trebuie sa fie STABIL si al grupului, nu al unei
     * variante: SKU-ul produsului daca exista, altfel id-ul lui din baza. Fara
     * el, Google nu poate lega intre ele variantele aceleiasi familii.
     */
    const productGroupID = (product.sku ?? "").trim() || (product.id ?? "").trim();

    /*
     * `variesBy` enumera CE difera intre variante, cu proprietati schema.org.
     * Se scrie doar ce s-a putut potrivi cu certitudine din numele optiunilor —
     * vezi `proprietateaOptiunii`. Daca nu s-a potrivit nimic, campul lipseste:
     * e recomandat, nu obligatoriu, iar o proprietate ghicita ar fi mai rea.
     */
    const proprietatiCareVariaza = [
      ...new Set(
        varianteJsonLd.options
          .map((o) => proprietateaOptiunii(o.name))
          .filter((p): p is "color" | "size" | "material" => p !== null),
      ),
    ];

    const hasVariant = combos.map((combo) => {
      const codVarianta = isValidGtin(combo.gtin) ? normalizeGtin(combo.gtin) : null;
      const skuVarianta = (combo.sku ?? "").trim();
      const valori = valoriPeOptiune(varianteJsonLd, combo) ?? {};
      const pretVarianta = comboUnitPrice(combo, Number(product.price) || 0);
      /*
       * Disponibilitatea se socoteste PER VARIANTA, dar marcajul de pe produs
       * bate: cand comerciantul a pus „Stoc epuizat" sau „Precomanda", el se
       * aplica intregii pagini. Fara asta, o pagina cu butonul stins ar fi
       * declarat variante „InStock".
       */
      const varIndisponibil = outOfStock || comboEpuizat(combo);
      return {
        "@type": "Product",
        /* Numele combinatiei, nu al produsului: „Husa … — Gri" se citeste ca
           articol, iar sapte randuri cu acelasi nume nu s-ar deosebi. */
        name: `${product.name} — ${combo.title}`,
        /*
         * ═══ CAMPURILE COMUNE SE SCRIU PE FIECARE VARIANTA, NU SE MOSTENESC ═══ (30.08.2026)
         *
         * `description` era calculata sus si pusa numai pe `ProductGroup`. Search Console i-a
         * raportat unui comerciant „description lipsa" pe FIECARE varianta a fiecarui produs.
         *
         * ⚠ Documentatia spune ca variantele mostenesc de la grup. Raportul lor spune altceva. Nu
         * putem sti care validator are dreptate — dar putem sa nu ne mai bazam pe mostenire: ce e
         * comun se scrie pe fiecare varianta, si atunci intrebarea nici nu se mai pune. Aceeasi
         * regula ca peste tot: precautia noastra nu e regula lor, si nici invers.
         *
         * ⚠ Masurat inainte de a dubla textul: 3061 de produse, 45092 de variante, 3 magazine.
         * Adaosul mediu pe pagina e de ~5,9 KB, iar cel mai mare produs (100 de variante) adauga
         * 50 KB. E o plata reala, facuta cu ochii deschisi: fara ea, 45092 de articole raman
         * marcate ca incomplete in Merchant listings.
         */
        description: desc,
        ...(skuVarianta ? { sku: skuVarianta } : {}),
        ...(codVarianta ? { gtin: codVarianta } : {}),
        ...(mpn ? { mpn } : {}),
        /* ⚠ Si marca: e comuna, deci intra sub aceeasi regula ca descrierea. */
        brand: { "@type": "Brand", name: brandProdus },
        ...valori,
        /*
         * Poza variantei, cand are una a ei; altfel GALERIA PRODUSULUI, scrisa aici.
         *
         * ⚠ Comentariul de dinainte spunea „altfel mosteneste galeria" — dar nu mostenea nimic,
         * pur si simplu lipsea cheia. Era o afirmatie despre ce face validatorul LOR, scrisa de
         * noi, si de acelasi fel cu cea pe care raportul tocmai a dezmintit-o la `description`.
         * 8667 de variante din productie n-au poza proprie.
         */
        ...(combo.image ? { image: [combo.image] } : images?.length ? { image: images } : {}),
        offers: {
          "@type": "Offer",
          priceCurrency: "RON",
          price: pretVarianta,
          itemCondition: "https://schema.org/NewCondition",
          availability: varIndisponibil
            ? "https://schema.org/OutOfStock"
            : stockStatus === "preorder"
              ? "https://schema.org/PreOrder"
              : "https://schema.org/InStock",
          validFrom,
          priceValidUntil: PRICE_VALID_UNTIL,
          /* Aceeasi adresa la toate: pagina nu stie inca sa preselecteze o
             varianta din adresa. Google accepta, dar daca se adauga vreodata
             un parametru de preselectare, aici e locul care il foloseste. */
          url: productUrl,
          shippingDetails,
          hasMerchantReturnPolicy,
        },
      };
    });

    return {
      "@context": "https://schema.org",
      "@type": "ProductGroup",
      name: product.name,
      description: desc,
      url: productUrl,
      ...(productGroupID ? { productGroupID } : {}),
      ...(proprietatiCareVariaza.length ? { variesBy: proprietatiCareVariaza } : {}),
      /* Codul de la nivel de produs ramane, cand exista: descrie familia, iar
         cele de pe variante descriu articolele. Nu se exclud. */
      ...(gtin ? { gtin } : {}),
      ...(mpn ? { mpn } : {}),
      brand: { "@type": "Brand", name: brandProdus },
      ...(images?.length ? { image: images } : {}),
      hasVariant,
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: desc,
    url: productUrl,
    ...(product.sku ? { sku: product.sku } : {}),
    ...(gtin ? { gtin } : {}),
    ...(mpn ? { mpn } : {}),
    brand: { "@type": "Brand", name: brandProdus },
    ...(images?.length ? { image: images } : {}),
    offers: priceRange.hasRange
      ? {
          "@type": "AggregateOffer",
          priceCurrency: "RON",
          lowPrice: priceRange.min,
          highPrice: priceRange.max,
          ...(offerCount > 1 ? { offerCount } : {}),
          itemCondition: "https://schema.org/NewCondition",
          availability,
          // `AggregateOffer` mosteneste ambele campuri de la `Offer`. Fara ele,
          // produsele cu variante pierdeau avertismentul reparat in iulie pe
          // oferta simpla si il primeau inapoi in Search Console.
          validFrom,
          priceValidUntil: PRICE_VALID_UNTIL,
          url: productUrl,
          shippingDetails,
          hasMerchantReturnPolicy,
        }
      : {
          "@type": "Offer",
          priceCurrency: "RON",
          price: priceRange.min,
          itemCondition: "https://schema.org/NewCondition",
          availability,
          validFrom,
          priceValidUntil: PRICE_VALID_UNTIL,
          url: productUrl,
          shippingDetails,
          hasMerchantReturnPolicy,
        },
  };
}
