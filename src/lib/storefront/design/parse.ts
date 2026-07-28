import { buildClassicDesign, newSectionId, resolveStyle, section } from "./defaults";
import { firstVariant, sectionMeta, variantMeta, type Field } from "./registry";
import {
  BUTTON_RADIUS_KEYS,
  BUTTON_STYLE_KEYS,
  CARD_RATIO_KEYS,
  CARD_STYLE_KEYS,
  CONTAINER_KEYS,
  DENSITY_KEYS,
  DESIGN_VERSION,
  FONT_KEYS,
  FONT_SCALE_KEYS,
  RADIUS_KEYS,
  STYLE_COLOR_KEYS,
  type DesignContext,
  type ResolvedStyle,
  type SectionInstance,
  type SectionKind,
  type StoreDesign,
  type StoreStyle,
  type StyleColorKey,
} from "./types";

/**
 * Parser total pentru configuratia de design.
 *
 * „Total" = pentru ORICE intrare returneaza un `StoreDesign` valid. Jsonb-ul din
 * baza e date de utilizator: poate fi gol, poate fi scris de o versiune veche a
 * aplicatiei, poate contine sectiuni sterse intre timp din catalog. Nimic din ce
 * intra aici nu are voie sa arunce sau sa produca un layout rupt.
 *
 * Aceeasi functie valideaza si la SCRIERE (server action). Un al doilea strat de
 * validare, cu alta schema, ar diverge inevitabil de cel de citire; asa, ce nu
 * trece de parser nu ajunge niciodata in baza. E si conventia casei —
 * `parseProductSections`, `parseStoreMode`, `parseStoreSeo` sunt scrise la fel.
 */

const MAX_HOME_SECTIONS = 40;
const MAX_REPEATER_ITEMS = 24;
const MAX_PRODUCT_IDS = 24;
const MAX_TEXT = 200;
const MAX_TEXTAREA = 2000;

/** Sectiuni care trebuie sa existe, chiar daca lipsesc din configuratia salvata. */
const REQUIRED_HOME: SectionKind[] = ["product_grid"];

// ---------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/**
 * Culorile ajung intr-un atribut `style` ca valori de variabile CSS. CSSOM refuza
 * oricum valorile invalide, dar acceptam explicit doar notatiile pe care le poate
 * produce editorul, ca sa nu depindem de asta.
 */
const COLOR_RE =
  /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\)|oklch\([\d\s.,%/]+\)|var\(--[a-z0-9-]+\)|transparent|currentColor)$/i;

function sanitizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return v && v.length <= 64 && COLOR_RE.test(v) ? v : undefined;
}

/** Linkuri stocate: acceptam doar ce e sigur de randat. Vezi si lib/pages/href.ts. */
function sanitizeHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v || v.length > 500) return undefined;
  if (v.startsWith("#") || v.startsWith("/")) return v;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return v;
  // Orice altceva cu schema (javascript:, data:, vbscript:) e respins.
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? undefined : v;
}

function sanitizeImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v || v.length > 1000) return undefined;
  return /^(https?:\/\/|\/)/i.test(v) ? v : undefined;
}

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.slice(0, max);
  return v.length ? v : undefined;
}

function clamp(value: unknown, min: number, max: number): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.max(n, min), max);
}

// ---------------------------------------------------------------------------
// Setari de sectiune
// ---------------------------------------------------------------------------

function sanitizeField(field: Field, value: unknown): unknown {
  switch (field.type) {
    case "text":
      return str(value, field.maxLength ?? MAX_TEXT);
    case "textarea":
      return str(value, field.maxLength ?? MAX_TEXTAREA);
    case "link":
      return sanitizeHref(value);
    case "toggle":
      return typeof value === "boolean" ? value : undefined;
    case "select":
      return oneOf(value, field.options.map((o) => o.value));
    case "color":
      return sanitizeColor(value);
    case "image":
      return sanitizeImage(value);
    case "range":
      return clamp(value, field.min, field.max);
    case "icon":
      return typeof value === "string" && /^[A-Za-z0-9]{1,40}$/.test(value) ? value : undefined;
    case "category":
      return str(value, MAX_TEXT);
    case "products":
      return Array.isArray(value)
        ? value.filter((x): x is string => typeof x === "string" && x.length <= 64).slice(0, MAX_PRODUCT_IDS)
        : undefined;
    case "actions": {
      if (!Array.isArray(value)) return undefined;
      const permise = new Map(field.options.map((o) => [o.value, o.value]));
      const vazute = new Set<string>();
      const out: { key: string; on: boolean }[] = [];
      for (const item of value) {
        const key = permise.get(obj(item).key as string);
        if (!key || vazute.has(key)) continue;
        vazute.add(key);
        out.push({ key, on: obj(item).on !== false });
      }
      // Actiunile lipsa se adauga aprinse la coada: lista salvata trebuie sa
      // ramana completa, altfel una noua n-ar mai putea fi pornita niciodata.
      for (const o of field.options) {
        if (!vazute.has(o.value)) out.push({ key: o.value, on: true });
      }
      return out;
    }
    case "repeater": {
      if (!Array.isArray(value)) return undefined;
      const items = value
        .slice(0, field.max ?? MAX_REPEATER_ITEMS)
        .map((item) => sanitizeSettings(field.fields, obj(item)));
      return items;
    }
    default:
      return undefined;
  }
}

function sanitizeSettings(fields: Field[], raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = sanitizeField(field, raw[field.key]);
    if (value !== undefined) out[field.key] = value;
  }
  return out;
}

/**
 * Cheile de „legatura" pe care sectiunile derivate le poarta cu ele si care nu
 * sunt expuse ca formular in editor (sursa unui rand de produse, referinta catre
 * randul salvat in page_content). Sunt validate explicit, nu prin `fields`.
 */
function sanitizeInternalSettings(kind: SectionKind, raw: Record<string, unknown>): Record<string, unknown> {
  if (kind !== "product_row") return {};
  const out: Record<string, unknown> = {};
  const mode = oneOf(raw.mode, ["featured", "custom", "selected", "category", "bundles"] as const);
  if (mode) out.mode = mode;
  const ref = str(raw.sectionRef, 64);
  if (ref) out.sectionRef = ref;
  return out;
}

// ---------------------------------------------------------------------------
// Sectiuni
// ---------------------------------------------------------------------------

function parseSection(raw: unknown, seenIds: Set<string>): SectionInstance | null {
  const r = obj(raw);
  const kind = r.kind;
  if (typeof kind !== "string") return null;
  const meta = sectionMeta(kind as SectionKind);
  if (!meta) return null; // sectiune scoasa din catalog -> ignorata

  const k = kind as SectionKind;
  const variant = typeof r.variant === "string" && meta.variants[r.variant] ? r.variant : firstVariant(k);
  if (!variant) return null;

  let id = typeof r.id === "string" && r.id.trim() ? r.id.trim().slice(0, 64) : newSectionId();
  while (seenIds.has(id)) id = newSectionId();
  seenIds.add(id);

  /*
   * Reglajele se curata fata de campurile TUTUROR variantelor sectiunii, nu
   * doar ale celei curente.
   *
   * Altfel, plimbarea prin galerie stergea definitiv ce nu apartinea variantei
   * de moment: comerciantul scria un text la un header, incerca alt design, se
   * intorcea, si textul nu mai era. Filtrarea per-varianta ramane la randare,
   * unde fiecare componenta isi citeste doar ce intelege.
   */
  const toateCampurile = Object.values(sectionMeta(k)?.variants ?? {}).flatMap((v) => v.fields);
  const settings = {
    ...sanitizeInternalSettings(k, obj(r.settings)),
    ...sanitizeSettings(toateCampurile, obj(r.settings)),
  };

  return { id, kind: k, variant, enabled: r.enabled !== false, settings };
}

function parseSectionList(raw: unknown, seenIds: Set<string>, max: number): SectionInstance[] {
  if (!Array.isArray(raw)) return [];
  const out: SectionInstance[] = [];
  const singletons = new Set<SectionKind>();
  for (const item of raw) {
    if (out.length >= max) break;
    const parsed = parseSection(item, seenIds);
    if (!parsed) continue;
    if (sectionMeta(parsed.kind)?.singleton) {
      if (singletons.has(parsed.kind)) continue; // a doua instanta a unui singleton
      singletons.add(parsed.kind);
    }
    out.push(parsed);
  }
  return out;
}

/** O sectiune obligatorie, luata din configuratia salvata sau din designul classic. */
function pickOne(raw: unknown, fallback: SectionInstance, seenIds: Set<string>): SectionInstance {
  const parsed = parseSection(raw, seenIds);
  if (parsed && parsed.kind === fallback.kind) {
    // Header-ul si footerul nu se pot stinge. Editorul nu mai ofera butonul, dar
    // o configuratie salvata inainte de asta, sau scrisa direct in jsonb, ar
    // ramane fara footer — adica fara datele firmei, fara retragerea din contract
    // (OUG 18/2026), fara cele sase politici si fara ANPC, pe toate paginile.
    const meta = sectionMeta(parsed.kind);
    return meta?.scope === "chrome" && meta.removable === false ? { ...parsed, enabled: true } : parsed;
  }
  seenIds.add(fallback.id);
  return fallback;
}

// ---------------------------------------------------------------------------
// Stil
// ---------------------------------------------------------------------------

export function parseStoreStyle(raw: unknown): StoreStyle {
  const r = obj(raw);
  const style: StoreStyle = {};

  const colorsRaw = obj(r.colors);
  const colors: Partial<Record<StyleColorKey, string>> = {};
  for (const key of STYLE_COLOR_KEYS) {
    const value = sanitizeColor(colorsRaw[key]);
    if (value) colors[key] = value;
  }
  if (Object.keys(colors).length) style.colors = colors;

  const assign = <K extends keyof StoreStyle>(key: K, value: StoreStyle[K]) => {
    if (value !== undefined) style[key] = value;
  };

  assign("fontHeading", oneOf(r.fontHeading, FONT_KEYS));
  assign("fontBody", oneOf(r.fontBody, FONT_KEYS));
  assign("fontScale", oneOf(r.fontScale, FONT_SCALE_KEYS));
  assign("radius", oneOf(r.radius, RADIUS_KEYS));
  assign("container", oneOf(r.container, CONTAINER_KEYS));
  assign("buttonStyle", oneOf(r.buttonStyle, BUTTON_STYLE_KEYS));
  assign("buttonRadius", oneOf(r.buttonRadius, BUTTON_RADIUS_KEYS));
  assign("cardStyle", oneOf(r.cardStyle, CARD_STYLE_KEYS));
  assign("cardRatio", oneOf(r.cardRatio, CARD_RATIO_KEYS));
  assign("density", oneOf(r.density, DENSITY_KEYS));

  return style;
}

// ---------------------------------------------------------------------------
// Design complet
// ---------------------------------------------------------------------------

/** `true` cand magazinul nu si-a materializat inca designul (randeaza „classic"). */
export function isEmptyDesign(raw: unknown): boolean {
  const r = obj(raw);
  return r.version !== DESIGN_VERSION;
}

export function parseStoreDesign(raw: unknown, ctx: DesignContext): StoreDesign {
  const classic = buildClassicDesign(ctx);
  if (isEmptyDesign(raw)) return classic;

  const r = obj(raw);
  const seenIds = new Set<string>();
  const chromeRaw = obj(r.chrome);
  const productRaw = obj(r.product);
  const commerceRaw = obj(r.commerce);

  const home = parseSectionList(r.home, seenIds, MAX_HOME_SECTIONS);

  /*
   * Randurile de produse traiesc in continuare in `page_content`, unde le pune
   * editorul vechi. Odata ce magazinul are un design salvat, lista de sectiuni
   * vine INTREAGA de acolo, deci un rand adaugat dupa aceea nu mai aparea
   * niciodata: comerciantul il vedea in editorul lui si nu si-l gasea in
   * magazin, fara niciun mesaj.
   *
   * Randurile custom isi pastreaza id-ul din `page_content`, deci potrivirea se
   * face pe el. Cele noi intra inaintea catalogului, unde le pune si designul
   * clasic. Ordinea aleasa de comerciant in editorul de design ramane neatinsa
   * pentru randurile pe care le are deja.
   */
  const randuriNoi = classic.home.filter(
    (s) => s.kind === "product_row" && !seenIds.has(s.id),
  );
  if (randuriNoi.length > 0) {
    const laCatalog = home.findIndex((s) => s.kind === "product_grid");
    const pozitie = laCatalog >= 0 ? laCatalog : home.length;
    for (const s of randuriNoi) seenIds.add(s.id);
    home.splice(pozitie, 0, ...randuriNoi);
    // Plafonul ramane plafon: readucerea randurilor nu are voie sa il sara.
    if (home.length > MAX_HOME_SECTIONS) home.length = MAX_HOME_SECTIONS;
  }

  // Sectiunile fara care magazinul n-ar mai fi un magazin se readauga la final
  // daca lipsesc — o configuratie stricata nu are voie sa ascunda catalogul.
  for (const kind of REQUIRED_HOME) {
    if (home.some((s) => s.kind === kind)) continue;
    const fromClassic = classic.home.find((s) => s.kind === kind);
    if (fromClassic && !seenIds.has(fromClassic.id)) {
      seenIds.add(fromClassic.id);
      home.push(fromClassic);
    }
  }

  /*
   * Sectiunile DERIVATE isi iau starea pornit/oprit din editorul magazinului, nu
   * din designul salvat.
   *
   * Continutul lor traieste in `page_content` si acolo are si comutatorul:
   * beneficiile, recenziile, galeria, banda de incredere, randurile de produse.
   * Odata ce designul e salvat, starea venea din jsonb si comutatoarele vechi
   * mergeau intr-o singura directie — stingeau, dar nu mai porneau nimic, si
   * comerciantul apasa fara niciun efect. Sectiunile ADAUGATE din editorul de
   * design nu au corespondent in continut, deci raman cu starea lor.
   */
  for (const s of home) {
    const derivata = classic.home.find((c) => c.id === s.id && c.kind === s.kind);
    if (derivata) s.enabled = derivata.enabled;
  }

  const announcementRaw = chromeRaw.announcement;
  const announcement =
    announcementRaw === null || announcementRaw === undefined
      ? null
      : parseSection(announcementRaw, seenIds);

  return {
    version: DESIGN_VERSION,
    style: parseStoreStyle(r.style),
    chrome: {
      announcement: announcement && announcement.kind === "announcement" ? announcement : null,
      header: pickOne(chromeRaw.header, classic.chrome.header, seenIds),
      footer: pickOne(chromeRaw.footer, classic.chrome.footer, seenIds),
    },
    home,
    product: {
      page: pickOne(productRaw.page, classic.product.page, seenIds),
    },
    commerce: {
      productCard: pickOne(commerceRaw.productCard, classic.commerce.productCard, seenIds),
      cartDrawer: pickOne(commerceRaw.cartDrawer, classic.commerce.cartDrawer, seenIds),
      checkout: pickOne(commerceRaw.checkout, classic.commerce.checkout, seenIds),
    },
  };
}

/** Designul rezolvat pentru randare: sectiuni curate + stil cu implicitele aplicate. */
export interface ResolvedDesign {
  design: StoreDesign;
  style: ResolvedStyle;
}

export function resolveDesign(raw: unknown, ctx: DesignContext): ResolvedDesign {
  const design = parseStoreDesign(raw, ctx);
  return { design, style: resolveStyle(design.style, ctx) };
}

// Reexport pentru consumatorii care construiesc sectiuni noi din editor.
export { section, newSectionId };

/** Expus doar pentru teste: sanitizarile individuale nu au alt consumator public. */
export const parseInternals = { sanitizeHrefForTest: sanitizeHref, sanitizeColorForTest: sanitizeColor };
