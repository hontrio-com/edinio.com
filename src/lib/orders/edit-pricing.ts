/**
 * Aritmetica editarii unei comenzi din panou, intr-un singur loc.
 *
 * Editarea comenzii era A TREIA cale de pret a proiectului si nu trecea prin
 * niciunul din motoarele pe care le folosesc celelalte doua. Un produs variabil
 * adaugat din panou intra la pretul de BAZA, fara marime: ANTIFOANE INT UF
 * REFILL au baza 156,80 si singura combinatie activa 438,00, deci fiecare bucata
 * adaugata pierdea 281,20 lei si coletul pleca fara marime. Treptele de cantitate
 * nu existau deloc: cine cerea inca doua bucati primea doua linii lipite la
 * coada, niciodata pachetul de trei pe care il promite pagina produsului.
 *
 * Modul PUR: fara React, fara Supabase, fara retea. Ce intra sunt liniile
 * comenzii, adaugarile cerute si catalogul viu; ce iese sunt liniile noi si
 * diferenta de subtotal. Sta separat de `order.actions.ts` din doua motive:
 * actiunile de server nu se pot testa in proiectul asta (`npm test` ruleaza doar
 * module pure), iar previzualizarea din modal trebuie sa dea EXACT aceleasi
 * cifre ca serverul — pana acum isi facea propria socoteala si se contrazicea cu
 * el pe fiecare comanda care trecea pragul de livrare gratuita.
 *
 * Acelasi tipar ca `vatBase` din `@/lib/utils/vat`.
 */

import {
  combinatiiActiveUnice,
  comboStock,
  comboUnitPrice,
  parseVariants,
  type VariantCombo,
  type VariantOption,
  type VariantsData,
} from "@/lib/storefront/variants";
import { construiesteTrepte, pretPeTrepte } from "@/lib/storefront/quantity-tiers";
import { computeVat, vatBase } from "@/lib/utils/vat";

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Doi bani: preturile de treapta sunt NEROTUNJITE, deci nu se compara cu `===`. */
const TOLERANTA = 0.005;

export interface LinieComanda {
  /** `null` pe comenzile venite din marketplace, cand SKU-ul nu s-a mapat. */
  product_id: string | null;
  name: string;
  price: number;
  quantity: number;
}

/** O combinatie activa, redusa la ce foloseste panoul. */
export interface ComboSlim {
  title: string;
  price: number;
  /** `null` = fara stoc declarat pe varianta, deci ramane stocul produsului. */
  stock: number | null;
}

export interface VarianteSlim {
  options: VariantOption[];
  combos: ComboSlim[];
}

/** Produsul asa cum arata AZI in catalog, cat ii trebuie editarii. */
export interface CatalogEdit {
  name: string;
  price: number;
  is_bundle: boolean;
  /** `null` cand produsul nu e variabil. */
  variante: VarianteSlim | null;
  /** Configuratia bruta din `page_sections.quantity_tiers`. */
  trepte: unknown;
}

export interface Adaugare {
  product_id: string;
  variant_title?: string | null;
  quantity: number;
}

/** Ce s-a adaugat efectiv — hraneste scaderea de stoc, niciodata totalurile. */
export interface LinieAdaugata {
  product_id: string;
  variant_title: string | null;
  quantity: number;
}

export interface PlanEditare {
  /** Liniile complete ale comenzii dupa editare, in ordinea de scris in baza. */
  items: unknown[];
  /**
   * Cat se schimba subtotalul, NU subtotalul recalculat din linii.
   *
   * Recalcularea din linii ar fi rescris tacit subtotalul comenzilor pe care nu
   * le atinge nimeni: `placeOrder` rotunjeste pretul unitar de treapta pe linia
   * principala, iar `placeCartOrder` nu, deci pe unele comenzi suma liniilor
   * difera de subtotalul scris cu un ban. Cu diferenta, zero adaugari inseamna
   * exact zero schimbare — proprietatea pe care se bazeaza si comentariul din
   * `updateOrderDetails`.
   */
  deltaSubtotal: number;
  adaugate: LinieAdaugata[];
  /**
   * Cat adauga la subtotal FIECARE adaugare, pe cheia ei.
   *
   * Panoul afisa `pret x cantitate` pe randul produsului adaugat, care la trepte
   * si la contopire nu e nici pretul liniei, nici cresterea comenzii: pe un
   * produs cu pachete, randul scria 342,00 in timp ce subtotalul de dedesubt
   * crestea cu 273,60, iar la o contopire care ieftinea putea sa scrie 149,00
   * langa un subtotal care SCADEA cu 20,00.
   */
  contributii: Record<string, number>;
}

/** Linia de extraoptiune, care NU e produs si nu intra in subtotal. */
export function esteLinieExtra(linie: LinieComanda): boolean {
  return typeof linie.product_id === "string" && linie.product_id.startsWith("extra_");
}

/**
 * Cheia unei linii adaugate in aceeasi sesiune de editare.
 *
 * Doua marimi ale aceluiasi produs sunt doua linii, nu una cu cantitate dubla.
 */
export function cheieLinie(productId: string, variantTitle?: string | null): string {
  return `${productId}::${variantTitle ?? ""}`;
}

/**
 * Cheile pe care le stie o linie obisnuita de marfa.
 *
 * `placeOrder` mai poate pune si `customization` (personalizarea ceruta de
 * client), iar comenzile de marketplace pun `sku` sau `barcode`. Toate spun ceva
 * despre ACELE bucati, nu despre produs, deci o linie care le poarta nu se
 * contopeste: cele doua bucati adaugate de comerciant ar fi mostenit tacit
 * gravura comandata de client.
 */
const CHEI_DE_LINIE_SIMPLA = new Set(["product_id", "name", "price", "quantity"]);

function eLinieSimpla(brut: unknown): boolean {
  if (!brut || typeof brut !== "object") return false;
  return Object.keys(brut as Record<string, unknown>).every((k) => CHEI_DE_LINIE_SIMPLA.has(k));
}

/** Citeste o linie din `orders.items` fara sa creada nimic despre forma ei. */
function citesteLinie(brut: unknown): LinieComanda | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  const pid = typeof o.product_id === "string" ? o.product_id : null;
  const qty = Number(o.quantity);
  const price = Number(o.price);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return null;
  return { product_id: pid, name: String(o.name ?? ""), price, quantity: qty };
}

/**
 * Combinatiile active ale unui produs, reduse la ce ii trebuie panoului.
 *
 * Se slabeste PE SERVER, nu in browser: `page_sections` are in medie 1,5 KB pe
 * produs si trece de 60 KB pe douazeci de rezultate de cautare, dintre care
 * panoului ii trebuie vreo doua sute de octeti. Trecerea prin
 * `combinatiiActiveUnice` nu e doar economie: ea pastreaza regula „la titluri
 * duplicate castiga PRIMA", aceeasi pe care o aplica `enabledComboPriceMap` cand
 * se repretuieste comanda. Fara ea, panoul ar arata pretul unei combinatii si
 * serverul ar incasa pretul alteia cu acelasi titlu.
 */
export function slabesteVariante(pageSections: unknown, basePrice: number): VarianteSlim | null {
  const v = parseVariants(pageSections);
  if (!v) return null;
  return {
    options: v.options,
    combos: combinatiiActiveUnice(v).map((c) => ({
      title: c.title,
      price: round2(comboUnitPrice(c, round2(basePrice))),
      stock: comboStock(c),
    })),
  };
}

/**
 * Forma slabita, refacuta in `VariantsData`, ca `VariantPicker` si
 * `isValueAvailable` sa mearga neatinse in panou.
 *
 * Combinatiile sunt deja filtrate pe active si dedublate pe titlu, deci
 * `enabled` e mereu adevarat aici.
 */
export function variantsDinSlim(slim: VarianteSlim): VariantsData {
  const combinations: VariantCombo[] = slim.combos.map((c, i) => ({
    id: `slim-${i}`,
    title: c.title,
    price: String(c.price),
    compare_at_price: "",
    sku: "",
    stock_quantity: c.stock === null ? "" : String(c.stock),
    image: "",
    enabled: true,
  }));
  return { options: slim.options, combinations };
}

/** Pretul unitar al unei combinatii, sau `null` cand titlul nu mai e activ. */
export function pretVarianta(cat: CatalogEdit, variantTitle: string): number | null {
  const c = cat.variante?.combos.find((x) => x.title === variantTitle);
  return c ? round2(c.price) : null;
}

/**
 * Linia asta e inca la pretul pe care il stie catalogul?
 *
 * Doua raspunsuri bune: pretul de baza de azi, sau pretul de treapta care iese
 * pentru CANTITATEA ei. Al doilea conteaza fiindca treptele lasa deliberat un
 * pret unitar nerotunjit (250 / 3 = 83,3333), iar o linie de pachet e la fel de
 * autoritara ca una simpla.
 *
 * Orice alt pret inseamna ca linia a fost stabilita de altcineva — un order
 * bump, o oferta „cumpara impreuna", un pachet, sau pur si simplu catalogul de
 * acum trei luni — si atunci nu se atinge.
 */
function estePretAutoritar(linie: LinieComanda, cat: CatalogEdit): boolean {
  const baza = round2(cat.price);
  if (Math.abs(linie.price - baza) < TOLERANTA) return true;
  const trepte = construiesteTrepte(cat.trepte, baza);
  const dupaTrepte = pretPeTrepte(trepte, linie.quantity, baza).unitPrice;
  return Math.abs(linie.price - dupaTrepte) < TOLERANTA;
}

/**
 * Se poate contopi adaugarea cu o linie care e deja pe comanda?
 *
 * Lista ALBA, nu neagra: se contopeste doar ce se poate dovedi curat. Motivul e
 * ca liniile stabilite de oferte nu poarta niciun semn pe ele — `applyOfferPricing`
 * schimba doar `price` (si desprinde o bucata) si pleaca. O contopire care
 * repretuieste din catalog ar sterge tacit reducerea convenita cu clientul si
 * i-ar urca pretul dupa ce a comandat.
 *
 * Toate conditiile deodata:
 *   1. exista EXACT o linie cu acel produs — o pereche de linii inseamna un bump
 *      aplicat pe o bucata (`aplicaBumpPeOBucata`), si nu se stie care e care;
 *   2. numele e identic cu cel din catalog, litera cu litera. Nicio parsare de
 *      paranteze: 65 de produse au paranteza chiar la finalul numelui si 161 de
 *      titluri de combinatie contin ele insele paranteze, deci „numele minus
 *      paranteza finala" ar taia in carne vie;
 *   3. pretul e unul autoritar (vezi `estePretAutoritar`);
 *   4. produsul nu e pachet — `expandBundleStock` scade componentele, iar o
 *      recantarire a liniei ar scadea a doua oara;
 *   5. adaugarea nu numeste o varianta. O linie de varianta are varianta coapta
 *      in nume, deci pica oricum la conditia 2; conditia asta o spune pe fata.
 */
export function poateContopi(
  prevItems: unknown[],
  productId: string,
  cat: CatalogEdit,
  variantTitle?: string | null,
): boolean {
  if (variantTitle) return false;
  if (cat.is_bundle) return false;
  const potriviri = prevItems.filter((brut) => {
    const l = citesteLinie(brut);
    return !!l && l.product_id === productId;
  });
  if (potriviri.length !== 1) return false;
  // Personalizare, SKU de marketplace, orice altceva: linia spune ceva despre
  // bucatile ei anume, deci nu se poate intinde peste bucati noi.
  if (!eLinieSimpla(potriviri[0])) return false;
  const linie = citesteLinie(potriviri[0])!;
  if (linie.name !== cat.name) return false;
  if (!(linie.quantity >= 1)) return false;
  return estePretAutoritar(linie, cat);
}

/**
 * Planul de editare: liniile noi ale comenzii si cat se schimba subtotalul.
 *
 * Ordinea din interior conteaza: intai se valideaza varianta (un produs variabil
 * fara varianta e REFUZAT, nu pretuit la baza), apoi se pretuieste prin motorul
 * de trepte, apoi se decide contopirea.
 */
export function planificaAdaugarea(
  prevItems: unknown[],
  adaugari: Adaugare[],
  catalog: Map<string, CatalogEdit>,
): PlanEditare | { error: string } {
  // Adaugarile aceluiasi produs SI aceleiasi variante se aduna; marimi diferite
  // raman linii diferite.
  const cerute = new Map<string, LinieAdaugata>();
  for (const a of adaugari ?? []) {
    const qty = Math.floor(Number(a?.quantity));
    if (!a?.product_id || !Number.isFinite(qty) || qty <= 0) continue;
    const titlu = a.variant_title?.trim() ? a.variant_title.trim() : null;
    const cheie = cheieLinie(a.product_id, titlu);
    const dejaCerut = cerute.get(cheie)?.quantity ?? 0;
    cerute.set(cheie, {
      product_id: a.product_id,
      variant_title: titlu,
      quantity: Math.min(999, dejaCerut + qty),
    });
  }

  const items = [...prevItems];
  const adaugate: LinieAdaugata[] = [];
  const contributii: Record<string, number> = {};
  let delta = 0;

  for (const cerut of cerute.values()) {
    const cat = catalog.get(cerut.product_id);
    if (!cat) {
      return { error: "Unul dintre produsele adaugate nu mai este disponibil. Reincarca pagina si incearca din nou." };
    }

    let unitar: number;
    let nume: string;

    if (cat.variante) {
      if (cat.variante.combos.length === 0) {
        return { error: `Produsul „${cat.name}" are variante, dar niciuna nu este activa. Activeaza o varianta din pagina produsului.` };
      }
      if (!cerut.variant_title) {
        return { error: `Produsul „${cat.name}" are variante. Alege o optiune inainte de a-l adauga.` };
      }
      if (cat.is_bundle) {
        return { error: `Produsul „${cat.name}" este pachet cu variante si nu poate fi adaugat din panou.` };
      }
      const pret = pretVarianta(cat, cerut.variant_title);
      // Varianta disparuta intre cautare si salvare nu cade pe pretul de baza:
      // ar fi exact portita pe care o inchidem la 4a.
      if (pret === null) {
        return { error: `Varianta „${cerut.variant_title}" nu mai este disponibila la „${cat.name}". Reincarca pagina si alege din nou.` };
      }
      unitar = pret;
      nume = `${cat.name} (${cerut.variant_title})`;
    } else {
      if (cerut.variant_title) {
        return { error: `Produsul „${cat.name}" nu are variante. Reincarca pagina si incearca din nou.` };
      }
      unitar = round2(cat.price);
      nume = cat.name;
    }

    const trepte = construiesteTrepte(cat.trepte, unitar);
    const separat = pretPeTrepte(trepte, cerut.quantity, unitar);
    const cheie = cheieLinie(cerut.product_id, cerut.variant_title);

    let contopit = false;
    if (poateContopi(prevItems, cerut.product_id, cat, cerut.variant_title)) {
      const idx = items.findIndex((brut) => {
        const l = citesteLinie(brut);
        return !!l && l.product_id === cerut.product_id;
      });
      const veche = citesteLinie(items[idx])!;
      const vechiSubtotal = round2(veche.price * veche.quantity);
      const cantitateTotala = veche.quantity + cerut.quantity;
      const linie = pretPeTrepte(trepte, cantitateTotala, unitar);
      /*
       * Contopirea are voie sa ieftineasca, niciodata sa scumpeasca.
       *
       * De obicei asta e garantat de programarea dinamica din `pretPeTrepte`,
       * care gaseste cea mai ieftina acoperire. Peste `MAX_CANTITATE_PACHETE`
       * (500 de bucati) insa, ea renunta la pachete si intoarce pretul intreg:
       * 300 de bucati luate cu 83,33 plus inca 250 ar fi fost repretuite toate
       * la 100, adica 5.000 de lei in plus peste bucatile pe care clientul le
       * avea deja. Cand se intampla asta, linia noua pleaca separat.
       */
      if (linie.subtotal <= vechiSubtotal + separat.subtotal + TOLERANTA) {
        items[idx] = {
          ...(items[idx] as Record<string, unknown>),
          product_id: cerut.product_id,
          name: cat.name,
          // NEROTUNJIT, ca `pret x cantitate` sa dea exact subtotalul pachetului.
          // Rotunjit la ban, trei bucati de 250 ar da 249,99.
          price: linie.unitPrice,
          quantity: cantitateTotala,
        };
        const contributie = round2(linie.subtotal - vechiSubtotal);
        delta += contributie;
        contributii[cheie] = contributie;
        contopit = true;
      }
    }

    if (!contopit) {
      items.push({
        product_id: cerut.product_id,
        name: nume,
        price: separat.unitPrice,
        quantity: cerut.quantity,
      });
      delta += separat.subtotal;
      contributii[cheie] = separat.subtotal;
    }

    adaugate.push(cerut);
  }

  return { items, deltaSubtotal: round2(delta), adaugate, contributii };
}

/**
 * Totalul comenzii din componentele ei — o singura formula pentru server si
 * pentru previzualizarea din modal.
 *
 * Pana acum modalul aduna `order.total + suma adaugata`, iar serverul recalcula
 * din componente si reevalua pragul de livrare gratuita. Pe comanda #0065
 * (subtotal 108, prag 150) modalul arata 193,00 si serverul scria 173,00,
 * fiindca transportul devenea gratuit. Avertismentul „diferenta de X nu se
 * incaseaza automat" numea deci o suma gresita, iar rambursul de pe AWB se ia
 * din totalul serverului.
 */
export function recalculeazaTotal(p: {
  subtotal: number;
  extras: number;
  discount: number;
  cardDiscount: number;
  codDiscount: number;
  codFee: number;
  shipping: number;
  /** `null` = magazinul nu ofera livrare gratuita peste un prag. */
  freeShippingThreshold: number | null;
  vat: { vat_enabled: boolean; vat_rate: number; prices_include_vat: boolean };
}): { total: number; vatAmount: number; shipping: number } {
  const subtotal = round2(p.subtotal);
  let shipping = Math.max(0, round2(p.shipping));
  if (p.freeShippingThreshold !== null && subtotal >= p.freeShippingThreshold) shipping = 0;

  const { vatAmount, vatAddOn } = computeVat(
    vatBase({
      goods: subtotal,
      extras: p.extras,
      shipping,
      discount: p.discount,
      cardDiscount: p.cardDiscount,
      codDiscount: p.codDiscount,
      codFee: p.codFee,
    }),
    p.vat,
  );

  const total = Math.max(0, round2(
    subtotal
    + p.extras
    - p.discount
    - p.cardDiscount
    - p.codDiscount
    + p.codFee
    + shipping
    + vatAddOn,
  ));

  return { total, vatAmount, shipping };
}

/** Suma extraoptiunilor de pe comanda; ele NU intra in subtotal. */
export function sumaExtraoptiunilor(items: unknown[]): number {
  return round2(
    items
      .map(citesteLinie)
      .filter((l): l is LinieComanda => !!l && esteLinieExtra(l))
      .reduce((s, l) => s + l.price * l.quantity, 0),
  );
}
