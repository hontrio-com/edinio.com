/**
 * Produs Edinio → incarcatura eMAG.
 *
 * ═══ ⚠ CEA MAI MARE DEOSEBIRE DE MODEL DIN TOATA INTEGRAREA ═══
 *
 * eMAG NU ARE VARIANTE. Fiecare marime sau culoare e o OFERTA SEPARATA, cu `id`
 * propriu, iar legatura dintre ele e o FAMILIE. Un produs Edinio cu patru
 * combinatii devine patru incarcaturi, nu una cu patru randuri inauntru.
 *
 * La Trendyol un produs cu variante ramanea UN obiect (`productMainId` cu mai
 * multe `barcode`-uri). Aici nu exista niciun obiect „produs" care sa fie al
 * nostru — de aceea si tabelul se cheama `emag_offers`.
 *
 * Tot fisierul e PUR: nu citeste baza, nu cheama reteaua. Id-urile eMAG si datele
 * magazinului sosesc ca argumente, tocmai ca fiecare regula de mai jos sa poata fi
 * probata fara nimic pornit.
 */

import { combinatiiActiveUnice, comboStock, comboUnitPrice, parseVariants } from "@/lib/storefront/variants";
import { codDeBareCurat } from "./ean";
/*
 * ⚠ Se refoloseste rescrierea de adrese a lui Trendyol, nu se scrie a doua.
 * Motivul e acolo: 1466 de imagini pe 855 de produse mai stau pe domeniul vechi
 * `pub-*.r2.dev`, iar marketplace-urile isi aduc singure imaginile si resping
 * produsul cand nu le pot lua. Cele doua domenii servesc acelasi obiect.
 */
import { adresaPublicaImagine } from "@/lib/trendyol/mapping";
import { descriereaPentruEmag } from "./descriere";
import type {
  EmagCaracteristica, EmagGpsrEntitate, EmagImagine, EmagOferta, EmagProdusOferta, EmagStoc,
} from "./types";

/* ═══════════════════════════════════════════════════════════════════════════
   PRETUL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ EMAG CERE PRETUL FARA TVA. TOATE CELE PATRU.
 *
 * `sale_price`, `recommended_price`, `min_sale_price` si `max_sale_price` sunt,
 * fiecare, „without VAT" in documentatia lor. Magazinele noastre isi tin pretul
 * cu sau fara TVA, dupa `store_settings.prices_include_vat`.
 *
 * Trimis gresit, nu da NICIO eroare: oferta se publica cu pretul umflat sau
 * subtiat cu cota de TVA, se si vinde asa, si se afla din marja. La 21% inseamna
 * o cincime din pret.
 *
 * Patru zecimale, cat ingaduie ei — nu doua. Rotunjit la doua, un pret de 99,99
 * cu TVA iese 82,64 in loc de 82,6364, iar inapoi cu TVA da 99,9944: comerciantul
 * vede pe eMAG alt pret decat in magazin si crede ca s-a stricat ceva.
 */
export function pretFaraTva(pretAfisat: number, cotaProcente: number, includeTva: boolean): number {
  if (!Number.isFinite(pretAfisat) || pretAfisat <= 0) return 0;
  if (!includeTva) return patruZecimale(pretAfisat);
  const cota = Number.isFinite(cotaProcente) ? cotaProcente : 0;
  return patruZecimale(pretAfisat / (1 + cota / 100));
}

function patruZecimale(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export interface BandaPret {
  min_sale_price: number;
  max_sale_price: number;
}

/**
 * Intervalul in care eMAG are voie sa miste pretul.
 *
 * ⚠ AMANDOUA SUNT OBLIGATORII LA PRIMA SALVARE a produsului, si eMAG cere
 * `max_sale_price > min_sale_price`. Egale, cererea se respinge.
 *
 * ⚠ De aceea procentul zero NU e ingaduit: ar da min = max = pret si ar respinge
 * fiecare produs nou al magazinului, cu un mesaj care nu pomeneste procentul.
 * Sub 1% se ridica la 1%, tacut dar corect — mai bine o banda ingusta decat o
 * publicare care nu porneste.
 */
export function bandaDePret(pretFaraTva: number, procent: number): BandaPret {
  const p = Number.isFinite(procent) && procent >= 1 ? procent : 1;
  return {
    min_sale_price: patruZecimale(pretFaraTva * (1 - p / 100)),
    max_sale_price: patruZecimale(pretFaraTva * (1 + p / 100)),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   IDENTIFICATORII
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `part_number`, in forma in care il va tine eMAG.
 *
 * ⚠ EI STERG SINGURI spatiile, virgula si punctul-virgula: documentatia da chiar
 * exemplul „part number;" salvat ca „partnumber". Daca trimitem forma cu spatii
 * si tinem local tot forma cu spatii, atunci `ext_part_number` de pe liniile
 * comenzii nu se mai potriveste cu nimic la noi — si comanda soseste fara sa stim
 * ce produs s-a vandut.
 *
 * Deci se normalizeaza AICI, o data, si se tine forma normalizata.
 */
export function normalizeazaPartNumber(brut: string | null | undefined): string {
  return (brut ?? "").replace(/[\s,;]/g, "");
}

/**
 * `part_number` pentru o combinatie.
 *
 * Fiecare combinatie e o oferta separata la eMAG, deci are nevoie de un
 * identificator PROPRIU. Cand combinatia n-are SKU al ei, se compune din SKU-ul
 * produsului si titlul combinatiei.
 *
 * ⚠ TITLUL NU SE NORMALIZEAZA CA UN SKU, si proba a prins de ce. eMAG sterge doar
 * spatiile, virgula si punctul-virgula — deci „S / Rosu" ar fi iesit „S/Rosu", cu
 * bara ramasa in identificator. Nu e interzis de ei, dar o bara intr-un cod care
 * ajunge in adrese, in exporturi CSV si in cautari e o problema care se descopera
 * tarziu si in alta parte.
 *
 * Aici titlul se aduce la o forma sigura: orice grup de semne care nu e litera sau
 * cifra devine o singura liniuta. „S / Rosu" da „S-Rosu", iar rezultatul e stabil
 * si trece neatins prin normalizarea LOR — deci ce trimitem e chiar ce vor tine.
 */
export function partNumberCombinatie(
  skuProdus: string | null | undefined,
  skuCombinatie: string | null | undefined,
  titluCombinatie: string,
): string {
  const alCombinatiei = normalizeazaPartNumber(skuCombinatie);
  if (alCombinatiei) return alCombinatiei;
  const baza = normalizeazaPartNumber(skuProdus);
  const sufix = (titluCombinatie ?? "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return baza ? `${baza}-${sufix}` : sufix;
}

/**
 * Stocul care pleaca la eMAG, dupa ce se opreste rezerva.
 *
 * ═══ ⚠ NU COBOARA SUB ZERO, SI NU „REZERVA" MAI MULT DECAT EXISTA ═══
 *
 * Un comerciant cu 2 bucati si rezerva 3 trebuie sa trimita `0`, nu `-1`: eMAG
 * respinge numerele negative, iar oferta ar fi ramas neactualizata cu un mesaj despre
 * un camp — adica ar fi continuat sa vanda cele doua bucati pe care omul le voia
 * oprite. Zero opreste vanzarea, care e chiar ce a cerut.
 */
/**
 * ⚠ VALORILE INGADUITE PENTRU `supply_lead_time`, SCRISE IN SCHEMA LOR.
 *
 * `{"type":"integer","enum":[2,3,5,7,14,30,60,90,120],"default":14}`. Nu e un numar
 * liber: 10 e refuzat, iar mesajul lor vorbeste despre camp, nu despre valorile
 * ingaduite — comerciantul ar fi cautat greseala in alta parte.
 */
export const SUPPLY_LEAD_TIME_INGADUIT = [2, 3, 5, 7, 14, 30, 60, 90, 120] as const;

/**
 * Cate zile ii trebuie magazinului ca sa se reaprovizioneze, dintre valorile lor.
 *
 * ⚠ ROTUNJESTE IN SUS, ca `alegeTimpPregatire`. Un magazin care se reaprovizioneaza
 * in zece zile si primeste `7` fiindca 7 e mai aproape decat 14 promite mai repede
 * decat poate — iar la eMAG promisiunea neonorata se numara.
 *
 * ⚠ Peste cea mai mare valoare se ia cea mai mare, nu se inventeaza una.
 */
export function alegeSupplyLeadTime(zile: number | null | undefined): number | null {
  const n = Number(zile);
  if (!Number.isFinite(n) || n <= 0) return null;
  return SUPPLY_LEAD_TIME_INGADUIT.find((v) => v >= n)
    ?? SUPPLY_LEAD_TIME_INGADUIT[SUPPLY_LEAD_TIME_INGADUIT.length - 1];
}

export function stocCuRezerva(stoc: number, rezerva: number | null | undefined): number {
  const s = Number.isFinite(stoc) ? Math.max(0, Math.floor(stoc)) : 0;
  const r = Number.isFinite(Number(rezerva)) ? Math.max(0, Math.floor(Number(rezerva))) : 0;
  return Math.max(0, s - r);
}

/* ═══════════════════════════════════════════════════════════════════════════
   IMAGINILE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Imaginile, in forma ceruta de eMAG.
 *
 * ⚠ `display_type: 1` MARCHEAZA PRINCIPALA, si e una singura. Restul primesc 2
 * (secundare). Fara marcaj, eMAG alege el, iar produsul apare pe site cu alta
 * poza decat in magazin.
 *
 * ⚠ Numai `https`. O adresa `http` e respinsa la validare si cade produsul intreg
 * — aceeasi regula ca la Trendyol.
 */
export function imaginiEmag(imagini: unknown, imagineCombinatie?: string | null): EmagImagine[] {
  const brute = Array.isArray(imagini) ? imagini : [];
  const adrese: string[] = [];

  /* Poza combinatiei e principala, cand exista: clientul care a ales „Rosu"
     trebuie sa vada rosu, nu prima poza a produsului. */
  const aCombinatiei = (imagineCombinatie ?? "").trim();
  if (aCombinatiei) adrese.push(adresaPublicaImagine(aCombinatiei));

  for (const x of brute) {
    const u = adresaPublicaImagine(String(x ?? "").trim());
    if (u && !adrese.includes(u)) adrese.push(u);
  }

  return adrese
    .filter((u) => /^https:\/\//i.test(u))
    .map((url, i) => ({ url, display_type: i === 0 ? 1 : 2 } as EmagImagine));
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE INTRA IN CARTOGRAFIERE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Produsul, cu exact campurile de care are nevoie cartografierea. */
export interface ProdusDeCartografiat {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  images: unknown;
  category: string | null;
  sku: string | null;
  weight_grams: number | null;
  stock_quantity: number | null;
  is_active: boolean;
  page_sections: unknown;
}

/**
 * Codul de bare scris in fisa produsului.
 *
 * ⚠ `page_sections.google.gtin` e acelasi camp pe care il foloseste feedul Google
 * Merchant. Un al doilea loc pentru „codul de bare" ar fi insemnat ca omul il scrie
 * o data pentru Google si inca o data pentru eMAG, si le uita pe rand.
 */
function gtinProdus(produs: ProdusDeCartografiat): string | null {
  const ps = (produs.page_sections ?? {}) as { google?: { gtin?: string } };
  return ps.google?.gtin ?? null;
}

/** Ce stie magazinul despre el insusi. */
export interface ContextMagazin {
  /**
   * Cate zile ii trebuie ca sa se reaprovizioneze (§15).
   *
   * ⚠ `null` = nu s-a declarat, si atunci NU se trimite. eMAG pune singur 14.
   */
  supply_lead_time?: number | null;
  /** Cota in PROCENTE (21 pentru 21%). */
  vat_rate: number;
  prices_include_vat: boolean;
  vat_id: number;
  /**
   * Zilele de pregatire alese de comerciant, sau `null` cand n-a ales.
   *
   * ⚠ `null` NU inseamna „pune o zi". Inseamna „nu trimite campul", ca eMAG sa
   * pastreze ce are acolo. Vezi nota din `magazinDin`.
   */
  handling_time: number | null;
  warehouse_id: number;
  warranty: number;
  /** Cat de larga e banda min/max, in procente. */
  price_band_pct: number;
  /** ⚠ Taxa verde INCLUDE TVA, spre deosebire de preturi. Numai pe eMAG RO. */
  green_tax?: number | null;
  /** Cate bucati se opresc pentru magazinul propriu. Se scad din stocul trimis. */
  stoc_rezervat?: number | null;
  source_language: string;
  brand: string | null;
  gpsr?: {
    safety_information?: string;
    manufacturer?: EmagGpsrEntitate[];
    eu_representative?: EmagGpsrEntitate[];
  };
}

/** Ce s-a hotarat pentru categoria produsului. */
export interface ContextCategorie {
  category_id: number;
  characteristics: EmagCaracteristica[];
  family_type_id?: number;
}

/**
 * Id-urile deja alocate, citite din `emag_offers`.
 *
 * ⚠ Sosesc ca argument, nu se genereaza aici. `emag_id` e cheia dupa care eMAG
 * identifica oferta si trebuie sa fie STABILA pe veci: generata la cartografiere,
 * s-ar fi schimbat la fiecare trimitere si fiecare trimitere ar fi creat alta
 * oferta, lasand-o pe cea veche orfana acolo.
 */
export interface IdentitateOferta {
  /** `null` pentru produsul simplu. */
  variant_title: string | null;
  emag_id: number;
  part_number_key?: string | null;
  ean?: string | null;
}

export interface RezultatCartografiere {
  oferte: EmagProdusOferta[];
  /** Ce n-a mers. O ofertă cu probleme NU se trimite. */
  probleme: string[];
}

/**
 * Ofertele eMAG ale unui produs.
 *
 * Un produs simplu da o oferta; unul cu N combinatii active da N oferte, toate cu
 * acelasi `family.id`.
 */
export function construiesteOferte(
  produs: ProdusDeCartografiat,
  magazin: ContextMagazin,
  categorie: ContextCategorie,
  identitati: IdentitateOferta[],
  familyId: number | null,
): RezultatCartografiere {
  const probleme: string[] = [];
  const variante = parseVariants(produs.page_sections);
  const combinatii = combinatiiActiveUnice(variante);
  const dupaTitlu = new Map(identitati.map((i) => [i.variant_title ?? "", i]));

  const comun = {
    category_id: categorie.category_id,
    source_language: magazin.source_language,
    brand: (magazin.brand ?? "").trim() || undefined,
    /* ⚠ Trecuta prin filtru, nu de-a gata. Vezi `descriere.ts`: `div`-urile si
       clasele storefrontului nostru ajung pe pagina LOR fara CSS-ul care le tine,
       iar descrierea se desface — produsul se publica si arata rupt. */
    description: descriereaPentruEmag(produs.description),
    characteristics: categorie.characteristics.length ? categorie.characteristics : undefined,
    warranty: magazin.warranty,
    vat_id: magazin.vat_id,
    ...(magazin.handling_time != null
      ? { handling_time: [{ warehouse_id: magazin.warehouse_id, value: magazin.handling_time }] }
      : {}),
    /*
     * ═══ ⚠ SE OMITE CAND NU E STIUT, EXACT CA `handling_time` ═══
     *
     * Schema lor spune `default: 14`. Deci netrimis, eMAG pune singur 14 — iar noi
     * n-avem de ce sa scriem peste ce a pus comerciantul in panoul LOR.
     *
     * Trimis cu o valoare de rezerva, fiecare republicare i-ar fi rescris timpul de
     * reaprovizionare cu al nostru. Fara nicio eroare: 14 e o valoare perfect valida.
     * Chiar greseala `handling_time ?? 1`, in alta deghizare.
     */
    /* ⚠ SE TRECE PRIN `alegeSupplyLeadTime` CHIAR DACA VINE DIN SETARI.
       Incarcatura se inchide cu un `as EmagProdusOferta`, deci tipul ingust
       `2 | 3 | 5 | ...` NU e verificat aici de compilator. O valoare scrisa din alta
       parte in config — o consola, o versiune mai veche — ar fi plecat asa cum e, iar
       eMAG ar fi respins oferta cu un mesaj despre camp, nu despre valorile ingaduite.
       Doua incuietori: si la salvarea setarii, si aici. */
    ...(alegeSupplyLeadTime(magazin.supply_lead_time) != null
      ? { supply_lead_time: alegeSupplyLeadTime(magazin.supply_lead_time) as number }
      : {}),
    /*
     * ⚠ `images_overwrite: 1` — imaginile din Edinio le INLOCUIESC pe cele de la ei,
     * nu se adauga peste. Cu `0`, fiecare retrimitere ar fi lipit inca un set: dupa a
     * treia editare a produsului, fisa de la eMAG ar fi avut cincisprezece poze, dintre
     * care zece vechi. Iar comerciantul n-ar fi avut de unde sti de ce.
     *
     * ⚠ Cine isi ingrijeste fisa in panoul lor opreste `sync_continut` — si atunci
     * documentatia nu mai pleaca deloc, deci nici steagul asta nu se aplica.
     */
    images_overwrite: 1 as const,
    safety_information: magazin.gpsr?.safety_information,
    manufacturer: magazin.gpsr?.manufacturer,
    eu_representative: magazin.gpsr?.eu_representative,
    /*
     * ⚠ TAXA VERDE INCLUDE TVA, spre deosebire de toate celelalte preturi. Documentatia
     * lor: „This value includes VAT." Trecuta prin `pretFaraTva` din obisnuinta, ar fi
     * plecat cu o cincime mai mica — si nimeni n-ar fi observat, fiindca e o suma mica
     * pe o linie separata. Deci se trimite EXACT cum a scris-o comerciantul.
     */
    ...(Number(magazin.green_tax) > 0 ? { green_tax: Number(magazin.green_tax) } : {}),
  };

  /* ── Produs simplu ────────────────────────────────────────────────────── */
  if (combinatii.length === 0) {
    const ident = dupaTitlu.get("");
    if (!ident) {
      probleme.push(`Produsul „${produs.name}" nu are încă un id eMAG alocat.`);
      return { oferte: [], probleme };
    }
    const oferta = ofertaSingura({
      produs, magazin, comun, ident,
      /* ⚠ Ce stim NOI bate ce-am primit inapoi: `ident.ean` vine din raspunsul lor si
         e gol la prima trimitere, iar fisa produsului il are de la inceput. */
      ean: ident.ean ?? codDeBareCurat(gtinProdus(produs)),
      pretAfisat: produs.price,
      compareAt: produs.compare_at_price,
      stoc: produs.stock_quantity ?? 0,
      partNumber: normalizeazaPartNumber(produs.sku) || normalizeazaPartNumber(produs.id),
      imagini: imaginiEmag(produs.images),
      titlu: produs.name,
      familie: undefined,
      probleme,
    });
    return { oferte: oferta ? [oferta] : [], probleme };
  }

  /* ── Produs cu combinatii ─────────────────────────────────────────────── */
  if (familyId == null) {
    probleme.push(`Produsul „${produs.name}" are variante, dar nu are încă o familie eMAG alocată.`);
    return { oferte: [], probleme };
  }
  if (!categorie.family_type_id) {
    /*
     * ⚠ Fara `family_type_id`, eMAG primeste ofertele DAR nu le grupeaza: pe site
     * apar ca produse fara legatura intre ele, iar clientul nu poate schimba
     * marimea. Nu da eroare — de aia se opreste aici, la noi.
     */
    probleme.push(
      `Categoria eMAG aleasă pentru „${produs.name}" nu are un tip de familie. ` +
      "Alege-l în setările integrării, altfel mărimile apar ca produse separate.",
    );
    return { oferte: [], probleme };
  }

  const oferte: EmagProdusOferta[] = [];
  for (const c of combinatii) {
    const ident = dupaTitlu.get(c.title);
    if (!ident) {
      probleme.push(`Varianta „${c.title}" a produsului „${produs.name}" nu are încă un id eMAG alocat.`);
      continue;
    }
    const oferta = ofertaSingura({
      produs, magazin, comun, ident,
      /*
       * ⚠ NUMAI codul COMBINATIEI, si niciodata al produsului.
       *
       * Un cod de bare identifica un ambalaj anume, nu un articol. Cazuta pe codul
       * produsului, fiecare marime ar fi plecat cu ACELASI EAN — iar eMAG le-ar fi
       * legat pe toate de aceeasi pagina de produs din catalogul lor, sau le-ar fi
       * respins ca duplicate. Mai bine fara cod decat cu unul care minte.
       */
      ean: ident.ean ?? codDeBareCurat(c.gtin),
      pretAfisat: comboUnitPrice(c, produs.price),
      compareAt: produs.compare_at_price,
      /* ⚠ Stocul COMBINATIEI, nu al produsului. `comboStock` intoarce `null` cand
         nu e declarat, si atunci ramane valabil stocul produsului intreg — vezi
         nota din `variants.ts`. */
      stoc: comboStock(c) ?? produs.stock_quantity ?? 0,
      partNumber: partNumberCombinatie(produs.sku, c.sku, c.title),
      imagini: imaginiEmag(produs.images, c.image),
      titlu: `${produs.name} - ${c.title}`,
      familie: {
        id: familyId,
        name: produs.name.slice(0, 200),
        family_type_id: categorie.family_type_id,
      },
      probleme,
    });
    if (oferta) oferte.push(oferta);
  }

  return { oferte, probleme };
}

function ofertaSingura(a: {
  produs: ProdusDeCartografiat;
  magazin: ContextMagazin;
  comun: Record<string, unknown>;
  ident: IdentitateOferta;
  /**
   * Codul de bare care pleaca, deja ales si curatat de apelant.
   *
   * ⚠ NU se mai citeste din `ident.ean`. Randul nostru `emag_offers` are `ean` gol la
   * o oferta pe care n-am trimis-o inca — el se umple abia din raspunsul lor — deci
   * PRIMA trimitere, chiar cea care creeaza produsul, pleca mereu fara cod de bare.
   *
   * eMAG raspunde atunci „saved as a draft … you need: EAN", si produsul ramane o
   * ciorna care nu se vinde. Masurat pe 24.08.2026: 40 de produse asa, fiecare cu un
   * `gtin` bun scris in fisa lui la noi. Comerciantul a spus-o direct: „la produsele
   * alea care spunea ca nu au cod EAN, au in magazinul nostru".
   */
  ean: string | null;
  pretAfisat: number;
  compareAt: number | null;
  stoc: number;
  partNumber: string;
  imagini: EmagImagine[];
  titlu: string;
  familie: EmagProdusOferta["family"];
  probleme: string[];
}): EmagProdusOferta | null {
  const { magazin, ident, probleme } = a;

  const sale = pretFaraTva(a.pretAfisat, magazin.vat_rate, magazin.prices_include_vat);
  if (sale <= 0) {
    probleme.push(`„${a.titlu}" nu are un preț valid.`);
    return null;
  }

  if (!a.partNumber) {
    probleme.push(`„${a.titlu}" nu are cod de produs (SKU). eMAG îl cere.`);
    return null;
  }

  if (a.imagini.length === 0) {
    probleme.push(`„${a.titlu}" nu are nicio imagine https. eMAG cere cel puțin una.`);
    return null;
  }

  const banda = bandaDePret(sale, magazin.price_band_pct);

  /*
   * `recommended_price` e pretul taiat, si eMAG cere sa fie MAI MARE decat
   * `sale_price`. Un `compare_at_price` mai mic sau egal e o greseala a
   * comerciantului, nu ceva de trimis: se lasa afara, si oferta pleaca fara
   * pretul taiat, in loc sa fie respinsa cu totul.
   */
  const recomandat = a.compareAt != null
    ? pretFaraTva(a.compareAt, magazin.vat_rate, magazin.prices_include_vat)
    : null;

  const stoc: EmagStoc[] = [{
    warehouse_id: magazin.warehouse_id,
    value: Math.max(0, Math.floor(Number.isFinite(a.stoc) ? a.stoc : 0)),
  }];

  return {
    ...(a.comun as object),
    id: ident.emag_id,
    name: a.titlu.slice(0, 255),
    part_number: a.partNumber,
    /*
     * ═══ ⚠ CHEIA DE PRODUS NU SE TRIMITE INAPOI. NICIODATA. (24.08.2026) ═══
     *
     * Documentatia lor, cuvant cu cuvant: „eMAG part_number_key. Used for ATTACHING a
     * product offer to an EXISTING product." Deci campul asta nu descrie oferta — el
     * MUTA oferta pe alta pagina din catalogul eMAG.
     *
     * O oferta care exista deja la ei e deja atasata unde trebuie. Trimis inapoi,
     * campul nu poate face nimic bun; poate doar sa o mute. Iar mutata gresit, marfa
     * comerciantului ajunge pe pagina altcuiva, cu pozele si descrierea altcuiva.
     *
     * ⚠ SI NU E O TEAMA TEORETICA. Verificat pe date reale, in ziua importului: din 3
     * chei luate la intamplare din cele 3.547 citite de la ei, TOATE TREI duceau la
     * produse straine — o folie de vidat si doua mese DKD Home Decor. Iar `/pd/` chiar
     * cauta exact: o cheie inventata da 404, deci cheile alea sunt reale, doar ca ale
     * altor produse.
     *
     * De unde vin, nu se poate sti de aici — noi le scriem dintr-un singur loc, fidel,
     * din raspunsul lor (`import-run.ts`). Dar atat timp cat nu se stie, ele NU pleaca
     * inapoi. Singura cheie in care avem incredere e cea gasita anume prin
     * `documentation/find_by_eans`, unde stim pe ce cod de bare s-a potrivit.
     */
    ...(a.ean ? { ean: [a.ean] } : {}),
    images: a.imagini,
    ...(a.familie ? { family: a.familie } : {}),
    /* 1 = activa, 0 = inactiva. Produsul ascuns in magazin nu se vinde nici acolo. */
    status: a.produs.is_active ? 1 : 0,
    sale_price: sale,
    ...(recomandat != null && recomandat > sale ? { recommended_price: recomandat } : {}),
    min_sale_price: banda.min_sale_price,
    max_sale_price: banda.max_sale_price,
    stock: stoc,
  } as EmagProdusOferta;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MASURATORILE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Dimensiunile si greutatea, in unitatile lor.
 *
 * ⚠ EMAG CERE MILIMETRI SI GRAME. Noi tinem centimetri (`page_sections.dimensions`)
 * si grame (`products.weight_grams`). Trimisi in centimetri, un colet de 30 cm ar
 * fi declarat 30 mm — de treizeci de ori mai mic — iar tariful de livrare calculat
 * de eMAG ar fi gresit fara ca nimic sa semnaleze.
 */
export function masuratoriEmag(
  emagId: number,
  dimensiuniCm: { length?: number; width?: number; height?: number } | null | undefined,
  greutateGrame: number | null | undefined,
): { id: number; length: number; width: number; height: number; weight: number } | null {
  const cm = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 10 * 100) / 100 : null;
  };
  const l = cm(dimensiuniCm?.length);
  const w = cm(dimensiuniCm?.width);
  const h = cm(dimensiuniCm?.height);
  const g = Number.isFinite(Number(greutateGrame)) && Number(greutateGrame) > 0
    ? Math.round(Number(greutateGrame) * 100) / 100
    : null;

  /* Toate patru sau niciuna: eMAG le cere impreuna, iar o masuratoare partiala
     ar fi fost respinsa oricum. */
  if (l == null || w == null || h == null || g == null) return null;
  return { id: emagId, length: l, width: w, height: h, weight: g };
}

/* ═══════════════════════════════════════════════════════════════════════════
   RUTELE USOARE: PRET SI STOC, FARA NICIO DOCUMENTATIE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce se stie despre o oferta deja publicata, cat trebuie ca sa i se schimbe pretul.
 */
export interface IdentitateUsoara {
  /** `null` pentru produsul simplu. */
  variant_title: string | null;
  emag_id: number;
}

/**
 * Ofertele pentru `offer/save` — pret, TVA, timp de pregatire, stoc, stare.
 *
 * ═══ ⚠ DE CE NU TRECE PRIN `construiesteOferte` ═══
 *
 * Fiindca aceea construieste DOCUMENTATIA, si de aceea se opreste cand documentatia
 * n-are cum sa iasa bine: fara categorie mapata sau fara `family_type_id`, intoarce
 * zero oferte si o problema. Ceea ce e chiar ce trebuie — la publicare.
 *
 * Dar o schimbare de PRET pe un produs deja publicat n-are nevoie de nimic din
 * toate acelea. Prima forma a expeditorului o trecea totusi pe acolo, si iesea exact
 * defectul pe care toata integrarea asta se straduieste sa-l evite: la un produs cu
 * variante a carui categorie si-a pierdut `family_type_id`, schimbarea de stoc dupa
 * o vanzare gasea zero oferte, nu trimitea nimic, si raporta REUSIT.
 *
 * Adica exact incidentul VetDepo, in alta deghizare: raspuns de succes, zero efect,
 * si nimeni nu afla. De aceea rutele usoare isi construiesc singure incarcatura, din
 * randurile care exista deja in `emag_offers`.
 */
/**
 * Stocul unei oferte deja publicate, dupa identitatea ei.
 *
 * ═══ ⚠ O VARIANTA CARE NU MAI EXISTA PRIMESTE ZERO, NU STOCUL PRODUSULUI ═══
 *
 * `emag_offers` tine `variant_title` — numele combinatiei, asa cum era la publicare.
 * Comerciantul poate redenumi o marime, sau o poate sterge cu totul; randul de oferta
 * ramane, fiindca oferta EXISTA in continuare la eMAG (ei n-au stergere).
 *
 * Prima forma cadea inapoi pe `produs.stock_quantity` de fiecare data cand nu gasea
 * combinatia. Deci: redenumesti „M" in „Marime M", iar oferta pentru „M" — care se
 * vinde in continuare pe eMAG — primeste dintr-o data stocul INTREG al produsului.
 *
 * eMAG ar fi continuat sa vanda o marime care nu mai exista, cu stocul tuturor
 * marimilor la un loc. Fara nicio eroare: numarul e valid, cererea reuseste, panoul
 * arata „trimis".
 *
 * ⚠ Zero opreste vanzarea, si asta e chiar ce a vrut comerciantul cand a scos
 * varianta. Aceeasi regula ca la `stocCuRezerva`: cand nu se stie, se opreste.
 *
 * ⚠ Produsul SIMPLU (`variant_title === null`) foloseste stocul produsului, si e
 * corect: acolo nu e nicio combinatie de gasit.
 */
function stoculIdentitatii(
  variantTitle: string | null,
  combinatie: { stock_quantity?: unknown } | undefined,
  stocProdus: number | null | undefined,
): number {
  if (variantTitle == null) return stocProdus ?? 0;
  if (!combinatie) return 0;
  return comboStock(combinatie as never) ?? stocProdus ?? 0;
}

export function oferteUsoare(
  produs: ProdusDeCartografiat,
  magazin: ContextMagazin,
  identitati: IdentitateUsoara[],
): EmagOferta[] {
  const variante = parseVariants(produs.page_sections);
  const combinatii = combinatiiActiveUnice(variante);
  const dupaTitlu = new Map(combinatii.map((c) => [c.title, c]));

  /* ⚠ Starea pleaca de la produs: oprit in magazin inseamna oprit si la ei. NU se
     sterge oferta — eMAG n-are stergere; se trece pe `status: 0`. */
  const stare: 0 | 1 = produs.is_active ? 1 : 0;

  return identitati.map((ident) => {
    const c = ident.variant_title ? dupaTitlu.get(ident.variant_title) : undefined;

    const pretAfisat = c ? comboUnitPrice(c, produs.price) : produs.price;
    const faraTva = pretFaraTva(pretAfisat, magazin.vat_rate, magazin.prices_include_vat);
    const banda = bandaDePret(faraTva, magazin.price_band_pct);

    /* ⚠ Stocul COMBINATIEI, si ZERO cand combinatia nu mai exista. Vezi
       `stoculIdentitatii`: cazuta inapoi pe stocul produsului, o marime redenumita ar
       fi primit stocul tuturor marimilor la un loc si s-ar fi vandut mai departe. */
    const stoc = stoculIdentitatii(ident.variant_title, c, produs.stock_quantity);

    return {
      id: ident.emag_id,
      sale_price: faraTva,
      min_sale_price: banda.min_sale_price,
      max_sale_price: banda.max_sale_price,
      vat_id: magazin.vat_id,
      /* ⚠ Se OMITE cand nu se stie, ca eMAG sa pastreze ce are. Trimis cu o valoare
         de rezerva, fiecare schimbare de pret ar fi rescris timpul de pregatire al
         comerciantului — fara nicio eroare, fiindca acela e un camp valid. */
      ...(magazin.handling_time != null
        ? { handling_time: [{ warehouse_id: magazin.warehouse_id, value: magazin.handling_time }] }
        : {}),
      stock: [{ warehouse_id: magazin.warehouse_id, value: stocCuRezerva(stoc, magazin.stoc_rezervat) }],
      status: stare,
    };
  });
}

/**
 * Cate bucati are fiecare oferta, pentru `PATCH /offer_stock/{id}`.
 *
 * ⚠ Ruta cea mai usoara dintre toate: nu atinge nici pretul, nici documentatia. La o
 * oferta pe care comerciantul a modificat-o in panoul eMAG, orice altceva i-ar fi
 * sters modificarile la FIECARE vanzare — adica de zeci de ori pe zi.
 */
export function stocuriDeTrimis(
  produs: ProdusDeCartografiat,
  identitati: IdentitateUsoara[],
  /* ⚠ Rezerva pentru magazinul propriu. Cere-o si aici, nu numai pe ruta grea: altfel
     fiecare vanzare ar fi trimis stocul INTREG si ar fi anulat rezerva la fiecare
     miscare — adica exact pe drumul cel mai des. */
  stocRezervat?: number | null,
): { emagId: number; cantitate: number }[] {
  const variante = parseVariants(produs.page_sections);
  const dupaTitlu = new Map(combinatiiActiveUnice(variante).map((c) => [c.title, c]));

  return identitati.map((ident) => {
    const c = ident.variant_title ? dupaTitlu.get(ident.variant_title) : undefined;
    /* ⚠ Aceeasi regula ca la pret, si aici e si mai scumpa: drumul asta se bate la
       FIECARE vanzare. O varianta disparuta ar fi trimis stocul intregului produs de
       zeci de ori pe zi. */
    const stoc = stoculIdentitatii(ident.variant_title, c, produs.stock_quantity);
    return { emagId: ident.emag_id, cantitate: stocCuRezerva(stoc, stocRezervat) };
  });
}
