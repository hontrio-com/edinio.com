import Image from "next/image";
import {
  ARIE_SIGLA,
  COMPARISON_EYEBROW,
  COMPARISON_LEAD,
  COMPARISON_RIVALS,
  COMPARISON_ROWS,
  COMPARISON_TITLE,
  COMPARISON_US,
  CULORI_MARCA,
  PLATFORM_LOGOS,
  inaltimeSigla,
  type ComparisonRival,
} from "@/lib/website/comparison";
import { SectionEyebrow } from "./SectionEyebrow";
import { VERDE_CITIBIL } from "@/lib/website/linii";

/**
 * Tabelul de comparație: Edinio față de celelalte platforme.
 *
 * A luat locul demo-ului interactiv pe prima pagină (cerut 2026-08-09).
 *
 * ═══ CAPUL SECȚIUNII E AL PERECHII ═══
 *
 * Aceeași coloană de 720px, aceeași etichetă (13px, semibold, 0.18em), același
 * titlu (32/44px) și aceeași descriere (16/18px) ca la „Problema" și „Soluția".
 * Capetele astea se citesc ca o serie doar fiindcă sunt identice. Când se
 * schimbă unul, se schimbă toate. Eticheta e gri: verdele e al secțiunii
 * Integrări, iar dacă ar fi și aici n-ar mai însemna nimic acolo.
 *
 * ═══ FUNDAL ALB, PLACĂ ALBĂ ═══
 *
 * ⚠ S-a încercat o dată inversarea — suprafață gri, coloana noastră albă și
 * ridicată din ea — ca răspuns la „e mult prea simplă". A fost RESPINSĂ: „îmi
 * plăcea cu fundalul alb și design-ul ăla". Deci nu se mai reia.
 *
 * Ce lipsea nu era contrastul de suprafață, ci CONȚINUTUL: siglele platformelor.
 * Un rând de nume scrise mărunt se citește ca o listă; siglele se recunosc
 * înainte de primul cuvânt. Restul e ierarhie de mărimi, nu ornament — niciun
 * degrade, nicio textură, nicio transparență, ca la casetele de la Integrări,
 * unde patru asemenea tratamente au fost respinse rând pe rând.
 *
 * ═══ UN SINGUR TABEL ÎN PAGINĂ, NU DOUĂ DESENE ═══
 *
 * Cerința a fost „perfect responsive și pe mobil, să se înțeleagă exact tot".
 * Derularea pe orizontală pică exact la partea a doua: pe 390px se văd două
 * coloane din șase, iar cine nu ghicește că se poate trage lateral crede că a
 * citit tot. Iar două desene în pagină (tabel + carduri, ascunse pe rând) costă
 * dublu: aceleași texte în două locuri, deci se despart la prima corectură, și
 * conținut citit de două ori de cititoarele de ecran.
 *
 * Aici e UN SINGUR `<table>`, semantic corect, care își schimbă doar `display`:
 * de la `lg` în sus e tabel; sub `lg` fiecare RÂND devine un card, cu criteriul
 * ca titlu și câte un rând „platformă → valoare".
 *
 * ⚠ Siglele apar DOAR pe desktop, în antetul coloanelor. Pe telefon rămân numai
 * denumirile (cerut): acolo numele e oricum scris în fiecare rând, iar sigla nu
 * adăuga nimic pe care el să nu-l spună.
 *
 * Numele din celulă e `aria-hidden`: pe desktop rolul lui îl are antetul, iar
 * legătura celulă-antet o face oricum tabelul.
 *
 * Pragul e `lg`, nu `md`: șase coloane la 768px lasă ~100px de coloană, iar
 * „Necesită configurare" se rupe în trei rânduri. Tableta primește tot carduri.
 */

/* Verdele pentru TEXT, luat din `lib/website/linii.ts`.

   Era declarat aici, si in inca patru fisiere, cu acelasi comentariu copiat
   langa fiecare: `#12874A`, ales fiindca verdele de marca (#1AB554) are pe alb
   2,70:1, sub prag. Alegerea era buna, dar `--primary` era deja acolo si are
   4,95:1. Doctrina celor doi verzi ramasi e in capul lui `globals.css`. */
const GREEN_TEXT = VERDE_CITIBIL;


function Sigla({ nume }: { nume: ComparisonRival }) {
  const logo = PLATFORM_LOGOS[nume];
  if (!logo.src) return null;
  const h = inaltimeSigla(logo, ARIE_SIGLA);
  return (
    <Image
      src={logo.src}
      /*
        `alt` gol, dinadins: denumirea e scrisă chiar dedesubt, în același antet.
        Repetată în `alt`, cititoarele de ecran ar spune platforma de două ori.
      */
      alt=""
      aria-hidden="true"
      width={Math.round(h * logo.ratio)}
      height={h}
      /*
        `unoptimized`: loader-ul proiectului lasă neatinse imaginile locale (prin
        el trece doar ce e pe R2), iar fără asta Next se plânge că loader-ul nu
        implementează `width`. Sunt fișiere de câțiva kiloocteți.
      */
      unoptimized
      style={{ height: h, width: "auto" }}
      className="max-w-full shrink-0 object-contain"
    />
  );
}

export function Comparison() {
  return (
    <section id="comparatie" className="sub-bara bg-white">
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-[720px] text-center">
          <SectionEyebrow label={COMPARISON_EYEBROW} />

          <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            {COMPARISON_TITLE.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h2>

          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            {COMPARISON_LEAD}
          </p>
        </div>

        {/*
          Placa albă pe pagina albă se deosebește DOAR prin umbră — aceeași
          rețetă de patru straturi ca la casetele de sigle, scoasă în
          `--umbra-placa` ca sursa de lumină să rămână una singură în tot site-ul.
          Vezi comentariul de la `.caseta-sigla` din globals.css.

          `overflow-hidden` ca tenta coloanei Edinio să fie tăiată de colțuri.
          E în regulă aici fiindcă nimic dinăuntru nu are umbră proprie: coloana
          se deosebește prin tentă, nu prin ridicare. (Dacă vreodată capătă una,
          placa are nevoie de padding cât întinderea ei — vezi capcana de la
          benzile de sigle, unde `overflow-hidden` reteza umbra casetelor.)
        */}
        <div className="placa mt-14 overflow-hidden rounded-[16px] lg:mt-20">
          <table className="block w-full lg:table lg:table-fixed lg:border-collapse">
            <caption className="sr-only">
              Comparație între {COMPARISON_US} și {COMPARISON_RIVALS.join(", ")} pe
              criteriile care privesc operarea unui magazin online în România.
            </caption>

            <thead className="hidden lg:table-header-group">
              <tr>
                {/* Colțul gol al tabelului: nu are ce antet să poarte. */}
                <td className="w-[26%] border-b border-hairline" />
                {/*
                  Edinio: DOAR denumirea, fără siglă (cerut). Coloana se
                  deosebește deja prin tentă și prin verde. `align-bottom` face
                  ca numele nostru să cadă pe aceeași linie cu numele celorlalți,
                  care au sigla deasupra lor.
                */}
                <th scope="col" className="border-b border-hairline bg-tint px-4 pb-4 pt-5 align-bottom">
                  <span
                    className="text-[14px] font-bold tracking-[-0.01em]"
                    style={{ color: GREEN_TEXT }}
                  >
                    {COMPARISON_US}
                  </span>
                </th>
                {COMPARISON_RIVALS.map((rival) => (
                  <th key={rival} scope="col" className="border-b border-hairline px-4 pb-4 pt-5 align-bottom">
                    <span className="flex flex-col items-center gap-2">
                      <Sigla nume={rival} />
                      <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
                        {rival}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="block lg:table-row-group">
              {COMPARISON_ROWS.map((row) => (
                /*
                  Pe ecrane mici rândul e un card: linia de sus desparte cardurile
                  între ele (primul n-are, ca să nu dubleze marginea plăcii), iar
                  pe desktop redevine linia obișnuită dintre rânduri.
                */
                <tr
                  key={row.criteriu}
                  className="block border-t border-hairline first:border-t-0 lg:table-row"
                >
                  <th
                    scope="row"
                    className="block px-5 pb-3 pt-5 text-left text-[15px] font-semibold leading-[1.35] tracking-[-0.02em] text-ink lg:table-cell lg:px-5 lg:py-5 lg:pe-6 lg:text-[14.5px] lg:leading-[1.45]"
                  >
                    {row.criteriu}
                  </th>

                  {/*
                    Edinio primul, și pe telefon, și pe desktop: e coloana pentru
                    care există tabelul. Tenta `tint` e o suprafață din INTERIORUL
                    plăcii, singurul loc unde mai are voie să apară după trecerea
                    site-ului pe fundal alb.
                  */}
                  <td className="flex items-center justify-between gap-4 bg-tint px-5 py-3 lg:table-cell lg:px-4 lg:py-5 lg:text-center lg:align-middle">
                    <span
                      className="text-[13px] font-semibold lg:hidden"
                      style={{ color: CULORI_MARCA[COMPARISON_US] }}
                      aria-hidden="true"
                    >
                      {COMPARISON_US}
                    </span>
                    <span
                      className="text-right text-[14.5px] font-bold leading-[1.35] lg:text-center lg:text-[15px]"
                      style={{ color: GREEN_TEXT }}
                    >
                      {row.edinio}
                    </span>
                  </td>

                  {row.rivali.map((valoare, i) => (
                    <td
                      key={COMPARISON_RIVALS[i]}
                      className="flex items-center justify-between gap-4 px-5 py-3 last:pb-5 lg:table-cell lg:px-4 lg:py-5 lg:text-center lg:align-middle lg:last:pb-5"
                    >
                      <span
                        className="text-[13px] font-medium lg:hidden"
                        style={{ color: CULORI_MARCA[COMPARISON_RIVALS[i]] }}
                        aria-hidden="true"
                      >
                        {COMPARISON_RIVALS[i]}
                      </span>
                      <Valoare valoare={valoare} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/**
 * Valoarea unui concurent.
 *
 * ═══ DE CE „X" NU SE MAI SCRIE CA LITERĂ ═══
 *
 * În tabelul primit, „X" înseamnă „neinclus", iar înțelesul îl dădea o notă de
 * sub tabel. Nota a fost scoasă la cererea clientului — deci litera rămânea
 * singură și ambiguă: pe un rând de bifat, un „X" se citește la fel de ușor ca
 * „da, marcat". Se desenează acum ca semn de închidere, care nu se poate citi
 * greșit, și își păstrează numele pentru cititoarele de ecran.
 *
 * ⚠ Semnul NU e roșu, și „Nu" nu e roșu. Un tabel roșu devine o acuzație, iar
 * afirmațiile astea sunt publicitate comparativă: trebuie să rămână descrieri
 * verificabile. Absența se arată prin GREUTATE mai mică, nu prin culoare.
 */
function Valoare({ valoare }: { valoare: string }) {
  if (valoare === "X") {
    return (
      <span className="inline-flex items-center lg:justify-center">
        <span className="sr-only">Neinclus</span>
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="h-[15px] w-[15px] text-ink-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={`text-right text-[13.5px] leading-[1.4] lg:text-center ${
        valoare === "Nu" ? "text-ink-3" : "text-ink-2"
      }`}
    >
      {valoare}
    </span>
  );
}
