/**
 * Un produs Edinio, dus la articolele care pleaca in feedul Pepita, si la
 * motivele pentru care unele nu pleaca.
 *
 * ═══ ⚠ O SINGURA HOTARARE, CITITA DIN DOUA LOCURI ═══
 *
 * Feedul o APLICA (scrie articolele intoarse de aici) si panoul o CITESTE (arata
 * problemele intoarse de aici). Doua liste de reguli, una in generator si una
 * scrisa pentru ecran, s-ar departa la prima schimbare, si atunci panoul ar
 * spune „143 eligibile” despre un feed care duce 138. Aceeasi lectie ca la
 * catalogul Meta (`facebook/catalog-feed.ts`).
 *
 * ⚠ Modulul e PUR: nicio citire din baza, niciun `server-only`. Tot ce ii trebuie
 * primeste. Asa poate fi probat, si asa poate raspunde si panoului.
 */

import { adresaPublicaImagine } from "@/lib/trendyol/mapping";
import { isValidGtin, normalizeGtin } from "@/lib/gtin";
import { pretulDinCatalogMinte } from "@/lib/customization/pretul-din-catalog-minte";
import {
  combinatiiActiveUnice, comboCompareAtPrice, comboStock, comboUnitPrice, parseVariants,
  VARIANT_TITLE_SEP, type VariantCombo,
} from "@/lib/storefront/variants";
import type { CategoriePepita } from "./categorii";
import { idArticol } from "./identitate";
import { preturilePentruFeed, type RegimTvaMagazin } from "./pret";
import { disponibilitate } from "./stoc";
import { PIETE, type PepitaConfig, type TipGarantie } from "./types";

/* ═══════════════════════════════════════════════════════════════════════════
   FORMELE
   ═══════════════════════════════════════════════════════════════════════════ */

export type { CategoriePepita };
export interface PozaPepita { url: string; principala: boolean; titlu?: string }
export interface AtributPepita { nume: string; valoare: string }

export interface ArticolPepita {
  id: string;
  /**
   * Titlul combinatiei din care s-a nascut articolul, sau sirul gol la produsul simplu.
   *
   * ⚠ NU pleaca in feed. E jumatatea de care are nevoie evidenta din `pepita_articole`, ca
   * drumul inapoi de la o comanda sa fie o cautare exacta, nu o recalculare a amprentelor
   * din titlurile de ACUM. Vezi `tineMinteArticolele`.
   */
  combinatie: string;
  nume: string;
  descriere: string;
  brand?: string;
  producator?: string;
  /** `<StructuredId>`: EAN/UPC/ISBN, numai daca trece verificarea cifrei de control. */
  gtin?: string;
  /** `<ProductNumber>`: codul de la producator (MPN). */
  mpn?: string;
  /** `<Currency>`: codul ISO 4217 al pietei. */
  moneda: string;
  pret: number;
  pretRedus: number | null;
  tva: number;
  transportBucata: number | null;
  categorii: CategoriePepita[];
  poze: PozaPepita[];
  url?: string;
  disponibil: boolean;
  cantitate: number | null;
  termenZile: number | null;
  atribute: AtributPepita[];
  dimensiuni?: { latime?: number; inaltime?: number; lungime?: number; greutate?: number };
  garantie?: { tip: TipGarantie; durata: number };
  /** `<LastMod>`, secunde Unix. */
  ultimaModificare?: number;
}

export type NivelProblema = "eroare" | "avertisment" | "info";

export interface ProblemaPepita {
  nivel: NivelProblema;
  cod: string;
  /** Text pentru comerciant, cu diacritice. */
  mesaj: string;
  /** Titlul combinatiei, cand problema priveste o singura varianta. */
  combinatie?: string;
}

export interface RezultatArticole {
  articole: ArticolPepita[];
  probleme: ProblemaPepita[];
}

/** Randul de produs, cu tot ce citeste hotararea de aici. */
export interface ProdusPepita {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  price: number | string | null;
  compare_at_price: number | string | null;
  sku: string | null;
  images: unknown;
  category: string | null;
  track_inventory: boolean;
  stock_quantity: number | null;
  weight_grams: number | null;
  page_sections?: unknown;
  is_bundle?: boolean;
  updated_at?: string | null;
  /** Verdictul componentelor, pentru pachete. Il calculeaza apelantul. */
  pachetDisponibil?: boolean;
}

export interface ContextArticole {
  business: { slug: string; custom_domain: string | null; store_name: string | null; business_name: string };
  config: PepitaConfig;
  magazin: RegimTvaMagazin;
  /** Calea categoriei, de la parinte la copil. O da apelantul, care are arborele. */
  caleCategorie: (nume: string | null) => CategoriePepita[];
  /** Adresa publica a magazinului. */
  baza: string;
  /** Stocul de siguranta al produsului asta, daca are unul propriu. */
  safetyStock?: number;
}

/* ═══════════════════════════════════════════════════════════════════════════
   AJUTOARE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Descrierea, adusa la text simplu.
 *
 * ⚠ SE SCOATE MARCAJUL, dinadins. Documentatia lor spune ca imaginile si
 * clipurile puse in descriere „nem kerülnek átvételre”, nu se preiau, deci un
 * `<img>` lasat inauntru ar ajunge fie text vizibil, fie nimic. Pozele au campul
 * lor (`<Photos>`), clipurile la fel (`<VideoLinks>`).
 *
 * ⚠ SI E SI O POARTA DE SIGURANTA: descrierea vine dintr-un editor bogat, deci
 * poate contine `<script>` pus de oricine are acces la panou. Textul simplu il
 * face inofensiv inainte sa plece catre un site strain.
 */
export function textSimplu(html: string | null | undefined, rezerva: string): string {
  const text = (html ?? "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#3[49];/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || rezerva;
}

/** Adresele de poza folosibile: absolute, https, pe domeniul public. */
export function pozeFolosibile(images: unknown): string[] {
  const brute = Array.isArray(images) ? images : [];
  const vazute = new Set<string>();
  const out: string[] = [];
  for (const x of brute) {
    const u = adresaPublicaImagine(String(x ?? "").trim());
    /*
     * ⚠ NUMAI `https://`. Pepita isi aduce singura pozele de pe adresele pe care
     * i le dam. O adresa `data:`, `blob:`, `http://localhost` sau una relativa nu
     * se poate deschide de la ei, iar produsul e respins fara ca noi sa aflam.
     */
    if (!/^https:\/\//i.test(u) || vazute.has(u)) continue;
    vazute.add(u);
    out.push(u);
  }
  return out;
}

interface AtributeGoogle { brand?: string; gtin?: string; mpn?: string }
interface Dimensiuni { length?: unknown; width?: unknown; height?: unknown }

function numarPozitiv(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Dimensiunile si greutatea, in unitatile CERUTE DE EI.
 *
 * ⚠ CENTIMETRI SI KILOGRAME. Edinio tine greutatea in GRAME (`weight_grams`), iar
 * documentatia Pepita cere `<Weight>` in kg („A termék súlya kg mértékegységben”).
 * Trimisa neconvertita, o husa de 300 g ar pleca la ei ca 300 kg, iar costul de
 * transport calculat de marketplace ar fi de sute de ori mai mare.
 */
export function dimensiuniPepita(p: ProdusPepita): ArticolPepita["dimensiuni"] | undefined {
  const d = ((p.page_sections as { dimensions?: Dimensiuni } | null)?.dimensions) ?? {};
  const greutate = p.weight_grams != null && Number(p.weight_grams) > 0
    ? Number(p.weight_grams) / 1000
    : undefined;
  const rezultat = {
    lungime: numarPozitiv(d.length),
    latime: numarPozitiv(d.width),
    inaltime: numarPozitiv(d.height),
    greutate,
  };
  return Object.values(rezultat).some((v) => v !== undefined) ? rezultat : undefined;
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOTARAREA
   ═══════════════════════════════════════════════════════════════════════════ */

function eroare(cod: string, mesaj: string, combinatie?: string): ProblemaPepita {
  return { nivel: "eroare", cod, mesaj, combinatie };
}
function avertisment(cod: string, mesaj: string, combinatie?: string): ProblemaPepita {
  return { nivel: "avertisment", cod, mesaj, combinatie };
}

/**
 * Articolele produsului si problemele lui.
 *
 * ⚠ O EROARE OPRESTE PRODUSUL, un avertisment nu. Regula e ingusta dinadins:
 * blocam numai ce am verificat ca Pepita refuza (pret zero, campuri obligatorii
 * lipsa) sau ce ar duce la o vanzare pe care comerciantul n-o poate onora.
 * Lipsa EAN-ului, de pilda, ramane avertisment: documentatia il numeste
 * „Ajanlott”, recomandat, nu obligatoriu, si blocandu-l am scoate de la vanzare
 * cataloage intregi pe o presupunere.
 */
export function articolelePentruProdus(p: ProdusPepita, ctx: ContextArticole): RezultatArticole {
  const probleme: ProblemaPepita[] = [];
  const nume = (p.name ?? "").trim();
  const descriere = textSimplu(p.description, "");
  const categorii = ctx.caleCategorie(p.category);
  const poze = pozeFolosibile(p.images);
  const pretDeBaza = Number(p.price) || 0;

  if (!nume) probleme.push(eroare("fara-nume", "Produsul nu are nume, iar Pepita cere numele la fiecare produs."));
  if (!descriere) {
    probleme.push(eroare("fara-descriere", "Produsul nu are descriere. Pepita cere o descriere la fiecare produs."));
  }
  if (categorii.length === 0) {
    probleme.push(eroare("fara-categorie", "Produsul nu are categorie, iar Pepita cere cel puțin una."));
  }
  if (poze.length === 0) {
    probleme.push(eroare(
      "fara-imagine",
      "Produsul nu are nicio imagine cu adresă publică https. Pepita își preia singură imaginile de la adresa dată.",
    ));
  }
  if (pretulDinCatalogMinte(p)) {
    probleme.push(eroare(
      "pret-care-minte",
      "Prețul din catalog nu este cel pe care îl plătește clientul: personalizarea schimbă suma finală. "
      + "Produsul nu pleacă spre Pepita până când prețul din catalog devine chiar prețul de pornire.",
    ));
  }

  const g = ((p.page_sections as { google?: AtributeGoogle } | null)?.google) ?? {};
  const brand = (g.brand ?? "").trim() || undefined;
  if (!brand) {
    probleme.push(avertisment("fara-brand", "Produsul nu are marcă. Pepita o folosește la căutare și la filtre."));
  }
  const dimensiuni = dimensiuniPepita(p);

  const variante = parseVariants(p.page_sections);
  const combinatii = combinatiiActiveUnice(variante);
  const siguranta = ctx.safetyStock ?? ctx.config.safety_stock ?? 0;
  const ultimaModificare = p.updated_at ? Math.floor(new Date(p.updated_at).getTime() / 1000) : undefined;
  const url = `${ctx.baza}/product/${p.slug ?? p.id}`;

  /** Ce e comun intre articolul simplu si fiecare combinatie aplatizata. */
  const comun = {
    moneda: (PIETE[ctx.config.piata] ?? PIETE.ro).moneda,
    descriere,
    brand,
    mpn: (g.mpn ?? "").trim() || undefined,
    categorii,
    url,
    transportBucata: ctx.config.shipping_price,
    termenZile: ctx.config.shipping_delay,
    garantie: ctx.config.garantie ? { tip: ctx.config.garantie.tip, durata: ctx.config.garantie.durata } : undefined,
    dimensiuni,
    ultimaModificare,
  };

  const gtinProdus = codBun(g.gtin, probleme);

  if (!variante || combinatii.length === 0) {
    const preturi = preturilePentruFeed(pretDeBaza, numarPozitiv(p.compare_at_price) ?? null, ctx.config.strategie_pret, ctx.magazin);
    if (preturi.pret <= 0) {
      probleme.push(eroare("pret-zero", "Prețul pentru Pepita este 0. Pepita nu acceptă produse cu preț zero."));
    }
    if (!gtinProdus) {
      probleme.push(avertisment(
        "fara-ean",
        "Produsul nu are cod EAN. Pepita îl recomandă insistent, iar în unele categorii îl cere.",
      ));
    }
    const disp = disponibilitate({
      tineEvidenta: !!p.track_inventory,
      stoc: p.stock_quantity,
      siguranta,
      disponibilImpus: p.is_bundle ? p.pachetDisponibil !== false : undefined,
    });
    if (probleme.some((x) => x.nivel === "eroare")) return { articole: [], probleme };
    return {
      articole: [{
        ...comun,
        id: idArticol(p.id, null),
        combinatie: "",
        nume,
        gtin: gtinProdus,
        pret: preturi.pret,
        pretRedus: preturi.pretRedus,
        tva: preturi.tva,
        poze: poze.map((u, i) => ({ url: u, principala: i === 0 })),
        disponibil: disp.disponibil,
        cantitate: disp.cantitate,
        atribute: [],
      }],
      probleme,
    };
  }

  /*
   * ⚠ APLATIZARE: fiecare combinatie devine un produs de sine statator.
   * Vezi `identitate.ts` pentru de ce, si pentru ce s-ar rupe altfel.
   */
  const articole: ArticolPepita[] = [];
  const amprente = new Map<string, string>();
  const eanuri = new Map<string, string>();
  const pretTaiatBaza = numarPozitiv(p.compare_at_price) ?? null;

  for (const combo of combinatii) {
    const titlu = combo.title;
    const id = idArticol(p.id, titlu);
    /*
     * ⚠ Doua combinatii cu acelasi `<Id>` ar insemna ca a doua o suprascrie pe
     * prima la ei, deci un pret sau un stoc care nu e al niciuneia. Amprenta e pe
     * 64 de biti, deci o coliziune e practic imposibila, dar „practic” nu e o
     * plasa: se verifica, si produsul se opreste.
     */
    const deja = amprente.get(id);
    if (deja !== undefined) {
      probleme.push(eroare(
        "combinatii-cu-acelasi-cod",
        `Variantele „${deja}” și „${titlu}” ajung la același identificator pentru Pepita. Redenumește una dintre ele.`,
        titlu,
      ));
      continue;
    }
    amprente.set(id, titlu);

    const pretUnitar = comboUnitPrice(combo, pretDeBaza);
    const pretTaiat = comboCompareAtPrice(combo, pretTaiatBaza);
    const preturi = preturilePentruFeed(pretUnitar, pretTaiat, ctx.config.strategie_pret, ctx.magazin);
    if (preturi.pret <= 0) {
      probleme.push(eroare("pret-zero", `Varianta „${titlu}” ajunge la prețul 0 pentru Pepita.`, titlu));
      continue;
    }

    const gtinCombo = codBun(combo.gtin, probleme, titlu) ?? gtinProdus;
    if (gtinCombo) {
      const alta = eanuri.get(gtinCombo);
      if (alta !== undefined && alta !== titlu) {
        /*
         * ⚠ Acelasi EAN pe doua variante nu e o eroare de-a noastra, dar e o
         * eroare la ei: codul identifica un articol anume, nu o familie. Se
         * trimit amandoua fara cod, in loc sa fie oprite: un articol fara EAN se
         * publica, unul cu EAN duplicat se respinge.
         */
        probleme.push(avertisment(
          "ean-duplicat",
          `Variantele „${alta}” și „${titlu}” au același cod EAN. Codul nu se trimite la Pepita pentru niciuna dintre ele.`,
          titlu,
        ));
        eanuri.set(gtinCombo, "__duplicat__");
      } else if (alta === undefined) {
        eanuri.set(gtinCombo, titlu);
      }
    }

    const disp = disponibilitate({
      tineEvidenta: !!p.track_inventory,
      /*
       * ⚠ STOCUL COMBINATIEI, nu al produsului. Trimis pe cel al produsului,
       * marimea S cu o bucata si marimea M cu doua ar aparea amandoua cu trei,
       * si s-ar vinde ce nu exista. Cand combinatia nu are stoc declarat, cade pe
       * al produsului, exact ca in magazin.
       */
      stoc: comboStock(combo) ?? p.stock_quantity,
      siguranta,
    });

    const pozaCombo = adresaPublicaImagine((combo.image ?? "").trim());
    const pozeCombo = /^https:\/\//i.test(pozaCombo)
      ? [pozaCombo, ...poze.filter((u) => u !== pozaCombo)]
      : poze;

    articole.push({
      ...comun,
      id,
      combinatie: titlu,
      nume: `${nume} (${titlu})`,
      gtin: gtinCombo,
      pret: preturi.pret,
      pretRedus: preturi.pretRedus,
      tva: preturi.tva,
      poze: pozeCombo.map((u, i) => ({ url: u, principala: i === 0 })),
      disponibil: disp.disponibil,
      cantitate: disp.cantitate,
      atribute: atributeleCombinatiei(variante.options, titlu),
    });
  }

  /*
   * ⚠ EANURILE DUPLICATE SE SCOT DUPA CE S-A STRANS TOATA LISTA. Verificate din
   * mers, prima varianta ar fi plecat cu cod si a doua fara, adica exact perechea
   * pe care Pepita o respinge.
   */
  for (const a of articole) {
    if (a.gtin && eanuri.get(a.gtin) === "__duplicat__") a.gtin = undefined;
  }

  if (articole.length === 0 && !probleme.some((x) => x.nivel === "eroare")) {
    probleme.push(eroare("fara-variante-valide", "Produsul are variante, dar niciuna nu poate fi trimisă la Pepita."));
  }
  if (probleme.some((x) => x.nivel === "eroare" && !x.combinatie)) return { articole: [], probleme };
  return { articole, probleme };
}

/**
 * Codul EAN, daca e chiar un cod.
 *
 * ⚠ SE VERIFICA CIFRA DE CONTROL, nu doar lungimea. Un cod inventat sau un SKU
 * pus din greseala in campul de EAN trece de „are 13 cifre” si e respins de ei.
 * ⚠ SI RAMANE SIR: `Number("0012345678905")` pierde zeroul din fata.
 */
function codBun(brut: unknown, probleme: ProblemaPepita[], combinatie?: string): string | undefined {
  const s = normalizeGtin(typeof brut === "string" ? brut : "");
  if (!s) return undefined;
  if (!isValidGtin(s)) {
    probleme.push(avertisment(
      "ean-nevalid",
      `Codul „${s}” nu este un EAN/UPC/ISBN valid, deci nu se trimite la Pepita.`,
      combinatie,
    ));
    return undefined;
  }
  return s;
}

/**
 * Valorile de pe axele combinatiei, ca atribute de produs.
 *
 * Aplatizata, combinatia „S / Rosu” nu mai are unde sa-si arate axele, iar la ei
 * ar ramane doar in nume. Puse ca `<Attributes>`, devin cautabile si filtrabile,
 * ceea ce documentatia lor chiar recomanda: „Érdemes minél több termékjellemzőt
 * átadni, ugyanis a termék ezek alapján válik kereshetővé".
 */
export function atributeleCombinatiei(optiuni: { name: string }[], titlu: string): AtributPepita[] {
  const bucati = titlu.split(VARIANT_TITLE_SEP);
  const out: AtributPepita[] = [];
  for (let i = 0; i < optiuni.length && i < bucati.length; i++) {
    const nume = (optiuni[i]?.name ?? "").trim();
    const valoare = (bucati[i] ?? "").trim();
    if (nume && valoare) out.push({ nume, valoare });
  }
  return out;
}

/** Combinatiile active ale produsului, pentru cine are nevoie doar de ele. */
export function combinatiile(p: ProdusPepita): VariantCombo[] {
  return combinatiiActiveUnice(parseVariants(p.page_sections));
}
