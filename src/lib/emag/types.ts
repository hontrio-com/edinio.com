/**
 * Tipurile eMAG Marketplace API, v4.5.1.
 *
 * Scrise de mana din OpenAPI-ul lor, nu generate: generatorul scoate un fisier de
 * mii de randuri in care nu incape niciuna dintre notele de mai jos, iar notele
 * sunt tocmai ce ne fereste de greselile pe care le-am facut la Trendyol.
 *
 * ⚠ DOUA CONVENTII CARE NU SE AMESTECA, si amandoua tac cand le incalci:
 *   - actiunile de SCRIERE (`save`) isi impacheteaza incarcatura in `{ data: [...] }`
 *   - actiunile de CITIRE (`read`, `count`) primesc filtrele ca CHEI DE NIVEL INTAI
 * Un filtru pus din greseala in `data` e IGNORAT, iar API-ul intoarce tot. Nu da
 * eroare — da un import complet gresit. De aceea `client.ts` are doua functii
 * separate, `scrie()` si `citeste()`, si nicio cale de a le confunda.
 */

/** Platformele eMAG pe care le acoperim. Fashion Days a fost lasat afara. */
export type EmagTara = "ro" | "bg" | "hu";

export const EMAG_TARI: readonly EmagTara[] = ["ro", "bg", "hu"] as const;

export const EMAG_TARA_IMPLICITA: EmagTara = "ro";

/** Cum se numeste tara pe ecran. */
export const EMAG_ETICHETA_TARA: Record<EmagTara, string> = {
  ro: "eMAG România",
  bg: "eMAG Bulgaria",
  hu: "eMAG Ungaria",
};

/**
 * Limba continutului trimis. eMAG o cere pe `source_language` si are implicit pe
 * platforma; o trimitem explicit ca sa nu depindem de implicitul lor.
 */
export const EMAG_LIMBA: Record<EmagTara, string> = {
  ro: "ro_RO",
  bg: "bg_BG",
  hu: "hu_HU",
};

/**
 * Raspunsul, identic pe toate rutele.
 *
 * ⚠ `isError: true` NU inseamna intotdeauna „nu s-a salvat”. Documentatia lor o
 * spune limpede: la o eroare de DOCUMENTATIE pe `product_offer/save`, raspunsul e
 * `isError: true` dar oferta E SALVATA si procesata. Vezi `clasificaRaspuns` din
 * `errors.ts` — acolo e singurul loc unde se decide ce inseamna un raspuns.
 */
export interface EmagRaspuns<T = unknown> {
  isError: boolean;
  messages?: unknown[];
  results?: T;
}

/* ═══════════════════════════════════════════════════════════════════════════
   OFERTE SI PRODUSE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Stocul pe depozit.
 *
 * ⚠ `warehouse_id: 1` cand exista un singur depozit — asa cere documentatia. Nu e
 * o valoare inventata de noi.
 */
export interface EmagStoc {
  warehouse_id: number;
  value: number;
}

/** Timpul de pregatire, in zile de la primirea comenzii. 0 = expediat in aceeasi zi. */
export interface EmagTimpPregatire {
  warehouse_id: number;
  value: number;
}

export interface EmagImagine {
  /** 1 = principala, 2 = secundara, 0 = restul. */
  display_type?: 0 | 1 | 2;
  /** Max 6000x6000px si 8 MB. JPG, JPEG sau PNG. */
  url: string;
}

export interface EmagCaracteristica {
  /** Id-ul caracteristicii la eMAG, din `category/read`. */
  id: number;
  value: string;
  /** Numai pentru caracteristicile cu etichete. */
  tag?: string;
}

/**
 * Familia: felul in care eMAG grupeaza variantele.
 *
 * ⚠ eMAG NU ARE VARIANTE IMBRICATE. Fiecare marime sau culoare e o OFERTA
 * SEPARATA, cu `id` propriu, legata de surorile ei prin familia asta. Un produs
 * Edinio cu patru combinatii inseamna patru oferte eMAG plus o familie.
 *
 * `id: 0` scoate produsul din familie.
 */
export interface EmagFamilie {
  id: number;
  /** Obligatoriu cand `id` nu e 0. */
  name?: string;
  /** Din `family_types` al categoriei. Obligatoriu cand `id` nu e 0. */
  family_type_id?: number;
}

/** Informatiile GPSR despre producator sau reprezentantul din UE. Maximum 10 seturi. */
export interface EmagGpsrEntitate {
  name: string;
  address: string;
  email: string;
}

/**
 * Incarcatura pentru `product_offer/save`: produs + oferta.
 *
 * ⚠ TREI FORME, dupa intentie:
 *   - produs NOU: si documentatia e obligatorie (`category_id`, `name`,
 *     `part_number`, `brand`, plus `warranty`/`ean` daca cere categoria)
 *   - atasare la un produs eMAG care exista deja: se trimite `part_number_key`
 *     (si NU se trimite cand vrem produs nou)
 *   - actualizare de oferta: doar `id`, `status`, `sale_price`, `vat_id`,
 *     `handling_time`, `stock` — FARA documentatie
 *
 * Pentru a treia forma exista insa o ruta mai usoara (`offer/save`; `offer_stock` e
 * masurata cu 0 reusite din 850 si nu se foloseste),
 * si ele sunt cele folosite. Vezi `rutaDeTrimitere` din `sync.ts`.
 */
export interface EmagProdusOferta {
  /**
   * ⚠ Id-ul NOSTRU intern, nu unul dat de eMAG. E cheia primara dupa care eMAG
   * identifica oferta, deci spatiul de identificatori e al nostru si trebuie sa
   * fie stabil pe veci. Vine din `emag_offers.emag_id`.
   */
  id: number;
  category_id?: number;
  vendor_category_id?: number;
  /** Atasare la un produs eMAG existent. Nu se trimite cand cream produs nou. */
  part_number_key?: string;
  source_language?: string;
  name?: string;
  /** ⚠ eMAG sterge automat spatiile, virgula si punctul-virgula. */
  part_number?: string;
  description?: string;
  brand?: string;
  /** 0 = imaginile se descarca doar daca s-a schimbat adresa, 1 = fortat. */
  force_images_download?: 0 | 1;
  images?: EmagImagine[];
  /** 1 = inlocuieste imaginile, 0 = adauga peste. */
  images_overwrite?: 0 | 1;
  characteristics?: EmagCaracteristica[];
  family?: EmagFamilie;
  url?: string;
  /** Garantia in luni. Obligatorie sau nu, dupa `is_warranty_mandatory` al categoriei. */
  warranty?: number;
  /** Obligatoriu sau nu, dupa `is_ean_mandatory` al categoriei. */
  ean?: string[];
  attachments?: { id?: number; url: string }[];
  /** 1 = activa, 0 = inactiva, 2 = scoasa din vanzare (numai la actualizare). */
  status: EmagStatusOferta;
  /** ⚠ FARA TVA. Pana la patru zecimale. */
  sale_price: number;
  /** Pretul de referinta, fara TVA. Trebuie sa fie mai mare decat `sale_price`. */
  recommended_price?: number;
  /** ⚠ Obligatoriu la PRIMA salvare a produsului. Fara TVA. */
  min_sale_price?: number;
  /** ⚠ Obligatoriu la PRIMA salvare. Fara TVA, si mai mare decat `min_sale_price`. */
  max_sale_price?: number;
  /** Se trimite doar cand difera de moneda platformei. */
  currency_type?: "EUR" | "PLN";
  stock: EmagStoc[];
  handling_time?: EmagTimpPregatire[];
  supply_lead_time?: 2 | 3 | 5 | 7 | 14 | 30 | 60 | 90 | 120;
  start_date?: string;
  vat_id: number;
  /** 1 = oferta intra in programul Genius. */
  emag_club?: 0 | 1;
  safety_information?: string;
  manufacturer?: EmagGpsrEntitate[];
  eu_representative?: EmagGpsrEntitate[];
  /** Numai pe eMAG RO. Valoarea INCLUDE TVA. */
  green_tax?: number;
}

/**
 * Incarcatura pentru `offer/save` — „light API”.
 *
 * ⚠ Nu poate crea nimic si nu poate atinge documentatia produsului. Exact de aia
 * e ruta potrivita pentru o schimbare de pret: la Trendyol, o schimbare de pret
 * trimisa pe ruta de continut a raportat succes fara sa schimbe niciun pret, pe
 * 1051 de produse.
 */
export interface EmagOferta {
  id: number;
  sale_price?: number;
  recommended_price?: number;
  min_sale_price?: number;
  max_sale_price?: number;
  currency_type?: "EUR" | "PLN";
  stock?: EmagStoc[];
  handling_time?: EmagTimpPregatire[];
  vat_id?: number;
  status?: EmagStatusOferta;
}

/** 1 = activa, 0 = inactiva, 2 = scoasa din vanzare (numai la actualizare). */
export type EmagStatusOferta = 0 | 1 | 2;

/**
 * Starea validarii documentatiei.
 *
 * ⚠ Valorile 7 lipseste din enumerarea lor, dinadins. Nu se inventeaza.
 */
export const EMAG_VALIDARE: Record<number, string> = {
  1: "Așteaptă validarea eMAG",
  2: "Așteaptă validarea mărcii",
  3: "Așteaptă validarea EAN",
  4: "Așteaptă validarea documentației",
  5: "Marcă respinsă",
  6: "EAN respins",
  8: "Documentație respinsă",
  9: "Documentație aprobată",
  10: "Blocat",
  11: "Actualizare în așteptare",
  12: "Actualizare respinsă",
};

/** 1 = se poate vinde, 2 = pret invalid. */
export const EMAG_VALIDARE_OFERTA: Record<number, string> = {
  1: "Preț valid",
  2: "Preț invalid",
};

/**
 * Starile de validare in care oferta POATE fi vanduta.
 *
 * ⚠ Nu e o lista aleasa de noi: documentatia spune ca o oferta e disponibila doar
 * cand `stock > 0`, `status = 1`, `offer_validation_status = 1` SI
 * `validation_status` e una dintre astea patru.
 */
export const EMAG_VALIDARE_VANDABILA: readonly number[] = [3, 9, 11, 12] as const;

/** Cum vine o oferta inapoi de la `product_offer/read`. */
export interface EmagOfertaCitita {
  id: number;
  part_number_key?: string;
  part_number?: string;
  category_id?: number;
  brand?: string;
  name?: string;
  description?: string;
  ean?: string[];
  images?: EmagImagine[];
  characteristics?: EmagCaracteristica[];
  family?: EmagFamilie;
  warranty?: number;
  url?: string;
  sale_price?: number;
  recommended_price?: number;
  min_sale_price?: number;
  max_sale_price?: number;
  currency?: string;
  status?: number;
  stock?: EmagStoc[];
  handling_time?: EmagTimpPregatire[];
  vat_id?: number;
  general_stock?: number;
  estimated_stock?: number;
  /** Cati vanzatori au oferta pe acelasi produs. */
  number_of_offers?: number;
  /** Pe ce loc suntem la butonul de cumparare. 1 = noi. */
  buy_button_rank?: number;
  best_offer_sale_price?: number;
  /** 1 = documentatia produsului e a noastra. */
  ownership?: number;
  /** ⚠ Ne-nul pentru produsele respinse din cauza documentatiei. */
  doc_errors?: unknown;
  validation_status?: { value?: number; description?: string }[] | { value?: number };
  offer_validation_status?: { value?: number; description?: string } | { value?: number };
  translation_validation_status?: { value?: number; description?: string }[] | { value?: number };
}

/** Filtrele lui `product_offer/read`. Se trimit ca CHEI DE NIVEL INTAI. */
/**
 * Starile prin care trece un rand din `emag_offers`.
 *
 * ═══ ⚠ COLOANA E `text` FARA `check`, DECI PAZA E AICI ═══
 *
 * Verificat in baza: `emag_offers.status` n-are nicio constrangere. Adica o litera
 * gresita intr-un singur loc ar fi facut o stare noua, tacut — iar ecranul, care
 * numara pe stari, ar fi aratat mai putine oferte decat sunt, fara nicio eroare.
 *
 * Scrise ca uniune, `tsc` refuza orice altceva. ⚠ Cine adauga o stare o adauga AICI
 * si nicaieri altundeva; cine scrie sirul de mana ocoleste chiar paza asta.
 */
export type StareOferta =
  /** Facuta la noi, netrimisa inca nicaieri. */
  | "draft"
  /** Adusa de import din contul lor. ⚠ Merge mereu cu `auto_sync: false`. */
  | "imported"
  /** Pusa la coada, asteapta randul. */
  | "queued"
  /** Trimisa la eMAG; asteptam verdictul lor de validare. */
  | "sent"
  /** Vandabila la ei: toate cele patru conditii deodata. Vezi `EMAG_VALIDARE_VANDABILA`. */
  | "live"
  /** Refuzata sau cazuta. Motivul sta in `error` si in `doc_errors`. */
  | "error"
  /** Oprita de la vanzare (`status: 0`). eMAG nu are stergere de oferta. */
  | "withdrawn";

export interface EmagFiltruOferte {
  id?: number;
  status?: 0 | 1;
  part_number?: string;
  part_number_key?: string;
  general_stock?: number;
  estimated_stock?: number;
  offer_validation_status?: 1 | 2;
  validation_status?: number;
  translation_validation_status?: number;
  currentPage?: number;
  /** ⚠ Maximum 100. Peste, eMAG intoarce tot 100 fara sa spuna. */
  itemsPerPage?: number;
}

/* ═══════════════════════════════════════════════════════════════════════════
   NOMENCLATOARE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface EmagCategorie {
  id: number;
  name?: string;
  is_allowed?: number;
  parent_id?: number;
  is_ean_mandatory?: number;
  is_warranty_mandatory?: number;
  characteristics?: EmagCaracteristicaCategorie[];
  family_types?: EmagTipFamilie[];
}

export interface EmagCaracteristicaCategorie {
  id: number;
  name?: string;
  type_id?: number;
  display_order?: number;
  is_mandatory?: number;
  is_filter?: number;
  allow_new_value?: number;
  values?: string[];
  tags?: string[];
}

export interface EmagTipFamilie {
  id: number;
  name?: string;
  characteristics?: { characteristic_id: number; characteristic_family_type_id?: number; is_foldable?: number }[];
}

export interface EmagCotaTva {
  vat_id: number;
  vat_rate?: number;
  is_default?: number;
}

export interface EmagValoareTimpPregatire {
  id?: number;
  value: number;
  name?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMENZI
   ═══════════════════════════════════════════════════════════════════════════ */

/** 1 = noua, 2 = in procesare, 3 = pregatita, 4 = finalizata, 0 = anulata, 5 = returnata. */
export type EmagStatusComanda = 0 | 1 | 2 | 3 | 4 | 5;

export const EMAG_STATUS_COMANDA: Record<number, string> = {
  0: "Anulată",
  1: "Nouă",
  2: "În procesare",
  3: "Pregătită",
  4: "Finalizată",
  5: "Returnată",
};

/** ⚠ 2 = onorata de eMAG (FBE), 3 = onorata de vanzator. Numai 3 se poate edita. */
export type EmagTipComanda = 2 | 3;

/** 1 = ramburs, 2 = transfer bancar, 3 = card online. */
export type EmagModPlata = 1 | 2 | 3;

export const EMAG_MOD_PLATA: Record<number, string> = {
  1: "Ramburs la livrare",
  2: "Transfer bancar",
  3: "Card online",
};

export interface EmagClientComanda {
  id?: number;
  name?: string;
  /** ⚠ E un HASH, nu o adresa de e-mail adevarata. Nu se trimite nimic la ea. */
  email?: string;
  company?: string;
  gender?: "M" | "F";
  code?: string;
  registration_number?: string;
  bank?: string;
  iban?: string;
  legal_entity?: 0 | 1;
  is_vat_payer?: 0 | 1;
  phone_1?: string;
  phone_2?: string;
  phone_3?: string;
  billing_name?: string;
  billing_phone?: string;
  billing_country?: string;
  billing_suburb?: string;
  billing_city?: string;
  billing_locality_id?: string;
  billing_street?: string;
  billing_postal_code?: string;
  shipping_country?: string;
  shipping_suburb?: string;
  shipping_city?: string;
  shipping_locality_id?: string;
  shipping_street?: string;
  shipping_postal_code?: string;
  shipping_contact?: string;
  shipping_phone?: string;
}

export interface EmagLinieComanda {
  /** Id-ul liniei la eMAG. Orice actualizare pe linie il foloseste. */
  id: number;
  /** ⚠ Id-ul NOSTRU intern al ofertei — legatura inapoi la `emag_offers.emag_id`. */
  product_id?: number;
  status: 0 | 1;
  part_number?: string;
  ext_part_number?: string;
  created?: string;
  modified?: string;
  currency?: string;
  quantity: number;
  /** ⚠ FARA TVA. */
  sale_price: number;
  name?: string;
  details?: string;
  serial_numbers?: string;
  product_voucher_split?: EmagImpartireVoucher[];
  /**
   * Taxele de tip SGR (garantie-returnare) puse pe linia de comanda.
   *
   * ⚠ SUNT BANI, SI PANA PE 24.08.2026 NU-I NUMARA NIMENI. Vezi `valoareGarantiilor`
   * din `orders.ts`: totalul comenzii iesea mai mic decat cat a facturat eMAG.
   *
   * ⚠ Fiecare are COTA EI de TVA, care nu e neaparat cea a magazinului.
   */
  recycle_warranties?: EmagGarantieReciclare[];
}

/**
 * Bucata dintr-un voucher care cade pe o linie.
 *
 * ⚠ Pe acelasi produs pot cadea MAI MULTE vouchere, cu COTE DE TVA DIFERITE.
 * Documentatia cere explicit sa se citeasca toti parametrii, nu doar primul.
 */
export interface EmagImpartireVoucher {
  voucher_id?: number;
  value?: number;
  vat_value?: number;
  vat?: number;
}

export interface EmagVoucher {
  voucher_id?: number;
  modified?: string;
  created?: string;
  status?: number;
  /** Valoarea TVA, negativa. */
  sale_price_vat?: number;
  /** Reducerea fara TVA, negativa. */
  sale_price?: number;
  voucher_name?: string;
  vat?: number;
  issue_date?: string;
}

/** O taxa de garantie-returnare (SGR) de pe o linie de comanda. */
export interface EmagGarantieReciclare {
  quantity?: number;
  /** Fara TVA, ca toate preturile lor. */
  sale_price?: number;
  /** ⚠ Cota EI, nu a magazinului. */
  vat_rate?: number;
  product_name?: string;
  recycle_warranty_voucher_split?: { value?: number; vat_value?: number; vat?: number }[];
}

export interface EmagComanda {
  id: number;
  status: EmagStatusComanda;
  is_complete?: 0 | 1;
  type?: EmagTipComanda;
  payment_mode_id?: EmagModPlata;
  detailed_payment_method?: string;
  delivery_mode?: "courier" | "pickup";
  details?: {
    locker_id?: string;
    locker_name?: string;
    locker_delivery_eligible?: 0 | 1;
    courier_external_office_id?: string;
  };
  date?: string;
  modified?: string;
  payment_status?: 0 | 1;
  cashed_co?: number;
  cashed_cod?: number;
  shipping_tax?: number;
  shipping_tax_voucher_split?: EmagImpartireVoucher[];
  products?: EmagLinieComanda[];
  customer?: EmagClientComanda;
  attachments?: EmagAtasament[];
  vouchers?: EmagVoucher[];
  is_storno?: boolean;
  /**
   * ⚠ Daca lista e NE-GOALA, AWB-ul trebuie emis pe unul dintre curierii din ea.
   * `null` inseamna „oricare”; o lista goala nu are acelasi inteles.
   */
  enforced_vendor_courier_accounts?: string[] | null;
  reason_cancellation?: number;
}

/** Filtrele lui `order/read`. Chei de nivel intai. */
export interface EmagFiltruComenzi {
  id?: number;
  status?: EmagStatusComanda | EmagStatusComanda[];
  createdBefore?: string;
  createdAfter?: string;
  modifiedBefore?: string;
  modifiedAfter?: string;
  payment_mode_id?: number | number[];
  is_complete?: 0 | 1;
  /** ⚠ Implicit 3 pe `order/read`. Ca sa vedem si FBE, se cere explicit 2. */
  type?: EmagTipComanda;
  currentPage?: number;
  itemsPerPage?: number;
}

/** 1 = factura, 3 = garantie, 4 = manual, 8 = ghid, 10 = AWB, 11 = proforma. */
export type EmagTipAtasament = 1 | 3 | 4 | 8 | 10 | 11;

export interface EmagAtasament {
  order_id?: number;
  order_type?: EmagTipComanda;
  /** Obligatoriu la garantii. Acelasi cu `products[].id` din `order/read`. */
  order_product_id?: number;
  name?: string;
  /** ⚠ Numai `.pdf`. */
  url: string;
  type?: EmagTipAtasament;
  force_download?: 0 | 1;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RETURURI (RMA)
   ═══════════════════════════════════════════════════════════════════════════ */

/** 1 = incomplet, 2 = nou, 3 = confirmat, 4 = refuzat, 5 = anulat, 6 = primit, 7 = finalizat. */
export type EmagStatusRetur = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const EMAG_STATUS_RETUR: Record<number, string> = {
  1: "Incomplet",
  2: "Nou",
  3: "Confirmat",
  4: "Refuzat",
  5: "Anulat",
  6: "Primit",
  7: "Finalizat",
};

/**
 * Ce trecere de stare e ingaduita, dupa tabelul din documentatie.
 *
 * ⚠ Sta aici ca DATE, nu ca sir de `if`-uri: o trecere nepermisa e refuzata de
 * eMAG cu un mesaj greu de citit, iar butonul care n-ar fi trebuit sa existe
 * ajunge oricum sub degetul comerciantului.
 */
export const EMAG_TRECERI_RETUR: Record<number, readonly number[]> = {
  2: [2, 3, 5],
  3: [3, 5, 6],
  4: [4],
  5: [5],
  6: [4, 6, 7],
  7: [7],
};

/**
 * Ce a cerut clientul cand a deschis returul.
 *
 * ⚠ ENUMERATE IN DOCUMENTATIA LOR, CUVANT CU CUVANT. Prima forma a comentariului din
 * `EmagRetur` scria „5 = altul”; e VOUCHER. Deosebirea conteaza: la voucher nu se
 * intorc bani, iar un ecran care ar fi scris „rambursare” l-ar fi pus pe comerciant sa
 * caute un IBAN care nu exista.
 */
export const EMAG_TIP_RETUR: Record<number, string> = {
  1: "Înlocuire cu același produs",
  2: "Înlocuire cu alt produs",
  3: "Rambursare",
  4: "Anularea plății pentru produs",
  5: "Voucher",
};

/**
 * Ce urmeaza sa faca comerciantul, pe fiecare fel de retur.
 *
 * ⚠ `null` INSEAMNA „NU STIU”, si nu se ascunde sub un „nu”. Un tip necunoscut — unul
 * nou la ei, sau lipsa cu totul — n-are voie sa arate ca „nu e nimic de facut”: omul ar
 * fi inchis returul crezand ca s-a rezolvat.
 */
export function ceUrmeazaLaRetur(tip: number | null | undefined): string | null {
  if (tip == null) return null;
  if (tip === 1 || tip === 2) return "Trimite produsul de schimb după ce îl primești pe cel returnat.";
  if (tip === 3) return "Întoarce banii clientului după ce primești marfa.";
  if (tip === 4) return "Anulează plata pentru produsul returnat.";
  if (tip === 5) return "eMAG îi dă clientului un voucher. Tu nu întorci bani.";
  return null;
}

export interface EmagRetur {
  emag_id: number;
  id?: number;
  order_id: number;
  type?: EmagTipComanda;
  invoice_number?: string;
  customer_name?: string;
  customer_company?: string;
  customer_phone?: string;
  products?: {
    id: number;
    product_emag_id?: number;
    product_id: number;
    quantity: number;
    product_name: string;
    return_reason: number;
    observations?: string;
    diagnostic?: number;
    reject_reason?: number;
    refund_value?: string;
  }[];
  awbs?: unknown[];
  pickup_locality_id?: number;
  /** 1 = curier eMAG, 2 = curierul vanzatorului, 3 = trimis de client. */
  pickup_method?: 1 | 2 | 3;
  return_reason?: number;
  observations?: string;
  /** Vezi `EMAG_TIP_RETUR`. ⚠ `5` e VOUCHER, nu „altul”. */
  return_type?: 1 | 2 | 3 | 4 | 5;
  return_address_id?: number;
  return_tax_value?: number;
  customer_account_iban?: string;
  customer_account_bank?: string;
  customer_account_beneficiary?: string;
  date?: string;
  request_status?: EmagStatusRetur;
  currency?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIVRARE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface EmagContCurier {
  account_id: number;
  account_display_name?: string;
  /** 1 = retur, 2 = comanda, 3 = amandoua, 4 = in afara marketplace-ului. */
  courier_account_type?: number;
  courier_name?: string;
  courier_account_properties?: number[];
  created?: string;
  /** 1 = activ, 0 = inactiv. */
  status?: number;
  pickup_country_code?: string;
}

export interface EmagAdresa {
  address_id: string;
  country_id?: number;
  country_code?: string;
  /** 1 = retur, 2 = ridicare, 3 = sediu (factura), 4 = estimari de livrare. */
  address_type_id?: number;
  locality_id?: number;
  suburb?: string;
  city?: string;
  address?: string;
  zipcode?: string;
  quarter?: string;
  floor?: string;
  is_default?: boolean;
}

export interface EmagLocalitate {
  emag_id: number;
  name?: string;
  name_latin?: string;
  region1?: string;
  region2?: string;
  region3?: string;
  region4?: string;
  geoid?: number;
  modified?: string;
  zipcode?: string;
  country_code?: string;
  iso2?: string;
}

export interface EmagParticipantAwb {
  name?: string;
  contact?: string;
  phone1?: string;
  phone2?: string;
  locality_id?: number;
  street?: string;
  zipcode?: string;
  legal_entity?: 0 | 1;
  /** Numai la expeditor: adresa de ridicare deja salvata la eMAG. */
  address_id?: string;
}

export interface EmagColetAwb {
  weight: number;
  length: number;
  width: number;
  height: number;
}

export interface EmagAwb {
  order_id?: number;
  rma_id?: number;
  sender: EmagParticipantAwb;
  receiver: EmagParticipantAwb;
  locker_id?: string;
  is_oversize: 0 | 1;
  insured_value?: number;
  weight?: number;
  envelope_number: number;
  parcel_number: number;
  observation?: string;
  /** Ramburs. */
  cod: number;
  courier_account_id?: number;
  pickup_and_return?: 0 | 1;
  saturday_delivery?: 0 | 1;
  sameday_delivery?: 0 | 1;
  dropoff_locker?: 0 | 1;
  unboxing?: 0 | 1;
  date?: string;
  currency?: "RON" | "EUR" | "HUF";
  packages?: EmagColetAwb[];
  save_volumetric_awb_data?: 0 | 1;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MASURATORI SI CAMPANII
   ═══════════════════════════════════════════════════════════════════════════ */

/** ⚠ Dimensiunile in MILIMETRI, greutatea in GRAME. Nu centimetri, nu kilograme. */
export interface EmagMasuratoare {
  id: number;
  length: number;
  width: number;
  height: number;
  weight: number;
}

export interface EmagPropunereCampanie {
  id: number;
  /** Fara TVA. */
  sale_price: number;
  stock: number;
  max_qty_per_order?: number;
  post_campaign_sale_price?: number;
  campaign_id: number;
  /** Procent, intre 10 si 100. */
  voucher_discount?: number;
  not_available_post_campaign?: 0 | 1;
  date_intervals?: unknown[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURATIA DIN `store_settings.emag_config`
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce tinem despre legatura cu eMAG a unui magazin.
 *
 * ⚠ `password` e SINGURUL camp criptat (vezi `privat.campuri_secrete`).
 * `username` ramane in clar dinadins: nu deschide nimic singur, iar comerciantul
 * trebuie sa poata reciti CE CONT a legat. Acelasi rationament ca la
 * `posta_config.username` si `pallex_config.username`.
 *
 * ⚠ Citirea la RULARE se face cu `createAdminClient()`. Pe clientul
 * comerciantului, vederea intoarce `enc.v1.…`, iar eMAG raspunde 401 la fiecare
 * apel — exact greseala care la Trendyol a facut ca publicarea sa mearga (cron,
 * service role) si ecranele de nomenclatoare sa dea 401.
 */
export interface EmagConfig {
  connected?: boolean;
  username?: string;
  password?: string;
  tara?: EmagTara;
  /** Numele firmei, pentru antetul de identificare. */
  vendor_name?: string;

  /** Comerciantul a schimbat parola sau i s-a scos dreptul de API. */
  needs_reconnect?: boolean;
  /** Se trimit automat schimbarile de pret si stoc? */
  auto_sync?: boolean;
  /** Un produs nou se publica singur? */
  auto_publish?: boolean;

  /**
   * Ofertele publicate din Edinio intra in programul Genius al eMAG?
   *
   * ═══ ⚠ IMPLICITUL LOR E `1`, SI ASTA E O CAPCANA (24.08.2026) ═══
   *
   * `ProductOfferSave.emag_club` are `default: 1`. Deci netrimis, FIECARE produs publicat
   * din Edinio intra in Genius — cu comisioanele si obligatiile de livrare de acolo.
   *
   * ⚠ Masurat pe contul unui comerciant, in raspunsul lor brut: TOATE ofertele lui de
   * dinainte au `emag_club: 0`. Adica produsele publicate de noi ar fi intrat in Genius
   * pe langa restul catalogului lui, fara ca cineva sa fi ales asta.
   *
   * ⚠ Implicitul NOSTRU e `0`, si dinadins: intrarea intr-un program cu obligatii de
   * livrare se cere, nu se presupune. Iar campul se trimite MEREU, ca implicitul lor sa
   * nu mai hotarasca in locul comerciantului.
   */
  emag_club?: 0 | 1;

  /** ⚠ `products.category` e un NUME, nu un id. De aia cheia hartii e text. */
  category_map?: Record<string, EmagIntrareCategorie>;

  /** Nomenclatoare puse deoparte, ca sa nu se ceara la fiecare trecere. */
  vat_id?: number;
  handling_time?: number;
  warranty_default?: number;
  warehouse_id?: number;

  /** Datele GPSR, la nivel de magazin. */
  gpsr?: {
    safety_information?: string;
    manufacturer?: EmagGpsrEntitate[];
    eu_representative?: EmagGpsrEntitate[];
  };

  /**
   * Taxa verde, pe categoriile care o cer.
   *
   * ═══ ⚠ VALOAREA INCLUDE TVA, SPRE DEOSEBIRE DE TOATE CELELALTE PRETURI ═══
   *
   * Documentatia lor, cuvant cu cuvant: „The value for Green tax that will be
   * displayed on site. This value includes VAT." Iar `sale_price`, `min_sale_price`,
   * `max_sale_price` si `recommended_price` sunt toate FARA.
   *
   * Trecuta prin `pretFaraTva` din obisnuinta, taxa ar fi plecat cu o cincime mai
   * mica — si nimeni n-ar fi observat, fiindca e o suma mica pe o linie separata.
   *
   * ⚠ Numai pe eMAG RO. Pe bg si hu, campul nu se trimite.
   *
   * ⚠ `null` INSEAMNA „STERGE-L”, si e forma pe care o cere imbinarea. Panoul trimite un
   * PETIC, iar intr-o imbinare cheia lipsa inseamna „las-o cum e” — deci un camp golit de
   * comerciant ar fi ramas pe loc. `null` e singurul fel de a spune „scoate-l”, si
   * cititorii il iau deja drept lipsa.
   */
  green_tax?: number | null;

  /**
   * Cate bucati se opresc pentru magazinul propriu.
   *
   * ⚠ Se SCADE din stocul trimis, si nu coboara sub zero. Un comerciant care are
   * acelasi stoc pe mai multe canale isi tine asa o rezerva: eMAG vede 8 din 10, iar
   * ultimele doua raman pentru magazinul lui.
   *
   * ⚠ `null` INSEAMNA „STERGE-L”, si e forma pe care o cere imbinarea. Panoul trimite un
   * PETIC, iar intr-o imbinare cheia lipsa inseamna „las-o cum e” — deci un camp golit de
   * comerciant ar fi ramas pe loc. `null` e singurul fel de a spune „scoate-l”, si
   * cititorii il iau deja drept lipsa.
   */
  stoc_rezervat?: number | null;

  /**
   * Trimite Edinio si CONTINUTUL (nume, descriere, imagini, caracteristici)?
   *
   * ═══ ⚠ ALTA INTREBARE DECAT `auto_sync` ═══
   *
   * `auto_sync` e „trimite pretul si stocul”. Asta e „rescrie si fisa produsului”.
   *
   * Multi comercianti isi ingrijesc fisa direct in panoul eMAG — poze mai bune, text
   * scris pentru cumparatorul de acolo — si vor ca Edinio sa conduca numai pretul si
   * stocul. Fara comutatorul asta, prima editare a produsului in magazin le-ar fi
   * sters munca, si n-ar fi avut cum s-o opreasca decat oprind sincronizarea cu totul.
   *
   * Implicit PORNIT: cine publica din Edinio se asteapta ca fisa sa vina tot de acolo.
   */
  sync_continut?: boolean;

  /** Cat de larg e intervalul min/max fata de pretul de vanzare, in procente. */
  price_band_pct?: number;

  /**
   * Cand am citit ULTIMA DATA catalogul lor, de la un capat la altul.
   *
   * ═══ ⚠ FARA EL NU SE POATE CREA NIMIC PE eMAG. VEZI 24.08.2026 ═══
   *
   * Un comerciant care avea deja produsele in contul lui eMAG a apasat „Publica”
   * pe 208 dintre ele fara sa fi rulat vreodata importul. Edinio n-avea de unde sa
   * stie ca produsele alea sunt DEJA acolo, asa ca a incercat sa le creeze din nou,
   * cu identitati noi. Rezultatul, masurat pe 150 de trimiteri:
   *
   *   ~2 din 3  „You already hold a Product associated with this PN” — eMAG a
   *             refuzat crearea. Nimic nu s-a duplicat, dar nimic nu s-a publicat.
   *   ~1 din 3  „saved as a draft … you need: EAN” — s-au facut ciorne moarte in
   *             contul LOR, care nu se vand si pe care le curata omul de mana.
   *
   * Si niciuna dintre cele 150 n-a fost o eroare: verdictul nostru a fost „reusit”
   * sau „reusit cu observatii”. Ecranul ar fi spus „trimise 208”.
   *
   * ⚠ SE SCRIE NUMAI CAND CATALOGUL S-A CITIT INTREG. Taiat de limita de pagini,
   * marcajul ar minti exact despre produsele pe care nu le-am vazut — adica despre
   * cele care se pot ciocni. Aceeasi regula ca la fereastra de comenzi: trunchierea
   * NU avanseaza marcajul.
   *
   * ⚠ Zero oferte citite ESTE un raspuns valid, si scrie marcajul. Un cont eMAG gol
   * e o stare adevarata, nu o citire nereusita — confundate, un comerciant nou n-ar
   * fi putut publica niciodata.
   */
  catalog_citit_la?: string;

  /** Marcaje de trecere. */
  orders_synced_at?: string;
  rma_synced_at?: string;
  reconcile_page?: number;
  /**
   * Cand a sunat ultima data eMAG cu o notificare.
   *
   * ⚠ Se scrie de ruta de notificari, nu de cron. Panoul il arata ca sa se poata
   * raspunde la „notificarile chiar functioneaza?” — intrebare care altfel n-are
   * niciun raspuns, fiindca lipsa lor nu strica nimic vizibil: comenzile intra oricum,
   * doar mai incet.
   */
  ultimul_webhook?: string;

  /*
   * ═══ SURSA ADEVARULUI, PE CAMP (§69) ═══
   *
   * Cine are ultimul cuvant cand ce e la eMAG nu mai e ce am trimis noi.
   *
   * ⚠ DOUA COMUTATOARE, NU UNUL, si asta e chiar hotararea. Aproape orice
   * comerciant vrea ca Edinio sa tina STOCUL — asta e tot rostul integrarii: un
   * singur inventar. Dar multi isi tin PRETUL in panoul eMAG, din campanii si din
   * Smart Deals.
   *
   * Cu un singur comutator, omul ar fi fost pus sa aleaga intre a-si pierde
   * campaniile la fiecare trecere si a-si vinde marfa de doua ori.
   *
   * ⚠ Implicitul e „edinio” pentru amandoua, si dinadins: un magazin care n-a
   * atins setarea a legat eMAG tocmai ca sa tina totul dintr-un singur loc.
   */
  /**
   * Cate zile ii trebuie magazinului ca sa se reaprovizioneze (§15).
   *
   * ⚠ Valorile lor sunt un ENUM: 2, 3, 5, 7, 14, 30, 60, 90, 120. Se aleg prin
   * `alegeSupplyLeadTime`, care rotunjeste IN SUS.
   *
   * ⚠ Lipsa inseamna „nu trimite campul”, nu „trimite 14”. eMAG are deja implicitul
   * lui, iar noi n-avem de ce sa scriem peste ce a pus comerciantul in panoul lor.
   *
   * ⚠ `null` INSEAMNA „STERGE-L”, si e forma pe care o cere imbinarea. Panoul trimite un
   * PETIC, iar intr-o imbinare cheia lipsa inseamna „las-o cum e” — deci un camp golit de
   * comerciant ar fi ramas pe loc. `null` e singurul fel de a spune „scoate-l”, si
   * cititorii il iau deja drept lipsa.
   */
  supply_lead_time?: number | null;

  deriva_pret?: "edinio" | "emag";
  deriva_stoc?: "edinio" | "emag";

  /** Adresa de ridicare si contul de curier alese pentru AWB. */
  pickup_address_id?: string;
  return_address_id?: string;
  courier_account_id?: number;

  /*
   * ═══ INTENTIA DE PROPAGARE, SCRISA IN ACELASI RAND CU DATELE ═══
   *
   * Cand comerciantul schimba o setare care pleaca in incarcatura ofertelor, punerea in
   * coada se face dupa raspuns (`dupaRaspuns`). Daca instanta moare intre salvare si
   * punerea in coada, intentia lui se pierde FARA URMA: plasa de schimbari neplecate se
   * uita la amprenta de CONTINUT a produsului, iar o setare de magazin nu e in ea. Nimic
   * nu o mai recupereaza vreodata.
   *
   * ⚠ DE-AIA CALATORESC IN CHIAR PETICUL CARE DUCE DATELE. `patchEmagConfig` merge printr-o
   * singura instructiune Postgres (`jsonb_merge_config`), deci intentia devine durabila in
   * aceeasi clipa cu valoarea care a cerut-o. Nu exista fereastra intre ele.
   *
   * Cronul ridica ce-a ramas neterminat. Punerea in coada e oricum idempotenta:
   * `emag_sync_queue` are `unique (business_id, offer_id, op)`.
   */

  /** Cand s-a cerut ultima propagare de setari. ISO, si totodata cheia ei. */
  propagare_ceruta_la?: string | null;
  /**
   * Ce marime de operatie cere: `oferta` le duce pe toate, `pret` doar pretul, `stoc` doar
   * stocul. La doua cereri suprapuse ramane cea mai GREA — o cerere usoara n-are voie sa
   * inlocuiasca una grea care inca n-a apucat sa plece.
   */
  propagare_op?: "oferta" | "pret" | "stoc" | null;
  /**
   * Valoarea lui `propagare_ceruta_la` care a fost DUSA la capat.
   *
   * ⚠ Se scrie marcajul cerut, nu „acum”: daca intre timp a venit o cerere noua, un „acum”
   * ar stinge-o si pe aceea, iar a doua schimbare a comerciantului n-ar mai pleca niciodata.
   */
  propagare_facuta_la?: string | null;
}

export interface EmagIntrareCategorie {
  category_id: number;
  /**
   * Caracteristicile fixate de comerciant pentru toata categoria.
   *
   * ⚠ Din §19 incoace acestea sunt o VALOARE DE REZERVA, nu una impusa: umplu golurile
   * pentru produsele care n-au specificatia lor in fisa. Vezi `caracteristici.ts`.
   */
  characteristics?: EmagCaracteristica[];
  /**
   * Ce cere eMAG in categoria asta, cu `values[]` si `is_mandatory` cu tot (§19).
   *
   * ⚠ SE PUNE DEOPARTE LA MAPARE, si nu din zgarcenie. `category/read` e o cerere din
   * cele 3 pe secunda ale magazinului; ceruta la fiecare trimitere, ar fi luat o
   * treime din ritm pentru un raspuns care se schimba de cateva ori pe an.
   *
   * ⚠ Lipsa inseamna „nu s-a mapat cu versiunea noua”. Atunci potrivirea nu are cu ce
   * lucra si raman doar cele fixate — adica purtarea de dinainte, nu o cadere.
   */
  characteristics_categorie?: EmagCaracteristicaCategorie[];
  family_type_id?: number;

  /*
   * ═══ ⚠ CE CERE CATEGORIA, PUS DEOPARTE LA MAPARE ═══
   *
   * Obligativitatea EAN-ului si a garantiei se afla numai din `category/read`. Fara
   * ele scrise aici, verificarea de dinainte de trimitere (`pregatire.ts`) ar fi
   * trebuit sa cheme eMAG pentru FIECARE produs — adica sa arda din cele 3 cereri pe
   * secunda exact ca sa afle ca nu trebuie sa trimita.
   *
   * Se scriu o data, cand comerciantul leaga categoria si oricum se cere schema ei.
   *
   * ⚠ Pot fi „imbatranite”: daca eMAG schimba cerintele unei categorii, aici ramane ce
   * era atunci. Nu e o pierdere — verificarea locala e o PLASA, nu o inlocuire a
   * validarii lor; ce scapa de aici tot la ei se opreste, doar mai tarziu. Se
   * improspateaza la fiecare re-salvare a maparii.
   */
  ean_obligatoriu?: boolean;
  garantie_obligatorie?: boolean;
}

/**
 * Eticheta omeneasca a fiecarei stari.
 *
 * ═══ ⚠ AICI ERAU DOUA UNIUNI PENTRU ACEEASI COLOANA ═══
 *
 * Pana de curand, `emag_offers.status` avea DOUA tipuri care il descriau: unul scris
 * in etapa 1 (`draft` | `trimis` | `in_validare` | `activ` | ...) si `StareOferta`,
 * scris in etapa 3, care e cel pe care il foloseste codul CU ADEVARAT.
 *
 * Niciuna nu era gresita in sine. Raul a fost ca panoul numara ofertele dupa numele
 * din prima, iar codul scria numele din a doua: toate numaratorile intorceau ZERO.
 *
 * De aceea a ramas UNA singura, iar tabelul de mai jos e legat de ea: adaugata o
 * stare noua fara eticheta, `tsc` refuza fisierul.
 *
 * ⚠ NU E FOLOSIT INCA DE NICIUN ECRAN, si e scris aici cu buna stiinta. Lista de
 * oferte a etapei 3 (`EmagListings`) nu exista inca; cand se scrie, ea trebuie sa ia
 * etichetele DE AICI, nu sa-si compuna alte siruri — altfel se naste a doua sursa de
 * adevar, adica exact defectul de mai sus, a doua oara.
 */
export const EMAG_ETICHETA_STARE: Record<StareOferta, string> = {
  draft: "Nelistat",
  imported: "Preluat din eMAG",
  queued: "În așteptare",
  sent: "Trimis, în validare",
  live: "Se vinde pe eMAG",
  error: "Necesită revizuire",
  withdrawn: "Oprit de la vânzare",
};
