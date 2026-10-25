import type { BlockInstance, SectionKind } from "./types";

/**
 * Blocurile unei sectiuni (etapa 4 din `docs/editor-magazin/PLAN.md`).
 *
 * Un bloc e o bucata care exista deja pe pagina, cu zona ei fixa: titlul,
 * pretul, butoanele, beneficiile de sub produs. Comerciantul le muta in
 * interiorul zonei, le ascunde pe cele optionale si (mai tarziu) le regleaza.
 * Azi doar pagina de produs are blocuri, si fiecare varianta are schema ei:
 * Clasic si Detaliat isi aseaza bucatile diferit.
 *
 * ⚠ Blocurile nu muta cod de bani. Logica (pretul afisat si cel trimis,
 * variantele, personalizarea, ofertele) ramane in componenta variantei; lista
 * de aici spune doar in ce ordine se aseaza bucatile si care se vad.
 *
 * Modul fara dependente la rulare de `registry.ts` sau `parse.ts`: amandoua il
 * folosesc pe el.
 */

/** O zona a sectiunii: blocurile se muta doar in interiorul ei. */
export interface ZonaBlocuri {
  id: string;
  label: string;
}

/** Ce trebuie sa stie un bloc ca sa-si afle vizibilitatea implicita. */
export interface ContextBlocuri {
  pageContent: Record<string, unknown>;
  /** Reglajele sectiunii: comutatoarele vechi ale variantei Detaliat. */
  setari: Record<string, unknown>;
}

export interface BlocMeta {
  label: string;
  /** Nume din `PAGE_ICONS` (`components/pages/icon-registry.tsx`). */
  icon: string;
  zona: string;
  /**
   * Motivul pentru care blocul nu se poate ascunde: bani, lege sau comanda.
   * Il citeste editorul, langa locul unde ar fi stat ochiul.
   */
  obligatoriu?: string;
  /**
   * Vizibilitatea cat timp omul n-a atins ochiul: comutatorul vechi care facea
   * acelasi lucru, ca nicio pagina sa nu se schimbe la lansare. Lipsa = aprins.
   */
  implicit?: (ctx: ContextBlocuri) => boolean;
}

export interface SchemaBlocuri {
  zone: ZonaBlocuri[];
  /** Ordinea cheilor e ordinea implicita: exact asezarea de dinainte de blocuri. */
  tipuri: Record<string, BlocMeta>;
}

const obiect = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const aprinsIn = (cheie: string) => (c: ContextBlocuri) => obiect(c.pageContent[cheie]).enabled === true;

// Motivele, o singura data: aceleasi in ambele variante. Le citeste omul in
// editor, deci cu diacritice.
const DE_CE = {
  titlu: "E titlul principal al paginii (H1), după care o găsește Google.",
  pret: "Prețul trebuie să se vadă înainte de comandă.",
  variante: "Fără ele clientul nu poate alege mărimea sau culoarea.",
  stoc: "Anunță stocul și precomanda, cu termenul ei.",
  personalizare: "Câmpurile intră în preț și în comandă.",
  cumparare: "Comanda, coșul și nota despre garanția legală (OUG 18/2026).",
  set: "Apare doar când ai o ofertă așezată lângă preț; se reglează din Oferte.",
  oferte: "Apar doar când ai oferte pentru produs; se reglează din Oferte.",
};

/** Clasic: coloana de cumparare langa galerie, apoi sectiunile de sub produs. */
const BLOCURI_CLASIC: SchemaBlocuri = {
  zone: [
    { id: "cumparare", label: "Zona de cumpărare" },
    { id: "jos", label: "Sub produs" },
  ],
  tipuri: {
    insigna: { label: "Eticheta „Calitate verificată”", icon: "BadgeCheck", zona: "cumparare", implicit: (c) => c.pageContent.show_quality_badge === true },
    titlu: { label: "Titlul", icon: "Award", zona: "cumparare", obligatoriu: DE_CE.titlu },
    descriere_scurta: { label: "Descrierea scurtă", icon: "MessageCircle", zona: "cumparare" },
    pret: { label: "Prețul", icon: "Tag", zona: "cumparare", obligatoriu: DE_CE.pret },
    pachet: { label: "Conținutul pachetului", icon: "Package", zona: "cumparare" },
    livrare: { label: "Estimarea livrării", icon: "Calendar", zona: "cumparare", implicit: aprinsIn("delivery_estimate") },
    variante: { label: "Variantele", icon: "Palette", zona: "cumparare", obligatoriu: DE_CE.variante },
    stoc: { label: "Stocul", icon: "PackageCheck", zona: "cumparare", obligatoriu: DE_CE.stoc },
    personalizare: { label: "Personalizarea", icon: "PenTool", zona: "cumparare", obligatoriu: DE_CE.personalizare },
    cumparare: { label: "Butoanele de comandă", icon: "ShoppingCart", zona: "cumparare", obligatoriu: DE_CE.cumparare },
    set: { label: "Setul „Cumpărate împreună”", icon: "Gift", zona: "cumparare", obligatoriu: DE_CE.set },
    incredere: { label: "Garanțiile", icon: "ShieldCheck", zona: "cumparare", implicit: (c) => c.pageContent.trust_badges_enabled !== false },
    dovada: { label: "Contorul de vizitatori", icon: "Users", zona: "cumparare", implicit: (c) => c.pageContent.show_social_proof === true },
    oferte: { label: "Oferte sub produs", icon: "HandCoins", zona: "jos", obligatoriu: DE_CE.oferte },
    beneficii: { label: "Beneficiile", icon: "Sparkles", zona: "jos", implicit: aprinsIn("benefits_section") },
    cum_functioneaza: { label: "Cum funcționează", icon: "Rocket", zona: "jos", implicit: aprinsIn("how_it_works_section") },
    descriere: { label: "Descrierea", icon: "Book", zona: "jos" },
    continut_pachet: { label: "Ce conține pachetul", icon: "Boxes", zona: "jos" },
    specificatii: { label: "Specificațiile", icon: "Wrench", zona: "jos" },
    intrebari: { label: "Întrebările frecvente", icon: "Headphones", zona: "jos", implicit: aprinsIn("faq_section") },
  },
};

/** Detaliat: coloana de cumparare intinsa, blocul de sub galerie, filele, apoi restul. */
const BLOCURI_DETALIAT: SchemaBlocuri = {
  zone: [
    { id: "cumparare", label: "Coloana de cumpărare" },
    { id: "sub_galerie", label: "Sub galerie" },
    { id: "file", label: "File" },
    { id: "jos", label: "Sub produs" },
  ],
  tipuri: {
    titlu: { label: "Titlul", icon: "Award", zona: "cumparare", obligatoriu: DE_CE.titlu },
    brand: { label: "Brandul", icon: "Gem", zona: "cumparare" },
    descriere_scurta: { label: "Descrierea scurtă", icon: "MessageCircle", zona: "cumparare" },
    dovada: { label: "Contorul de vizitatori", icon: "Users", zona: "cumparare", implicit: (c) => c.pageContent.show_social_proof === true },
    pret: { label: "Prețul", icon: "Tag", zona: "cumparare", obligatoriu: DE_CE.pret },
    variante: { label: "Variantele", icon: "Palette", zona: "cumparare", obligatoriu: DE_CE.variante },
    stoc: { label: "Stocul", icon: "PackageCheck", zona: "cumparare", obligatoriu: DE_CE.stoc },
    personalizare: { label: "Personalizarea", icon: "PenTool", zona: "cumparare", obligatoriu: DE_CE.personalizare },
    cumparare: { label: "Butoanele de comandă", icon: "ShoppingCart", zona: "cumparare", obligatoriu: DE_CE.cumparare },
    trepte: { label: "Reducerile de cantitate", icon: "Percent", zona: "cumparare", implicit: (c) => c.setari.showTiers !== false },
    contact: { label: "Telefon și WhatsApp", icon: "Phone", zona: "cumparare", implicit: (c) => c.setari.showContact !== false },
    detalii: { label: "Caseta „Detalii produs”", icon: "Settings", zona: "sub_galerie", implicit: (c) => c.setari.showDetails !== false },
    rezumat: { label: "Rezumatul specificațiilor", icon: "BarChart3", zona: "sub_galerie", implicit: (c) => c.setari.showSpecsSummary !== false },
    incredere: { label: "Garanțiile", icon: "ShieldCheck", zona: "sub_galerie", implicit: (c) => c.pageContent.trust_badges_enabled !== false },
    descriere: { label: "Descrierea", icon: "Book", zona: "file" },
    specificatii: { label: "Specificațiile", icon: "Wrench", zona: "file" },
    intrebari: { label: "Întrebările frecvente", icon: "Headphones", zona: "file", implicit: aprinsIn("faq_section") },
    continut_pachet: { label: "Ce conține pachetul", icon: "Boxes", zona: "jos" },
    oferte: { label: "Oferte sub produs", icon: "HandCoins", zona: "jos", obligatoriu: DE_CE.oferte },
    beneficii: { label: "Beneficiile", icon: "Sparkles", zona: "jos", implicit: aprinsIn("benefits_section") },
    cum_functioneaza: { label: "Cum funcționează", icon: "Rocket", zona: "jos", implicit: aprinsIn("how_it_works_section") },
  },
};

/** Schema blocurilor unei sectiuni, dupa tip si varianta; `null` cand sectiunea n-are blocuri. */
export function schemaBlocurilor(kind: SectionKind, variant: string): SchemaBlocuri | null {
  if (kind !== "product_page") return null;
  return variant === "detailed" ? BLOCURI_DETALIAT : BLOCURI_CLASIC;
}

/**
 * Blocurile salvate, curatate: doar tipurile schemei, fiecare o data, in ordinea
 * salvata. Setarile raman goale in etapa asta (niciun bloc nu are inca reglaje).
 */
export function parseBlocuri(raw: unknown, schema: SchemaBlocuri): BlockInstance[] {
  if (!Array.isArray(raw)) return [];
  const vazute = new Set<string>();
  const out: BlockInstance[] = [];
  for (const element of raw) {
    const r = obiect(element);
    const tip = typeof r.type === "string" ? r.type : "";
    const meta = schema.tipuri[tip];
    if (!meta || vazute.has(tip)) continue;
    vazute.add(tip);
    // Semnul ochiului doar pe blocurile care se pot ascunde, si doar ca boolean:
    // cheia in plus, chiar goala, ar fi facut alt obiect la comparatia ciornei.
    const semn = !meta.obligatoriu && typeof r.enabledOverride === "boolean" ? { enabledOverride: r.enabledOverride } : null;
    out.push({ id: tip, type: tip, enabled: r.enabled !== false, ...semn, settings: {} });
  }
  return out;
}

/**
 * Lista completa: cele salvate in ordinea lor, tipurile lipsa la locul lor
 * implicit, vizibilitatea efectiva. Idempotenta: a doua trecere da acelasi lucru.
 *
 * Un tip lipsa (adaugat in schema dupa ce omul si-a aranjat blocurile, sau venit
 * din alta varianta) intra dupa vecinul lui din stanga din ordinea implicita;
 * fara vecin, inaintea celui din dreapta. Pozitia absoluta n-ar avea sens: lista
 * salvata poate avea alta ordine.
 */
export function completeazaBlocuri(
  salvate: readonly BlockInstance[] | undefined,
  schema: SchemaBlocuri,
  ctx: ContextBlocuri,
): BlockInstance[] {
  const implicita = Object.keys(schema.tipuri);
  const lista = (salvate ?? []).filter((b, i, toate) => schema.tipuri[b.type] && toate.findIndex((x) => x.type === b.type) === i);
  for (const [k, tip] of implicita.entries()) {
    if (lista.some((b) => b.type === tip)) continue;
    const stanga = implicita.slice(0, k).reverse().map((t) => lista.findIndex((b) => b.type === t)).find((i) => i >= 0);
    const dreapta = implicita.slice(k + 1).map((t) => lista.findIndex((b) => b.type === t)).find((i) => i >= 0);
    const pozitie = stanga !== undefined ? stanga + 1 : dreapta !== undefined ? dreapta : lista.length;
    lista.splice(pozitie, 0, { id: tip, type: tip, enabled: true, settings: {} });
  }
  return lista.map((b) => {
    const meta = schema.tipuri[b.type];
    const semn = meta.obligatoriu ? undefined : b.enabledOverride;
    const enabled = meta.obligatoriu ? true : (semn ?? (meta.implicit ? meta.implicit(ctx) : true));
    return { id: b.type, type: b.type, enabled, ...(semn === undefined ? {} : { enabledOverride: semn }), settings: b.settings ?? {} };
  });
}

/** Blocurile aprinse ale unei zone, in ordinea lor: ce randeaza varianta. */
export function blocurileZonei(blocuri: readonly BlockInstance[], schema: SchemaBlocuri, zona: string): BlockInstance[] {
  return blocuri.filter((b) => b.enabled && schema.tipuri[b.type]?.zona === zona);
}

/**
 * Muta blocul cu un loc in zona lui (-1 = sus, 1 = jos). Intoarce ACEEASI lista
 * cand n-are unde: la capatul zonei, sau pentru un id necunoscut.
 */
export function mutaBloc(blocuri: readonly BlockInstance[], schema: SchemaBlocuri, id: string, directie: -1 | 1): readonly BlockInstance[] {
  const i = blocuri.findIndex((b) => b.id === id);
  if (i < 0) return blocuri;
  const zona = schema.tipuri[blocuri[i].type]?.zona;
  let j = i + directie;
  while (j >= 0 && j < blocuri.length && schema.tipuri[blocuri[j].type]?.zona !== zona) j += directie;
  if (j < 0 || j >= blocuri.length) return blocuri;
  const urmatoarea = [...blocuri];
  [urmatoarea[i], urmatoarea[j]] = [urmatoarea[j], urmatoarea[i]];
  return urmatoarea;
}

/** Ochiul blocului. Intoarce ACEEASI lista pentru un bloc obligatoriu sau necunoscut. */
export function comutaBloc(blocuri: readonly BlockInstance[], schema: SchemaBlocuri, id: string): readonly BlockInstance[] {
  const i = blocuri.findIndex((b) => b.id === id);
  if (i < 0 || schema.tipuri[blocuri[i].type]?.obligatoriu) return blocuri;
  const nou = !blocuri[i].enabled;
  return blocuri.map((b, k) => (k === i ? { ...b, enabled: nou, enabledOverride: nou } : b));
}
