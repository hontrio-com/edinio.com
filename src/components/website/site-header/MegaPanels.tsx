import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  COMPARE_FEATURED,
  COMPETITORS,
  MENU_INDUSTRY_LINKS,
  RESOURCES,
  RESOURCES_FEATURED,
  SOLUTION_COLUMNS,
  SOLUTION_FEATURED,
} from "@/lib/website/nav";
import {
  ColumnHeading,
  CompactLink,
  CompareItem,
  FeaturedPanel,
  HelpStrip,
  MegaItem,
} from "./MenuPieces";

/**
 * Cele trei panouri ale mega menu-ului.
 *
 * Toate au ACEEASI latime (1140px) si, centrate, cad exact peste containerul
 * barei de sus: marginea din stanga a panoului se aliniaza cu sigla, cea din
 * dreapta cu butonul. Am incercat intai o latime pe masura fiecarui panou, dar
 * cele mici pluteau in mijlocul ecranului, fara legatura cu intrarea care le
 * deschidea. Latimea comuna arata intentionat, nu intamplator.
 *
 * Fiecare panou are aceeasi impartire: continut la stanga, un panou de
 * promovare la dreapta.
 *
 * Cat se vede in meniu vs cat exista: in meniu intra doar sase industrii, alese
 * in `MENU_INDUSTRY_LINKS`, ca inaltimea coloanei sa nu depaseasca restul
 * panoului. Toate noua se vad pe `/industrii`.
 */

/** Impartirea comuna: continut la stanga, promovare la dreapta. */
const SPLIT = "grid grid-cols-[minmax(0,1fr)_minmax(0,0.34fr)] gap-x-5 p-5";

/**
 * Cartonul alb, umbrit, in care sta orice panou.
 *
 * Banda de ajutor e aici, nu in fiecare panou: asa apare la fel in toate trei si
 * nu se poate uita la urmatorul panou pe care il adaugam.
 */
function PanelCard({
  children,
  onNavigate,
}: {
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    /* `pointer-events-auto` reia mouse-ul de la invelis. Vezi nota din SiteHeader. */
    <div className="pointer-events-auto mx-auto w-full max-w-[1140px] overflow-hidden rounded-[20px] border border-hairline bg-white shadow-[0_24px_64px_-16px_rgba(10,10,10,0.16),0_6px_18px_-8px_rgba(10,10,10,0.07)]">
      {children}
      <HelpStrip onNavigate={onNavigate} />
    </div>
  );
}

export function SolutionPanel({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <PanelCard onNavigate={onNavigate}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.62fr)_minmax(0,0.95fr)] gap-x-5 p-5">
        {SOLUTION_COLUMNS.map((column) => (
          <div key={column.heading}>
            <ColumnHeading>{column.heading}</ColumnHeading>
            <div className="flex flex-col">
              {column.items.map((item) => (
                <MegaItem key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}

        {/* Industrii — lista compacta, fara descrieri, plus trimitere la toate. */}
        <div className="flex flex-col">
          <ColumnHeading>Industrii</ColumnHeading>
          <div className="flex flex-col">
            {MENU_INDUSTRY_LINKS.map((link) => (
              <CompactLink key={link.href} link={link} onNavigate={onNavigate} />
            ))}
          </div>
          <div className="mt-2 border-t border-hairline pt-2">
            <Link
              href="/industrii"
              onClick={onNavigate}
              className="group flex items-center gap-1.5 rounded-lg px-3 py-[7px] text-[13px] font-semibold leading-5 text-ink transition-colors duration-150 hover:bg-tint-2"
            >
              Vezi toate industriile
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        <FeaturedPanel featured={SOLUTION_FEATURED} onNavigate={onNavigate} />
      </div>
    </PanelCard>
  );
}

export function ComparePanel({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <PanelCard onNavigate={onNavigate}>
      <div className={cn(SPLIT)}>
        <div>
          <ColumnHeading>Compară Edinio cu</ColumnHeading>
          <div className="grid grid-cols-3 gap-x-2">
            {COMPETITORS.map((item) => (
              <CompareItem key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>

        <FeaturedPanel featured={COMPARE_FEATURED} onNavigate={onNavigate} />
      </div>
    </PanelCard>
  );
}

export function ResourcesPanel({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <PanelCard onNavigate={onNavigate}>
      <div className={cn(SPLIT)}>
        <div>
          <ColumnHeading>Resurse</ColumnHeading>
          <div className="grid grid-cols-2 gap-x-2">
            {RESOURCES.map((item) => (
              <MegaItem key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>

        <FeaturedPanel featured={RESOURCES_FEATURED} onNavigate={onNavigate} />
      </div>
    </PanelCard>
  );
}
