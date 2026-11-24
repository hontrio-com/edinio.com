import { ArrowUpRight } from "lucide-react";
import {
  adresaPrezentareHontrio, CE_FACE_HONTRIO, INDEMN_HONTRIO, NUMELE_HONTRIO,
} from "@/lib/parteneri/hontrio";

/*
  ═══════════════════════════════════════════════════════════════════════════
  „PROMOVEAZĂ-ȚI MAGAZINUL", IN BARA DE SUS                      (24.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Duce la Hontrio, platforma-sora care face reclamele Google Shopping ale
  magazinului. Sta langa „Scapă de Stoc" si are forma lui: sigla si eticheta, in
  chenarul subtire al butoanelor din bara. „Adaugă" ramane singurul buton plin.

  ⚠ FILA NOUA, NU FEREASTRA CU CADRU, cum are Scapa de Stoc. Hontrio raspunde cu
  `X-Frame-Options: DENY`, iar conectarea trece prin fereastra Google, care nu se
  lasa incadrata. Vezi `@/lib/parteneri/hontrio`.

  ⚠ FARA `"use client"`: n-are stare si n-are efecte. Ajunge oricum in pachetul
  browserului, fiindca il importa bara de sus, care e componenta de client.

  ═══ ⚠ TREI TREPTE DE LATIME, TOATE MASURATE (24.11.2026) ═══

  De la 1280 px (`xl`): sigla si eticheta. Butonul are 187 px, iar cautarea isi
  pastreaza cei 384 px ai ei.

  Intre 640 si 1279 px: doar sigla (33 px). Eticheta apare abia de la `xl`, nu de
  la `lg` ca la Scapa de Stoc. La 1024 px cautarea are 314 px cu butonul fara
  eticheta; cu eticheta (inca 154 px) i-ar fi ramas 160, adica o caseta in care
  nu incape nici indemnul ei. Asta e socotit din latimile masurate, nu vazut.

  Sub 640 px (telefon): butonul NU se arata in bara. Cu el, cautarea ramanea cu
  91 px la un ecran de 390 si cu 70 la unul de 360, fata de 130 si 100 fara el:
  o caseta in care se vad trei litere. Pe telefon intrarea sta in meniul lateral,
  ca rand cu text (`RandHontrio`, mai jos), unde are loc sa spuna si ce e.
*/
export function ButonHontrio() {
  return (
    <a
      href={adresaPrezentareHontrio("bara-de-sus")}
      target="_blank"
      /* `noopener`: fila deschisa nu primeste `window.opener`, deci nu poate muta panoul de sub om. */
      rel="noopener noreferrer"
      title={`${CE_FACE_HONTRIO} Se deschide într-o filă nouă.`}
      /*
        ⚠ NUMELE SE SCRIE EXPLICIT. Sub `xl` eticheta e `display:none`, iar ce e
        ascuns asa nu intra in numele accesibil: ar fi ramas numele din `title`,
        adica toata descrierea, citita la fiecare trecere. Si spune unde duce:
        „Promovează-ți magazinul" singur nu pomeneste ca pleci din panou.
      */
      aria-label={`${INDEMN_HONTRIO} cu ${NUMELE_HONTRIO} (se deschide într-o filă nouă)`}
      className="hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:inline-flex"
    >
      <SemnHontrio className="h-3.5" />
      <span className="hidden whitespace-nowrap xl:inline">{INDEMN_HONTRIO}</span>
    </a>
  );
}

/**
 * Aceeasi usa, ca rand in meniul lateral de pe telefon.
 *
 * ⚠ ARE CHEIA LUI DE RAPORT (`meniu-telefon`), nu pe a butonului: altfel vizitele
 * de pe telefon s-ar aduna cu cele de pe calculator si nu s-ar mai vedea daca
 * randul din meniu e folosit de cineva.
 */
export function RandHontrio({ laApasare }: { laApasare?: () => void }) {
  return (
    <a
      href={adresaPrezentareHontrio("meniu-telefon")}
      target="_blank"
      rel="noopener noreferrer"
      onClick={laApasare}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
    >
      {/* Locas de 16 px, cat iconitele celorlalte randuri, ca textele sa inceapa pe aceeasi linie. */}
      <span className="grid h-4 w-4 flex-shrink-0 place-items-center">
        <SemnHontrio className="h-4" />
      </span>
      <span className="flex-1">{INDEMN_HONTRIO}</span>
      <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span className="sr-only">(se deschide într-o filă nouă)</span>
    </a>
  );
}

/**
 * Semnul „H", fisierul lor: negru pe fond gol, cum il au si ca iconita a site-ului.
 *
 * ⚠ FARA `dark:invert`, desi pare ca ar trebui. Panoul n-are tema intunecata:
 * `.zona-aplicatie` fixeaza fundalul pe alb, iar clasa `dark` nu o pune nimeni
 * (verificat pe 24.11.2026). Cu inversarea scrisa, in ziua in care `dark` ar
 * ajunge pe un stramos, semnul ar iesi ALB pe bara alba, adica nevazut. Cine
 * face candva tema intunecata trece oricum prin toate siglele din panou.
 *
 * `alt=""`: numele il spune textul de langa sau `aria-label`-ul butonului.
 */
function SemnHontrio({ className }: { className: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/integrations/hontrio.png"
      alt=""
      width={470}
      height={508}
      className={`w-auto flex-shrink-0 ${className}`}
    />
  );
}
