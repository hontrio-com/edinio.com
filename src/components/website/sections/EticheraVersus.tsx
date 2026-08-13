import {
  marimeaNoastra,
  marimeVersus,
  SIGLA_NOASTRA,
  VERSUS_LOGOS,
  type VersusKey,
} from "@/lib/website/versus-logos";

/**
 * Rândul de deasupra titlului pe paginile „Edinio vs …": sigla noastră, un „vs"
 * mărunt, sigla lor.
 *
 * Cerut de client (13.08), în locul textului „EDINIO VS SHOPIFY".
 *
 * ═══ DE CE NU ÎNĂLȚIME EGALĂ ═══
 *
 * Siglele au forme foarte diferite — punga Shopify e aproape pătrată, cuvântul
 * Cartum e lung cât cinci înălțimi. Puse la aceeași ÎNĂLȚIME, Cartum ar acoperi
 * de vreo șase ori mai multă suprafață și ar strivi-o pe cealaltă. Se
 * egalizează SUPRAFAȚA, prin `marimeVersus()` — aceeași socoteală ca la siglele
 * de integrări.
 *
 * ⚠ DOAR PUNGA, fără cuvântul „Edinio" de lângă — cerut de client (13.08).
 * Câștigul nu e doar de aspect: cu textul alături, ansamblul nostru avea altă
 * greutate decât sigla lor, iar echilibrul dintre cele două se potrivea din ochi.
 * Singură, punga trece prin ACEEAȘI formulă ca a lor și iese egală prin
 * construcție, nu prin nimereală.
 *
 * ⚠ „vs" NU e o siglă și nu intră în socoteala suprafeței: e o monedă de mărime
 * fixă, pusă peste rând. Vezi nota de la el.
 *
 * ⚠ `<img>` simplu, nu `next/image`: loaderul proiectului lasă fișierele locale
 * neatinse, deci n-ar produce niciun `srcset`. Aceeași hotărâre ca la `Logo` din
 * secțiunea de integrări, unde e și scrisă pe larg.
 */
export function EticheraVersus({ cheie }: { cheie: VersusKey }) {
  const logo = VERSUS_LOGOS[cheie];
  const marime = marimeVersus(cheie);
  const noastra = marimeaNoastra();

  return (
    <div className="flex items-center justify-center gap-4 sm:gap-5">
      {/* ── Noi ── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SIGLA_NOASTRA.src}
        alt={SIGLA_NOASTRA.name}
        style={{ height: noastra.height, maxWidth: noastra.maxWidth }}
        className="w-auto shrink-0 object-contain"
        decoding="async"
      />

      {/*
        ═══ VS ═══

        Cerut de client (13.08) „mult mai proeminent și cu ceva efect, să pară că
        e VERSUS". Era un cuvințel cenușiu între două sigle; acum e o monedă.

        Trei lucruri îl fac să pară versus, nu conjuncție:

        1. **STĂ ÎNTR-UN DISC ALB, RIDICAT.** Aceeași umbră ca la casetele de
           sigle (`--umbra-placa`), deci discul se citește ca un obiect pus PESTE
           rând, nu ca o literă din el. Asta desparte cele două sigle în două
           tabere.
        2. **E ÎNCLINAT.** Literele aplecate spun mișcare, ciocnire — de la
           afișele de meci vine tot înțelesul. Drept, ar fi rămas o prescurtare.
        3. **ARE O LUMINĂ VERDE ÎN SPATE.** Un halou stins, cât să ridice discul
           de pe fundal fără să tragă ochiul de la sigle.

        ⚠ Verdele e al mărcii NOASTRE, iar asta e o alegere: discul stă la mijloc,
        dar pagina e a noastră. Un „vs" cenușiu ar fi fost neutru și mort.
      */}
      <span className="relative flex shrink-0 items-center justify-center">
        {/* Haloul. `blur` pe un disc verde, foarte stins. */}
        <span
          aria-hidden
          className="pointer-events-none absolute h-[46px] w-[46px] rounded-full blur-[10px] sm:h-[52px] sm:w-[52px]"
          style={{ backgroundColor: "var(--color-brand)", opacity: 0.18 }}
        />

        <span
          className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white sm:h-[44px] sm:w-[44px]"
          style={{ boxShadow: "var(--umbra-placa)" }}
        >
          <span
            className="text-[15px] font-extrabold uppercase italic tracking-[-0.03em] sm:text-[17px]"
            style={{ color: "var(--color-brand)" }}
          >
            vs
          </span>
        </span>
      </span>

      {/* ── Ei ── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.src}
        alt={logo.name}
        style={{ height: marime.height, maxWidth: marime.maxWidth }}
        className="w-auto shrink-0 object-contain"
        decoding="async"
      />
    </div>
  );
}
