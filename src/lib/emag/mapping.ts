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
import { createHash } from "node:crypto";
import { LIMITE_EMAG, partNumberPreaLung, plafonat, taiat } from "./limite";
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
    /*
     * ⚠ NUMAI FORMATELE PE CARE LE ACCEPTA EI. Schema lor, la `images[].url`: „JPG,
     * JPEG or PNG." Filtrul se uita doar la `https`, deci un `.webp` pleca linistit —
     * si in catalogul masurat exista patru. eMAG nu se plange de o poza pe care n-o
     * poate citi: produsul apare pur si simplu fara ea.
     *
     * ⚠ Adresa se taie de intrebare inainte de potrivire: fisierele noastre au uneori
     * `?v=` sau semnaturi, iar `.jpg?v=2` nu s-ar fi potrivit cu nimic.
     */
    .filter((u) => /\.(jpe?g|png)$/i.test(u.split("?")[0]))
    .map((url, i) => ({ url, display_type: i === 0 ? 1 : 2 } as EmagImagine));
}

/**
 * De ce n-a ramas nicio imagine buna, in cuvintele omului.
 *
 * ═══ ⚠ „NU ARE NICIO IMAGINE HTTPS" ERA FALS (masurat, 24.08.2026) ═══
 *
 * Patru produse blocate in coada, fiecare cu mesajul asta. Iar toate patru AVEAU exact
 * o imagine, si aceea https: `https://edinio-cdn.com/…/….webp`.
 *
 * Filtrarea e corecta — schema lor, la `images[].url`, spune „JPG, JPEG or PNG", deci un
 * `.webp` se scoate pe drept. Dar motivul raportat era altul decat cel adevarat.
 *
 * ⚠ CE COSTA: comerciantul deschide fisa produsului, vede poza acolo, vede ca e https, si
 * nu intelege nimic. Cauta o zi o imagine lipsa care nu lipseste, in loc sa converteasca
 * un fisier. Aceeasi forma cu „eMAG nu trimite motivul prin API" si cu bulina „Preluat":
 * o stare adevarata, cu un motiv fals lipit de ea.
 *
 * ⚠ Se numara pe adresele DE DUPA `https`, nu pe cele brute: un produs cu o poza `http`
 * si una `.webp` are doua necazuri, iar spuse amandoua deodata n-ar ajuta pe nimeni. Se
 * spune cel care se repara primul.
 */
export function motivulImaginilor(imagini: unknown, imagineCombinatie?: string | null): string {
  const brute = Array.isArray(imagini) ? imagini : [];
  const aCombinatiei = (imagineCombinatie ?? "").trim();
  const toate = [
    ...(aCombinatiei ? [adresaPublicaImagine(aCombinatiei)] : []),
    ...brute.map((x) => adresaPublicaImagine(String(x ?? "").trim())).filter(Boolean),
  ];

  if (toate.length === 0) return "nu are nicio imagine. eMAG cere cel puțin una.";

  const sigure = toate.filter((u) => /^https:\/\//i.test(u));
  if (sigure.length === 0) {
    return "are imagini, dar niciuna pe https. eMAG le respinge pe cele http.";
  }

  /* ⚠ Se spune si CE format are, si care se accepta: „converteste-le" fara sa spui in ce
     e o sarcina, nu o indrumare. */
  const extensii = [...new Set(
    sigure.map((u) => (u.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase())
      .filter(Boolean),
  )];
  const scrise = extensii.length ? ` Ale tale sunt ${extensii.map((e) => `.${e}`).join(", ")}.` : "";
  return `are imagini, dar eMAG acceptă doar JPG, JPEG sau PNG.${scrise} Convertește-le în fișa produsului.`;
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
  /** ⚠ Pachet Edinio: stoc derivat din componente, deci NU se publica. Vezi `ceLipseste`. */
  is_bundle?: boolean | null;
  page_sections: unknown;
}

/**
 * Datele GPSR, aduse la limitele lor.
 *
 * ⚠ Se TAIE, nu se refuza: sunt date de contact, iar o adresa scurtata ramane
 * folositoare. Refuzate, ar fi oprit publicarea intregului catalog pentru un caracter.
 */
function gpsrPentruEmag(lista: EmagGpsrEntitate[] | undefined): EmagGpsrEntitate[] | undefined {
  if (!Array.isArray(lista) || lista.length === 0) return undefined;
  return lista.slice(0, LIMITE_EMAG.gpsrSeturi).map((e) => ({
    name: taiat(e?.name, LIMITE_EMAG.gpsrNume),
    address: taiat(e?.address, LIMITE_EMAG.gpsrAdresa),
    email: taiat(e?.email, LIMITE_EMAG.gpsrEmail),
  }));
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

/**
 * Codul de bare cu care va pleca oferta asta la eMAG.
 *
 * ═══ ⚠ O SINGURA SURSA PENTRU „CE TRIMIT" SI „CE VERIFIC" ═══
 *
 * Pana acum erau doua, si se despartisera:
 *
 *   ce TRIMITEM   `ident.ean ?? codDeBareCurat(gtin din fisa produsului)` — reparat 24.08
 *   ce VERIFICAM  `randuri.filter(r => …(r.ean ?? "").trim())` — citit numai din
 *                 `emag_offers.ean`, coloana pe care o scrie DOAR importul, din raspunsul LOR
 *
 * ⚠ CE COSTA: la un produs facut in Edinio, randul din `emag_offers` are `ean` NULL —
 * `asiguraIdentitatile` insereaza sapte coloane si codul nu e printre ele. Deci filtrul
 * dadea lista goala, `cautaInCatalogulLor` iesea cu „mergi" INAINTE de orice cerere, si
 * `documentation/find_by_eans` nu se chema NICIODATA pentru un produs nou.
 *
 * Adica toata masinaria scrisa impotriva duplicatului in catalogul lor comun —
 * `atasare`, `inchis`, `nehotarat`, `avem_deja`, plus oprirea adaugata pe 25.08 — rula
 * numai pentru ofertele venite din import, unde duplicatul nici nu se poate produce. Si
 * tacea exact acolo unde se putea.
 *
 * ⚠ Nu e „la prima publicare": e la fiecare publicare, pana cand cineva face un import
 * complet care umple coloana din raspunsul lor.
 *
 * ⚠ ORDINEA E CEA DIN `ofertaSingura`, si trebuie sa ramana asa: ce ne-au spus EI bate ce
 * stim noi, fiindca `ident.ean` e codul confirmat de ei pentru chiar oferta aceea.
 */
export function eanDeTrimis(
  produs: ProdusDeCartografiat,
  variantTitle: string | null,
  identEan?: string | null,
): string | null {
  if (identEan) return identEan;
  if (!variantTitle) return codDeBareCurat(gtinProdus(produs));

  /* ⚠ Codul COMBINATIEI, niciodata al produsului: un cod de bare identifica un ambalaj
     anume. Cazut pe cel al produsului, fiecare marime ar pleca cu ACELASI cod, iar eMAG
     le-ar lega pe toate de aceeasi pagina sau le-ar respinge ca duplicate. */
  /* ⚠ `parseVariants` primeste TOT `page_sections`, nu `page_sections.variants` — asa il
     cheama si restul fisierului (liniile 528, 1050, 1108). Dat doar nodul interior,
     intoarce `null`, lista iese goala, si fiecare combinatie ar fi plecat FARA cod. */
  const c = combinatiiActiveUnice(parseVariants(produs.page_sections))
    .find((x) => x.title === variantTitle);
  return c ? codDeBareCurat(c.gtin) : null;
}

/**
 * Amprenta CONTINUTULUI care pleaca pe ruta grea.
 *
 * ═══ ⚠ DE CE O AMPRENTA SI NU INCA UN MARCAJ DE TIMP ═══
 *
 * Plasa de siguranta intreba `p.updated_at > o.last_synced_at`. Dar `last_synced_at` se
 * scrie la ORICE reusita, inclusiv dupa o simpla miscare de stoc — `duStocul` cheama
 * aceeasi `scrieRezultatul`. Deci:
 *
 *   10:00  se schimba titlul si poza · punerea in coada se pierde
 *   10:04  se vinde ceva · stocul pleaca si reuseste → `last_synced_at = 10:04`
 *   10:10  plasa intreaba 10:00 > 10:04 ? NU. „Nimic neplecat."
 *
 * Iar la eMAG raman titlul si poza vechi. ⚠ Cu cat magazinul vinde mai bine, cu atat plasa
 * e mai oarba: fiecare vanzare sterge urma schimbarii pierdute.
 *
 * ⚠ SI UN `last_content_synced_at` N-AR FI AJUNS. `products.updated_at` se misca la orice
 * scriere pe produs, deci si la scaderea stocului dupa vanzare — iar atunci am fi retrimis
 * toata documentatia dupa fiecare comanda.
 *
 * Marcajele de timp raspund la „cand". Intrebarea e „ce". Amprenta se schimba numai cand
 * se schimba chiar campurile care pleaca; stocul si pretul n-o pot atinge.
 *
 * ⚠ CE INTRA IN EA: exact ce trimite ruta grea si NIMIC altceva. Pretul si stocul sunt
 * lasate afara ANUME — ele au reconcilierea lor (`masoaraDeriva`), iar puse aici ar fi
 * facut fiecare vanzare sa para o schimbare de continut.
 */
export function amprentaContinutului(produs: ProdusDeCartografiat): string {
  const ps = (produs.page_sections ?? {}) as {
    google?: { brand?: unknown; gtin?: unknown };
    specifications?: unknown;
    dimensions?: unknown;
    variants?: unknown;
  };

  /* ⚠ Ordinea e FIXA, nu `Object.keys`: doua obiecte cu aceleasi valori in alta ordine
     trebuie sa dea aceeasi amprenta, altfel plasa s-ar aprinde la o simpla rescriere a
     fisei care n-a schimbat nimic. Aceeasi lectie ca la `deriva.ts`. */
  const bucati: unknown[] = [
    produs.name ?? null,
    produs.description ?? null,
    produs.category ?? null,
    produs.sku ?? null,
    produs.weight_grams ?? null,
    produs.is_active ?? null,
    Array.isArray(produs.images) ? produs.images : [],
    ps.google?.brand ?? null,
    ps.google?.gtin ?? null,
    ps.specifications ?? null,
    ps.dimensions ?? null,
    /* ⚠ Variantele intra INTREGI: titlu, cod, gtin si poza fiecarei combinatii pleaca in
       incarcatura, deci o schimbare acolo e o schimbare de continut. */
    ps.variants ?? null,
  ];

  return createHash("sha256").update(JSON.stringify(bucati)).digest("hex").slice(0, 32);
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
  /** ⚠ Se trimite MEREU. Vezi nota din `types.ts`: implicitul lor e 1, al nostru 0. */
  emag_club: 0 | 1;
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
  /**
   * Numele pe care il are oferta LA EI, citit de reconciliere.
   *
   * ⚠ Slujeste la o singura hotarare: eMAG refuza sa schimbe `part_number` SI `name` in
   * aceeasi cerere. Vezi `schimbaSiNumele`.
   */
  nume_emag?: string | null;
}

export interface RezultatCartografiere {
  oferte: EmagProdusOferta[];
  /** Ce n-a mers. O ofertă cu probleme NU se trimite. */
  probleme: string[];
  /**
   * Ce merită spus, dar NU oprește trimiterea.
   *
   * ═══ ⚠ DOUĂ LISTE, FIINDCĂ SUNT DOUĂ ÎNTREBĂRI ═══
   *
   * `trimite.ts` raportează `probleme[0]` când nu se poate construi nicio ofertă. Cu
   * observațiile amestecate acolo, o notă împinsă devreme devenea „motivul" — iar
   * comerciantul repara ce nu-l bloca, la nesfârșit.
   *
   * Măsurat: patru elemente de coadă își ardeau încercările raportând un cod de bare
   * stricat de Excel, care nici măcar nu era cauza și nici nu se putea repara.
   */
  observatii: string[];
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
  /**
   * Cere-le sa descarce iar imaginile, chiar daca adresa n-a schimbat.
   *
   * ⚠ NUMAI de la apasarea explicita a comerciantului pe un singur produs. Vezi nota de
   * la `force_images_download`: au o limita stransa, si se atinge repede.
   */
  fortaImaginile = false,
): RezultatCartografiere {
  const probleme: string[] = [];
  /* ⚠ Separate de `probleme`: vezi `RezultatCartografiere`. */
  const observatii: string[] = [];
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
    /* ⚠ `warranty` are `maximum=255` (luni) in schema lor. */
    warranty: plafonat(magazin.warranty, LIMITE_EMAG.garantie),
    vat_id: magazin.vat_id,
    /*
     * ⚠ SE TRIMITE MEREU, chiar si `0`. Implicitul lor e `1`: netrimis, fiecare produs
     * publicat din Edinio ar intra in Genius, cu obligatiile de livrare de acolo. Vezi
     * `emag_club` din `types.ts` pentru ce s-a masurat pe un cont adevarat.
     */
    emag_club: magazin.emag_club,
    /* ⚠ Plafonat la 255, ca `supply_lead_time` de mai jos si din acelasi motiv:
       incarcatura se inchide cu `as EmagProdusOferta`, deci compilatorul NU verifica
       valoarea, iar o cifra scrisa in config din alta parte ar fi plecat asa cum e. */
    ...(magazin.handling_time != null
      ? { handling_time: [{
          warehouse_id: magazin.warehouse_id,
          value: plafonat(magazin.handling_time, LIMITE_EMAG.zilePregatire),
        }] }
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
    /*
     * ═══ ⚠ SE FORTEAZA NUMAI CAND CERE OMUL, SI IATA DE CE (24.08.2026) ═══
     *
     * PROBLEMA E ADEVARATA: implicitul lor e `0` = „images downloaded only if link
     * changed", iar adresele noastre sunt IMUABILE (uuid + timp in cale). Cele doua puse
     * cap la cap: daca descarcarea pica O DATA, nu se mai reincearca NICIODATA.
     *
     * ⚠ DAR PRIMA REPARATIE A FOST GRESITA, si s-a vazut in cinci minute. Am pus
     * `force_images_download: 1` la FIECARE trimitere, cu argumentul ca „ruta grea se
     * foloseste rar". La prima cerere care a plecat asa, eMAG a raspuns:
     *
     *     „WARNING: You've exceeded the requests limit with 'force_download'.
     *      Please contact eMAG Marketplace Support team."
     *
     * O CERERE. Deci au o limita stransa pe descarcarile fortate, pe care documentatia
     * n-o pomeneste nicaieri — inca un lucru care nu e in schema lor.
     *
     * ⚠ Asa ca pleaca numai cand comerciantul apasa el „Trimite acum" pe UN produs.
     * Atunci se uita la o poza care lipseste si cere anume s-o luam din nou, iar
     * numarul de cereri e marginit de cate ori apasa un om. Coada nu forteaza niciodata.
     */
    ...(fortaImaginile ? { force_images_download: 1 as const } : {}),
    safety_information: magazin.gpsr?.safety_information,
    /*
     * ⚠ GPSR ARE LIMITELE LUI, SI ELE NU ERAU PAZITE NICAIERI.
     *
     * Schema lor: `name` 200, `address` 500, `email` 100, si „Maximum 10 sets" la
     * amandoua listele. Datele astea le scrie comerciantul o data, in setari, si de
     * acolo pleaca la FIECARE produs — deci o adresa prea lunga n-ar fi oprit un
     * produs, ci toate. Iar mesajul lor ar fi vorbit despre GPSR, nu despre setarea
     * din care vine.
     */
    manufacturer: gpsrPentruEmag(magazin.gpsr?.manufacturer),
    eu_representative: gpsrPentruEmag(magazin.gpsr?.eu_representative),
    /*
     * ⚠ TAXA VERDE INCLUDE TVA, spre deosebire de toate celelalte preturi. Documentatia
     * lor: „This value includes VAT." Trecuta prin `pretFaraTva` din obisnuinta, ar fi
     * plecat cu o cincime mai mica — si nimeni n-ar fi observat, fiindca e o suma mica
     * pe o linie separata. Deci se trimite EXACT cum a scris-o comerciantul.
     */
    ...(Number(magazin.green_tax) > 0 ? { green_tax: Number(magazin.green_tax) } : {}),
  };

  /*
   * ═══ ⚠ UN COD DE BARE STRICAT SE SPUNE, NU SE INGHITE (24.08.2026) ═══
   *
   * `codDeBareCurat` refuza pe drept codurile stalcite de Excel — `5.94903E+12`, sau un
   * EAN-13 cu zerouri lipite la coada. Curatate de non-cifre, ele ar da un cod scurt si
   * valid la prima vedere, iar `find_by_eans` ar putea lega oferta de produsul ALTCUIVA.
   *
   * Dar refuzul era TACUT: oferta pleca fara EAN, eMAG o facea ciorna („you need: EAN"),
   * si comerciantul afla din panoul lor. Masurat pe un catalog: 39 de produse asa, dintre
   * care 33 cu codul pierdut definitiv in notatie stiintifica.
   *
   * ⚠ E o OBSERVATIE, nu o oprire: produsul pleaca mai departe. In categoriile unde EAN-ul
   * nu e obligatoriu, oferta e perfect buna fara el, iar oprita, marfa n-ar mai ajunge
   * deloc la vanzare pentru o cifra scrisa gresit intr-un fisier.
   */
  const gtinScris = (gtinProdus(produs) ?? "").trim();
  if (gtinScris && !codDeBareCurat(gtinScris)) {
    /*
     * ═══ ⚠ SE PUNE LA `observatii`, NU LA `probleme` (îndreptat 24.08.2026) ═══
     *
     * Nota asta era împinsă în `probleme`, deși comentariul de deasupra spune limpede că
     * e o observație și nu o oprire. Iar `trimite.ts`, când nu se poate construi nicio
     * ofertă, raportează `probleme[0]` — PRIMA din listă.
     *
     * ⚠ Nota asta se împinge devreme, deci ea era prima. Măsurat în producție: patru
     * elemente de coadă își ardeau încercările raportând „Codul de bare 5.94903E+12 nu e
     * valid", când motivul adevărat pentru care nu ieșea nicio ofertă era cu totul altul,
     * mai jos în listă. Comerciantul repara codul de bare și nu se schimba nimic.
     *
     * ⚠ Și codul acela nu se poate repara: `5.94903E+12` păstrează 6 cifre din 13. Excel
     * l-a rescris la salvarea fișierului. Deci omul era trimis la o reparație imposibilă
     * pentru o problemă care nici măcar nu-l bloca.
     */
    observatii.push(
      `Codul de bare „${gtinScris}” nu e valid, așa că oferta pleacă fără el. ` +
      "Arată ca un cod stricat de Excel la salvarea fișierului: formatează coloana ca " +
      "Text înainte de salvare, apoi reintrodu-l în fișa produsului.",
    );
  }

  /* ── Produs simplu ────────────────────────────────────────────────────── */
  if (combinatii.length === 0) {
    const ident = dupaTitlu.get("");
    if (!ident) {
      probleme.push(`Produsul „${produs.name}" nu are încă un id eMAG alocat.`);
      return { oferte: [], probleme, observatii };
    }
    const oferta = ofertaSingura({
      produs, magazin, comun, ident,
      /* ⚠ Aceeasi functie pe care o foloseste si VERIFICAREA din catalogul lor. Doua
         socoteli separate s-au departat o data deja; vezi `eanDeTrimis`. */
      ean: eanDeTrimis(produs, null, ident.ean),
      pretAfisat: produs.price,
      compareAt: produs.compare_at_price,
      stoc: produs.stock_quantity ?? 0,
      partNumber: normalizeazaPartNumber(produs.sku) || normalizeazaPartNumber(produs.id),
      numeLaEi: ident?.nume_emag ?? null,
      imagini: imaginiEmag(produs.images),
      imaginiBrute: produs.images,
      titlu: produs.name,
      familie: undefined,
      probleme,
    });
    return { oferte: oferta ? [oferta] : [], probleme, observatii };
  }

  /* ── Produs cu combinatii ─────────────────────────────────────────────── */
  if (familyId == null) {
    probleme.push(`Produsul „${produs.name}" are variante, dar nu are încă o familie eMAG alocată.`);
    return { oferte: [], probleme, observatii };
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
    return { oferte: [], probleme, observatii };
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
      ean: eanDeTrimis(produs, c.title, ident.ean),
      pretAfisat: comboUnitPrice(c, produs.price),
      compareAt: produs.compare_at_price,
      /* ⚠ Stocul COMBINATIEI, nu al produsului. `comboStock` intoarce `null` cand
         nu e declarat, si atunci ramane valabil stocul produsului intreg — vezi
         nota din `variants.ts`. */
      stoc: comboStock(c) ?? produs.stock_quantity ?? 0,
      partNumber: partNumberCombinatie(produs.sku, c.sku, c.title),
      numeLaEi: ident?.nume_emag ?? null,
      imagini: imaginiEmag(produs.images, c.image),
      imaginiBrute: produs.images,
      imagineCombinatie: c.image,
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

  return { oferte, probleme, observatii };
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
  /**
   * Numele pe care il are oferta LA EI, asa cum l-a citit reconcilierea.
   *
   * ⚠ `null` inseamna „nu stim inca" — nu „n-are nume". Deosebirea conteaza: pe „nu
   * stim" NU se poate hotari nimic, deci se trimite ca pana acum.
   */
  numeLaEi?: string | null;
  imagini: EmagImagine[];
  /** ⚠ Pentru MESAJ, nu pentru trimitere: din ele se afla DE CE n-a ramas niciuna. */
  imaginiBrute: unknown;
  imagineCombinatie?: string | null;
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

  /*
   * ⚠ SE REFUZA, NU SE TAIE. `part_number` are `maxLength=25` la ei, iar un SKU taiat
   * nu e un SKU mai scurt — e ALT SKU. Trimis, ar lega oferta de alt produs din
   * catalogul lor sau ar face un duplicat, fara nicio eroare. Oprit aici, comerciantul
   * primeste un mesaj in romana si isi poate scurta codul cu cap.
   */
  if (partNumberPreaLung(a.partNumber)) {
    probleme.push(
      `Codul de produs „${a.partNumber}" are ${a.partNumber.length} caractere, iar eMAG ` +
      `acceptă cel mult ${LIMITE_EMAG.partNumber}. Scurtează-l în fișa produsului.`,
    );
    return null;
  }

  if (a.imagini.length === 0) {
    /* ⚠ Motivul ADEVARAT, nu unul generic. Vezi `motivulImaginilor`: patru produse au
       stat blocate cu „nu are nicio imagine https", desi aveau imagini, si https. */
    probleme.push(`„${a.titlu}" ${motivulImaginilor(a.imaginiBrute, a.imagineCombinatie)}`);
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

  /* ⚠ `stock[].value` are `maximum=65535` in schema lor. Un depozit cu mai mult —
     consumabile, hrana la sac — ar fi trimis un numar in afara intervalului, iar eMAG
     refuza OFERTA INTREAGA, cu un mesaj despre stoc. Plafonat, se vinde mai departe:
     „65535 bucati" e destul de adevarat. */
  const stoc: EmagStoc[] = [{
    warehouse_id: magazin.warehouse_id,
    value: plafonat(a.stoc, LIMITE_EMAG.stoc),
  }];

  return {
    ...(a.comun as object),
    id: ident.emag_id,
    name: taiat(a.titlu, LIMITE_EMAG.nume),
    /*
     * ═══ ⚠ NUMELE SI CODUL NU SE SCHIMBA IN ACEEASI CERERE (25.08.2026) ═══
     *
     * Regula lor, citita din raspunsurile reale: „You are trying to change both
     * part_number and name at the same time for id 285089. Existing part_number is
     * [AVX-K6253-285089] and existing name is [Lesa Retractabila…]".
     *
     * ⚠ SI RASPUND 200. Verdictul iese `reusit_cu_observatii`, elementul PARASESTE coada
     * si totul pare dus — dar schimbarea nu s-a aplicat, iar oferta ramane la ei cu numele
     * si codul vechi. Masurat pe 48 de ore: cinci oferte. Putine, dar mecanismul loveste
     * orice produs caruia i se schimba amandoua.
     *
     * ⚠ SE RENUNTA LA COD, NU LA NUME. Numele il vede cumparatorul in lista lor; codul e
     * al nostru, de regasire. Cand se poate trimite doar unul, pleaca cel care conteaza
     * pentru omul care cumpara.
     *
     * ⚠ Iar codul NU se pierde: la trecerea urmatoare numele va fi deja al lor, deci
     * `numeLaEi === titlu`, conditia de mai jos cade, si codul pleaca singur. Doua treceri
     * in loc de una, fara ca nimeni sa apese nimic.
     *
     * ⚠ Pe „nu stim ce nume au" (`numeLaEi` gol) se trimite ca pana acum: o oferta noua
     * n-are ce sa intre in conflict, iar o presupunere ar opri codul degeaba.
     */
    ...(schimbaSiNumele(a) ? {} : { part_number: a.partNumber }),
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

  /*
   * ⚠ PESTE INTERVALUL LOR NU SE PLAFONEAZA, SE RENUNTA (audit 24.08.2026).
   *
   * Schema lor: toate patru au `maximum=999999`. Aici nu se face ca la stoc, si
   * dinadins: „65535 bucati" e destul de adevarat cat sa se vanda, dar o cutie taiata
   * la 999999 mm e o MASURATOARE INVENTATA. Trimisa, curierul calculeaza transportul
   * pe ea, iar diferenta o refactureaza peste saptamani.
   *
   * O greutate de un milion de grame nu e o cutie mare, e o cifra gresita in fisa
   * produsului. Netrimisa, curierul masoara la ridicare — ceea ce oricum face.
   */
  const peste = LIMITE_EMAG.masuraMm;
  if (l > peste || w > peste || h > peste || g > LIMITE_EMAG.masuraGrame) return null;

  return { id: emagId, length: l, width: w, height: h, weight: g };
}

/* ═══════════════════════════════════════════════════════════════════════════
   RUTELE USOARE: PRET SI STOC, FARA NICIO DOCUMENTATIE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce se stie despre o oferta deja publicata, cat trebuie ca sa i se schimbe pretul.
 */
/**
 * Se schimba NUMELE fata de ce au ei acum?
 *
 * ⚠ PUR SI EXPORTAT, ca sa poata fi probat fara retea. E o hotarare mica dar cu doua
 * feluri de a gresi: prea larga, si codul nu mai pleaca niciodata; prea ingusta, si
 * schimbarea de nume se pierde tacut, cu 200 de la ei.
 *
 * ⚠ Se compara pe textul TAIAT la limita lor, fiindca aia e valoarea care chiar pleaca.
 * Comparat cu numele intreg, un produs cu titlu lung ar fi parut mereu „schimbat" si
 * codul lui n-ar mai fi plecat niciodata.
 */
export function schimbaSiNumele(a: { titlu: string; numeLaEi?: string | null }): boolean {
  const laEi = (a.numeLaEi ?? "").trim();
  /* ⚠ Nu stim ce au: nu se hotaraste nimic, se trimite ca pana acum. */
  if (!laEi) return false;
  return taiat(a.titlu, LIMITE_EMAG.nume).trim() !== laEi;
}

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
      /* ⚠ Acelasi plafon ca pe ruta grea. O singura cale plafonata ar fi insemnat ca
         acelasi produs trece la publicare si pica la urmatoarea miscare de stoc. */
      stock: [{
        warehouse_id: magazin.warehouse_id,
        value: plafonat(stocCuRezerva(stoc, magazin.stoc_rezervat), LIMITE_EMAG.stoc),
      }],
      status: stare,
    };
  });
}

/**
 * Cate bucati are fiecare oferta, pentru `POST /offer/save` cu `{id, stock}`.
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
    return { emagId: ident.emag_id, cantitate: plafonat(stocCuRezerva(stoc, stocRezervat), LIMITE_EMAG.stoc) };
  });
}
