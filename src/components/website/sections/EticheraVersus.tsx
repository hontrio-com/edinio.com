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
 * ⚠ „vs" NU e o siglă și nu intră în socoteala suprafeței: e semn, nu marcă.
 * Vezi nota de la el.
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
    /*
      ═══ AȘEZAREA: TREI COLOANE, NU UN RÂND ═══

      ⚠ CERUT „exact la mijloc față de cele 2 logo-uri", și un rând simplu NU
      poate face asta. Siglele au lățimi foarte diferite — a noastră 35px, a lui
      Cartum 91 — iar într-un rând centrat se centrează RÂNDUL ÎNTREG: „vs" ajunge
      împins spre stânga cu jumătate din diferența dintre ele, adică vreo 28px.
      Se vede.

      Aici sunt trei coloane: `1fr` — „vs" — `1fr`. Cele două margini sunt egale
      prin construcție, deci „vs" cade exact pe mijloc, oricât de late ar fi
      siglele.

      ⚠ Iar siglele se lipesc de „vs", nu se centrează în coloana lor: a noastră
      la dreapta (`justify-self-end`), a lor la stânga. Așa golul dintre fiecare
      siglă și „vs" e ACELAȘI, în timp ce prisosul rămâne pe dinafară, unde nu-l
      mărginește nimic. Centrate în coloane, golurile ar fi ieșit diferite.
    */
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-6">
      {/* ── Noi ── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SIGLA_NOASTRA.src}
        alt={SIGLA_NOASTRA.name}
        style={{ height: noastra.height, maxWidth: noastra.maxWidth }}
        className="w-auto justify-self-end object-contain"
        decoding="async"
      />

      {/*
        ═══ VS ═══

        ⚠ FĂRĂ NICIO RAMĂ, cerut de client (13.08). O formă dinainte îl punea
        într-un disc alb cu umbră; discul îl făcea al treilea obiect din rând, în
        loc să fie legătura dintre celelalte două.

        Ce-l face să pară versus, acum că n-are ramă, sunt două lucruri:
        MĂRIMEA — e mai înalt decât siglele, deci se citește primul — și
        ÎNCLINAREA, de la care vine tot înțelesul, ca pe afișele de meci.

        Verdele e al mărcii NOASTRE, iar asta e o alegere: semnul stă la mijloc,
        dar pagina e a noastră.
      */}
      <span
        className="text-[30px] leading-none font-extrabold uppercase italic tracking-[-0.04em] sm:text-[36px]"
        style={{ color: "var(--color-brand)" }}
      >
        vs
      </span>

      {/* ── Ei ── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.src}
        alt={logo.name}
        style={{ height: marime.height, maxWidth: marime.maxWidth }}
        className="w-auto justify-self-start object-contain"
        decoding="async"
      />
    </div>
  );
}
