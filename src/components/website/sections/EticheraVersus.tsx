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
 * ⚠ „vs" NU e o siglă și nu se scalează cu ele: rămâne mic și stins, ca o
 * legătură între două lucruri, nu ca al treilea lucru din rând.
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

      <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        vs
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
