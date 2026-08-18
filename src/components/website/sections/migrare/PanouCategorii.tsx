import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import {
  ARBORE_CATEGORII,
  TOTAL_PRODUSE_ARBORE,
  type NodCategorie,
} from "@/lib/website/migrare";

/**
 * Ilustrația secțiunii „Categorii": arborele de categorii, așa cum arată în panou.
 *
 * ═══ DE CE UN ARBORE ADEVĂRAT, ȘI NU O SCHEMĂ CU RAMURI ═══
 *
 * Cerut „premium și realist, să nu pară deloc vibe coded" (19.08). Lucrul care
 * face o ilustrație să pară scoasă dintr-un generator e tocmai schema: cutii
 * rotunjite legate cu linii curbe, așezate simetric, ca o organigramă. Nu seamănă
 * cu nimic din ce vede omul când își administrează magazinul — și niciun magazin
 * nu-și ține categoriile așa.
 *
 * Un arbore ADEVĂRAT arată altfel, și fiecare abatere de la organigramă e un semn
 * că cineva chiar a folosit unul:
 *
 * - **Linii de ghidaj verticale**, nu ramuri desenate. Coboară din dreptul
 *   săgeții părintelui și trec pe lângă toți copiii. Așa arată orice arbore de
 *   fișiere, fiindcă e singurul fel în care ochiul urmărește indentarea fără să
 *   numere pixeli.
 * - **Ramuri STRÂNSE și DESFĂCUTE amestecate.** Un arbore în care totul e deschis
 *   nu arată a arbore, arată a listă indentată. Săgeata întoarsă în jos față de
 *   cea în lateral e chiar diferența.
 * - **Numere care se adună.** Vezi nota din `migrare.ts`: copiii însumați dau
 *   părintele, iar cele trei rădăcini dau totalul din cap.
 * - **Un rând sub cursor**, cu fundal stins și mânerul de tras la stânga. Într-un
 *   panou de categorii, mânerul apare pe rândul peste care stai — fiindcă acolo
 *   ordinea chiar se schimbă trăgând. E genul de amănunt pe care o ilustrație
 *   inventată nu-l are, fiindcă nu știe de ce ar exista.
 * - **Cifre monospațiate** la numărătoare, aliniate la dreapta. Cu cifre
 *   obișnuite, un „48" și un „226" nu se aliniază niciodată, iar coloana arată
 *   strâmbă fără să se vadă de ce.
 *
 * ═══ FĂRĂ JAVASCRIPT, ȘI FĂRĂ SĂ PARĂ CĂ AR TREBUI ═══
 *
 * Nimic nu se apasă aici: e o ilustrație, nu un panou de-adevăratelea. De aceea
 * rândurile nu sunt butoane și n-au stare de hover — un desen care se aprinde sub
 * cursor promite că se poate face ceva cu el, iar când nu se întâmplă nimic e mai
 * rău decât dacă n-ar fi promis. Cursorul din desen e o STARE ZUGRĂVITĂ, nu una
 * care răspunde.
 *
 * ⚠ TOT ARBORELE E `aria-hidden`. Rostit, ar fi ieșit un șir de nume de raioane cu
 * cifre între titlu și buton. Ce se aude e propoziția de mai jos, care spune ce
 * arată desenul.
 */
export function PanouCategorii() {
  return (
    <div className="mx-auto w-full max-w-[420px] lg:max-w-none">
      <p className="sr-only">
        Un arbore de categorii cu trei niveluri, așa cum arată în administrarea
        magazinului: raioane, subcategorii și numărul de produse din fiecare.
      </p>

      <div
        aria-hidden="true"
        className="overflow-hidden rounded-[14px] border border-hairline bg-white"
      >
        {/*
          Capul panoului. Fără el, arborele plutește — un panou adevărat îți spune
          mereu ce listă privești și cât e de mare.
        */}
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
            Categorii
          </span>
          <span className="text-[11.5px] tabular-nums text-ink-3">
            {TOTAL_PRODUSE_ARBORE} produse
          </span>
        </div>

        <div className="p-2">
          {ARBORE_CATEGORII.map((nod) => (
            <Ramura key={nod.nume} nod={nod} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Ramura({ nod }: { nod: NodCategorie }) {
  const areCopii = nod.copii !== undefined;
  const desfacut = Boolean(nod.deschis && nod.copii?.length);

  return (
    <div>
      <div
        className={[
          "relative flex items-center gap-2 rounded-[6px] py-[6px] pr-2.5 pl-2",
          nod.subCursor ? "bg-tint-2" : "",
        ].join(" ")}
      >
        {/*
          Mânerul de tras, DOAR pe rândul sub cursor. Stă în afara curgerii, la
          stânga săgeții, exact ca într-un panou care lasă categoriile mutate cu
          mouse-ul: acolo apare din marginea rândului, nu împinge textul.
        */}
        {nod.subCursor ? (
          <GripVertical
            className="absolute -left-[3px] h-3.5 w-3.5 text-ink-3"
            strokeWidth={2}
          />
        ) : null}

        {/*
          Săgeata, sau un gol de aceeași lățime.

          ⚠ GOLUL E OBLIGATORIU la frunze: fără el, rândurile fără copii ar fi
          început cu 14px mai la stânga decât frățiorii lor, iar coloana de nume
          s-ar fi zimțat. Într-un arbore, alinierea numelor pe nivel e tot ce ține
          desenul în picioare.
        */}
        {areCopii ? (
          desfacut ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" strokeWidth={2.2} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-3" strokeWidth={2.2} />
          )
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}

        <span
          className={[
            "truncate text-[13px] leading-none tracking-[-0.01em]",
            /* Rădăcinile sunt mai apăsate: într-o listă cu trei niveluri, dacă
               toate rândurile au aceeași greutate, ierarhia rămâne doar în
               indentare — și se pierde din prima privire. */
            areCopii ? "font-medium text-ink" : "text-ink-2",
          ].join(" ")}
        >
          {nod.nume}
        </span>

        <span className="ml-auto shrink-0 text-[11.5px] tabular-nums text-ink-3">
          {nod.produse}
        </span>
      </div>

      {desfacut ? (
        /*
          Linia de ghidaj și indentarea copiilor.

          `ml-[15px]` NU e un număr ales din ochi: rândul are 8px de spațiere la
          stânga, iar săgeata 14px lățime, deci mijlocul ei cade la 8 + 7 = 15.
          Linia coboară fix din vârful săgeții părintelui — dacă se schimbă
          spațierea rândului sau mărimea săgeții, se schimbă și numărul ăsta.
        */
        <div className="ml-[15px] border-l border-hairline pl-[9px]">
          {nod.copii?.map((copil) => (
            <Ramura key={copil.nume} nod={copil} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
