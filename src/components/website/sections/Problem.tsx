import { AlertTriangle } from "lucide-react";
import {
  COMPLAINTS,
  PROBLEM_EYEBROW,
  PROBLEM_LEAD,
  PROBLEM_TITLE,
} from "@/lib/website/problem";
import { EYEBROW_TONES, SectionEyebrow } from "./SectionEyebrow";

/**
 * Secțiunea „Problema": un singur card, cu titlul sus și un nor de nemulțumiri
 * jos, care iese din card în stânga și în dreapta.
 *
 * Norul e tot rostul secțiunii. Dacă plângerile ar sta cuminți într-o grilă, ar
 * fi o listă și s-ar citi ca o listă: mult, ordonat, ușor de sărit. Tăiate de
 * marginea cardului, se citesc altfel — pare că mai sunt și dincolo de ea, iar
 * omul se oprește exact ca să vadă dacă e și a lui acolo. De asta rândurile sunt
 * mai late decât cardul INTENȚIONAT, nu din greșeală.
 *
 * Cardul e din aceeași familie cu cele de la secțiunea de funcții (alb, chenar
 * de 1px, colț mare, pe câmpul `tint`), ca să nu pară adus din alt site.
 */

/*
 * Rosul sectiunii vine de la eticheta, nu invers. Scris si aici, s-ar fi
 * despartit de ea la prima ajustare.
 */
const { rgb: ALARM_RGB, text: ALARM_TEXT } = EYEBROW_TONES.alarm;

/**
 * Lumina de sub titlu.
 *
 * Larga si slaba, nu strimta si tare: la fel ca aburul verde din hero, un halou
 * mic si aprins se citeste ca o pata lipita acolo, unul lat si stins se citeste
 * ca lumina. Centrul sta la 60% din inaltime, adica DEASUPRA norului: asa
 * plangerile de jos raman lizibile in loc sa se piarda in rosu.
 *
 * Doua straturi, nu unul. Prima incercare avea un singur gradient intins pe
 * toata latimea si iesea o caramida roz: fara colturi curate nu se mai vedea ca
 * e lumina, parea al doilea fundal. Acum haloul e rotund si lasa colturile albe,
 * iar spalatura de jos, mult mai slaba, doar aseaza pastilele pe ceva.
 */
const GLOW = [
  `radial-gradient(54% 58% at 50% 60%, rgba(${ALARM_RGB},0.20) 0%, rgba(${ALARM_RGB},0.075) 46%, transparent 76%)`,
  `radial-gradient(95% 42% at 50% 104%, rgba(${ALARM_RGB},0.07) 0%, transparent 72%)`,
].join(", ");

/**
 * Cum pluteste fiecare rand.
 *
 * `duration` e cat ii ia unui rand sa treaca o data peste propria lungime, deci
 * viteza depinde si de cat de lung e randul. Numerele de aici ies pe la 20px pe
 * secunda la toate trei, adica un cuvant la vreo doua secunde.
 *
 * `delay` e NEGATIV dinadins: porneste animatia din mijlocul ei, nu de la capat.
 * Fara asta, la incarcarea paginii toate trei ar pleca din exact aceeasi
 * pozitie si primele secunde s-ar vedea o coloana care se desface.
 *
 * Sensurile alterneaza. Trei randuri care aluneca in aceeasi parte se citesc ca
 * o banda de stiri; unul dus, unul intors, unul dus se citesc ca un nor.
 */
const DRIFT = [
  { duration: 70, delay: -12, reverse: false },
  { duration: 74, delay: -35, reverse: true },
  { duration: 76, delay: -21, reverse: false },
];

export function Problem() {
  return (
    /*
     * Fara spatiu jos: sectiunea urmatoare (functiile) sta pe acelasi `tint` si
     * isi aduce propriul spatiu de sus. Daca s-ar pune si aici, s-ar aduna doua
     * si ar ramane o gaura in mijlocul paginii.
     */
    <section className="bg-tint pt-16 lg:pt-24">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[28px] border border-hairline bg-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: GLOW }}
          />

          <div className="relative px-5 pt-12 text-center sm:px-8 sm:pt-16 lg:pt-20">
            <SectionEyebrow
              tone="alarm"
              icon={AlertTriangle}
              label={PROBLEM_EYEBROW}
            />

            <h2 className="mx-auto mt-6 max-w-[860px] text-[30px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[42px] lg:text-[46px]">
              {PROBLEM_TITLE.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h2>

            {/* `text-pretty` ca sa nu ramana ultimul cuvant singur pe un rand. */}
            <p className="mx-auto mt-5 max-w-[680px] text-pretty text-[15px] leading-[1.6] text-ink-2 sm:text-[17px]">
              {PROBLEM_LEAD}
            </p>
          </div>

          <ComplaintCloud />
        </div>
      </div>
    </section>
  );
}

/**
 * Norul de nemulțumiri, în plutire lentă.
 *
 * Fiecare rând e o pistă mai lată decât cardul, care alunecă la nesfârșit. Ce
 * iese din card se taie, pentru că părintele are `overflow-hidden`; nu apare
 * bară de derulare și nu împinge pagina în lateral.
 *
 * Marginile se sting, nu se taie drept. Tăiate drept, cât iese din card depinde
 * de lățimea ferestrei și de cât de lungă e fiecare plângere: la o anumită
 * lățime rămânea la margine un ciot de două litere, care nu se citește ca
 * „urmează și altele", ci ca o scăpare. Acum, cu rândurile în mișcare, marginea
 * ar fi fost și mai rea fără estompare: pastilele ar fi apărut și ar fi dispărut
 * tăiate, ca la o ștampilă. Stinse, ies și intră în ceață.
 */
const CLOUD_FADE =
  "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)";

function ComplaintCloud() {
  return (
    <div
      className="relative mt-14 space-y-2 pb-6 sm:mt-24 sm:space-y-2.5 sm:pb-8 lg:mt-36 lg:pb-11"
      style={{ maskImage: CLOUD_FADE, WebkitMaskImage: CLOUD_FADE }}
    >
      {COMPLAINTS.map((row, index) => {
        const { duration, delay, reverse } = DRIFT[index];

        return (
          <div
            key={index}
            className="problem-drift flex"
            style={{
              ["--drift-duration" as string]: `${duration}s`,
              ["--drift-delay" as string]: `${delay}s`,
              ["--drift-direction" as string]: reverse ? "reverse" : "normal",
            }}
          >
            <ComplaintRow complaints={row} />
            {/*
              A doua oară aceleași plângeri, doar ca să nu se vadă reluarea. Nu e
              conținut nou, deci pentru cititoarele de ecran nu există: altfel
              omul ar auzi toată lista de două ori la rând.
            */}
            <ComplaintRow complaints={row} aria-hidden />
          </div>
        );
      })}
    </div>
  );
}

/**
 * O listă de pastile, cu spațiul de după ultima INCLUS.
 *
 * `pe-2` nu e o respirație oarecare: e exact cât spațiul dintre pastile. Așa
 * lista are lățimea `L + spațiu`, cele două copii se leagă cap la cap, iar
 * `-50%` din pistă cade fix peste una dintre ele. Pus ca `gap` pe pistă în loc
 * de aici, saltul de la fiecare tură ar fi de jumătate de spațiu.
 */
function ComplaintRow({
  complaints,
  ...rest
}: {
  complaints: string[];
  "aria-hidden"?: boolean;
}) {
  return (
    <ul className="flex shrink-0 gap-2 pe-2 sm:gap-2.5 sm:pe-2.5" {...rest}>
      {complaints.map((complaint) => (
        <li
          key={complaint}
          className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium sm:px-5 sm:py-2.5 sm:text-[15px]"
          style={{
            backgroundColor: `rgba(${ALARM_RGB},0.07)`,
            color: ALARM_TEXT,
          }}
        >
          {complaint}
        </li>
      ))}
    </ul>
  );
}
