import type {
  CatalogEntry,
  CatalogVariant,
  StockChange,
  StockFeedRow,
  StockMatchKey,
  StockPlan,
  StockRowIssue,
} from "./types";

/**
 * Potriveste randurile din feed cu produsele din catalog si spune EXACT ce se va
 * schimba. Functie pura: nu atinge baza de date, deci se poate testa intreaga.
 *
 * Doua reguli din care nu se iese:
 *
 * 1. **Ce nu e in feed nu se atinge.** Functia nu intoarce niciodata o scriere
 *    pentru un produs care nu apare in fisier. Un feed de furnizor contine de
 *    obicei doar ce are pe stoc; daca am pune pe zero tot restul, o trimitere
 *    partiala ar goli magazinul.
 *
 * 2. **Ce e ambiguu se opreste, nu se ghiceste.** SKU-ul nu e unic in baza. Daca
 *    un cod prinde doua produse, randul devine eroare. Sa pui stocul pe produsul
 *    gresit e mai rau decat sa nu-l pui deloc.
 */

/** Cheia de cautare, adusa la o forma in care se pot compara doua fisiere. */
function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** O tinta gasita: produsul si, daca e cazul, varianta din el. */
interface Target {
  product: CatalogEntry;
  variantId: string | null;
  /**
   * SKU-ul combinatiei tintite.
   *
   * Fara el nu se poate ajunge inapoi la combinatia potrivita: `id`-ul unei
   * combinatii e un slug din optiuni ("galben-unic") si NU e unic in produs. Un
   * `find` pe id o intoarce pe PRIMA, deci stocul curent s-ar citi de la sora ei.
   */
  variantSku: string | null;
}

/** Combinatia tintita, cautata pe id SI pe SKU. */
function findVariant(target: Target): CatalogVariant | null {
  if (target.variantId === null) return null;
  const sameId = target.product.variants.filter((v) => v.id === target.variantId);
  if (sameId.length <= 1) return sameId[0] ?? null;

  const sku = norm(target.variantSku);
  return (sku && sameId.find((v) => norm(v.sku) === sku)) || sameId[0] || null;
}

/**
 * Cheia, cu zerourile din fata scoase — dar NUMAI daca e numai cifre.
 *
 * Excel salveaza o coloana de coduri formatata ca numar pierzand zeroul din
 * fata: un EAN-8 sau un UPC-12 care incepe cu 0 iese din fisier scurtat cu o
 * cifra, iar randul raporta „Niciun produs din magazin nu are acest cod" — desi
 * codul era acolo. Omul deschidea fisierul in Excel, vedea codul intreg pe ecran
 * (Excel il afiseaza dupa formatul celulei) si nu intelegea reclamatia.
 *
 * Se aplica doar la chei numerice: la un SKU ca "007-ABC" zeroul din fata poate
 * face parte din cod, si nu avem voie sa-l stergem.
 */
function cheieFaraZerouri(key: string): string | null {
  if (!/^\d+$/.test(key)) return null;
  const fara = key.replace(/^0+/, "");
  return fara === "" ? null : fara;
}

/**
 * Indexul de cautare. Cheile care duc la mai multe tinte se tin separat, ca sa
 * poata fi raportate ca ambigue in loc sa fie rezolvate la intamplare.
 */
class TargetIndex {
  private single = new Map<string, Target>();
  private ambiguous = new Map<string, Target[]>();
  /** Acelasi index, cheiat fara zerourile din fata. Doar pentru coduri numerice. */
  private faraZerouri = new Map<string, Target[]>();

  add(key: string, target: Target): void {
    if (!key) return;

    const dezbracata = cheieFaraZerouri(key);
    if (dezbracata) {
      const lista = this.faraZerouri.get(dezbracata) ?? [];
      lista.push(target);
      this.faraZerouri.set(dezbracata, lista);
    }

    const ambigue = this.ambiguous.get(key);
    if (ambigue) {
      /* Fara verificarea asta, aceeasi tinta putea intra de mai multe ori si
         mesajul catre om numara fantome („se potriveste cu: Tricou, Tricou"). */
      const deja = ambigue.some((t) => t.product.id === target.product.id && t.variantId === target.variantId);
      if (!deja) ambigue.push(target);
      return;
    }

    const existing = this.single.get(key);
    if (!existing) {
      this.single.set(key, target);
      return;
    }
    /* Acelasi produs si aceeasi varianta, listate de doua ori: nu e ambiguitate. */
    if (existing.product.id === target.product.id && existing.variantId === target.variantId) return;

    /*
     * Acelasi PRODUS, dar una e tinta pe produs si cealalta pe o combinatie a
     * LUI: nu e o ambiguitate adevarata, e acelasi articol descris de doua ori.
     *
     * Se alege COMBINATIA, fiindca la un produs cu variante coloana de stoc a
     * produsului e recalculata de declansatorul din Postgres ca suma
     * combinatiilor — deci scrierea pe produs oricum n-ar tine.
     *
     * Masurat in productie: 382 de produse din 3 magazine au SKU-ul produsului
     * identic cu al uneia dintre combinatiile lui. Pe cheia IMPLICITA toate
     * ieseau „ambigue" la fiecare rulare, deci stocul lor nu se actualiza
     * niciodata, si niciun mesaj nu spunea de ce.
     */
    if (existing.product.id === target.product.id) {
      const peCombinatie = existing.variantId === null ? target : existing;
      const peProdus = existing.variantId === null ? existing : target;
      if (peCombinatie.variantId !== null && peProdus.variantId === null) {
        this.single.set(key, peCombinatie);
        return;
      }
    }

    this.single.delete(key);
    this.ambiguous.set(key, [existing, target]);
  }

  lookup(key: string): { target: Target | null; ambiguous: boolean; coliziuni: Target[] } {
    const ambigue = this.ambiguous.get(key);
    if (ambigue) return { target: null, ambiguous: true, coliziuni: ambigue };

    const exact = this.single.get(key);
    if (exact) return { target: exact, ambiguous: false, coliziuni: [] };

    /* Ultima incercare: codul din fisier a pierdut zerourile din fata. */
    const dezbracata = cheieFaraZerouri(key);
    if (dezbracata) {
      const candidati = this.faraZerouri.get(dezbracata) ?? [];
      const distincte = new Map(candidati.map((t) => [`${t.product.id}|${t.variantId}`, t]));
      if (distincte.size === 1) {
        return { target: [...distincte.values()][0], ambiguous: false, coliziuni: [] };
      }
      if (distincte.size > 1) {
        return { target: null, ambiguous: true, coliziuni: [...distincte.values()] };
      }
    }

    return { target: null, ambiguous: false, coliziuni: [] };
  }
}

function buildIndex(catalog: CatalogEntry[], matchKey: StockMatchKey): TargetIndex {
  const index = new TargetIndex();

  const tintaVarianta = (product: CatalogEntry, variant: CatalogVariant): Target => ({
    product,
    variantId: variant.id,
    variantSku: variant.sku,
  });

  for (const product of catalog) {
    const productTarget: Target = { product, variantId: null, variantSku: null };

    switch (matchKey) {
      case "product_id":
        index.add(norm(product.id), productTarget);
        break;
      case "external_id":
        index.add(norm(product.external_id), productTarget);
        break;
      case "gtin":
        index.add(norm(product.gtin), productTarget);
        /*
         * Codul de bare sta si pe COMBINATII, si acolo sta cel mai des: 9.991 din
         * 47.314 de combinatii au unul propriu (masurat in productie). Fara
         * randurile de mai jos, un magazin de imbracaminte cu cod pe fiecare
         * marime — exact cum cere Google — primea „Niciun produs din magazin nu
         * are acest cod" pe FIECARE rand, desi codurile erau in baza.
         */
        for (const variant of product.variants) {
          index.add(norm(variant.gtin), tintaVarianta(product, variant));
        }
        break;
      case "sku":
        index.add(norm(product.sku), productTarget);
        break;
      case "variant_sku":
        for (const variant of product.variants) {
          index.add(norm(variant.sku), tintaVarianta(product, variant));
        }
        break;
      case "sku_auto":
        /* Un singur fisier poate amesteca SKU de produs cu SKU de varianta, cum
           arata si exemplul cerut: TRIC-001 pe produs, TRIC-001-M pe marime. */
        index.add(norm(product.sku), productTarget);
        for (const variant of product.variants) {
          index.add(norm(variant.sku), tintaVarianta(product, variant));
        }
        break;
    }
  }

  return index;
}

/** Valorile curente ale tintei, produs sau varianta. */
function currentValues(target: Target): { stock: number | null; price: number; inventoryOff: boolean } {
  if (target.variantId === null) {
    return {
      stock: target.product.stock_quantity,
      price: target.product.price,
      inventoryOff: !target.product.track_inventory,
    };
  }
  const variant = findVariant(target);
  return {
    stock: variant?.stock_quantity ?? null,
    price: variant?.price ?? target.product.price,
    /* La variante, urmarirea stocului tot de pe produs se ia. */
    inventoryOff: !target.product.track_inventory,
  };
}

export interface PlanOptions {
  matchKey: StockMatchKey;
  /** Scrie preturi. Fals => coloana de pret e ignorata complet. */
  updatePrice: boolean;
}

export function buildStockPlan(
  rows: StockFeedRow[],
  catalog: CatalogEntry[],
  options: PlanOptions,
): StockPlan {
  const index = buildIndex(catalog, options.matchKey);
  const changes: StockChange[] = [];
  const issues: StockRowIssue[] = [];
  let unchanged = 0;

  /*
   * Acelasi identificator de mai multe ori in ACELASI fisier.
   *
   * Se resping doar cand se CONTRAZIC. Daca furnizorul trimite doua cantitati
   * diferite pentru acelasi cod, singurul raspuns cinstit e sa spunem ca fisierul
   * se bate cap in cap.
   *
   * Dar de multe ori nu se contrazic: un export listeaza acelasi cod de doua ori
   * cu ACEEASI cantitate, sub statusuri diferite ("STOC" si "LICHIDARE STOC").
   * Acolo nu e nimic de ales. Respinse, asemenea randuri ar lasa varianta
   * neactualizata la fiecare rulare, la nesfarsit, pentru o problema inchipuita.
   */
  const firstRow = new Map<string, StockFeedRow>();
  const conflicting = new Set<string>();
  /** Randuri care repeta, identic, un cod deja luat mai sus. */
  const redundant = new Set<number>();
  for (const row of rows) {
    const key = norm(row.identifier);
    if (!key) continue;
    const first = firstRow.get(key);
    if (!first) {
      firstRow.set(key, row);
      continue;
    }
    if (first.stock !== row.stock || first.price !== row.price) conflicting.add(key);
    else redundant.add(row.rowIndex);
  }

  for (const row of rows) {
    const key = norm(row.identifier);

    if (!key) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "invalid",
        detail: "Randul nu are identificator.",
      });
      continue;
    }

    if (conflicting.has(key)) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "duplicate",
        detail: "Acelasi identificator apare de mai multe ori in fisier, cu cantitati diferite. Nu putem alege noi care e cea buna.",
      });
      continue;
    }

    if (redundant.has(row.rowIndex)) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "duplicate",
        detail: "Randul repeta un cod de mai sus, cu aceeasi valoare. S-a folosit primul.",
      });
      continue;
    }

    const wantsPrice = options.updatePrice && row.price !== null;
    if (row.stock === null && !wantsPrice) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "invalid",
        detail: "Randul nu are nici stoc, nici pret de actualizat.",
      });
      continue;
    }

    if (row.stock !== null && (!Number.isFinite(row.stock) || row.stock < 0 || !Number.isInteger(row.stock))) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "invalid",
        detail: "Stocul trebuie sa fie un numar intreg, zero sau mai mare.",
      });
      continue;
    }

    if (wantsPrice && (!Number.isFinite(row.price!) || row.price! < 0)) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "invalid",
        detail: "Pretul trebuie sa fie un numar zero sau mai mare.",
      });
      continue;
    }

    const { target, ambiguous, coliziuni } = index.lookup(key);

    if (ambiguous) {
      /* Numele produselor lovite, ca omul sa le poata cauta. Fara ele, raportul
         dadea acelasi text pentru toate randurile si nu se putea repara nimic. */
      const nume = coliziuni
        .slice(0, 3)
        .map((t) => (t.variantId ? `${t.product.name} / ${findVariant(t)?.title ?? t.variantId}` : t.product.name));
      const restul = coliziuni.length > nume.length ? ` si inca ${coliziuni.length - nume.length}` : "";
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "ambiguous",
        detail: nume.length
          ? `Codul se potriveste cu: ${nume.join(", ")}${restul}. Nu putem alege noi care e cel corect.`
          : "Codul se potriveste cu mai multe produse. Nu putem alege noi care e cel corect.",
      });
      continue;
    }

    if (!target) {
      issues.push({
        rowIndex: row.rowIndex,
        identifier: row.identifier,
        problem: "not_found",
        detail: "Niciun produs din magazin nu are acest cod.",
      });
      continue;
    }

    /*
     * Combinatia STINSA: se poate scrie in ea, dar nu se vede nicaieri.
     *
     * Declansatorul de suma numara doar combinatiile aprinse, iar pagina nu o
     * arata deloc — deci nici stocul, nici pretul scrise acolo nu exista pentru
     * niciun cumparator. 8.313 din 47.314 de combinatii sunt stinse in
     * productie, deci nu e un caz de colt.
     */
    if (target.variantId !== null) {
      const combinatie = findVariant(target);
      if (combinatie && !combinatie.enabled) {
        issues.push({
          rowIndex: row.rowIndex,
          identifier: row.identifier,
          problem: "ignored",
          detail: `Varianta „${combinatie.title}" a produsului „${target.product.name}" e dezactivata, deci stocul ei nu se vede in magazin. Activeaz-o din editarea produsului.`,
        });
        continue;
      }
    }

    const current = currentValues(target);
    const stockTo = row.stock !== null && row.stock !== current.stock ? row.stock : null;
    const priceTo = wantsPrice && row.price !== current.price ? row.price : null;

    if (stockTo === null && priceTo === null) {
      unchanged++;
      continue;
    }

    /*
     * STOCUL scris pe coloana produsului, la un produs cu variante aprinse, nu
     * tine.
     *
     * `products_sync_variant_stock` (declansator BEFORE INSERT/UPDATE in
     * Postgres) recalculeaza `products.stock_quantity` ca SUMA combinatiilor
     * aprinse. Sare doar cat timp `page_sections->'variants'` ramane neatins —
     * iar scriitorul chiar asta face, scrie numai coloana — deci valoarea
     * supravietuieste pana la prima vanzare a oricarei marimi si abia atunci se
     * intoarce la suma. Intre timp raportul spune „actualizat" si nimeni nu are
     * cum sa lege lucrurile.
     *
     * Se uita DOAR la stoc: PRETUL produsului-parinte e al lui si se scrie
     * normal, deci un feed care actualizeaza numai preturi merge mai departe.
     */
    if (stockTo !== null && target.variantId === null && target.product.variantsEnabled) {
      const combinatiiAprinse = target.product.variants.filter((v) => v.enabled);
      const aprinse = combinatiiAprinse.length;
      /*
       * Se opreste DOAR cand declansatorul chiar ar suprascrie.
       *
       * `sync_product_stock_from_variants` sare cand macar o combinatie aprinsa
       * n-are stoc numeric — si atunci scrierea pe produs chiar tine. Masurat in
       * productie: din 3.207 produse cu variante aprinse, 351 sunt in situatia
       * asta. O regula care nu copiaza conditia declansatorului le-ar fi refuzat
       * pe toate, degeaba.
       */
      const declansatorulSuprascrie = aprinse > 0 && combinatiiAprinse.every((v) => v.stockNumeric);
      if (declansatorulSuprascrie) {
        issues.push({
          rowIndex: row.rowIndex,
          identifier: row.identifier,
          problem: "ignored",
          detail: `„${target.product.name}" are ${aprinse} variante, iar stocul lui e suma lor. Un stoc scris pe produs nu se pastreaza. Trimite cate un rand per varianta si alege potrivirea dupa „SKU varianta".`,
        });
        continue;
      }
    }

    const variant = findVariant(target);

    changes.push({
      rowIndex: row.rowIndex,
      identifier: row.identifier,
      productId: target.product.id,
      productName: target.product.name,
      variantId: target.variantId,
      variantSku: variant?.sku ?? null,
      variantTitle: variant?.title ?? null,
      stockFrom: current.stock,
      stockTo,
      priceFrom: current.price,
      priceTo,
      inventoryOff: current.inventoryOff,
    });
  }

  return { changes, unchanged, issues, totalRows: rows.length };
}

/** Cifrele pentru ecranul de previzualizare. */
export function summarizePlan(plan: StockPlan) {
  const stockChanges = plan.changes.filter((c) => c.stockTo !== null).length;
  const priceChanges = plan.changes.filter((c) => c.priceTo !== null).length;
  const variantChanges = plan.changes.filter((c) => c.variantId !== null).length;
  const inventoryOff = plan.changes.filter((c) => c.inventoryOff).length;
  const toZero = plan.changes.filter((c) => c.stockTo === 0).length;

  const byProblem = { not_found: 0, ambiguous: 0, invalid: 0, duplicate: 0, ignored: 0 };
  for (const issue of plan.issues) byProblem[issue.problem]++;

  return {
    totalRows: plan.totalRows,
    willWrite: plan.changes.length,
    stockChanges,
    priceChanges,
    variantChanges,
    inventoryOff,
    toZero,
    unchanged: plan.unchanged,
    ...byProblem,
  };
}
