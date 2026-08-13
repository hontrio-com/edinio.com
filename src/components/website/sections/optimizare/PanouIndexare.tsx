import {
  INDEXARE,
  PAGINI_INDEXATE,
  SITEMAP_GAZDA,
  type PaginaIndexata,
} from "@/lib/website/seo";

/**
 * Ilustrația celui de-al patrulea card SEO: raportul de indexare din Google
 * Search Console.
 *
 * ═══ MĂSURAT DIN CAPTURA CLIENTULUI, NU GHICIT ═══
 *
 * Culorile și proporțiile sunt citite pixel cu pixel din captura trimisă de el:
 *
 *   placa „neindexate"   #9E9E9E
 *   placa „indexate"     #0F9D58
 *   fundalul paginii     #F0F4F9
 *   plăcile              180 × 128, deci raportul 1,41
 *
 * ⚠ PLĂCILE SE ATING. În captură cea gri se termină la x=189 și cea verde începe
 * la 190 — niciun spațiu între ele, doar colțurile din afară rotunjite. Arată ca
 * o singură bară tăiată în două, iar asta e chiar rostul: sunt două părți ale
 * aceluiași întreg, nu două cifre alăturate. Un spațiu de câțiva pixeli între
 * ele, cât ar părea de firesc, strică lucrul ăsta.
 *
 * ⚠ FUNDALUL CENUȘIU E AL LOR, nu o alegere de gust. Search Console pune cardurile
 * albe pe #F0F4F9; fără el, plăcile ar pluti pe pagina noastră albă și ar arăta a
 * grafic făcut de noi. Celelalte trei ilustrații ale secțiunii au fundal alb
 * fiindcă și originalele lor au.
 *
 * ═══ SCRISUL E ÎN ROMÂNEȘTE ═══
 *
 * Captura clientului e în engleză, fiindcă așa e contul lui. Dar un comerciant
 * român deschide Search Console în românește, iar restul secțiunii — căutarea,
 * rezultatele, rândul lui Chrome — e tot în românește. Aceleași plăci, aceeași
 * limbă cu pagina.
 */

/* Citite din captură, cu pipeta. Nu se înlocuiesc cu tokenurile noastre: desenul
   trebuie să fie al lor. */
const GRI = "#9E9E9E";
const VERDE = "#0F9D58";
const FUNDAL = "#F0F4F9";
const LINIE = "#dadce0";
const TEXT = "#202124";
const TEXT_STINS = "#5f6368";

export function PanouIndexare() {
  return (
    <div className="@container">
      {/*
        Ce se aude și ce se indexează. Restul e ascuns: e un raport desenat,
        despre un magazin de pildă.
      */}
      <p className="sr-only">
        Exemplu de raport Google Search Console pentru magazin:{" "}
        {INDEXARE.indexate.valoare} pagini indexate și {INDEXARE.neindexate.valoare}{" "}
        neindexate, cu lista ultimelor pagini accesate de Google.
      </p>

      <div
        aria-hidden="true"
        className="overflow-hidden rounded-[14px] border border-hairline p-[10px] @[340px]:p-3"
        style={{ backgroundColor: FUNDAL }}
      >
        {/* ── Cardul de sus: cele două plăci și rândul „Afișări" ── */}
        <div className="overflow-hidden rounded-lg bg-white">
          <div className="p-[10px] @[340px]:p-3">
            {/*
              Plăcile, lipite. `overflow-hidden` pe învelișul lor rotunjește doar
              colțurile din afară — cele dinăuntru rămân drepte, ca în captură.
            */}
            {/*
              ⚠ PLĂCILE NU CRESC PESTE 180px, ci doar se micșorează sub el.

              În Search Console au mărime fixă: 180 × 128, măsurat în captură. Cu
              `flex-1` singur, pe panoul lat de la 640-767px (unde grila e încă pe
              o coloană) ajungeau de 332px fiecare, cu numărul de 58px — nu mai
              erau plăcile lor, erau niște dale. Cu plafon, la lățime mare rămân
              cât trebuie și la stânga, cu alb în dreapta, exact ca la ei; iar pe
              panoul îngust se strâng, fiindcă acolo n-au încotro.
            */}
            <div className="flex overflow-hidden rounded-md">
              <Placa
                culoare={GRI}
                eticheta={INDEXARE.neindexate.eticheta}
                valoare={INDEXARE.neindexate.valoare}
                subsol={INDEXARE.neindexate.subsol}
              />
              <Placa
                culoare={VERDE}
                eticheta={INDEXARE.indexate.eticheta}
                valoare={INDEXARE.indexate.valoare}
              />
            </div>

            {/*
              Rândul de sub plăci, cu pătratul NEBIFAT — e al treilea rând din
              legenda graficului, iar în captură e nebifat. Bifat, ar fi spus că
              se arată și afișările, adică alt grafic decât cel de deasupra.
            */}
            <div className="mt-[10px] flex items-center gap-2 @[340px]:mt-3">
              <span
                className="block h-[13px] w-[13px] shrink-0 rounded-[2px] border-[1.5px]"
                style={{ borderColor: "#80868b" }}
              />
              <span
                className="text-[11px] leading-none @[340px]:text-[12.5px]"
                style={{ color: TEXT }}
              >
                {INDEXARE.afisari}
              </span>
            </div>
          </div>
        </div>

        {/* ── Cardul de jos: lista de pagini ── */}
        <div className="mt-[10px] overflow-hidden rounded-lg bg-white @[340px]:mt-3">
          <div
            className="flex items-center justify-between gap-3 border-b px-[10px] py-2 @[340px]:px-3"
            style={{ borderColor: LINIE }}
          >
            <span
              className="text-[10px] leading-none @[340px]:text-[11px]"
              style={{ color: TEXT_STINS }}
            >
              URL
            </span>
            <span
              className="shrink-0 text-[10px] leading-none @[340px]:text-[11px]"
              style={{ color: TEXT_STINS }}
            >
              Ultima accesare
            </span>
          </div>

          {PAGINI_INDEXATE.map((pagina, i) => (
            <Rand
              key={pagina.cale}
              pagina={pagina}
              ultimul={i === PAGINI_INDEXATE.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * O placă din perechea de sus.
 *
 * ⚠ FIECARE PLACĂ E PROPRIUL EI CONTAINER, iar scrisul se măsoară în procente
 * din lățimea ei — altfel, pe panoul îngust, numărul mare ar rămâne la fel de
 * mare și ar ieși din placă. Proporțiile vin din captură, împărțite la cei 180px
 * ai plăcii de acolo: numărul 34/180, eticheta 13/180, subsolul 11/180.
 *
 * ⚠ Iar `@container` NU se aplică propriului element: spațierea în `cqw` pusă
 * chiar pe placă s-ar raporta la învelișul de deasupra. De aceea stă pe un strat
 * dinăuntru. Aceeași capcană ca la tiglele de la cardul 1, unde a costat un text
 * de 4,8px.
 */
function Placa({
  culoare,
  eticheta,
  valoare,
  subsol,
}: {
  culoare: string;
  eticheta: string;
  valoare: string;
  subsol?: string;
}) {
  return (
    <div
      className="@container relative max-w-[180px] flex-1"
      style={{ backgroundColor: culoare, aspectRatio: "180 / 128" }}
    >
      <div className="flex h-full flex-col p-[6.7cqw]">
        <div className="flex items-center gap-[4cqw]">
          {/* Pătratul bifat, alb, ca în captură. */}
          <span className="flex h-[7.8cqw] w-[7.8cqw] shrink-0 items-center justify-center rounded-[1.5cqw] border-[0.9cqw] border-white">
            <svg viewBox="0 0 24 24" className="h-[6cqw] w-[6cqw] fill-white">
              <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </span>
          <span className="truncate text-[7.2cqw] leading-none text-white">{eticheta}</span>
        </div>

        {/*
          Numărul. `mt-auto` îl împinge în jos: în captură stă lipit de subsol, nu
          la mijlocul plăcii.
        */}
        <span className="mt-auto text-[19cqw] leading-none font-light text-white">
          {valoare}
        </span>

        {/*
          Subsolul are loc rezervat și când lipsește: fără el, numărul de pe placa
          verde ar coborî mai jos decât cel de pe placa gri, iar cele două cifre
          n-ar mai sta pe aceeași linie.
        */}
        <span className="mt-[3cqw] block h-[6.5cqw] text-[6.5cqw] leading-none text-white/85">
          {subsol ?? ""}
        </span>
      </div>

      {/* Semnul întrebării, în colțul din dreapta jos. */}
      <svg
        viewBox="0 0 24 24"
        className="absolute right-[5cqw] bottom-[5cqw] h-[7.8cqw] w-[7.8cqw] fill-white/70"
      >
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m1 17h-2v-2h2zm2.07-7.75-.9.92A3.4 3.4 0 0 0 13 15h-2v-.5a4 4 0 0 1 1.17-2.83l1.24-1.26A2 2 0 0 0 14 9a2 2 0 0 0-4 0H8a4 4 0 0 1 8 0 3.2 3.2 0 0 1-.93 2.25" />
      </svg>
    </div>
  );
}

function Rand({ pagina, ultimul }: { pagina: PaginaIndexata; ultimul: boolean }) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-[10px] py-[7px] @[340px]:px-3 @[340px]:py-2"
      style={ultimul ? undefined : { borderBottom: `1px solid ${LINIE}` }}
    >
      {/*
        Adresa, TĂIATĂ LA CAPĂT, nu ruptă pe două rânduri — Search Console taie,
        fiindcă rândurile tabelului au toate aceeași înălțime. Iar gazda e
        cenușie și calea neagră: la o listă de pagini ale aceluiași site, ce
        deosebește rândurile e calea, nu gazda repetată de cinci ori.
      */}
      <span className="min-w-0 truncate text-[10.5px] leading-[1.35] @[340px]:text-[12px]">
        <span style={{ color: TEXT_STINS }}>{SITEMAP_GAZDA.replace("https://", "")}</span>
        <span style={{ color: TEXT }}>{pagina.cale}</span>
      </span>

      <span
        className="shrink-0 text-[10px] leading-none @[340px]:text-[11.5px]"
        style={{ color: TEXT_STINS }}
      >
        {pagina.accesata}
      </span>
    </div>
  );
}
