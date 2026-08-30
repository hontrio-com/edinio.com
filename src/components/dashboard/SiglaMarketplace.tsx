import Image from "next/image";

/**
 * Sigla unui marketplace, la inaltime fixa si cu raportul ei adevarat.
 *
 * ═══ TOATE ERAU STRIVITE INTR-UN PATRAT DE 16×16 (30.08.2026) ═══
 *
 * Butoanele „Publica pe …" desenau fiecare sigla cu `className="h-4 w-4"`. Dar niciuna dintre ele
 * nu e patrata — sunt marci scrise, late:
 *
 *     Trendyol   100×23    4,35 : 1
 *     eMAG      3840×1030  3,73 : 1
 *     About You  434×44    9,86 : 1   ← turtita de zece ori
 *     OLX         78×45    1,73 : 1
 *
 * Reclamat de comerciant, cu poza: literele ieseau lipite si ilizibile.
 *
 * ⚠ SE FIXEAZA INALTIMEA, NU LATIMEA. O marca scrisa se citeste pe rand: inaltimea o aliniaza cu
 * textul de langa ea, iar latimea trebuie sa ramana cat ii cere raportul. Invers — latime fixa —
 * ar face About You de doua ori mai inalta decat OLX.
 *
 * ⚠ Si `width`/`height` de mai jos sunt dimensiunile ADEVARATE ale fisierelor, nu niste numere
 * rotunde. Next.js le foloseste ca sa rezerve locul inainte de incarcare; date gresit, pagina ar
 * fi sarit exact cand se aseaza sigla.
 */

/** Dimensiunile reale ale fisierelor din `public/integrations`, citite din ele. */
const SIGLE = {
  olx: { src: "/integrations/olx.svg", alt: "OLX", w: 78, h: 45 },
  trendyol: { src: "/integrations/trendyol.svg", alt: "Trendyol", w: 100, h: 23 },
  emag: { src: "/integrations/emag.webp", alt: "eMAG", w: 3840, h: 1030 },
  aboutyou: { src: "/integrations/aboutyou.png", alt: "About You", w: 434, h: 44 },
} as const;

export type MarketplaceCuSigla = keyof typeof SIGLE;

export function SiglaMarketplace({
  piata,
  inaltime = 16,
  latimeMax = 72,
  className = "",
}: {
  piata: MarketplaceCuSigla;
  /** Inaltimea in pixeli. Latimea iese din raportul siglei. */
  inaltime?: number;
  /**
   * Cat de lata are voie sa fie, inainte sa se micsoreze pe inaltime.
   *
   * ⚠ FARA EA, About You AR IMPINGE BUTONUL AFARA DIN RAND. La 9,86 : 1, o sigla inalta de
   * saisprezece pixeli e lata de o suta cincizeci si opt — mai lata decat textul de langa ea.
   * Cu marginea asta, siglele late ies mai scunde, dar NICIODATA turtite; iar numele
   * marketplace-ului sta oricum scris in eticheta butonului, deci nu se pierde nimic.
   */
  latimeMax?: number;
  className?: string;
}) {
  const s = SIGLE[piata];
  return (
    <Image
      src={s.src}
      alt={s.alt}
      width={s.w}
      height={s.h}
      /*
       * ⚠ `height` in stil, `width: auto` — si `object-contain` peste ele, ca sigla sa nu fie
       * intinsa nici daca vreun parinte ii impune o latime.
       */
      style={{ height: inaltime, width: "auto", maxWidth: latimeMax }}
      className={`shrink-0 object-contain ${className}`}
      /*
       * ⚠ Siglele partenerilor NU se trec prin optimizatorul de imagini: sunt mici, doua sunt
       * vectoriale, iar o marca reprocesata isi pierde marginile curate exact la dimensiunea la
       * care se citeste.
       */
      unoptimized
    />
  );
}
