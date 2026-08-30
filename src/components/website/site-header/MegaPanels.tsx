import { cn } from "@/lib/utils/cn";
import {
  COMPARE_FEATURED,
  COMPETITORS,
  RESOURCES,
  RESOURCES_FEATURED,
  SOLUTION_COLUMNS,
  SOLUTION_FEATURED,
} from "@/lib/website/nav";
import {
  ColumnHeading,
  CompareItem,
  FeaturedPanel,
  HelpStrip,
  MegaItem,
} from "./MenuPieces";

/**
 * Cele trei panouri ale mega menu-ului.
 *
 * Toate PORNESC din acelasi invelis de 1140px, care cade exact peste containerul
 * barei de sus: marginea din stanga se aliniaza cu sigla, cea din dreapta cu
 * butonul. „De ce noi" si „Resurse" il umplu; „Solutie eCommerce" e strans la
 * 880px din 30.08, dupa ce industriile au iesit din el.
 *
 * ⚠ Un carton mai ingust NU pluteste in mijlocul ecranului, cum patea prima
 * incercare de latimi pe masura fiecarui panou. Cauza de atunci era `mx-auto`,
 * nu latimea: acum centrarea sta pe invelis, iar cartonul se aliniaza la stanga
 * in el. Amanuntul, la `PanelCard`.
 *
 * Fiecare panou are aceeasi impartire: continut la stanga, un panou de
 * promovare la dreapta.
 *
 * ⚠ INDUSTRIILE AU IESIT DIN MENIU, si de pe desktop, si de pe telefon. Paginile
 * raman si raman legate din subsol, care e pe fiecare pagina, deci n-au ramas
 * orfane pentru Google.
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
  latime,
}: {
  children: React.ReactNode;
  onNavigate?: () => void;
  /** Latimea cartonului, cand nu se vrea cea plina. Vezi nota de mai jos. */
  latime?: string;
}) {
  return (
    /*
      ═══ UN CARTON MAI INGUST SE ALINIAZA LA STANGA, NU SE CENTREAZA ═══

      Nota de sus spune ca toate panourile au fost facute la fel de late fiindca
      unul mic „plutea in mijlocul ecranului, fara legatura cu intrarea care il
      deschidea". Adevarat, dar cauza nu era latimea, era `mx-auto`: un carton
      centrat pe ecran n-are de unde sa stie unde e intrarea din bara.

      Deci invelisul pastreaza latimea plina si centrarea, iar cartonul sta in
      coltul lui din stanga. Marginea lui din stanga cade exact peste sigla, la
      fel ca la panourile late. Ingust sau lat, panoul atarna de bara.
    */
    <div className="mx-auto w-full max-w-[1140px]">
      {/* `pointer-events-auto` reia mouse-ul de la invelis. Vezi nota din SiteHeader. */}
      <div
        className={cn(
          "pointer-events-auto w-full overflow-hidden rounded-[20px] border border-hairline bg-white shadow-[0_24px_64px_-16px_rgba(10,10,10,0.16),0_6px_18px_-8px_rgba(10,10,10,0.07)]",
          latime,
        )}
      >
        {children}
        <HelpStrip onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function SolutionPanel({ onNavigate }: { onNavigate?: () => void }) {
  return (
    /*
      ⚠ MAI INGUST DECAT CELELALTE DOUA, dinadins (cerut 30.08).

      Industriile au iesit din panou, deci au ramas doua coloane de cate doua
      intrari si cardul de promovare. Pe 1140px, atat continut lasa un gol lat
      cat inca o coloana, iar panoul arata a ceva din care s-a sters ceva — chiar
      asa si era. Stranse la 880px, aceleasi intrari arata alese, nu ramase.

      Latimea e a PANOULUI, nu a intrarilor: coloanele isi pastreaza masura, doar
      cartonul nu se mai intinde dupa ele.
    */
    <PanelCard onNavigate={onNavigate} latime="max-w-[580px]">
      <div className="grid grid-cols-2 gap-x-5 px-5 pt-5">
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
      </div>

      {/*
        Integrarile stau DEDESUBT, ca banda pe toata latimea (cerut 30.08).

        Cat au stat in dreapta, latimea lor minima tinea panoul deschis la peste
        800px oricat de putin continut aveau coloanele. Coborate, ele se intind
        dupa panou in loc sa-l intinda pe el, iar cele doua coloane pot ajunge la
        580px, adica exact cat le trebuie.
      */}
      <div className="px-5 pb-5 pt-4">
        <FeaturedPanel featured={SOLUTION_FEATURED} onNavigate={onNavigate} asezare="banda" />
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
