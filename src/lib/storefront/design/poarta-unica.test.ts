import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildClassicDesign } from "./defaults";
import type { DesignContext, SectionInstance, SectionKind } from "./types";

/*
 * ⚠ O SECTIUNE ARE O SINGURA POARTA: `enabled` DIN DESIGN.
 *
 * Etapa 2 a editorului unic (25.10.2026). Sectiunile derivate din continut isi
 * iau `enabled` din comutatorul vechi (`defaults.ts`), iar parserul il lasa asa
 * cat timp ochiul din editor n-a spus altceva. Sapte componente verificau insa
 * comutatorul INCA O DATA, deci ochiul le putea stinge, dar nu le putea aprinde:
 * se misca, previzualizarea nu arata nimic, Publica nu schimba nimic. In editorul
 * unic ochiul e singurul control de vizibilitate, deci o poarta a doua l-ar face
 * mort exact pe sectiunile astea.
 *
 * Proba nu tine o lista de comutatoare scrisa de mana: le afla din derivare,
 * aprinzand si stingand fiecare cheie pe care o citeste `defaults.ts`.
 */

const RAD = process.cwd();
/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
const sursa = (f: string) => readFileSync(path.join(RAD, f), "utf8").replace(/\r\n/g, "\n");
/** Fara comentarii: ele povestesc dinadins poarta scoasa. */
const cod = (f: string) => sursa(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DEFAULTS = "src/lib/storefront/design/defaults.ts";
const SECTIUNI = "src/components/storefront/sections";

/** Componenta care deseneaza fiecare tip derivat, dupa dispecerul din `SectionRenderer`. */
const COMPONENTA: Partial<Record<SectionKind, string>> = {
  announcement: `${SECTIUNI}/chrome/AnnouncementMarquee.tsx`,
  usp_strip: `${SECTIUNI}/chrome/UspStripIcons.tsx`,
  shipping_progress: `${SECTIUNI}/shipping/ShippingProgressBanner.tsx`,
  product_row: `${SECTIUNI}/products/ProductRowClassic.tsx`,
  benefits: `${SECTIUNI}/content/BenefitsClassic.tsx`,
  reviews: `${SECTIUNI}/content/ReviewsClassic.tsx`,
  gallery: `${SECTIUNI}/content/GalleryClassic.tsx`,
  about: `${SECTIUNI}/content/AboutClassic.tsx`,
  contact: `${SECTIUNI}/content/ContactClassic.tsx`,
};

type Comutator = {
  /** De unde citeste derivarea cheia. */
  sursa: "pc" | "features";
  /** `steag` = valoare booleana; `obiect` = `{ enabled }` in obiectul sectiunii. */
  forma: "steag" | "obiect";
  tipuri: Set<SectionKind>;
};

const ctx = (pageContent: Record<string, unknown>, features: Record<string, unknown>): DesignContext => ({
  primaryColor: "#07c527",
  pageContent,
  features,
});

const cuAnunt = (d: ReturnType<typeof buildClassicDesign>): SectionInstance[] =>
  [...(d.chrome.announcement ? [d.chrome.announcement] : []), ...d.home];

/** Cheile din care `defaults.ts` deriva `enabled`, cu forma lor si tipurile pe care le aprind. */
function comutatoareDerivate(): Map<string, Comutator> {
  const text = cod(DEFAULTS);
  const chei = new Map<string, "pc" | "features">();
  for (const m of text.matchAll(/\bpc\.(\w+)/g)) chei.set(m[1], "pc");
  for (const m of text.matchAll(/\bfeatures\.(\w+)/g)) chei.set(m[1], "features");

  const forme = [
    ["steag", true, false],
    ["obiect", { enabled: true }, { enabled: false }],
  ] as const;
  const out = new Map<string, Comutator>();
  for (const [cheie, unde] of chei) {
    for (const [forma, pornit, oprit] of forme) {
      const pune = (v: unknown) => (unde === "pc" ? ctx({ [cheie]: v }, {}) : ctx({}, { [cheie]: v }));
      const aprinse = cuAnunt(buildClassicDesign(pune(pornit)));
      const stinse = new Map(cuAnunt(buildClassicDesign(pune(oprit))).map((s) => [s.id, s.enabled]));
      const tipuri = new Set(aprinse.filter((s) => stinse.has(s.id) && stinse.get(s.id) !== s.enabled).map((s) => s.kind));
      if (tipuri.size > 0) {
        out.set(cheie, { sursa: unde, forma, tipuri });
        break;
      }
    }
  }
  return out;
}

test("derivarea are comutatoare de gasit (proba nu trece pe gol)", () => {
  const gasite = comutatoareDerivate();
  // Azi: banda de incredere, pragul, Recomandate, beneficiile, recenziile, bara de
  // anunt, galeria, despre si contactul. Mai putine = s-a schimbat forma derivarii.
  assert.ok(gasite.size >= 9, `doar ${gasite.size} comutatoare gasite: ${[...gasite.keys()].join(", ")}`);
});

test("⚠⚠ fiecare tip derivat din continut are componenta cunoscuta", () => {
  for (const [cheie, { tipuri }] of comutatoareDerivate()) {
    for (const tip of tipuri) {
      assert.ok(COMPONENTA[tip], `„${tip}" se deriva din „${cheie}", dar proba nu-i stie componenta`);
    }
  }
});

test("⚠⚠ componentele derivate nu mai verifica comutatorul vechi", () => {
  for (const [cheie, { sursa: unde, forma, tipuri }] of comutatoareDerivate()) {
    for (const tip of tipuri) {
      const fisier = COMPONENTA[tip]!;
      /*
       * O singura exceptie, o REZERVA: bara de anunt cade pe flagul vechi doar
       * cand pagina nu-si pune designul in context (`announcementOn` lipseste).
       * Acolo n-are cine sa citeasca `enabled` din design.
       */
      const text = cod(fisier).replace(/announcementOn \?\? bar\?\.enabled === true/g, "");
      if (unde === "features") {
        assert.doesNotMatch(text, new RegExp(`features\\.${cheie}\\b`), `${fisier} verifica inca features.${cheie}`);
      } else if (forma === "steag") {
        assert.doesNotMatch(text, new RegExp(`\\b${cheie}\\b`), `${fisier} citeste inca „${cheie}"`);
      } else {
        // Obiectul sectiunii ramane sursa CONTINUTULUI (titlu, randuri); doar
        // `enabled` din el nu mai are voie sa decida.
        assert.doesNotMatch(text, /\.enabled\b/, `${fisier} verifica inca „${cheie}.enabled"`);
      }
    }
  }
});

test("⚠ randurile de produse nu se mai filtreaza pe `enabled` din continut", () => {
  const text = cod("src/components/ministore/MiniStoreRenderer.tsx");
  const start = text.indexOf("const productSections = useMemo(");
  assert.ok(start >= 0, "nu gasesc lista de randuri in MiniStoreRenderer");
  const bloc = text.slice(start, text.indexOf("}, [", start));
  assert.doesNotMatch(bloc, /\.enabled\b/, "lista de randuri filtreaza inca dupa comutatorul din continut");
});
