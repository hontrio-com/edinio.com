import "server-only";

import { curataHtmlPentruEditor } from "@/lib/pages/prepare-blocks";
import { TIPURI_CONTINUT } from "./blocuri";
import { parseBlocuriLibere } from "./continut-liber";

/**
 * Blocurile „Conținut liber” (etapa 9) curatate pentru EDITOR, ca blocurile unei pagini proprii
 * (`curataHtmlPentruEditor`): editorul si previzualizarea le randeaza pe originea panoului, iar
 * proprietarul le poate scrie direct in baza, pe langa editor. Un `<img onerror>` ar fi rulat la el
 * sau la un admin intrat prin impersonare.
 *
 * Merge pe un design citit sau pe unul BRUT (o versiune din istoric): se uita doar in locurile unde stau
 * continuturile (sectiunile `continut_liber`, blocurile-container ale paginilor) si nu atinge nimic
 * altceva, deci nu schimba designul pentru comparatiile editorului.
 */
export function curataContinutulPentruEditor<T>(design: T): T {
  if (!esteObiect(design)) return design;
  const d = design as Record<string, unknown>;
  const curat = (setari: unknown) => {
    const o = esteObiect(setari) ? setari : {};
    return { ...o, blocuri: curataHtmlPentruEditor(parseBlocuriLibere(o.blocuri)) };
  };
  const peSectiune = (s: unknown): unknown => {
    if (!esteObiect(s)) return s;
    if (s.kind === "continut_liber") return { ...s, settings: curat(s.settings) };
    if (!Array.isArray(s.blocks)) return s;
    return {
      ...s,
      blocks: s.blocks.map((b) => (esteObiect(b) && typeof b.type === "string" && TIPURI_CONTINUT.has(b.type) ? { ...b, settings: curat(b.settings) } : b)),
    };
  };
  const produs = esteObiect(d.product) ? d.product : null;
  const magazin = esteObiect(d.shop) ? d.shop : null;
  return {
    ...d,
    ...(Array.isArray(d.home) ? { home: d.home.map(peSectiune) } : {}),
    ...(produs ? {
      product: {
        ...produs,
        page: peSectiune(produs.page),
        ...(Array.isArray(produs.sabloane)
          ? { sabloane: produs.sabloane.map((s) => (esteObiect(s) ? { ...s, page: peSectiune(s.page) } : s)) }
          : {}),
      },
    } : {}),
    ...(magazin ? { shop: { ...magazin, page: peSectiune(magazin.page) } } : {}),
  } as T;
}

function esteObiect(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
