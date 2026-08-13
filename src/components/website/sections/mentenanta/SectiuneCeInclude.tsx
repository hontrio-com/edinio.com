import { cn } from "@/lib/utils/cn";
import {
  MENTENANTA_ASEZARE,
  MENTENANTA_LEAD,
  MENTENANTA_TITLU,
  cardMentenanta,
  type CardMentenanta,
} from "@/lib/website/mentenanta";
import { IlustratieMentenanta } from "./IlustratiiMentenanta";

/**
 * „Ce include" — trei carduri: două mari alături, unul lat sub ele.
 *
 * ═══ CE ERA ÎNAINTE, ȘI DE CE NU MAI E ═══
 *
 * Erau patru file care se schimbau la trecerea cu mausul: la stânga titlurile,
 * la dreapta un panou care se muta cu o animație. Clientul a cerut (13.08) altă
 * așezare, după o referință trimisă de el, iar schimbarea nu e doar de formă:
 *
 * — La file, se vedea UNUL SINGUR odată. Ce include mentenanța se citea pe
 *   bucăți, și numai dacă omul se plimba cu mausul peste listă. Acum se văd
 *   toate trei deodată, ceea ce e chiar întrebarea la care răspunde secțiunea.
 * — Fără file, nu mai e nevoie de stare, de măsurat butoane, de marcaj care
 *   alunecă. Secțiunea s-a întors la o piesă de server, fără JavaScript propriu.
 *   Singurul cod care mai rulează în browser e cel din ilustrații.
 *
 * ═══ ALB, NU CENUȘIU ═══
 *
 * ⚠ Cerut anume: „cu alb, fără acel gri". În referință, cardul dinafară e
 * cenușiu și panoul dinăuntru alb — de acolo vine deosebirea dintre ele. Aici
 * amândouă sunt albe, deci deosebirea o face LINIA. E și limbajul restului
 * site-ului: un card alb cu fir subțire, iar înăuntru încă unul.
 *
 * Panoul ilustrației stătea pe `bg-tint`; acum e alb. Rămâne cenușie doar banda
 * de titlu dinăuntrul panoului desenat — aia e parte din desen, nu din card:
 * fără ea, panoul n-ar mai semăna cu o fereastră de program.
 *
 * ⚠ TREI LOCURI, PATRU TEXTE. Care rămâne pe dinafară se hotărăște în
 * `MENTENANTA_ASEZARE` (`lib/website/mentenanta.ts`), nu aici — acolo scrie și
 * de ce.
 */

export function SectiuneCeInclude() {
  const [stanga, dreapta] = MENTENANTA_ASEZARE.mari;

  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            {MENTENANTA_TITLU}
          </h2>
          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            {MENTENANTA_LEAD}
          </p>
        </div>

        {/* ── Cele două mari, alături ── */}
        <div className="mt-12 grid grid-cols-1 gap-6 lg:mt-16 lg:grid-cols-2">
          <Card card={cardMentenanta(stanga)} />
          <Card card={cardMentenanta(dreapta)} />
        </div>

        {/* ── Cel lat, dedesubt ── */}
        <div className="mt-6">
          <Card card={cardMentenanta(MENTENANTA_ASEZARE.lat)} lat />
        </div>
      </div>
    </section>
  );
}

/**
 * Un card.
 *
 * ⚠ ACELAȘI COMPONENT ȘI PENTRU CELE MARI, ȘI PENTRU CEL LAT. Ce se schimbă e
 * doar CUM SE AȘAZĂ cele două părți: la cele mari, textul deasupra ilustrației;
 * la cel lat, unul lângă altul. Două componente ar fi însemnat două locuri unde
 * se schimbă un chenar sau o spațiere, iar al doilea s-ar fi uitat.
 */
function Card({ card, lat }: { card: CardMentenanta; lat?: boolean }) {
  return (
    <article
      className={cn(
        /*
          ⚠ UMBRA E CEA DE PE PAGINA DE START (`.feature-card-shadow`), nu una
          nouă. Clientul a cerut carduri „mai premium", iar tentația era să scriu
          încă o rețetă de umbră — a treia din proiect, după cea a casetelor de
          sigle (`--umbra-placa`) și asta.

          Nu se poate: nota din `globals.css` cere ca toate umbrele de pe site să
          tragă în aceeași direcție, fiindcă o sursă de lumină care se schimbă de
          la un obiect la altul e chiar lucrul care le face să pară desenate, nu
          așezate. Iar aici e chiar cazul rețetei ăsteia — un card alb, mare, pe
          o pagină albă, exact ca alea de pe pagina de start.

          Trei straturi: o linie de contact de 1px, o umbră apropiată care spune
          că e ridicat de pe pagină, și una largă și adâncă (64px, dusă în jos cu
          34) care dă greutatea. Ultima e cea care face diferența dintre „card" și
          „chenar".
        */
        "feature-card-shadow flex flex-col rounded-[22px] border border-hairline bg-white p-6 sm:p-8",
        /* Cel lat: text la stânga, ilustrație la dreapta, dar abia de la `lg`.
           Sub atât, un card lat n-are lățime de împărțit și se așază ca celelalte. */
        lat && "lg:grid lg:grid-cols-2 lg:items-center lg:gap-10 lg:p-10",
      )}
    >
      {/*
        Spațiul dintre text și ilustrație stă AICI, ca margine de jos a textului,
        nu ca margine de sus a panoului. Motivul e la nota de mai jos: panoul are
        `mt-auto`, iar `mt-auto` și o margine scrisă nu pot sta amândouă pe același
        element — a doua ar fi anulat-o pe prima, iar alinierea de jos s-ar fi
        pierdut fără să se plângă nimic.
      */}
      <div className={cn(lat ? "min-w-0" : "mb-6 sm:mb-8")}>
        <h3 className="text-[21px] font-bold leading-[1.25] tracking-[-0.02em] text-ink sm:text-[24px]">
          {card.titlu}
        </h3>
        <p className="mt-3 text-[15px] leading-[1.6] text-ink-2 sm:text-[16px]">
          {card.descriere}
        </p>
      </div>

      {/*
        Panoul ilustrației.

        ⚠ `mt-auto` la cele mari: dacă o descriere are un rând în plus, ilustrația
        rămâne totuși lipită de fundul cardului, deci cele două carduri alăturate
        își încheie desenul la aceeași înălțime. Fără el, una ar fi stat mai sus
        decât cealaltă, iar rândul ar fi arătat strâmb.

        La cel lat nu se pune: acolo cele două părți stau una lângă alta, iar
        `items-center` le potrivește pe mijloc.
      */}
      <div
        className={cn(
          /* ⚠ `relative` și `overflow-hidden` NU sunt de prisos: unele ilustrații
             își pun un strat de fundal peste tot panoul (razele de la
             „Securitate"). Un strat `absolute inset-0` se agață de primul
             strămoș poziționat — fără `relative` aici, s-ar fi agățat de
             secțiune și ar fi acoperit toată pagina. Iar `inset-0` acoperă și
             spațierea panoului, deci razele ajung până la chenar. */
          "relative flex items-center justify-center overflow-hidden rounded-[14px] border border-hairline bg-white px-4 py-6 sm:px-6 sm:py-8",
          lat ? "mt-8 lg:mt-0" : "mt-auto",
        )}
      >
        <IlustratieMentenanta id={card.id} />
      </div>
    </article>
  );
}
