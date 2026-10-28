"use client";

import { ArrowLeft, Plus, Settings2 } from "lucide-react";
import { BlockSettings } from "@/components/pages/BlockSettings";
import { FurnizorLegaturi } from "@/components/pages/editor/CampLink";
import { RedaAnimatia } from "@/components/pages/editor/ControaleAspect";
import { toateClaseleDeFont } from "@/components/pages/fonturi-incarcate";
import { IconitaBloc, PaletaBlocuri } from "@/components/pages/PaletaBlocuri";
import { SetariPagina } from "@/components/pages/SetariPagina";
import { BLOCK_META, type Block, type BlockType, type SectiuneAcasa } from "@/lib/pages/blocks.types";
import { updateBlockInTree } from "@/lib/pages/block-tree";
import type { DateBlocuri, DateEditorPagina } from "@/lib/pages/date-editor-pagina";
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

function Antet({ titlu, subtitlu, icon, onInapoi, inapoiLa = "pagină" }: {
  titlu: string; subtitlu: string; icon: React.ReactNode; onInapoi: () => void;
  /** Unde duce sageata, pentru cititoarele de ecran: „pagină” sau „conținut” (etapa 9). */
  inapoiLa?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onInapoi} aria-label={`Înapoi la ${inapoiLa}`}
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

const integrariSetari = (d: DateBlocuri) => ({
  furnizori: d.integrari.furnizori,
  plati: d.integrari.plati.map((m) => m.nume),
  curieri: d.integrari.curieri.map((m) => m.nume),
});

/**
 * Setarile unui bloc (`BlockSettings`), pe orice lista de blocuri: o pagina proprie sau un „Conținut
 * liber” din magazin (etapa 9). `onSchimba` aplica modificarea acolo unde sta lista.
 */
export function PanouBlocComun({ bloc, date, loc, inapoiLa, onSchimba, onInapoi, onRedaAnimatia }: {
  bloc: Block;
  date: DateBlocuri;
  /** Unde sta blocul, in cuvinte: titlul paginii sau locul continutului. */
  loc: string;
  inapoiLa?: string;
  /** O modificare a blocului; `cheie` tine campurile atinse: tastarea intr-un camp e un singur pas la Anuleaza. */
  onSchimba: (patch: Partial<Block>, cheie: string) => void;
  onInapoi: () => void;
  /** „Redă animația”: blocul se remonteaza in previzualizare (`cheieAnimatie`). */
  onRedaAnimatia: () => void;
}) {
  const eticheta = BLOCK_META[bloc.type]?.label ?? bloc.type;
  const rezumat = rezumatBloc(bloc);
  return (
    <FurnizorLegaturi value={{ businessId: date.business.id, ...date.legaturi }}>
      {/* Toate clasele de font: lista de fonturi se arata fiecare in fontul lui, ca in editorul de pagini. */}
      <div className={cn("space-y-5 pb-6", toateClaseleDeFont())}>
        <Antet titlu={eticheta} subtitlu={rezumat ? `${loc} · ${rezumat}` : loc} inapoiLa={inapoiLa}
          icon={<IconitaBloc tip={bloc.type} className="h-4 w-4" />} onInapoi={onInapoi} />
        <RedaAnimatia.Provider value={onRedaAnimatia}>
          <BlockSettings
            key={bloc.id}
            block={bloc}
            onChange={(patch) => onSchimba(patch, `bloc:${bloc.id}:${Object.keys(patch).sort().join(",")}`)}
            categories={date.categorii}
            forms={date.forms}
            businessId={date.business.id}
            isAdmin={date.isAdmin}
            integrari={integrariSetari(date)}
            pachete={date.pachete}
            randuriProduse={date.randuriProduse}
          />
        </RedaAnimatia.Provider>
      </div>
    </FurnizorLegaturi>
  );
}

/** Blocul unei pagini proprii (etapa 5): modificarea intra in pagina deschisa. */
export function PanouBlocPagina({ bloc, pagina, date, titluPagina, onInapoi, onRedaAnimatia }: {
  bloc: Block;
  pagina: PaginaDeschisa;
  date: DateEditorPagina;
  titluPagina: string;
  onInapoi: () => void;
  onRedaAnimatia: () => void;
}) {
  return (
    <PanouBlocComun bloc={bloc} date={date} loc={titluPagina} onInapoi={onInapoi} onRedaAnimatia={onRedaAnimatia}
      onSchimba={(patch, cheie) => pagina.aplica((s: StarePagina) => ({ ...s, blocks: updateBlockInTree(s.blocks, bloc.id, patch) }), cheie)} />
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

/**
 * Un bloc de integrare se poate adauga numai cand integrarea lui e activa. Fara date (galeria de pe
 * Acasa, cat se incarca), toate stinse: blocurile lor apar oricum, cu ce trebuie conectat.
 */
export function integrariActive(date: DateBlocuri | null): Record<string, boolean> {
  return {
    newsletter: (date?.integrari.furnizori.length ?? 0) > 0,
    payments: (date?.integrari.plati.length ?? 0) > 0,
    couriers: (date?.integrari.curieri.length ?? 0) > 0,
  };
}

export function PanouAdaugaBloc({ tinta, date, estePaginaAcasa = false, laSfarsit = "La sfârșitul paginii", locText, onBloc, onAcasa, onInapoi, inapoiLa }: {
  tinta: TintaBloc;
  date: DateBlocuri;
  estePaginaAcasa?: boolean;
  /** Unde intra blocul fara `dupa`: intr-un „Conținut liber” e sfarsitul continutului, nu al paginii. */
  laSfarsit?: string;
  /** Locul spus intreg, cand blocul intra intr-un „Conținut liber” nou (etapa 10, „+” de sub produs). */
  locText?: string;
  onBloc: (tip: BlockType) => void;
  /** Sectiunile paginii principale: doar la paginile proprii; lipsa = grupul nu apare (etapa 9). */
  onAcasa?: (sectiune: SectiuneAcasa) => void;
  onInapoi: () => void;
  inapoiLa?: string;
}) {
  const integrareActiva = integrariActive(date);
  return (
    <div className="space-y-5 pb-6">
      <Antet
        titlu={tinta.fel === "coloana" ? "Adaugă în coloană" : "Adaugă un bloc"}
        subtitlu={locText ?? [
          tinta.fel === "coloana" ? `Coloana ${tinta.coloana + 1}` : null,
          // „deasupra” vine doar din „+”-ul de sus din previzualizare (etapa 10).
          tinta.dupa ? `sub „${tinta.dupa}”` : tinta.inainte ? `deasupra „${tinta.inainte}”` : tinta.fel === "sus" ? laSfarsit : null,
        ].filter(Boolean).join(", ")}
        icon={<Plus className="h-4 w-4" />}
        onInapoi={onInapoi}
        inapoiLa={inapoiLa}
      />
      <PaletaBlocuri
        inColoana={tinta.fel === "coloana"}
        estePaginaAcasa={estePaginaAcasa}
        integrareActiva={integrareActiva}
        onBloc={onBloc}
        onAcasa={onAcasa}
      />
    </div>
  );
}
