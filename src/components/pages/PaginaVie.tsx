"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BLOCK_META, type Block } from "@/lib/pages/blocks.types";
import { cheieAnimatie } from "@/lib/pages/animatii";
import { sanitizeCss } from "@/lib/pages/sanitize-css";
import { titlulPrincipal } from "@/lib/pages/titlul-principal";
import {
  BLOC_ATTR,
  ETICHETA_ATTR,
  PREVIEW_MESSAGE,
  SECTION_ATTR,
  cheiaPaginiiProprii,
  idBloc,
  isPreviewMessage,
  type DatePrevizualizarePagina,
} from "@/lib/storefront/design/preview-protocol";
import { BlockRenderer, type BlockRendererCtx } from "./BlockRenderer";

/** Numele continutului unei pagini proprii in arbore si pe contur (etapa 5). */
export const ETICHETA_CONTINUT_LIBER = "Conținut liber";

const FARA_DATE: DatePrevizualizarePagina = { products: [], bundles: [], forms: [], plati: [], curieri: [] };

/**
 * Pagina proprie in previzualizarea editorului unic (etapa 5 din `docs/editor-magazin/PLAN.md`).
 *
 * Pana trimite editorul blocurile lui, arata pagina randata pe server (`children`); apoi randeaza
 * blocurile primite, nesalvate inca, prin acelasi `BlockRenderer`, cu datele de previzualizare ale
 * editorului de pagini. Marcajele (continutul `pagina:<id>`, fiecare bloc `pagina:<id>/<bloc>`) fac
 * clicul si conturul sa mearga ca in restul editorului.
 *
 * ⚠ Ruta o pune DOAR in modul editor (proprietarul, cu semnele de editor). Pe magazinul public
 * pagina se randeaza pe server, ca inainte, si nimeni nu asculta mesajele.
 */
export function PaginaVie({ pageId, cssInitial, ctx, children }: {
  pageId: string;
  /** CSS-ul salvat al paginii, pana vine cel din editor. */
  cssInitial: string;
  /** Ce nu se schimba din editor: culoarea, adresele, retelele, magazinul. */
  ctx: Pick<BlockRendererCtx, "color" | "basePath" | "storeSlug" | "social" | "businessId" | "estePaginaAcasa">;
  children: ReactNode;
}) {
  const [viu, setViu] = useState<{ blocks: Block[]; css: string; date: DatePrevizualizarePagina; reluari: Record<string, number> } | null>(null);

  useEffect(() => {
    function laMesaj(e: MessageEvent) {
      if (e.origin !== window.location.origin || !isPreviewMessage(e.data)) return;
      const mesaj = e.data;
      // Doar pentru pagina asta: alta pagina deschisa in editor nu-si muta blocurile aici.
      if (mesaj[PREVIEW_MESSAGE] !== "pagina" || mesaj.id !== pageId) return;
      setViu((inainte) => ({ blocks: mesaj.blocks, css: mesaj.css, date: mesaj.date ?? inainte?.date ?? FARA_DATE, reluari: mesaj.reluari ?? {} }));
    }
    window.addEventListener("message", laMesaj);
    return () => window.removeEventListener("message", laMesaj);
  }, [pageId]);

  const sectiune = cheiaPaginiiProprii(pageId);
  const css = sanitizeCss(viu ? viu.css : cssInitial);
  const marcheazaBloc = (b: Block, continut: ReactNode) => (
    // Cheia animatiei: o animatie aleasa sau reluata remonteaza blocul, iar scriptul paginii il porneste.
    <div key={cheieAnimatie(b, viu?.reluari[b.id] ?? 0)} {...{ [BLOC_ATTR]: idBloc(sectiune, b.id), [ETICHETA_ATTR]: BLOCK_META[b.type]?.label ?? b.type }} className="contents">
      {continut}
    </div>
  );

  return (
    <div {...{ [SECTION_ATTR]: sectiune, [ETICHETA_ATTR]: ETICHETA_CONTINUT_LIBER }} className="contents">
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      {viu ? (
        <BlockRenderer
          blocks={viu.blocks}
          ctx={{ ...ctx, ...viu.date, pageId, preview: true, h1Id: titlulPrincipal(viu.blocks), marcheazaBloc }}
        />
      ) : children}
    </div>
  );
}
