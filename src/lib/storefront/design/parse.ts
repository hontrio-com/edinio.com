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

/**
 * Variantele de hero pe care le alege un COMUTATOR, nu un om care alege un
 * design: „Afiseaza continutul peste banner" comuta exact intre ele.
 */
const VARIANTE_HERO_DERIVATE = ["banners", "overlay"];

/** Locul unei sectiuni in designul classic. Lipsa = la coada. */
function indexInClassic(classicHome: SectionInstance[], id: string): number {
  const i = classicHome.findIndex((c) => c.id === id);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

/**
 * Unde se aseaza o sectiune readusa din classic.
 *
 * Dupa VECINUL din stanga, nu la un indice absolut: intre timp designul salvat
 * poate avea alte sectiuni, mutate sau sterse, iar un indice luat din classic ar
 * fi asezat beneficiile in mijlocul catalogului. Cand niciun vecin dinaintea ei
 * nu mai exista, sectiunea deschide pagina — exact ce spune si classic.
 */
function pozitiaDupaVecin(
  home: SectionInstance[],
  classicHome: SectionInstance[],
  sectiune: SectionInstance,
): number {
  const inainte = classicHome.slice(0, classicHome.indexOf(sectiune));
  for (let i = inainte.length - 1; i >= 0; i--) {
    const undeva = home.findIndex((s) => s.id === inainte[i].id);
    if (undeva >= 0) return undeva + 1;
  }
  return 0;
}

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

  // Semnul din editorul de design, cand exista. Numai un boolean adevarat
  // conteaza: orice altceva inseamna „n-a atins nimeni ochiul".
  //
  // Cheia se adauga doar cand exista cu adevarat, nu ca `undefined`: sectiunile
  // se compara intre ele cu `deepEqual` si prin `JSON.stringify` — si acolo o
  // cheie in plus, chiar goala, inseamna „alt obiect". Verificarea de concurenta
  // a cioarnei se sprijina exact pe comparatia asta.
  const enabledOverride = typeof r.enabledOverride === "boolean" ? { enabledOverride: r.enabledOverride } : null;
  // La fel pentru varianta aleasa de om. Se pastreaza doar daca varianta aia
  // chiar exista azi: una scoasa din catalog n-are ce apara.
  const variantOverride = typeof r.variantOverride === "string" && meta.variants[r.variantOverride]
    ? { variantOverride: r.variantOverride }
    : null;

  return { id, kind: k, variant, enabled: r.enabled !== false, ...enabledOverride, ...variantOverride, settings };
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
  const shopRaw = obj(r.shop);
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

  /*
   * Orice sectiune APRINSA in editorul magazinului care lipseste din designul
   * salvat se readuce, la locul ei.
   *
   * ⚠ Fara asta, comutatoarele din „Editeaza magazinul" pentru „Beneficii
   * magazin", „Recenzii", „Galerie" sau „Banda de incredere" erau moarte: se
   * aprindeau, se salvau, aratau bifa verde, si nu se intampla nimic — la
   * nesfarsit. Lista de sectiuni venea INTREAGA din jsonb, iar din classic se
   * readuceau doar randurile de produse si `REQUIRED_HOME`, care are un singur
   * element. O sectiune lipsa dintr-un design salvat de o versiune mai veche a
   * aplicatiei nu se mai intorcea niciodata.
   *
   * Doar cele aprinse: una stinsa n-are ce cauta in lista, si nici nu se pierde
   * nimic — in clipa in care comerciantul o aprinde, `classic` o da aprinsa si
   * regula asta o readuce singura.
   *
   * ⚠⚠ SI DOAR CELE PE CARE NU LE-A SCOS NIMENI ANUME. „Lipseste" nu spune de ce
   * lipseste: o sectiune stearsa din editorul de design arata identic cu una
   * care n-a existat vreodata. Fara lista `sterse`, cosul de gunoi devenea un
   * buton mort — sectiunea disparea din previzualizare, comerciantul apasa
   * Publica, si ea era inapoi. Mai rau: stearsa si adaugata la loc din paleta,
   * aparea de DOUA ori, iar autosalvarea cadea de fiecare data.
   *
   * Al doilea filtru, pe singleton: chiar si fara o stergere, un tip care exista
   * deja in lista sub alt id nu are voie sa fie dublat.
   *
   * Pozitia se ia dupa VECINUL din stanga din classic, nu dupa un indice: intre
   * timp designul poate avea alte sectiuni, sterse sau mutate, iar un indice
   * absolut ar fi asezat beneficiile in mijlocul catalogului.
   */
  /*
   * Id-urile scoase anume, pastrate DOAR cat timp mai au ce apara.
   *
   * Lista opreste readaugarea din `classic`, deci un id care nu exista acolo
   * n-are nimic de oprit: o sectiune adaugata din paleta si stearsa apoi lasa un
   * id care nu se mai potriveste nimanui. Filtrata asa, lista nu poate creste
   * peste numarul de sectiuni derivate — nu-i trebuie niciun plafon, iar cu un
   * plafon ar fi fost mai rau decat fara: taiat, el arunca tocmai ultimele
   * stergeri, si atunci a doua parsare a aceluiasi design da alt rezultat decat
   * prima. Verificarea de concurenta a cioarnei se sprijina pe faptul ca nu se
   * intampla asta (vezi `draft-guard.ts`).
   */
  const apararePosibila = new Set([
    ...classic.home.map((s) => s.id),
    ...(classic.chrome.announcement ? [classic.chrome.announcement.id] : []),
  ]);
  /*
   * ⚠⚠ DESIGNURILE SCRISE INAINTE DE SEMNELE ASTEA TREBUIE CITITE ALTFEL.
   *
   * Prezenta cheii `sterse` — chiar goala — inseamna „designul a trecut prin
   * versiunea care noteaza intentiile". Lipsa ei inseamna un design mai vechi, in
   * care aceleasi intentii nu se scriau nicaieri, dar EXISTA: comerciantii care
   * si-au sters deja sectiuni din editorul de design, si-au ales deja un hero din
   * galerie sau si-au aranjat deja randurile, ar fi vazut totul revenind singur
   * pe magazinul LIVE la primul deploy — cea mai urata forma de regresie, fiindca
   * nimeni n-a apasat nimic.
   *
   * Pentru ele, intentia se reconstituie din diferenta fata de designul „classic":
   * ce lipseste a fost sters, o varianta de hero care nu e cea derivata a fost
   * aleasa, o ordine care nu e cea din `page_content` a fost aranjata. Se face o
   * singura data — dupa prima salvare, cheia exista si nu se mai reconstituie.
   *
   * `product_row` ramane in afara: acolo „lipseste" chiar inseamna „e nou in
   * `page_content`", si tocmai de aia exista `randuriNoi` de mai sus.
   */
  const semneNotate = Array.isArray(r.sterse);
  const reconstituite = semneNotate ? [] : classic.home
    .filter((c) => c.kind !== "product_row" && !seenIds.has(c.id))
    .map((c) => c.id);
  if (!semneNotate && classic.chrome.announcement && chromeRaw.announcement === undefined) {
    reconstituite.push(classic.chrome.announcement.id);
  }

  const sterse = new Set(
    [
      ...(Array.isArray(r.sterse) ? r.sterse.filter((x): x is string => typeof x === "string") : []),
      ...reconstituite,
    ].filter((id) => apararePosibila.has(id)),
  );

  /**
   * Cineva a aranjat ordinea in editorul de design; derivarea nu mai rescrie nimic.
   *
   * La designurile vechi se deduce: daca randurile stau altfel decat le-ar aseza
   * `page_content`, atunci le-a asezat un om.
   */
  const ordineaSalvata = home.filter((s) => s.kind === "product_row").map((s) => s.id);
  const ordineaDerivata = classic.home
    .filter((s) => s.kind === "product_row" && seenIds.has(s.id))
    .map((s) => s.id);
  const design_ordineAtinsa = semneNotate
    ? r.ordineAtinsa === true
    : ordineaSalvata.join("|") !== ordineaDerivata.join("|");
  for (const c of classic.home) {
    if (seenIds.has(c.id) || !c.enabled || sterse.has(c.id)) continue;
    if (sectionMeta(c.kind)?.singleton && home.some((s) => s.kind === c.kind)) continue;
    if (home.length >= MAX_HOME_SECTIONS) break;
    seenIds.add(c.id);
    home.splice(pozitiaDupaVecin(home, classic.home, c), 0, c);
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
   * Sectiunile DERIVATE isi iau starea pornit/oprit din editorul magazinului —
   * DACA editorul de design nu si-a spus cuvantul.
   *
   * Continutul lor traieste in `page_content` si acolo are si comutatorul:
   * beneficiile, recenziile, galeria, banda de incredere, randurile de produse.
   * Odata ce designul e salvat, starea venea din jsonb si comutatoarele vechi
   * mergeau intr-o singura directie — stingeau, dar nu mai porneau nimic, si
   * comerciantul apasa fara niciun efect. Sectiunile ADAUGATE din editorul de
   * design nu au corespondent in continut, deci raman cu starea lor.
   *
   * ⚠ `enabledOverride` e ce lipsea, si lipsa lui rupea CELALALT editor. Copiat
   * neconditionat, `enabled` din classic anula ochiul din editorul de design la
   * prima citire de dupa salvare: stingeai o sectiune, disparea instant din
   * previzualizare (care primeste designul NEPARSAT, prin postMessage), apasai
   * Publica — si revenea. Pentru „Cautare si filtre", „Categorii" si „Catalog
   * produse" stingerea era de-a dreptul imposibila: designul classic le
   * construieste cu `enabled` scris in cod.
   *
   * Cu trei stari, fiecare editor comanda ce e al lui: semnul explicit bate
   * derivarea, iar lipsa lui lasa comanda comutatorului vechi.
   */
  for (const s of home) {
    const derivata = classic.home.find((c) => c.id === s.id && c.kind === s.kind);
    if (derivata) s.enabled = s.enabledOverride ?? derivata.enabled;
  }

  /*
   * VARIANTA de hero se re-deriva si ea, nu doar starea.
   *
   * „Afiseaza continutul peste banner" din editorul magazinului nu aprinde si nu
   * stinge nimic — alege intre doua variante, `banners` si `overlay`. Odata ce
   * designul era salvat, varianta venea din jsonb si nu se mai re-deriva
   * niciodata: comutatorul se salva, previzualizarea se reincarca, si hero-ul
   * ramanea identic in ambele pozitii. La fel pentru adaugarea primului banner,
   * care si ea schimba varianta.
   *
   * ⚠ DOAR CAND NIMENI N-A ALES ANUME. `banners` si `overlay` nu sunt doar cele
   * doua stari ale comutatorului — sunt si doua design-uri din catalog, cu nume
   * proprii („Doar imagini", „Imagine cu text peste"). Re-derivate
   * neconditionat, ele nu puteau fi alese NICIODATA din galerie: cardul se
   * marca activ, previzualizarea se schimba, si magazinul randa celalalt.
   * `variantOverride` e semnul ca a ales un om; atunci comutatorul tace.
   */
  const heroSalvat = home.find((s) => s.kind === "hero");
  const heroClassic = classic.home.find((s) => s.kind === "hero");
  if (heroSalvat && heroClassic && heroSalvat.variantOverride === undefined) {
    /*
     * Designul vechi si-a DECLARAT o varianta valida, alta decat cea derivata?
     * Atunci a ales-o un om, si alegerea lui nu se pierde la deploy.
     *
     * Se cere varianta din jsonb-ul BRUT, nu cea de dupa parsare: una necunoscuta
     * cade pe prima din catalog, iar aceea poate nimeri chiar peste una derivata —
     * si atunci un design stricat s-ar fi ales singur un hero, pe veci.
     */
    const heroBrut = Array.isArray(r.home)
      ? (r.home.map(obj).find((x) => x.kind === "hero")?.variant)
      : undefined;
    const alesDeOm = typeof heroBrut === "string" && !!sectionMeta("hero")?.variants[heroBrut];

    if (!semneNotate && alesDeOm && heroSalvat.variant !== heroClassic.variant) {
      heroSalvat.variantOverride = heroSalvat.variant;
    } else if (VARIANTE_HERO_DERIVATE.includes(heroSalvat.variant)) {
      heroSalvat.variant = heroClassic.variant;
    }
  }

  /*
   * Randurile de produse isi iau ORDINEA tot din editorul magazinului.
   *
   * Sagetile de acolo promit „Trage de sageti ca sa schimbi ordinea", scriu
   * cuminte in `page_content.product_sections` — si nimeni nu citea ordinea aia:
   * lista venea intreaga din jsonb, iar din classic se readuceau doar randurile
   * lipsa. Mutai un rand, salvai, si magazinul arata aceeasi ordine.
   *
   * Se reasaza doar CINE ocupa sloturile, nu si unde sunt sloturile: pozitia
   * blocului de randuri fata de restul paginii ramane a editorului de design,
   * ordinea dinauntru ramane a editorului magazinului. Asa fiecare comanda ce
   * arata in propriul ecran, si niciunul nu-l contrazice pe celalalt.
   *
   * ⚠⚠ SI NUMAI CAT TIMP NIMENI N-A ARANJAT ORDINEA IN EDITORUL DE DESIGN.
   * Randurile de produse sunt sectiuni ca oricare alta acolo: se trag, se muta
   * cu sagetile. Aplicata neconditionat, regula asta trimitea in slotul din capul
   * paginii ALT rand decat cel tras acolo — editorul arata una, magazinul alta —
   * si nu exista nicio cale de a aseza „Recomandate" fata de randurile custom,
   * fiindca el nici nu apare in `page_content.product_sections`.
   */
  const sloturi = design_ordineAtinsa ? [] : home.map((s, i) => [s, i] as const)
    .filter(([s]) => s.kind === "product_row" && classic.home.some((c) => c.id === s.id));
  if (sloturi.length > 1) {
    const dupaClassic = sloturi
      .map(([s]) => s)
      .sort((a, b) => indexInClassic(classic.home, a.id) - indexInClassic(classic.home, b.id));
    sloturi.forEach(([, pozitie], i) => { home[pozitie] = dupaClassic[i]; });
  }

  /*
   * Bara de anunt, cu ACEEASI regula ca sectiunile paginii — lipsea de tot.
   *
   * ⚠ Bucla de mai sus itereaza numai peste `home`; bara sta in `chrome` si se
   * lua intreaga din jsonb. Deci mergea intr-o singura directie, exact invers
   * decat restul: stinsa din editorul magazinului disparea, dar APRINSA de acolo
   * nu aparea niciodata. Comerciantul o aprindea, scria textul, salva, primea
   * „Salvat" — si bara nu se vedea nicaieri, fiindca designul salvat spunea
   * „stinsa" si designul castiga la randare.
   *
   * Cand bara LIPSESTE cu totul din designul salvat si editorul magazinului o
   * cere aprinsa, se ia cea din classic: altfel comutatorul ar fi ramas mort si
   * dupa reparatie, pentru magazinele care au salvat un design fara ea.
   *
   * ⚠ `null` NU inseamna „lipseste". Asa o scrie `removeSection` cand cineva
   * sterge bara din lista de sectiuni, iar tratate la fel, cele doua faceau
   * stergerea imposibila: bara revenea la prima citire, pe fiecare pagina, cat
   * timp comutatorul vechi era pornit. Lista `sterse` spune care e cazul.
   */
  const announcementRaw = chromeRaw.announcement;
  const announcementSalvat =
    announcementRaw === null || announcementRaw === undefined
      ? null
      : parseSection(announcementRaw, seenIds);
  const announcementClassic = classic.chrome.announcement;
  const announcementStearsa =
    announcementRaw === null
    || (announcementClassic ? sterse.has(announcementClassic.id) : false);
  const announcement = announcementSalvat
    ? {
        ...announcementSalvat,
        enabled: announcementSalvat.enabledOverride
          ?? announcementClassic?.enabled
          ?? announcementSalvat.enabled,
      }
    : !announcementStearsa && announcementClassic?.enabled
      ? announcementClassic
      : null;

  return {
    version: DESIGN_VERSION,
    style: parseStoreStyle(r.style),
    // Cele doua semne trebuie sa se INTOARCA in designul salvat, altfel prima
    // scriere le pierde si stergerea, respectiv ordinea, se anuleaza singure la
    // urmatoarea citire: `saveDesignDraft` scrie forma PARSATA, nu ce a trimis
    // clientul. Plafonate ca sa nu creasca la nesfarsit.
    /*
     * `sterse` se scrie MEREU, chiar goala, si asta e esential: prezenta cheii e
     * semnul ca designul a trecut prin versiunea care noteaza intentiile.
     * Omisa cand e goala, un design fara nicio stergere ar fi fost recitit la
     * nesfarsit ca „vechi", iar orice sectiune adaugata mai tarziu in `classic`
     * ar fi fost luata drept stearsa si n-ar mai fi aparut niciodata.
     */
    sterse: [...sterse],
    ...(design_ordineAtinsa ? { ordineAtinsa: true } : {}),
    chrome: {
      announcement: announcement && announcement.kind === "announcement" ? announcement : null,
      header: pickOne(chromeRaw.header, classic.chrome.header, seenIds),
      footer: pickOne(chromeRaw.footer, classic.chrome.footer, seenIds),
    },
    home,
    product: {
      page: pickOne(productRaw.page, classic.product.page, seenIds),
    },
    // Fara linia asta slotul ar disparea la prima salvare: parserul nu face
    // merge peste `raw`, construieste si returneaza un obiect literal, iar
    // server action-ul scrie exact acel obiect in baza.
    shop: {
      page: pickOne(shopRaw.page, classic.shop.page, seenIds),
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
