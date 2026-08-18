import type { CSSProperties, ReactNode } from "react";
import {
  MiniaturaCategorii,
  MiniaturaClienti,
  MiniaturaComenzi,
  MiniaturaIntegrari,
  MiniaturaProduse,
} from "./MiniaturiMigrare";

/**
 * Arcul de plăci de deasupra titlului, în hero-ul paginii „Migrare magazin":
 * ce anume se mută, arătat înainte să fie citit.
 *
 * ═══ DE CE ARC, ȘI DE UNDE VINE ═══
 *
 * Referința dată de client (14.08) e un rând de plăci așezate pe o bandă curbă,
 * fiecare înclinată după curbă. Din ea s-au luat DOUĂ lucruri — arcul și plăcile
 * — și s-a lăsat restul: acolo plăcile sunt colorate fiecare altfel și stau pe o
 * panglică desenată, peste un fundal albastru. Aici fundalul e mesh-ul verde al
 * hero-ului, care e deja al paginii.
 *
 * Plăcile sunt ALBE, cerut explicit: aceleași ca în hero-ul paginii „Integrări".
 * Nu seamănă cu ele, sunt chiar ele — `caseta-sigla` din `globals.css` aduce
 * albul și umbra în patru straturi. Așa cele două hero-uri rămân din aceeași
 * platformă, iar dacă se schimbă cândva umbra, se schimbă în amândouă deodată.
 *
 * ⚠ FĂRĂ panglica de sub plăci. Pe fundalul din referință banda desparte plăcile
 * de albastru; aici ar fi o a treia formă albă peste un hero care are deja
 * lumina verde și, imediat dedesubt, un titlu de 66px. Arcul se citește oricum
 * din înclinare și din coborârea capetelor.
 *
 * ═══ CE E ÎNĂUNTRU: BUCĂȚI DIN PANOU, NU PICTOGRAME ═══
 *
 * Prima formă avea pictograme — `Package`, `Layers`, `Users`, `ShoppingCart`,
 * `Plug`. Erau limpezi și n-aveau nimic greșit, dar erau pictogramele oricui:
 * spuneau „produse", nu spuneau nimic despre unde ajung produsele. Acum fiecare
 * placă ține o bucată din panoul Edinio — un card de produs cu preț, un arbore
 * de categorii, două rânduri de clienți, două comenzi cu starea lor, două
 * integrări cu comutatorul pornit. Vezi `MiniaturiMigrare.tsx`.
 *
 * ⚠ ASTA A CERUT PLĂCI MAI MARI, și e schimbul care a făcut posibilă mutarea:
 * 46px erau destui pentru o pictogramă, dar nu pentru o interfață. Acum sunt
 * 78 → 92 → 112. Costul se vede mai jos, la plăcile care dispar pe telefon.
 *
 * ═══ GEOMETRIA ═══
 *
 * Cinci plăci pe un cerc, la 9° una de alta: −18°, −9°, 0°, +9°, +18°. Coborârea
 * fiecăreia e cea de pe cerc, `R × (1 − cos θ)`.
 *
 * ⚠ NU E ÎN PIXELI, ci în raport cu latura plăcii — socoteala și motivul sunt în
 * `globals.css`, la `.arc-placa`. Pe scurt: când plăcile cresc, crește și
 * distanța dintre ele, deci trebuie să crească și raza, altfel arcul se turtește
 * exact pe ecranul mare, unde se vede cel mai bine.
 *
 * Depărtarea pe orizontală o dă `gap`, egală, nu coarda cercului. Pe hârtie
 * capetele ar trebui strânse cu cos 18° = 0,951, adică 5% — sub doi pixeli la
 * depărtarea de aici. Nu merită o socoteală în plus.
 *
 * ⚠ `transform` NU MIȘCĂ NIMIC ÎN AȘEZARE: rotirea și coborârea sunt desen, deci
 * rândul își păstrează înălțimea plăcii nerotite. De aceea marginea de jos e mai
 * mare decât pare că trebuie — capătul rotit coboară cu aproape jumătate de placă
 * sub cutia lui, iar titlul începe la 24px sub rând.
 *
 * ═══ PE TELEFON RĂMÂN TREI ═══
 *
 * ⚠ Cinci plăci de 78px nu încap la 320px, cea mai îngustă lățime pe care o ține
 * site-ul: `5 × 78 + 4 × 6` = 414, plus capetele rotite, față de 280 utili. Nu e
 * o chestiune de gust, e aritmetică — la cinci plăci, latura maximă acolo e vreo
 * 46px, adică fix cât nu încape o interfață.
 *
 * Deci sub `sm` se ascunde PERECHEA DIN MIJLOC (±9°), nu capetele. Pare invers
 * decât te-ai aștepta, și e dinadins: perechea de la ±18° e cea care ține
 * curbura. Ascunzând-o pe ea ar fi rămas trei plăci la 0° și ±9°, adică 6px
 * diferență de nivel pe un rând de 250 — un rând drept cu o strâmbătură, nu un
 * arc. Așa, pe telefon rămân capetele și cheia, iar arcul se vede la fel de bine.
 *
 * Se pierd „Categorii" și „Comenzi" pe ecran mic. E o pierdere adevărată, dar e
 * cea mai mică: amândouă sunt scrise pe litere în descrierea de dedesubt, la două
 * rânduri distanță.
 */

interface Placa {
  /** Ce se transferă. Se aude la cititoarele de ecran; pe ecran nu se scrie. */
  eticheta: string;
  miniatura: ReactNode;
  /** Unghiul pe cerc, în grade. */
  rot: number;
  /**
   * Coborârea, ca RAPORT din latura plăcii: `5,92 × (1 − cos rot)`.
   * Vezi `.arc-placa` în `globals.css`.
   */
  coborare: number;
  /** Dispare sub `sm`. Vezi nota „Pe telefon rămân trei". */
  doarLarg?: boolean;
}

/**
 * ⚠ ORDINEA E CEA DIN PROPOZIȚIA CLIENTULUI, nu cea în care au fost cerute:
 * descrierea de sub titlu zice „Produse, categorii, clienți, comenzi și alte date
 * importante". Ochiul trece peste plăci, citește titlul și dă imediat peste
 * aceleași lucruri în aceeași ordine — o rimă mică, dar gratuită. „Integrări" stă
 * la capăt fiindcă e singurul care nu apare pe nume în propoziție; el e „alte date
 * importante".
 */
const PLACI: Placa[] = [
  { eticheta: "Produse", miniatura: <MiniaturaProduse />, rot: -18, coborare: 0.2895 },
  { eticheta: "Categorii", miniatura: <MiniaturaCategorii />, rot: -9, coborare: 0.0729, doarLarg: true },
  { eticheta: "Clienți", miniatura: <MiniaturaClienti />, rot: 0, coborare: 0 },
  { eticheta: "Comenzi", miniatura: <MiniaturaComenzi />, rot: 9, coborare: 0.0729, doarLarg: true },
  { eticheta: "Integrări", miniatura: <MiniaturaIntegrari />, rot: 18, coborare: 0.2895 },
];

/**
 * Cât așteaptă prima placă înainte să plece, în milisecunde.
 *
 * O bătaie scurtă, cât să nu pornească mișcarea chiar în prima zugrăveală a
 * paginii, peste schimbarea fontului. Sub o zecime de secundă nu se citește ca
 * așteptare, dar e destul cât mișcarea să înceapă pe o pagină deja așezată.
 */
const INTARZIERE_BAZA = 90;

/** Cât stă fiecare pereche după cea dinaintea ei. Vezi `variabile()`. */
const PAS_INTARZIERE = 65;

/**
 * Numerele unei plăci, ca variabile CSS. Așezarea și mișcarea sunt în
 * `globals.css`, la `.arc-placa` — aici doar se traduc datele.
 *
 * Același tipar ca la câmpul de sigle de pe „Integrări" (`CampSigle`), și din
 * același motiv: Tailwind nu poate genera clase din date, fiindcă scanerul lui
 * citește codul sursă, nu ce iese din el la randare.
 */
function variabile({ rot, coborare }: Placa): CSSProperties {
  /*
    ⚠ TREAPTA VINE DIN UNGHI, nu dintr-un câmp scris separat: 0 la mijloc, 1 la
    plăcile de 9°, 2 la cele de 18°. Așa întârzierea și poziția sunt același
    număr citit de două ori, deci nu se pot desincroniza. Cu o coloană în plus în
    tabel, cine ar fi schimbat un unghi ar fi lăsat în urmă o ordine care nu mai
    pleacă din mijloc — și e chiar felul de greșeală care nu se vede uitându-te
    la cod.
  */
  const treapta = Math.abs(rot) / 9;

  return {
    "--coborare": coborare,
    "--rot": `${rot}deg`,
    "--intarziere": `${INTARZIERE_BAZA + treapta * PAS_INTARZIERE}ms`,
  } as CSSProperties;
}

export function ArcMigrare() {
  return (
    /*
      Listă, nu un șir de `div`-uri: sunt cinci lucruri de același fel, iar
      cititorul de ecran anunță „listă cu 5 elemente" înainte să le înșire. Cu
      `div`-uri s-ar fi auzit cinci cuvinte răzlețe între titlu și pastilă.

      ⚠ `--latura` se dă AICI, o singură dată, și coboară prin moștenire la toate
      plăcile. Din ea ies latura, colțul, coborârea pe arc și punctul din care
      pleacă mișcarea — deci o singură valoare de schimbat, nu cinci reguli.

      Marginea de jos e mai mare decât pare că trebuie fiindcă plăcile de la
      capete coboară și se rotesc, iar `transform` nu spune nimic despre asta
      așezării: fără ea, colțul plăcii din margine ar fi intrat peste prima literă
      a titlului.
    */
    <ul
      aria-label="Ce se transferă în Edinio"
      className="mx-auto mb-10 flex items-start justify-center gap-1.5 [--latura:78px] sm:mb-12 sm:gap-2.5 sm:[--latura:92px] lg:mb-16 lg:gap-3 lg:[--latura:112px]"
    >
      {PLACI.map((placa) => (
        <li
          key={placa.eticheta}
          /*
            `caseta-sigla` ADUCE albul și umbra; nu se pune `bg-white` lângă ea.
            `arc-placa` aduce latura, colțul, așezarea pe cerc ȘI mișcarea de
            intrare — poziția de repaus e scrisă acolo, nu aici, tocmai ca oprirea
            animației la `prefers-reduced-motion` să nu lase plăcile în rând drept.

            ⚠ `@container` stă pe PLACĂ fiindcă miniatura dinăuntru se măsoară în
            procente din ea. Nu se poate pune pe miniatură: un element nu se poate
            măsura pe sine.
          */
          className={`arc-placa caseta-sigla @container overflow-hidden ${
            placa.doarLarg ? "hidden sm:block" : "block"
          }`}
          style={variabile(placa)}
        >
          {placa.miniatura}
          {/*
            Numele, doar pentru cititoarele de ecran.

            ⚠ NU e de prisos, deși descrierea de sub titlu enumeră aproape
            aceleași cuvinte: „Integrări" nu apare acolo. Iar o bucată de
            interfață nu se aude în niciun fel — fără rândul ăsta, cine ascultă
            pagina ar fi auzit „listă cu 5 elemente" și cinci elemente goale.
          */}
          <span className="sr-only">{placa.eticheta}</span>
        </li>
      ))}
    </ul>
  );
}
