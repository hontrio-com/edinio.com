/**
 * Tipurile integrarii easySales.
 *
 * ⚠ NUMELE CAMPURILOR SECRETE SUNT IDENTICE IN TREI LOCURI: aici, in `CAMPURI_SECRETE`
 * (`src/lib/integrari/secrete.ts`) si in `privat.campuri_secrete` (migratia fundatiei). Nimic nu
 * leaga cele trei la rulare; proba `secretele-sunt-aceleasi.test.ts` le compara.
 *
 * ⚠ RASPUNSURILE LOR SE CITESC TOLERANT. Id-urile vin cand numere, cand siruri; sumele, cand
 * numere, cand siruri cu numar variabil de zecimale [A: exemplele]. Tipurile de mai jos spun
 * `unknown` acolo unde forma nu e garantata, ca nimeni sa nu se bizuie pe una singura.
 */

import type { SlugAbonat } from "./constante";

/** Starea contului lor, citita din `GET /api/v2/account` (daca tokenul nostru il poate citi). */
export interface ContEasySales {
  firma?: string | null;
  vat_id?: string | null;
  /** Comparatia `vat_id` cu CUI-ul magazinului, dupa normalizare. */
  potrivire_cui?: "da" | "nu" | "cui_lipsa" | "necunoscut";
  abonament_activ?: boolean | null;
  proba?: boolean | null;
  expira_la?: string | null;
  max_comenzi?: number | null;
  comenzi_curente?: number | null;
  moneda_preferata?: string | null;
  citit_la?: string;
}

/** Un canal vandut prin easySales, declarat de comerciant (planul, §4.9). */
export interface CanalDeclarat {
  /** Integrarea nativa Edinio cu care s-ar ciocni: `emag`, `trendyol`, `aboutyou`, `olx`, `pepita` sau `altul`. */
  canal: string;
  /** Tara, ISO2 mic (`ro`, `hu`, `bg`...). */
  tara: string;
}

export interface EasySalesConfig {
  /* ── stari ── */
  connected?: boolean;
  needs_reconnect?: boolean;
  motiv_reconectare?: string | null;
  pauza?: boolean;
  pauza_motiv?: string | null;

  /* ── identitate ── */
  client_id?: string;
  client_secret?: string;          // secret
  website_token?: string;          // secret
  /** sha256 al website token-ului, primele 32 de caractere: identitatea comparabila in clar. */
  website_token_amprenta?: string;
  website_nume?: string | null;

  /* ── tokenul de acces ── */
  access_token?: string;           // secret
  refresh_token?: string;          // secret
  token_versiune?: number;
  token_emis_la?: string;
  token_expira_la?: string;
  emitere_pana?: string | null;
  emitere_id?: string | null;
  emitere_incercata_la?: string;
  /** Clipa ultimei reemiteri facute la un 401 (cel mult una la 10 minute). */
  reemitere_401_la?: string;
  /** Revocarile neexplicate din ultimele 24 de ore (planul, §4.6). */
  revocari_neexplicate?: string[];
  scopuri_cerute?: string[];
  scopuri_versiune?: number;
  /** Revendicarea `scopes` din JWT. `null` = necunoscut, NU „fara drepturi". */
  scopuri?: string[] | null;
  jwt_sub?: string | null;

  /* ── Personal Access Token, numai daca citirea comenzilor altor canale il cere (D3) ── */
  pat?: string;                    // secret
  pat_introdus_la?: string | null;
  pat_expira_la?: string | null;

  /* ── contul lor ── */
  cont?: ContEasySales;

  /* ── webhook-uri ── */
  /** sha256 al jetonului din adresa abonarilor. Jetonul insusi nu se pastreaza: se DERIVA (`abonari.ts`). */
  webhook_jeton_hash?: string;
  /** Versiunea din care se deriva jetonul; rotirea o creste. */
  webhook_jeton_versiune?: number;
  webhook_secret?: string;         // secret
  /** Numele campului secretului la abonare: colectia scrie `seccret`, ghidul `secret` (M-WH-1). */
  webhook_camp_secret?: "secret" | "seccret";
  abonari?: Partial<Record<SlugAbonat, string>>;
  /** Refacerile abonarilor disparute, pe slug (paza „inlocuita de alt program", planul §6.7). */
  abonari_refacute?: Partial<Record<SlugAbonat, string[]>>;
  semnatura_mod?: "masoara" | "impune";
  semnatura_varianta?: "corp" | "payload" | null;
  ultima_livrare_la?: string | null;

  /* ── comutatoarele, citite si de declansatori ── */
  comenzi_active?: boolean;
  catalog_activ?: boolean;
  stoc_activ?: boolean;

  /* ── setari ── */
  serie_facturi?: string | null;
  canale?: CanalDeclarat[];
  /** Comenzile cu plata online pleaca dupa plata (D24). */
  online_dupa_plata?: boolean;
  /**
   * `order_total` la Save (M-COM-2): `incasat` = `orders.total` (implicit), `definitie` = liniile
   * brute + transportul, cum il defineste documentatia [A].
   */
  varianta_total?: "incasat" | "definitie";

  /* ── catalogul (E3): setarile omului. Lipsa = hotararea recomandata din plan (D8, D9, D10, D21, D30). ── */
  /** D8: produsele fara SKU propriu primesc unul generat (`EDN-...`), tinut numai in legatura. Implicit da. */
  catalog_sku_generat?: boolean;
  /** D10: un produs fara descriere pleaca cu numele drept descriere. Implicit nu: ramane blocat. */
  catalog_descriere_din_nume?: boolean;
  /** D9: stocul fix al produselor fara evidenta de stoc (ca la Trendyol). `null` = excluse. */
  catalog_stoc_fix?: number | null;
  /** D21: stergerea din Edinio arhiveaza produsul in easySales. Implicit da. */
  catalog_arhivare_la_stergere?: boolean;
  /** D30: o combinatie scoasa sau dezactivata ramane cu stoc 0 (implicit) sau se arhiveaza. */
  catalog_combinatie_scoasa?: "stoc_zero" | "arhivare";
  /** `handling_time`, in zile [A: „Handling time (days)"]. `null` = nu se trimite. */
  catalog_termen_zile?: number | null;
  /** Catalogul oprit de noi, cu motivul pentru om: website redenumit, moneda schimbata, cota de TVA. */
  catalog_pauza?: string | null;
  catalog_pornit_la?: string | null;
  /**
   * Amprenta a tot ce intra in produs fara sa fie pe `products`: TVA-ul, adresa magazinului,
   * prefixul produselor, setarile de mai sus. Schimbata = tot catalogul inapoi in coada.
   */
  catalog_amprenta_mediu?: string | null;
  /** Siguranta de masa pe preturi (D22): o trecere mare asteapta confirmarea omului. */
  catalog_preturi_asteapta?: { cerut_la: string; produse: number } | null;
  catalog_preturi_confirmate_la?: string | null;
  /**
   * SKU-urile purtate de mai multe unitati vandabile ale magazinului (`lower(trim)`), socotite pe tot
   * catalogul cel mult o data pe ora: o citire a intregului catalog la fiecare lot ar costa mai mult
   * decat lotul. Intre doua socoteli, paza tare ramane indexul unic pe `lower(sku_trimis)`.
   */
  catalog_sku_duplicate?: string[];
  catalog_sku_duplicate_la?: string | null;
  /** Marcajele catalogului in cron. */
  /** Ultima retrimitere a catalogului intreg la cererea lor (`products-refresh-requested`). */
  catalog_reimprospatat_la?: string | null;
  catalog_verificare_la?: string | null;
  catalog_arhivari_la?: string | null;

  /* ── bucla de stoc (E4) ── */
  /**
   * `umbra`: comenzile altor canale se clasifica si se noteaza „ce as consuma", fara efect;
   * `canar`: se consuma si se impinge numai pe SKU-urile din `stoc_canar`; `efect`: tot catalogul.
   */
  stoc_mod?: "umbra" | "canar" | "efect";
  /** SKU-urile canarului (5-20), alese de om. */
  stoc_canar?: string[];
  stoc_pornit_la?: string | null;
  /** Valul de stoc in curs: cate articole a pus pe 0 (siguranta de masa, D22). */
  stoc_val?: { inceput_la: string; la_zero: number } | null;
  /** Valul asteapta confirmarea omului. */
  stoc_val_asteapta?: { cerut_la: string; la_zero: number } | null;
  stoc_val_confirmat_la?: string | null;
  /** Ultima citire a comenzilor lor inaintea unei impingeri de stoc (regula celor 60 de secunde). */
  stoc_comenzi_citite_la?: string | null;
  /** Ultima retrimitere a stocului intreg (`stock-refresh-requested`, reactivarea contului). */
  stoc_reimprospatat_la?: string | null;
  /** Ultima trecere a derivei (articolele citite de verificare dupa ea se compara). */
  stoc_deriva_la?: string | null;

  /* ── alarmele de magazin, cu clipa ultimei notificari (`notificari.ts`) ── */
  alarme?: Record<string, string>;

  /* ── cererile lor de reimprospatare (`products-refresh-requested`, `stock-refresh-requested`) ── */
  reimprospatare_catalog_ceruta_la?: string | null;
  reimprospatare_stoc_ceruta_la?: string | null;

  /* ── marcajele cronului ── */
  marcaj_comenzi?: string | null;
  banda_la?: string | null;
  plasa_legaturi_la?: string | null;
  plasa_comenzi_la?: string | null;
  sanatate_la?: string | null;
  abonari_verificate_la?: string | null;
  curatenie_la?: string | null;
  conectat_la?: string | null;
}

/** Ce poarta un raspuns de-al lor, adus la o forma. */
export interface PlicEasySales<T = unknown> {
  success?: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]> | unknown;
  meta?: { current_page?: number; last_page?: number; total?: number; per_page?: number };
}

/** Un website din `GET /api/v2/websites/list` [A: name, url, module_version, status]. */
export interface WebsiteEasySales {
  name?: string | null;
  url?: string | null;
  module_version?: string | null;
  status?: string | null;
}

/** O abonare din `GET /api/v2/webhooks` [A]. */
export interface AbonareEasySales {
  id?: unknown;
  url?: string | null;
  http_method?: string | null;
  /** `1` la abonarile vazute pe 14.10.2026. */
  active?: unknown;
  webhook?: { slug?: string | null; name?: string | null; group?: string | null } | null;
  details?: {
    result?: {
      time?: string; final?: boolean; success?: boolean; response?: string;
      attempt_nr?: number; status_code?: number; next_attempt_at?: string | null; total_nr_of_attempts?: number;
    } | null;
    triggered_at?: string | null;
  } | null;
}

/** O comanda, cum o intorc `GET /orders/{id}` si lista [A: Get Order, List orders]. */
export interface ComandaEasySales {
  id?: unknown;
  order_display_id?: unknown;
  internal_id?: unknown;
  order_date?: string | null;
  status?: unknown;
  value?: unknown;
  tax?: unknown;
  total_value?: unknown;
  total_vouchers?: unknown;
  cancel_request?: unknown;
  website?: string | null;
  marketplace?: string | null;
  payment_mode?: unknown;
  payment_status?: unknown;
  products?: {
    sku?: string | null; name?: string | null; quantity?: unknown; price?: unknown; total?: unknown; tax?: unknown;
    product_website_id?: unknown;
    product_data?: { id?: unknown; sku?: string | null; ean?: string | null } | null;
    offer?: { id?: unknown; marketplace_id?: unknown; marketplace_name?: string | null } | null;
  }[];
  shipments?: {
    awb_id?: unknown;
    awb_url?: string | null;
    awb_tracking_page?: string | null;
    delivery_status?: { description?: string | null; value?: unknown } | null;
    delivery_history?: { date?: string | null; description?: string | null }[] | null;
    courier?: { id?: unknown; name?: string | null } | null;
  }[] | null;
  invoices?: { series?: string | null; number?: unknown; URL?: string | null; type?: string | null }[] | null;
  invoice_series?: string | null;
  invoice_nr?: unknown;
  invoice_storno_nr?: unknown;
  awb_id?: unknown;
  custom_status?: { id?: unknown; name?: string | null; long_name?: string | null; color?: string | null } | null;
  errors?: { date?: string | null; action?: string | null; message?: string | null }[] | null;
  updated_at?: string | null;
  created_at?: string | null;
  delivery_status?: { description?: string | null; value?: unknown } | null;
}
