"use client";

import { ArrowLeft, Plus, Settings2 } from "lucide-react";
import { BlockSettings } from "@/components/pages/BlockSettings";
import { FurnizorLegaturi } from "@/components/pages/editor/CampLink";
import { toateClaseleDeFont } from "@/components/pages/fonturi-incarcate";
import { IconitaBloc, PaletaBlocuri } from "@/components/pages/PaletaBlocuri";
import { SetariPagina } from "@/components/pages/SetariPagina";
import { BLOCK_META, type Block, type BlockType, type SectiuneAcasa } from "@/lib/pages/blocks.types";
import { updateBlockInTree } from "@/lib/pages/block-tree";
import type { DateEditorPagina } from "@/lib/pages/date-editor-pagina";
import { rezumatBloc, type StarePagina } from "@/lib/editor-magazin/pagina-proprie";
import { cn } from "@/lib/utils/cn";
import { RandComutator } from "./continut/ui";
import type { TintaBloc } from "./ArborePagina";
import type { PaginaDeschisa } from "./usePaginaProprie";

/**
 * Panourile unei pagini proprii in editorul unic (etapa 5 din `docs/editor-magazin/PLAN.md`): blocul,
 * setarile paginii si „Adaugă bloc”. Folosesc piesele editorului de pagini de pana acum
 * (`BlockSettings`, `SetariPagina`, `PaletaBlocuri`), deci un bloc se regleaza exact ca inainte.
 */

function Antet({ titlu, subtitlu, icon, onInapoi }: { titlu: string; subtitlu: string; icon: React.ReactNode; onInapoi: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onInapoi} aria-label="Înapoi la pagină"
        className="shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
        <ArrowLeft className="h-4 w-4" />
      </button>
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-foreground leading-snug break-words">{titlu}</h2>
        <p className="text-[11px] text-muted-foreground leading-snug break-words">{subtitlu}</p>
      </div>
    </div>
  );
}

const integrariSetari = (d: DateEditorPagina) => ({
  furnizori: d.integrari.furnizori,
  plati: d.integrari.plati.map((m) => m.nume),
  curieri: d.integrari.curieri.map((m) => m.nume),
});

export function PanouBlocPagina({ bloc, pagina, date, titluPagina, onInapoi }: {
  bloc: Block;
  pagina: PaginaDeschisa;
  date: DateEditorPagina;
  titluPagina: string;
  onInapoi: () => void;
}) {
  const eticheta = BLOCK_META[bloc.type]?.label ?? bloc.type;
  const rezumat = rezumatBloc(bloc);
  return (
    <FurnizorLegaturi value={{ businessId: date.business.id, ...date.legaturi }}>
      {/* Toate clasele de font: lista de fonturi se arata fiecare in fontul lui, ca in editorul de pagini. */}
      <div className={cn("space-y-5 pb-6", toateClaseleDeFont())}>
        <Antet titlu={eticheta} subtitlu={rezumat ? `${titluPagina} · ${rezumat}` : titluPagina}
          icon={<IconitaBloc tip={bloc.type} className="h-4 w-4" />} onInapoi={onInapoi} />
        <BlockSettings
          key={bloc.id}
          block={bloc}
          // Cheia tine campurile atinse: tastarea intr-un camp e un singur pas la Anuleaza.
          onChange={(patch) => pagina.aplica(
            (s: StarePagina) => ({ ...s, blocks: updateBlockInTree(s.blocks, bloc.id, patch) }),
            `bloc:${bloc.id}:${Object.keys(patch).sort().join(",")}`,
          )}
          categories={date.categorii}
          forms={date.forms}
          businessId={date.business.id}
          isAdmin={date.isAdmin}
          integrari={integrariSetari(date)}
          pachete={date.pachete}
          randuriProduse={date.randuriProduse}
        />
      </div>
    </FurnizorLegaturi>
  );
}

export function PanouPagina({ stare, pagina, date, onInapoi }: {
  stare: StarePagina;
  pagina: PaginaDeschisa;
  date: DateEditorPagina;
  onInapoi: () => void;
}) {
  const publicBase = date.business.custom_domain ? `https://${date.business.custom_domain}` : `https://edinio.com/${date.business.slug}`;
  return (
    <div className="space-y-5 pb-6">
      <Antet titlu="Setările paginii" subtitlu={stare.titlu || "Pagină fără titlu"} icon={<Settings2 className="h-4 w-4" />} onInapoi={onInapoi} />
      <RandComutator
        titlu="Publicată"
        ajutor="Stinsă, pagina o vezi doar tu, aici în editor. Se aplică la Salvează pagina."
        pornit={stare.publicata}
        onSchimba={(v) => pagina.aplica((s) => ({ ...s, publicata: v }), "publicata")}
      />
      <SetariPagina
        title={stare.titlu}
        slug={stare.slug}
        seo={stare.seo}
        css={stare.css}
        publicBase={publicBase}
        blocks={stare.blocks}
        onTitle={(v) => pagina.aplica((s) => ({ ...s, titlu: v }), "titlu")}
        onSlug={(v) => pagina.aplica((s) => ({ ...s, slug: v }), "slug")}
        onSeo={(v) => pagina.aplica((s) => ({ ...s, seo: v }), "seo")}
        onCss={(v) => pagina.aplica((s) => ({ ...s, css: v }), "css")}
      />
    </div>
  );
}

export function PanouAdaugaBloc({ tinta, date, onBloc, onAcasa, onInapoi }: {
  tinta: TintaBloc;
  date: DateEditorPagina;
  onBloc: (tip: BlockType) => void;
  onAcasa: (sectiune: SectiuneAcasa) => void;
  onInapoi: () => void;
}) {
  // Un bloc de integrare se poate adauga numai cand integrarea lui e activa.
  const integrareActiva: Record<string, boolean> = {
    newsletter: date.integrari.furnizori.length > 0,
    payments: date.integrari.plati.length > 0,
    couriers: date.integrari.curieri.length > 0,
  };
  return (
    <div className="space-y-5 pb-6">
      <Antet
        titlu={tinta.fel === "coloana" ? "Adaugă în coloană" : "Adaugă un bloc"}
        subtitlu={tinta.fel === "coloana" ? `Coloana ${tinta.coloana + 1}` : "La sfârșitul paginii; îl muți apoi cu săgețile"}
        icon={<Plus className="h-4 w-4" />}
        onInapoi={onInapoi}
      />
      <PaletaBlocuri
        inColoana={tinta.fel === "coloana"}
        estePaginaAcasa={date.estePaginaAcasa}
        integrareActiva={integrareActiva}
        onBloc={onBloc}
        onAcasa={onAcasa}
      />
    </div>
  );
}
