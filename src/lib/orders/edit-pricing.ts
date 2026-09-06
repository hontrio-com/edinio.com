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
import { MAX_CANTITATE_LINIE, cantitateCeruta, mesajCantitate } from "@/lib/orders/quantity";
import { computeVat, vatBase } from "@/lib/utils/vat";
import { esteIdExtra } from "@/lib/orders/extras";

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Cat de departe poate sta un pret de linie de cel din catalog si sa fie tot al
 * lui: o JUMATATE DE BAN, plus zgomotul virgulei mobile.
 *
 * Preturile de pachet sunt nerotunjite (10,45 pe doua bucati inseamna 5,225),
 * deci nu se compara cu `===`. Iar comenzile scrise inainte de reparatia
 * pretului unitar poarta valoarea ROTUNJITA — 5,23 — adica exact o jumatate de
 * ban distanta. Cu pragul fix la 0,005, comparat strict, ele cadeau sau treceau
 * dupa cum pica ultimul bit: la o proba, unul din zece pachete de doua bucati
 * cadea. Iar o linie cazuta nu se mai contopeste, deci comerciantul care mai
 * adauga o bucata primeste doua linii lipite in loc de pachetul urmator.
 *
 * Nu inghite nimic real: un pret stabilit ALTFEL — un bump, o oferta, catalogul
 * de acum trei luni — e la cel putin un ban distanta, adica de doua ori mai
 * mult.
 */
const TOLERANTA = 0.0051;

/*
 * Despartitorii amprentei de linii (vezi `amprentaLinii`).
 *
 * Nu sunt decorativi si nu pot lipsi: lipite cap la cap, o linie „A" de 1 leu in
 * 11 bucati si una „A" de 11 lei intr-o bucata dau amandoua acelasi sir — adica
 * exact schimbarea pe care amprenta exista ca sa o prinda. Separatorii ASCII de
 * unitate si de inregistrare nu pot aparea intr-un nume de produs. Se scriu prin
 * `fromCharCode`, si nu ca literale: un caracter de control pus direct in fisier
 * e invizibil in orice editor si il poate sterge oricine, fara sa vada ca a facut-o.
 */
const SEP_CAMP = String.fromCharCode(31);
const SEP_LINIE = String.fromCharCode(30);

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
  /**
   * Mai e produsul in vanzare?
   *
   * Produsele liniilor DEJA vandute se citesc dinadins fara filtrul de activare —
   * altfel o linie a unui produs stins intre timp n-ar mai putea fi nici macar
   * scoasa. Steagul spune insa ca pe ACELA nu se mai poate CRESTE cantitatea:
   * `expandBundleStock` refuza orice id inactiv, deci butonul „+" ar fi picat la
   * salvare cu un mesaj despre pachete, dupa ce omul a mai corectat si alte campuri.
   */
  activ: boolean;
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

/** O linie EXISTENTA, dusa la o cantitate noua. `quantity: 0` = scoasa de tot. */
export interface ModificareLinie {
  /** Pozitia in `orders.items`, asa cum a fost citita de panou. */
  index: number;
  quantity: number;
}

/** Ce s-a intamplat cu o linie existenta pe care comerciantul a atins-o. */
export interface RandEditat {
  index: number;
  /** Cantitatea finala; `0` inseamna ca linia nu mai exista. */
  quantity: number;
  /** Pretul unitar final — repretuit prin trepte sau pastrat, dupa caz. */
  price: number;
  /** Cat aduce linia DUPA editare (la extraoptiuni: in `extras`, nu in subtotal). */
  subtotal: number;
  /** Cat aducea INAINTE. Diferenta lor e chiar contributia liniei la delta. */
  subtotalVechi: number;
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
  /**
   * Suma extraoptiunilor DUPA editare.
   *
   * Se intoarce din plan, si nu se mai calculeaza de apelant din liniile VECHI:
   * de cand se pot scoate linii, o extraoptiune scoasa trebuie sa iasa si din
   * total. Cu zero modificari da exact `sumaExtraoptiunilor(prevItems)`.
   */
  extras: number;
  /** Ce stoc se REVENDICA in plus (adaugari + cresteri de cantitate). */
  adaugate: LinieAdaugata[];
  /** Ce stoc se DA INAPOI (scoateri + scaderi de cantitate). */
  scoase: LinieAdaugata[];
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
  /** Starea finala a fiecarei linii existente ATINSE, pe indexul ei original. */
  randuri: RandEditat[];
  /**
   * Indicii liniilor scazute sau scoase al caror stoc NU se poate da inapoi.
   *
   * Nu e o eroare, e o marturisire: pentru liniile astea nu se stie CE s-a
   * consumat (varianta neidentificabila in catalogul de azi, produs sters), iar
   * un „dau inapoi ceva ce pare potrivit" ar umfla stocul altei marimi. Panoul le
   * arata, comerciantul corecteaza de mana.
   */
  faraStoc: number[];
}

/** Linia de extraoptiune, care NU e produs si nu intra in subtotal. */
export function esteLinieExtra(linie: LinieComanda): boolean {
  return esteIdExtra(linie.product_id);
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
function estePretAutoritarLa(linie: LinieComanda, unitar: number, trepteBrute: unknown): boolean {
  const baza = round2(unitar);
  if (Math.abs(linie.price - baza) < TOLERANTA) return true;
  const trepte = construiesteTrepte(trepteBrute, baza);
  const dupaTrepte = pretPeTrepte(trepte, linie.quantity, baza).unitPrice;
  return Math.abs(linie.price - dupaTrepte) < TOLERANTA;
}

function estePretAutoritar(linie: LinieComanda, cat: CatalogEdit): boolean {
  return estePretAutoritarLa(linie, cat.price, cat.trepte);
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
      quantity: Math.min(MAX_CANTITATE_LINIE, dejaCerut + qty),
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

  return {
    items,
    deltaSubtotal: round2(delta),
    extras: sumaExtraoptiunilor(items),
    adaugate,
    scoase: [],
    contributii,
    randuri: [],
    faraStoc: [],
  };
}

/**
 * Ce se poate face cu o linie care e DEJA pe comanda.
 *
 * Nu e o lista de reguli de interfata: aceeasi functie o cheama si panoul (ca sa
 * stinga butoanele) si serverul (ca sa refuze ce n-avea voie sa se ceara). Scrisa
 * de doua ori, ar fi mers imediat pe drumuri diferite — actiunile de server sunt
 * endpointuri publice, deci butonul stins nu inseamna cerere imposibila.
 *
 * ═══ ASIMETRIA CARE TINE TOT ═══
 *
 * Cresterea si scaderea NU au aceleasi conditii, si asta e intentionat:
 *
 *   - a CRESTE inseamna a vinde bucati in plus, deci cere sa se stie exact CE se
 *     scade din stoc. Fara certitudine, se refuza — altfel se vinde marfa care nu
 *     exista, exact gaura inchisa pe variante ([[supravanzare-variante]]);
 *   - a SCADEA sau a SCOATE nu vinde nimic. Se lasa sa se intample chiar si cand
 *     stocul nu se poate da inapoi — dar atunci NU se atinge nici stocul, nici
 *     `stoc_rezervat`, si linia se trece in `faraStoc` ca sa se vada pe ecran.
 *     Asa comanda ramane corecta la bani, iar marfa ramane rezervata (se elibereaza
 *     oricum daca comanda se anuleaza), in loc sa se umfle stocul altei marimi.
 */
export interface CapacitateLinie {
  index: number;
  /** Numele, pretul si cantitatea de pe comanda — panoul nu mai reciteste `items`. */
  name: string;
  price: number;
  quantity: number;
  esteExtra: boolean;
  /** Titlul variantei, cand s-a putut identifica in catalogul de AZI. */
  variantTitle: string | null;
  /** Linia se poate scoate sau scadea? Fals doar pe linii pe care nu le pot citi. */
  poateScadea: boolean;
  poateCreste: boolean;
  /** De ce nu poate creste — mesaj de aratat pe ecran si de intors de pe server. */
  motivCrestere: string | null;
  /** Se misca stocul cand linia scade sau dispare? */
  stocSeMisca: boolean;
  /** Cantitatea noua se repretuieste prin treptele de azi? */
  repretuire: boolean;
  /** Pretul unitar din catalog de la care pleaca repretuirea. */
  unitarCatalog: number | null;
}

/**
 * Varianta unei linii existente, identificata SIGUR sau deloc.
 *
 * `orders.items` NU retine `variant_title` nicaieri — numele e singura urma a
 * marimii vandute (vezi `placeOrder`, unde scrie exact asta). Deci se merge
 * invers: se compun numele pe care le-ar fi produs combinatiile ACTIVE de azi
 * (`Produs (Titlu)`, ca in `pretulLiniei`) si se cauta o potrivire pe sirul
 * INTREG.
 *
 * Nu e „parsare de paranteze", si tocmai de aia merge: 65 de produse au paranteza
 * chiar la finalul numelui si 161 de titluri de combinatie contin ele insele
 * paranteze, deci taierea „numele minus paranteza finala" ar fi taiat in carne
 * vie. Titlurile vin deja dedublate din `combinatiiActiveUnice`, deci o potrivire
 * nu poate fi ambigua.
 */
function identificaVarianta(linie: LinieComanda, cat: CatalogEdit): string | null {
  if (!cat.variante) return null;
  const gasit = cat.variante.combos.find((c) => `${cat.name} (${c.title})` === linie.name);
  return gasit ? gasit.title : null;
}

const MOTIV_FARA_CATALOG = "Produsul nu mai este in catalog, deci nu pot verifica stocul pentru bucati in plus. Scoate linia sau adauga alt produs.";
const MOTIV_INACTIV = "Produsul e dezactivat in catalog, deci nu se mai pot vinde bucati in plus din el. Reactiveaza-l din pagina produsului, apoi incearca din nou.";
const MOTIV_VARIANTA = "Nu pot recunoaste varianta acestei linii in catalogul de azi (numele s-a schimbat sau combinatia a fost stinsa), deci nu pot scadea stocul potrivit. Adauga bucatile in plus din cautarea de mai jos.";
const MOTIV_LINIE_SPECIALA = "Linia poarta personalizare sau vine dintr-un marketplace, deci bucatile in plus n-ar mosteni corect datele ei. Adauga-le ca linie noua.";
const MOTIV_NECITIBILA = "Linia are o forma pe care nu o pot citi. Contacteaza suportul.";

export function capacitatiLinii(prevItems: unknown[], catalog: Map<string, CatalogEdit>): CapacitateLinie[] {
  return prevItems.map((brut, index) => {
    const l = citesteLinie(brut);
    const gol: CapacitateLinie = {
      index, name: "", price: 0, quantity: 0, esteExtra: false, variantTitle: null,
      poateScadea: false, poateCreste: false, motivCrestere: MOTIV_NECITIBILA,
      stocSeMisca: false, repretuire: false, unitarCatalog: null,
    };
    if (!l) return gol;

    const comun = { index, name: l.name, price: l.price, quantity: l.quantity, poateScadea: true };

    // Extraoptiunile n-au stoc si n-au pret in catalog: se misca liber, la pretul
    // lor de pe comanda.
    if (esteLinieExtra(l)) {
      return {
        ...comun, esteExtra: true, variantTitle: null, poateCreste: true, motivCrestere: null,
        stocSeMisca: false, repretuire: false, unitarCatalog: null,
      };
    }

    const cat = l.product_id ? catalog.get(l.product_id) : undefined;
    if (!cat) {
      return {
        ...comun, esteExtra: false, variantTitle: null, poateCreste: false,
        motivCrestere: MOTIV_FARA_CATALOG, stocSeMisca: false, repretuire: false, unitarCatalog: null,
      };
    }

    const simpla = eLinieSimpla(brut);
    const variantTitle = identificaVarianta(l, cat);
    /*
     * Produsul are variante, dar linia nu se potriveste cu niciuna. Poate fi o
     * comanda de dinainte ca produsul sa capete variante, un titlu redenumit, sau
     * o combinatie stinsa. In toate cazurile: nu se stie din ce marime s-a scazut.
     *
     * Si pachetele cu variante intra aici — `planificaAdaugarea` le refuza oricum
     * la adaugare, deci n-au de ce sa aiba o a doua purtare la editare.
     */
    const varianteNecunoscute = !!cat.variante && (variantTitle === null || cat.is_bundle);
    const unitarCatalog = variantTitle !== null ? pretVarianta(cat, variantTitle) : round2(cat.price);

    const motivCrestere = varianteNecunoscute ? MOTIV_VARIANTA
      : !cat.activ ? MOTIV_INACTIV
      : !simpla ? MOTIV_LINIE_SPECIALA
      : null;

    return {
      ...comun,
      esteExtra: false,
      variantTitle,
      poateCreste: motivCrestere === null,
      motivCrestere,
      // Pachetele se desfac in componente la fiecare miscare, deci stocul lor se
      // misca la fel de bine ca al unui produs simplu.
      stocSeMisca: !varianteNecunoscute,
      /*
       * Se repretuieste DOAR ce se poate dovedi ca e inca pretul catalogului —
       * de baza sau de treapta, pentru cantitatea de acum. Orice alt pret a fost
       * stabilit de altcineva (un bump, o oferta „cumpara impreuna", catalogul de
       * acum trei luni) si se pastreaza intocmai: repretuit, ar sterge tacit
       * reducerea convenita cu clientul. Aceeasi lista alba ca la `poateContopi`.
       */
      repretuire: simpla && !varianteNecunoscute && unitarCatalog !== null
        && estePretAutoritarLa(l, unitarCatalog, cat.trepte),
      unitarCatalog,
    };
  });
}

/**
 * Amprenta liniilor pe care le-a VAZUT panoul.
 *
 * Modificarile se cer pe INDEX (`orders.items` e o lista, iar liniile n-au id).
 * Intre desenarea modalului si apasarea pe „Salveaza" incap minute, si in ele
 * altcineva — alt operator, un lot, un webhook de marketplace — poate schimba
 * liniile. Atunci indexul 2 nu mai e produsul pe care l-a apasat comerciantul, si
 * s-ar scoate ALTCEVA, in tacere.
 *
 * Aceeasi functie pe amandoua capetele; nepotrivirea opreste editarea. Cheile
 * alese sunt exact cele care schimba banii sau stocul.
 */
export function amprentaLinii(items: unknown[]): string {
  return items
    .map((brut) => {
      const l = citesteLinie(brut);
      if (!l) return "?";
      return [l.product_id ?? "", l.name, String(l.price), String(l.quantity)].join(SEP_CAMP);
    })
    .join(SEP_LINIE);
}

/**
 * Planul complet al unei editari: scoateri, cantitati noi SI adaugari.
 *
 * Ordinea din interior conteaza. Intai se aplica modificarile pe liniile
 * existente, si abia pe rezultat se planifica adaugarile — asa contopirea vede
 * comanda cum va arata ea, nu cum arata acum. Altfel, o linie dusa la zero ar fi
 * ramas candidat de contopire si bucatile adaugate s-ar fi lipit de o linie
 * stearsa.
 */
export function planificaEditarea(
  prevItems: unknown[],
  modificari: ModificareLinie[],
  adaugari: Adaugare[],
  catalog: Map<string, CatalogEdit>,
): PlanEditare | { error: string } {
  const capacitati = capacitatiLinii(prevItems, catalog);

  // Ultima cerere pe un index castiga. Un index din afara listei NU se ignora:
  // inseamna ca panoul a lucrat pe alte linii decat cele din baza.
  const cerute = new Map<number, number>();
  for (const m of modificari ?? []) {
    const idx = Math.floor(Number(m?.index));
    if (!Number.isFinite(idx) || idx < 0 || idx >= prevItems.length) {
      return { error: "Comanda s-a schimbat intre timp. Reincarca pagina si incearca din nou." };
    }
    /*
     * Zero e singura valoare sub 1 care are inteles: „scoate linia". Tot restul
     * trece prin regula comuna de cantitate, care pe server REFUZA in loc sa
     * rescrie — o cerere de 5000 rescrisa la 999 ar primi si TREAPTA de pret a
     * lui 999, adica alt pret unitar decat cel vazut. Vezi `quantity.ts`.
     */
    const brutQty = Number(m?.quantity);
    if (brutQty === 0) { cerute.set(idx, 0); continue; }
    const jud = cantitateCeruta(brutQty);
    if (jud.fel !== "ok") {
      return { error: mesajCantitate(jud, capacitati[idx]?.name || undefined) };
    }
    cerute.set(idx, jud.cantitate);
  }

  const items: unknown[] = [];
  const randuri: RandEditat[] = [];
  const scoase: LinieAdaugata[] = [];
  const crescute: LinieAdaugata[] = [];
  const faraStoc: number[] = [];
  let delta = 0;

  for (let i = 0; i < prevItems.length; i++) {
    const brut = prevItems[i];
    const nou = cerute.get(i);
    const l = citesteLinie(brut);
    const cap = capacitati[i];

    // Linia nu e atinsa: pleaca mai departe exact cum era.
    if (nou === undefined || !l || nou === l.quantity) {
      items.push(brut);
      continue;
    }
    if (!cap.poateScadea) return { error: cap.motivCrestere ?? MOTIV_NECITIBILA };
    if (nou > l.quantity && !cap.poateCreste) return { error: cap.motivCrestere ?? MOTIV_VARIANTA };

    const subtotalVechi = round2(l.price * l.quantity);
    let price = l.price;
    let subtotal = round2(l.price * nou);
    const cat = l.product_id ? catalog.get(l.product_id) : undefined;
    if (cap.repretuire && cap.unitarCatalog !== null && cat && nou > 0) {
      const r = pretPeTrepte(construiesteTrepte(cat.trepte, cap.unitarCatalog), nou, cap.unitarCatalog);
      /*
       * Scaderea are voie sa ieftineasca, niciodata sa scumpeasca.
       *
       * De obicei e garantat de programarea dinamica din `pretPeTrepte`, dar nu
       * mereu: monotonia treptelor se verifica doar la SCRIERE (`problemaMonotonie`)
       * si NU se cleameaza la citire, tocmai ca o configuratie gresita sa se vada.
       * Datele vechi pot fi deci nemonotone — cu [1@100, 2@98, 3@84], taind o
       * bucata din trei, linia sare de la 84 la 98, adica comerciantul scoate marfa
       * si clientul are de platit mai mult. Cand se intampla, se pastreaza pretul
       * unitar de pe comanda: cu mai putine bucati la acelasi pret, linia scade
       * intotdeauna.
       *
       * Perechea garzii de la contopire, care apara acelasi lucru in celalalt sens.
       */
      if (nou > l.quantity || r.subtotal <= subtotalVechi + TOLERANTA) {
        // NEROTUNJIT, ca `pret x cantitate` sa dea exact subtotalul pachetului.
        price = r.unitPrice;
        subtotal = r.subtotal;
      }
    }

    if (nou > 0) {
      items.push({ ...(brut as Record<string, unknown>), price, quantity: nou });
    }
    randuri.push({ index: i, quantity: nou, price, subtotal: nou > 0 ? subtotal : 0, subtotalVechi });

    // Extraoptiunile nu intra in subtotal — ele se numara in `extras`, recalculat
    // din liniile finale.
    if (!cap.esteExtra) delta += (nou > 0 ? subtotal : 0) - subtotalVechi;

    if (cap.esteExtra || !l.product_id) continue;
    const d = nou - l.quantity;
    if (!cap.stocSeMisca) {
      // Scaderea intra oricum; stocul nu se atinge, dar se spune.
      if (d < 0) faraStoc.push(i);
      continue;
    }
    if (d > 0) crescute.push({ product_id: l.product_id, variant_title: cap.variantTitle, quantity: d });
    else scoase.push({ product_id: l.product_id, variant_title: cap.variantTitle, quantity: -d });
  }

  const dupaAdaugari = planificaAdaugarea(items, adaugari, catalog);
  if ("error" in dupaAdaugari) return dupaAdaugari;

  /*
   * ═══ CE SE MUTA INTRE DOUA LINII ALE ACELUIASI PRODUS NU SE MAI CERE DE LA STOC ═══
   *
   * Revendicarea si eliberarea se intampla in doua tranzactii: intai se cere stocul
   * pentru cresteri, si abia inauntrul scrierii se dau inapoi scaderile. Deci o
   * mutare cu suma zero se masoara pe stocul DE DINAINTE de propria ei scadere.
   *
   * Cazul e chiar cel produs de `aplicaBumpPeOBucata`, care lasa doua linii pe
   * acelasi produs: comerciantul muta o bucata de pe linia de bump pe cea intreaga
   * (una +1, cealalta -1) si, daca produsul a ramas pe zero, editarea pica cu
   * „stoc insuficient" pentru o cerere care nu cere nimic.
   *
   * Se compenseaza pe cheia (produs, varianta) — aceeasi bucata, acelasi raft — si
   * in AMANDOUA listele deodata, ca socoteala de pe `stoc_rezervat` sa ramana
   * inchisa: ce nu se mai cere, nu se mai nici da inapoi.
   */
  const netPeCheie = new Map<string, number>();
  const identitate = new Map<string, { product_id: string; variant_title: string | null }>();
  for (const a of [...crescute, ...dupaAdaugari.adaugate]) {
    const k = cheieLinie(a.product_id, a.variant_title);
    netPeCheie.set(k, (netPeCheie.get(k) ?? 0) + a.quantity);
    identitate.set(k, { product_id: a.product_id, variant_title: a.variant_title });
  }
  for (const s of scoase) {
    const k = cheieLinie(s.product_id, s.variant_title);
    netPeCheie.set(k, (netPeCheie.get(k) ?? 0) - s.quantity);
    identitate.set(k, { product_id: s.product_id, variant_title: s.variant_title });
  }
  const adaugateNete: LinieAdaugata[] = [];
  const scoaseNete: LinieAdaugata[] = [];
  for (const [k, net] of netPeCheie) {
    if (net === 0) continue;
    const id = identitate.get(k)!;
    (net > 0 ? adaugateNete : scoaseNete).push({ ...id, quantity: Math.abs(net) });
  }

  /*
   * O comanda nu are voie sa ramana fara marfa.
   *
   * Cu zero linii de produs, factura n-are ce contine, AWB-ul n-are ce declara,
   * iar emailul catre client arata o comanda goala pe care el a platit-o. Cine
   * chiar vrea sa renunte la toata comanda o anuleaza — acolo se elibereaza si
   * stocul, si cuponul, si se opresc si notificarile.
   */
  const areMarfa = (lista: unknown[]) => lista.some((brut) => {
    const l = citesteLinie(brut);
    return !!l && !esteLinieExtra(l) && l.quantity > 0;
  });
  // Se compara cu starea DINAINTE: o comanda care nu avea marfa nici pana acum
  // (linii goale, date stricate) trebuie sa-si poata corecta mai departe adresa si
  // telefonul. Regula opreste GOLIREA, nu editarea unei comenzi deja goale.
  if (areMarfa(prevItems) && !areMarfa(dupaAdaugari.items)) {
    return { error: "Comanda ar ramane fara niciun produs. Daca vrei sa renunti la ea, anuleaz-o din panou — asa se elibereaza si stocul, si cuponul." };
  }

  return {
    items: dupaAdaugari.items,
    deltaSubtotal: round2(delta + dupaAdaugari.deltaSubtotal),
    extras: sumaExtraoptiunilor(dupaAdaugari.items),
    adaugate: adaugateNete,
    scoase: scoaseNete,
    contributii: dupaAdaugari.contributii,
    randuri,
    faraStoc,
  };
}

/**
 * Ce stoc mai are nevoie comanda DUPA editare, pe produs si pe combinatie.
 *
 * Exista pentru clema din baza: eliberarea nu are voie sa scada `stoc_rezervat`
 * sub ce datoreaza comanda mai departe. Fara ea, clema stia doar cat a luat comanda
 * IN TOTAL pe un produs — iar cand acelasi produs e consumat de doua linii (o
 * componenta de pachet plus vanzarea lui separata), scoaterea uneia manca si
 * rezervarea celeilalte, si stocul se umfla cu marfa inca nelivrata.
 *
 * Se numara pachetul, nu componentele lui: desfacerea cere catalogul intreg si se
 * face pe server, cu EXACT aceeasi functie ca eliberarea (`expandBundleRelease`).
 * Doua desfaceri diferite ar fi readus chiar nepotrivirea pe care clema o repara.
 *
 * Liniile la care nu se stie ce s-a consumat (varianta nerecunoscuta, produs iesit
 * din catalog) intra si ele la numaratoare pe produs: nu se elibereaza nimic pentru
 * ele, dar marfa lor ramane datorata, deci trebuie sa apere rezervarea.
 */
export function necesarDeStoc(items: unknown[], catalog: Map<string, CatalogEdit>): {
  produse: { product_id: string; quantity: number }[];
  variante: { product_id: string; variant_title: string; quantity: number }[];
} {
  const produse = new Map<string, number>();
  const variante = new Map<string, { product_id: string; variant_title: string; quantity: number }>();
  const capacitati = capacitatiLinii(items, catalog);
  for (let i = 0; i < items.length; i++) {
    const l = citesteLinie(items[i]);
    if (!l || !l.product_id || esteLinieExtra(l)) continue;
    const qty = Math.max(0, Math.floor(Number(l.quantity) || 0));
    if (qty <= 0) continue;
    produse.set(l.product_id, (produse.get(l.product_id) ?? 0) + qty);
    const titlu = capacitati[i]?.variantTitle;
    if (!titlu) continue;
    const k = cheieLinie(l.product_id, titlu);
    const v = variante.get(k);
    if (v) v.quantity += qty;
    else variante.set(k, { product_id: l.product_id, variant_title: titlu, quantity: qty });
  }
  return {
    produse: [...produse.entries()].map(([product_id, quantity]) => ({ product_id, quantity })),
    variante: [...variante.values()],
  };
}

/**
 * Depasesc reducerile marfa ramasa pe comanda?
 *
 * `recalculeazaTotal` plafoneaza totalul la zero, si asa trebuie: un total negativ
 * n-ar avea niciun inteles. Dar plafonarea ASCUNDE cazul, iar de cand se pot scoate
 * linii el chiar se poate produce — cuponul a fost convenit pe cosul de atunci si
 * ramane inghetat, deci pe o comanda de 200 cu 50% reducere, scoaterea a 150 de lei
 * de marfa lasa 50 de lei de marfa si 100 de lei de reducere. Comanda s-ar fi scris
 * cu total 0, curierul n-ar mai fi incasat nimic, si nimic nu s-ar fi vazut pe ecran.
 */
export function reducerileDepasescMarfa(p: {
  subtotal: number;
  extras: number;
  discount: number;
  cardDiscount: number;
  codDiscount: number;
}): boolean {
  return round2(p.subtotal + p.extras - p.discount - p.cardDiscount - p.codDiscount) < 0;
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
