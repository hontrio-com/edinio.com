import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  AVERTISMENT_VS,
  LEGENDA_VS,
  TABELE_VS,
  type ValoareVs,
} from "@/lib/website/comparatii-vs";
import { CULORI_MARCI, type VersusKey } from "@/lib/website/versus-culori";
import { SectionEyebrow } from "./SectionEyebrow";

/**
 * `AAAA-LL-ZZ` scris pe romaneste, fara sa treaca prin `Date`.
 *
 * ⚠ FARA `new Date(...)`, si e o alegere. `new Date("2026-08-14")` se citeste
 * ca UTC la miezul noptii, iar afisat intr-un fus la vest de Greenwich ar da
 * ziua DINAINTE — data de pe pagina ar fi cu o zi mai devreme pentru unii
 * cititori, si niciodata pentru cine o scrie. Sirul se taie in bucati.
 */
const LUNI_RO = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

function dataRo(iso: string): string {
  const [an, luna, zi] = iso.split("-");
  const nume = LUNI_RO[Number(luna) - 1];
  /* Forma nerecunoscuta se arata ca atare: mai bine o data ciudata decat una
     inventata sau un `NaN` pe pagina. */
  return nume ? `${Number(zi)} ${nume} ${an}` : iso;
}

/**
 * Tabelul de comparație de pe paginile „Edinio vs …".
 *
 * ═══ DOUĂ COLOANE, NU CINCI ═══
 *
 * Pe pagina de start există deja un tabel de comparație, dar acela ne pune lângă
 * PATRU concurenți deodată și e altă piesă. Aici e față în față cu unul singur,
 * iar din asta decurge tot desenul: coloanele de valori pot fi înguste, criteriul
 * ia toată lățimea rămasă, și încape ca tabel adevărat până la 320px — fără să
 * trebuiască să se rupă în cartonașe pe telefon, cum face cel de pe start.
 *
 * ═══ CE FACE UN TABEL COMPARATIV SĂ FIE CITIT, NU DOAR VĂZUT ═══
 *
 * ⚠ COLOANA NOASTRĂ E SCOASĂ ÎN FAȚĂ, dar prin FUNDAL, nu prin culoarea bifelor.
 * Bifa verde și „X"-ul roșu pe ambele coloane ar fi spus „noi bun, ei rău" la
 * fiecare rând, inclusiv la cele unde e invers. Aici semnul spune doar dacă
 * lucrul e inclus; cine îl are e treaba coloanei.
 *
 * ⚠ SEMNUL DE „NU" NU E ROȘU. E cenușiu, ca al nostru de pe rândurile în care noi
 * stăm mai prost. Roșul ar fi transformat un tabel de fapte într-o judecată — și
 * exact rândurile alea, unde noi avem „X", sunt cele care fac tabelul credibil.
 *
 * ⚠ Numele platformelor sunt în culorile lor, ca în rândul de deasupra titlului —
 * întunecate cât să se citească. Vezi `versus-culori.ts`.
 */
export function TabelVersus({ cheie }: { cheie: VersusKey }) {
  const tabel = TABELE_VS[cheie];
  const marca = CULORI_MARCI[cheie];

  return (
    <section className="border-t border-hairline bg-white">
      <div className="mx-auto max-w-[1200px] px-5 pt-20 pb-24 sm:px-6 lg:px-8 lg:pt-28 lg:pb-32">
        <div className="mx-auto max-w-[760px] text-center">
          <SectionEyebrow label="Comparație" />

          <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            Edinio față în față cu {marca.nume}
          </h2>

          {/* Rândul de deschidere, cuvânt cu cuvânt din PDF-ul clientului. */}
          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            {tabel.intro}
          </p>
        </div>

        {/*
          Placa. Aceeași ridicare de pe pagină ca la tabelul de pe start și la
          casetele de sigle — `.placa` din `globals.css`, ca sursa de lumină să
          rămână una singură pe tot site-ul.
        */}
        <div className="placa mx-auto mt-12 max-w-[900px] overflow-hidden rounded-[16px] lg:mt-16">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Comparație între Edinio și {tabel.coloanaRival}
            </caption>

            <thead>
              <tr className="border-b border-hairline">
                <th
                  scope="col"
                  className="px-4 py-3.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3 sm:px-6"
                >
                  Funcționalitate
                </th>
                {/*
                  ⚠ Coloanele de valori au lățime FIXĂ, iar criteriul ia restul.
                  Lăsate să se împartă singure, coloana lungă de criterii le-ar fi
                  strivit pe celelalte două exact acolo unde e mai puțin loc, pe
                  telefon.
                */}
                <th
                  scope="col"
                  className="w-[84px] px-2 py-3.5 text-center text-[12px] font-semibold sm:w-[130px] sm:px-4"
                  style={{ color: CULORI_MARCI.edinio.culoare }}
                >
                  Edinio
                </th>
                <th
                  scope="col"
                  className="w-[84px] px-2 py-3.5 text-center text-[12px] font-semibold sm:w-[130px] sm:px-4"
                  style={{ color: marca.culoare }}
                >
                  {tabel.coloanaRival}
                </th>
              </tr>
            </thead>

            <tbody>
              {tabel.randuri.map((rand, i) => (
                <tr
                  key={rand.criteriu}
                  className={cn(i > 0 && "border-t border-hairline")}
                >
                  <th
                    scope="row"
                    className="px-4 py-3.5 text-[13.5px] leading-[1.45] font-normal text-ink sm:px-6 sm:text-[15px]"
                  >
                    {rand.criteriu}
                  </th>

                  {/* Coloana noastră, pe fundal stins — de aici se vede care e. */}
                  <td className="bg-tint px-2 py-3.5 text-center sm:px-4">
                    <Valoare valoare={rand.edinio} />
                  </td>
                  <td className="px-2 py-3.5 text-center sm:px-4">
                    <Valoare valoare={rand.rival} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Legenda și avertismentul ── */}
        <div className="mx-auto mt-6 flex max-w-[900px] flex-col gap-2 text-[12.5px] leading-[1.5] text-ink-3">
          <p className="flex items-start gap-2">
            <Check className="mt-[3px] h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            <span>{LEGENDA_VS.da}</span>
          </p>
          <p className="flex items-start gap-2">
            <X className="mt-[3px] h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            <span>{LEGENDA_VS.nu}</span>
          </p>
          {/*
            ⚠ Rândul ăsta NU e de politețe. Tabelul spune lucruri despre firme
            străine, iar ce oferă ele se schimbă fără să ne anunțe. Scris, spune
            cititorului că e o fotografie de moment; nescris, fiecare rând ar
            părea o afirmație permanentă.
          */}
          <p className="mt-1">{AVERTISMENT_VS}</p>
          {/*
            ⚠ „DIN", NU „VERIFICAT LA" — ȘI ASTA E O CORECTURĂ, NU O NUANȚĂ.

            Prima scriere spunea „Verificat la 14 august 2026, pe site-ul oficial
            Cartum." O revizie adversarială a arătat ce iese din asta: pe
            /vs/cartum, fraza stă la câțiva pixeli sub două rânduri pe care CHIAR
            fișierul de date le notează ca fiind contrazise de site-ul lor
            (`comparatii-vs.ts`, nota din dreptul lui `cartum`) — deci pagina
            afirma o verificare tocmai acolo unde nu s-a făcut una.

            Iar antetul aceluiași fișier o spune limpede: data e a PDF-ului
            clientului, nu a unei reverificări făcute de noi. O pagină nu are voie
            să afirme mai mult decât știe fișierul din care se hrănește.

            Acum spune exact ce e adevărat pentru toate șase: DE CÂND sunt
            afirmațiile, și unde se poate uita cititorul singur. Când cineva chiar
            reverifică o platformă și mută data ei, fraza rămâne adevărată — doar
            devine mai proaspătă.

            ⚠ Spațiul dinaintea legăturii e scris ca `{" "}`, nu lăsat la capăt de
            rând: JSX înghite spațiul de dinaintea unei expresii puse pe rândul
            următor, iar textul ar fi ieșit lipit de link — tăcut, fiindcă nimic
            nu cade.
          */}
          <p className="mt-1">
            Afirmațiile despre {marca.nume} sunt din {dataRo(tabel.verificatLa)}. Le poți verifica pe{" "}
            <a
              href={tabel.siteOficial}
              rel="nofollow noopener noreferrer"
              target="_blank"
              className="underline underline-offset-2 hover:text-ink"
            >
              site-ul lor oficial
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * O celulă.
 *
 * ⚠ Trei stări, nu două: bifă, semn de „nu", sau un text scurt. PDF-ul are chiar
 * trei — „15 zile" față de „7 zile" nu e nici da, nici nu, iar strâns într-un
 * „da/nu" ar fi devenit o afirmație pe care clientul n-a făcut-o.
 */
function Valoare({ valoare }: { valoare: ValoareVs }) {
  if (valoare === true) {
    return (
      <>
        <Check
          aria-hidden
          className="mx-auto h-[18px] w-[18px] text-primary"
          strokeWidth={2.5}
        />
        <span className="sr-only">Da</span>
      </>
    );
  }

  if (valoare === false) {
    return (
      <>
        {/* Cenușiu, nu roșu. Vezi nota de sus. */}
        <X aria-hidden className="mx-auto h-[18px] w-[18px] text-ink-3" strokeWidth={2.5} />
        <span className="sr-only">Nu</span>
      </>
    );
  }

  return (
    <span className="block text-[12.5px] leading-[1.35] text-ink-2 sm:text-[13.5px]">
      {valoare}
    </span>
  );
}
