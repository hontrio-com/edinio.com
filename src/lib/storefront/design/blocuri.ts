import { ETICHETA_CONTINUT_LIBER, parseBlocuriLibere, reidentificaBlocuri, blocuriDinSetari } from "./continut-liber";
import { sanitizeSettings } from "./curatare";
import type { Block } from "@/lib/pages/blocks.types";
import type { Field } from "./registry";
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
   * Motivul pentru care blocul n-are ochi: bani, lege, comanda, sau o bucata pe
   * care o aprinde chiar continutul ei (ofertele, estimarea livrarii). Blocul se
   * aseaza mereu; bucata insasi decide daca are ce arata. Il citeste editorul,
   * langa locul unde ar fi stat ochiul.
   */
  obligatoriu?: string;
  /**
   * Vizibilitatea cat timp omul n-a atins ochiul: comutatorul vechi care facea
   * acelasi lucru, ca nicio pagina sa nu se schimbe la lansare. Lipsa = aprins.
   */
  implicit?: (ctx: ContextBlocuri) => boolean;
  /**
   * „Conținut liber” (etapa 9): blocul nu e o bucata fixa a paginii, ci un container cu blocurile
   * paginilor proprii (`settings.blocuri`, vezi `continut-liber.ts`). Poate aparea de mai multe ori,
   * fiecare cu id-ul lui; nu se adauga singur (pagina ramane cum era pana il pune omul) si se poate
   * sterge.
   */
  repetabil?: true;
  /**
   * O coloana a subsolului (etapa 11): se poate pune de mai multe ori, fiecare cu id-ul ei si cu reglajele ei,
   * curatate pe `campuri`, ca setarile unei sectiuni. `unica`: cel mult una in subsol (logo-ul, contactul,
   * newsletterul, retelele). `implicite`: reglajele unei coloane noi, deja in forma curatata.
   */
  coloana?: { campuri: Field[]; unica?: true; implicite: Record<string, unknown> };
}

export interface SchemaBlocuri {
  zone: ZonaBlocuri[];
  /** Ordinea cheilor e ordinea implicita: exact asezarea de dinainte de blocuri. */
  tipuri: Record<string, BlocMeta>;
  /**
   * Lista cu care porneste o sectiune fara blocuri salvate (subsolul, etapa 11): coloanele de dinainte, din reglajele
   * sectiunii. O lista golita anume ramane goala; doar LIPSA ei aduce implicitele.
   */
  implicite?: (setari: Record<string, unknown>) => BlockInstance[];
  /** Cate blocuri poate avea sectiunea cu totul (subsolul: `MAX_COLOANE_SUBSOL`). */
  maxBlocuri?: number;
}

const obiect = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const aprinsIn = (cheie: string) => (c: ContextBlocuri) => obiect(c.pageContent[cheie]).enabled === true;

// Motivele, o singura data: aceleasi in ambele variante. Le citeste omul in
// editor, deci cu diacritice.
const DE_CE = {
  titlu: "Nu se ascunde: e titlul principal al paginii (H1), după care o găsește Google.",
  pret: "Nu se ascunde: prețul trebuie să se vadă înainte de comandă.",
  variante: "Nu se ascunde: fără ele clientul nu poate alege mărimea sau culoarea.",
  stoc: "Nu se ascunde: anunță stocul și precomanda, cu termenul ei.",
  personalizare: "Nu se ascunde: câmpurile intră în preț și în comandă.",
  cumparare: "Nu se ascunde: comanda, coșul și nota despre garanția legală (OUG 18/2026).",
  set: "Se arată doar când ai o ofertă așezată lângă preț; o reglezi din Oferte.",
  oferte: "Se arată doar când ai oferte pentru produs; le reglezi din Oferte.",
  /*
   * Fara ochi, dar nu din motive de bani: comutatorul ei ramane in continut,
   * fiindca il citeste si varianta Detaliat, unde estimarea e un rand din caseta
   * „Detalii produs”, nu o bucata a ei. Scos de acolo, cine foloseste Detaliat
   * n-ar mai fi avut cum s-o porneasca sau s-o opreasca.
   */
  livrare: "Se arată când pornești „Arată estimarea livrării” mai jos; tot de acolo o oprești.",
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
    /* „Caseta”, ca „Ce conține pachetul” de jos sa nu para acelasi bloc (proba 4.6). */
    pachet: { label: "Caseta „Pachetul conține”", icon: "Package", zona: "cumparare" },
    livrare: { label: "Estimarea livrării", icon: "Calendar", zona: "cumparare", obligatoriu: DE_CE.livrare },
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
    continut_liber: { label: ETICHETA_CONTINUT_LIBER, icon: "PenTool", zona: "jos", repetabil: true },
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
    continut_liber: { label: ETICHETA_CONTINUT_LIBER, icon: "PenTool", zona: "jos", repetabil: true },
  },
};

/**
 * Pagina Magazin (etapa 9): fara bucati fixe, doar „Conținut liber” deasupra si sub produse. Doua
 * tipuri, nu unul, fiindca zona tine de tip; amandoua se cheama la fel pentru om.
 *
 * ⚠ Aceeasi schema pe TOATE variantele, si pe „none” (produsele pe pagina principala): altfel o
 * plimbare prin galerie ar fi aruncat continutul la parsare. Randarea il arata doar pe `/magazin`
 * (decizia lui din 27.10: „Doar pe /magazin”), cand pagina exista.
 */
const BLOCURI_MAGAZIN: SchemaBlocuri = {
  zone: [
    { id: "sus", label: "Deasupra produselor" },
    { id: "jos", label: "Sub produse" },
  ],
  tipuri: {
    continut_sus: { label: ETICHETA_CONTINUT_LIBER, icon: "PenTool", zona: "sus", repetabil: true },
    continut_jos: { label: ETICHETA_CONTINUT_LIBER, icon: "PenTool", zona: "jos", repetabil: true },
  },
};

// ---------------------------------------------------------------------------
// Subsolul (etapa 11): coloane-bloc
// ---------------------------------------------------------------------------

/** Cate coloane poate avea subsolul; peste, pe calculator nu mai incap una langa alta. */
export const MAX_COLOANE_SUBSOL = 8;

const TITLU_COLOANA: Field = { key: "titlu", type: "text", label: "Titlul coloanei", maxLength: 60 };

/**
 * Coloanele subsolului. Textele implicite sunt ale magazinului, deci fara diacritice, ca restul subsolului
 * („Informatii”, „Inapoi sus”); etichetele de aici le vede doar omul din editor.
 */
const COLOANE_SUBSOL: Record<string, BlocMeta> = {
  identitate: {
    label: "Logo și text", icon: "Image", zona: "coloane",
    coloana: {
      unica: true,
      campuri: [
        { key: "arataLogo", type: "toggle", label: "Logo-ul" },
        { key: "arataSloganul", type: "toggle", label: "Sloganul magazinului" },
        { key: "text", type: "textarea", label: "Text", maxLength: 300 },
        { key: "arataRetelele", type: "toggle", label: "Rețelele sociale" },
      ],
      implicite: { arataLogo: true, arataSloganul: true, arataRetelele: true },
    },
  },
  linkuri: {
    label: "Linkuri", icon: "MousePointerClick", zona: "coloane",
    coloana: {
      campuri: [
        TITLU_COLOANA,
        {
          key: "sursa", type: "select", label: "Ce linkuri", options: [
            { value: "categorii", label: "Categoriile magazinului" },
            { value: "pagini", label: "Paginile din meniu" },
            { value: "alese", label: "Alese de mine" },
          ],
        },
        { key: "toateProdusele", type: "toggle", label: "„Toate produsele” primul" },
        { key: "cate", type: "range", label: "Câte categorii", min: 1, max: 12 },
        {
          key: "linkuri", type: "repeater", label: "Linkurile", itemLabel: "Link", max: 12,
          fields: [
            { key: "eticheta", type: "text", label: "Textul", maxLength: 80 },
            { key: "adresa", type: "link", label: "Adresa" },
          ],
        },
      ],
      implicite: { titlu: "Linkuri utile", sursa: "alese", linkuri: [] },
    },
  },
  text: {
    label: "Text", icon: "Type", zona: "coloane",
    coloana: {
      campuri: [TITLU_COLOANA, { key: "text", type: "textarea", label: "Textul", maxLength: 600 }],
      implicite: { titlu: "Despre noi", text: "Scrie aici cateva randuri despre magazinul tau." },
    },
  },
  contact: {
    label: "Contact", icon: "Phone", zona: "coloane",
    coloana: {
      unica: true,
      campuri: [
        TITLU_COLOANA,
        { key: "telefon", type: "toggle", label: "Telefonul" },
        { key: "whatsapp", type: "toggle", label: "WhatsApp" },
        { key: "email", type: "toggle", label: "Emailul" },
        { key: "oras", type: "toggle", label: "Orașul" },
      ],
      implicite: { titlu: "Contact", telefon: true, whatsapp: true, email: true, oras: true },
    },
  },
  newsletter: {
    label: "Newsletter", icon: "MailPlus", zona: "coloane",
    coloana: {
      unica: true,
      campuri: [
        TITLU_COLOANA,
        { key: "text", type: "textarea", label: "Textul", maxLength: 200 },
        { key: "buton", type: "text", label: "Textul butonului", maxLength: 40 },
      ],
      implicite: { titlu: "Newsletter", text: "Afla primul de oferte si noutati.", buton: "Aboneaza-ma" },
    },
  },
  imagine: {
    label: "Imagine", icon: "Image", zona: "coloane",
    coloana: {
      campuri: [
        { key: "imagine", type: "image", label: "Imaginea" },
        { key: "link", type: "link", label: "Link la apăsare" },
        { key: "alt", type: "text", label: "Text alternativ", maxLength: 120 },
        { key: "latime", type: "range", label: "Lățimea", min: 40, max: 320, unit: "px" },
      ],
      implicite: { latime: 160 },
    },
  },
  retele: {
    label: "Rețele sociale", icon: "Share2", zona: "coloane",
    coloana: { unica: true, campuri: [TITLU_COLOANA], implicite: { titlu: "Urmareste-ne" } },
  },
};

/** Tipurile de coloana, in ordinea din lista „Adaugă coloană”. */
export const TIPURI_COLOANE_SUBSOL = Object.keys(COLOANE_SUBSOL);

const sloganulDeAzi = (setari: Record<string, unknown>) => setari.showTagline === true;

/**
 * Subsolul pe coloane (`dark`, `columns`): identitatea (logo, slogan, retelele), „Magazin” (toate produsele si
 * primele 6 categorii), „Informatii” (paginile din meniu), „Contact”. Exact `FooterColumns` de dinainte de etapa 11.
 */
const SUBSOL_PE_COLOANE: SchemaBlocuri = {
  zone: [{ id: "coloane", label: "Coloane" }],
  tipuri: COLOANE_SUBSOL,
  maxBlocuri: MAX_COLOANE_SUBSOL,
  implicite: (setari) => [
    { id: "identitate", type: "identitate", enabled: true, settings: { arataLogo: true, arataSloganul: sloganulDeAzi(setari), arataRetelele: true } },
    { id: "magazin", type: "linkuri", enabled: true, settings: { titlu: "Magazin", sursa: "categorii", toateProdusele: true, cate: 6 } },
    { id: "informatii", type: "linkuri", enabled: true, settings: { titlu: "Informatii", sursa: "pagini" } },
    { id: "contact", type: "contact", enabled: true, settings: { titlu: "Contact", telefon: true, whatsapp: true, email: true, oras: true } },
  ],
};

/**
 * Subsolul centrat: logo-ul, paginile pe un rand, contactul fara oras, retelele. Exact `FooterCentered` de dinainte;
 * „Inapoi sus” e reglajul subsolului (pornit implicit aici).
 */
const SUBSOL_CENTRAT: SchemaBlocuri = {
  zone: [{ id: "coloane", label: "Coloane" }],
  tipuri: COLOANE_SUBSOL,
  maxBlocuri: MAX_COLOANE_SUBSOL,
  implicite: (setari) => [
    { id: "identitate", type: "identitate", enabled: true, settings: { arataLogo: true, arataSloganul: sloganulDeAzi(setari), arataRetelele: false } },
    { id: "informatii", type: "linkuri", enabled: true, settings: { sursa: "pagini" } },
    { id: "contact", type: "contact", enabled: true, settings: { telefon: true, whatsapp: true, email: true, oras: false } },
    { id: "retele", type: "retele", enabled: true, settings: {} },
  ],
};

/** Schema blocurilor unei sectiuni, dupa tip si varianta; `null` cand sectiunea n-are blocuri. */
export function schemaBlocurilor(kind: SectionKind, variant: string): SchemaBlocuri | null {
  if (kind === "shop_page") return BLOCURI_MAGAZIN;
  if (kind === "footer") return variant === "centered" ? SUBSOL_CENTRAT : SUBSOL_PE_COLOANE;
  if (kind !== "product_page") return null;
  return variant === "detailed" ? BLOCURI_DETALIAT : BLOCURI_CLASIC;
}

/**
 * Tipurile de bloc care sunt „Conținut liber”, din toate schemele: le citesc curatarea pentru editor si
 * cine cauta continuturile in design, fara sa le scrie de mana.
 */
export const TIPURI_CONTINUT: ReadonlySet<string> = new Set(
  [BLOCURI_CLASIC, BLOCURI_DETALIAT, BLOCURI_MAGAZIN].flatMap((s) => Object.keys(s.tipuri).filter((t) => s.tipuri[t].repetabil)),
);

/** Cate „Conținut liber” poate avea o sectiune, pe toate zonele ei. */
export const MAX_CONTINUTURI_PE_SECTIUNE = 10;

/** Tipul e un „Conținut liber” (container cu blocuri), nu o bucata fixa a paginii. */
export function esteContinut(schema: SchemaBlocuri, tip: string): boolean {
  return schema.tipuri[tip]?.repetabil === true;
}

const ID_CONTINUT = /^[A-Za-z0-9_-]{1,64}$/;

/** Id nou pentru un „Conținut liber” adaugat sau duplicat: nu se poate confunda cu un tip fix. */
function idContinutNou(): string {
  return `cl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Blocurile salvate, curatate: doar tipurile schemei, in ordinea salvata. O bucata fixa apare o
 * data, cu id-ul = tipul si fara reglaje. Un „Conținut liber” (`repetabil`) apare de cate ori e
 * salvat, cel mult `MAX_CONTINUTURI_PE_SECTIUNE`, cu id-ul lui si blocurile lui curatate.
 *
 * ⚠ Id-ul unui continut e STABIL: unul lipsa, stricat, dublat sau egal cu un tip fix primeste unul
 * dupa pozitie, acelasi la fiecare citire (ca `parseBlocuriLibere`).
 */
export function parseBlocuri(raw: unknown, schema: SchemaBlocuri): BlockInstance[] {
  if (!Array.isArray(raw)) return [];
  const vazute = new Set<string>();
  const out: BlockInstance[] = [];
  let continuturi = 0;
  const unicePuse = new Set<string>();
  raw.forEach((element, i) => {
    const r = obiect(element);
    const tip = typeof r.type === "string" ? r.type : "";
    const meta = schema.tipuri[tip];
    if (!meta) return;
    // Semnul ochiului doar pe blocurile care se pot ascunde, si doar ca boolean:
    // cheia in plus, chiar goala, ar fi facut alt obiect la comparatia ciornei.
    const semn = !meta.obligatoriu && typeof r.enabledOverride === "boolean" ? { enabledOverride: r.enabledOverride } : null;
    if (meta.coloana) {
      // O coloana a subsolului (etapa 11): plafonul, cele unice o data, id-ul stabil, reglajele curatate.
      if (out.length >= (schema.maxBlocuri ?? Infinity) || (meta.coloana.unica && unicePuse.has(tip))) return;
      if (meta.coloana.unica) unicePuse.add(tip);
      const dorit = typeof r.id === "string" && ID_CONTINUT.test(r.id) ? r.id : `${tip}_${i}`;
      let id = dorit;
      for (let n = 2; vazute.has(id); n += 1) id = `${dorit}_${n}`;
      vazute.add(id);
      out.push({ id, type: tip, enabled: r.enabled !== false, ...semn, settings: sanitizeSettings(meta.coloana.campuri, obiect(r.settings)) });
      return;
    }
    if (meta.repetabil) {
      if (continuturi >= MAX_CONTINUTURI_PE_SECTIUNE) return;
      continuturi += 1;
      const dorit = typeof r.id === "string" && ID_CONTINUT.test(r.id) && !schema.tipuri[r.id] ? r.id : `${tip}_${i}`;
      let id = dorit;
      for (let n = 2; vazute.has(id); n += 1) id = `${dorit}_${n}`;
      vazute.add(id);
      out.push({ id, type: tip, enabled: r.enabled !== false, ...semn, settings: { blocuri: parseBlocuriLibere(obiect(r.settings).blocuri) } });
      return;
    }
    if (vazute.has(tip)) return;
    vazute.add(tip);
    out.push({ id: tip, type: tip, enabled: r.enabled !== false, ...semn, settings: {} });
  });
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
  // Ordinea implicita e a bucatilor fixe; un „Conținut liber” sau o coloana nu se adauga singure.
  const implicita = Object.keys(schema.tipuri).filter((tip) => !schema.tipuri[tip].repetabil && !schema.tipuri[tip].coloana);
  // Subsolul fara coloane salvate (etapa 11) porneste de la coloanele de dinainte; o lista goala ramane goala.
  const deLaCare = salvate === undefined && schema.implicite ? schema.implicite(ctx.setari) : salvate;
  const cuId = (tip: string) => schema.tipuri[tip].repetabil || schema.tipuri[tip].coloana;
  const lista = (deLaCare ?? []).filter((b, i, toate) => schema.tipuri[b.type] && (cuId(b.type)
    ? toate.findIndex((x) => x.id === b.id) === i
    : toate.findIndex((x) => x.type === b.type) === i));
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
    // Un continut sau o coloana isi pastreaza id-ul (pot fi mai multe de acelasi tip); o bucata fixa are id-ul = tipul.
    return { id: cuId(b.type) ? b.id : b.type, type: b.type, enabled, ...(semn === undefined ? {} : { enabledOverride: semn }), settings: b.settings ?? {} };
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

// ---------------------------------------------------------------------------
// „Conținut liber” (etapa 9): containerele se adauga, se duplica si se sterg
// ---------------------------------------------------------------------------

/** Cate continuturi are deja sectiunea, pe toate zonele. */
function cateContinuturi(blocuri: readonly BlockInstance[], schema: SchemaBlocuri): number {
  return blocuri.filter((b) => esteContinut(schema, b.type)).length;
}

/**
 * Un „Conținut liber” nou de tipul `tip`: sub blocul `loc.dupa` sau deasupra lui `loc.inainte` (cand e
 * in aceeasi zona), altfel la coada listei. Coada e capatul zonei lui: ordinea conteaza doar
 * inauntrul zonei (`blocurileZonei`). Gol, sau cu `initiale` (primul bloc ales din „+”, etapa 10).
 * Intoarce ACEEASI lista pentru un tip care nu e continut sau peste plafon.
 */
export function adaugaContinut(
  blocuri: readonly BlockInstance[],
  schema: SchemaBlocuri,
  tip: string,
  loc: { dupa?: string; inainte?: string } = {},
  initiale: readonly Block[] = [],
): readonly BlockInstance[] {
  const meta = schema.tipuri[tip];
  if (!meta?.repetabil || cateContinuturi(blocuri, schema) >= MAX_CONTINUTURI_PE_SECTIUNE) return blocuri;
  const inZona = (id: string | undefined) => (id ? blocuri.findIndex((b) => b.id === id && schema.tipuri[b.type]?.zona === meta.zona) : -1);
  const iDupa = inZona(loc.dupa);
  const iInainte = inZona(loc.inainte);
  const pozitie = iDupa >= 0 ? iDupa + 1 : iInainte >= 0 ? iInainte : blocuri.length;
  const urmatoarea = [...blocuri];
  urmatoarea.splice(pozitie, 0, { id: idContinutNou(), type: tip, enabled: true, settings: { blocuri: [...initiale] } });
  return urmatoarea;
}

/** Copia unui continut, imediat sub el, cu id-uri noi si pe blocurile dinauntru. */
export function duplicaContinut(blocuri: readonly BlockInstance[], schema: SchemaBlocuri, id: string): readonly BlockInstance[] {
  const i = blocuri.findIndex((b) => b.id === id);
  if (i < 0 || !esteContinut(schema, blocuri[i].type) || cateContinuturi(blocuri, schema) >= MAX_CONTINUTURI_PE_SECTIUNE) return blocuri;
  const original = blocuri[i];
  const copia: BlockInstance = {
    ...original,
    id: idContinutNou(),
    settings: { ...original.settings, blocuri: reidentificaBlocuri(blocuriDinSetari(original.settings)) },
  };
  const urmatoarea = [...blocuri];
  urmatoarea.splice(i + 1, 0, copia);
  return urmatoarea;
}

/** Sterge un continut. Bucatile fixe ale paginii nu se sterg: intoarce ACEEASI lista. */
export function stergeContinut(blocuri: readonly BlockInstance[], schema: SchemaBlocuri, id: string): readonly BlockInstance[] {
  const i = blocuri.findIndex((b) => b.id === id);
  if (i < 0 || !esteContinut(schema, blocuri[i].type)) return blocuri;
  return blocuri.filter((_, k) => k !== i);
}

// ---------------------------------------------------------------------------
// Coloanele subsolului (etapa 11): se adauga, se duplica, se sterg, se regleaza
// ---------------------------------------------------------------------------

/** Id nou pentru o coloana adaugata sau duplicata. */
function idColoanaNou(): string {
  return `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Se mai poate pune o coloana de tipul asta? Nu peste plafon si nu a doua dintr-una unica. */
export function poateAdaugaColoana(blocuri: readonly BlockInstance[], schema: SchemaBlocuri, tip: string): boolean {
  const meta = schema.tipuri[tip];
  if (!meta?.coloana || blocuri.length >= (schema.maxBlocuri ?? Infinity)) return false;
  return !(meta.coloana.unica && blocuri.some((b) => b.type === tip));
}

/**
 * O coloana noua de tipul `tip`, cu reglajele ei implicite: sub `loc.dupa`, deasupra lui `loc.inainte` (din „+”
 * din previzualizare) sau la capat. Intoarce ACEEASI lista cand nu se poate (`poateAdaugaColoana`).
 */
export function adaugaColoana(
  blocuri: readonly BlockInstance[],
  schema: SchemaBlocuri,
  tip: string,
  loc: { dupa?: string; inainte?: string } = {},
): readonly BlockInstance[] {
  const meta = schema.tipuri[tip];
  if (!meta?.coloana || !poateAdaugaColoana(blocuri, schema, tip)) return blocuri;
  const iDupa = loc.dupa ? blocuri.findIndex((b) => b.id === loc.dupa) : -1;
  const iInainte = loc.inainte ? blocuri.findIndex((b) => b.id === loc.inainte) : -1;
  const pozitie = iDupa >= 0 ? iDupa + 1 : iInainte >= 0 ? iInainte : blocuri.length;
  const urmatoarea = [...blocuri];
  urmatoarea.splice(pozitie, 0, { id: idColoanaNou(), type: tip, enabled: true, settings: structuredClone(meta.coloana.implicite) });
  return urmatoarea;
}

/** Copia unei coloane, imediat sub ea. Nu pentru cele unice si nu peste plafon: ACEEASI lista. */
export function duplicaColoana(blocuri: readonly BlockInstance[], schema: SchemaBlocuri, id: string): readonly BlockInstance[] {
  const i = blocuri.findIndex((b) => b.id === id);
  const meta = i >= 0 ? schema.tipuri[blocuri[i].type] : undefined;
  if (!meta?.coloana || meta.coloana.unica || blocuri.length >= (schema.maxBlocuri ?? Infinity)) return blocuri;
  const urmatoarea = [...blocuri];
  urmatoarea.splice(i + 1, 0, { ...blocuri[i], id: idColoanaNou(), settings: structuredClone(blocuri[i].settings) });
  return urmatoarea;
}

/** Sterge o coloana. Altceva decat o coloana nu se sterge de aici: ACEEASI lista. */
export function stergeColoana(blocuri: readonly BlockInstance[], schema: SchemaBlocuri, id: string): readonly BlockInstance[] {
  const i = blocuri.findIndex((b) => b.id === id);
  if (i < 0 || !schema.tipuri[blocuri[i].type]?.coloana) return blocuri;
  return blocuri.filter((_, k) => k !== i);
}

/**
 * Reglajele unei coloane, inlocuite. Asa cum le scrie panoul: le curata parserul la salvare, nu aici, altfel o adresa
 * pe jumatate scrisa („https:”) ar fi disparut din camp la fiecare tasta.
 */
export function setariColoana(
  blocuri: readonly BlockInstance[],
  schema: SchemaBlocuri,
  id: string,
  setari: Record<string, unknown>,
): readonly BlockInstance[] {
  const i = blocuri.findIndex((b) => b.id === id);
  if (i < 0 || !schema.tipuri[blocuri[i].type]?.coloana) return blocuri;
  return blocuri.map((b, k) => (k === i ? { ...b, settings: setari } : b));
}
