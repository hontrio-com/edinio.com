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

  ═══ ⚠ DOUA TREPTE DE LATIME, MASURATE PE PAGINA ADEVARATA (24.11.2026) ═══

  De la 1280 px (`xl`): sigla si eticheta. Butonul are 187 px, iar cautarii ii
  raman 371 (din cei 384 cat poate avea), cu un prenume de unsprezece litere in
  dreapta.

  Sub 1280 px: doar sigla (33 px), pe orice ecran. Eticheta apare abia de la
  `xl`, nu de la `lg` ca la Scapa de Stoc: la 1024 px cautarea are 269 px cu
  butonul fara eticheta, iar cu eticheta (inca 154 px) i-ar fi ramas 115, adica o
  caseta in care nu incape nici indemnul ei. Asta e socotit din latimile
  masurate, nu vazut.

  ═══ ⚠ PE TELEFON STA IN LOCUL LUI SCAPA DE STOC, NU LANGA EL ═══

  Cerut de proprietar dupa prima versiune: „Pe mobil acolo in topbar in loc de
  logo de la scapa de stoc, pui Hontrio. Scapadestoc sa se vada doar de pe
  laptop/pc sau ecrane mai mari". Deci sub `lg` in bara e doar butonul asta, iar
  Scapa de Stoc apare de la `lg` in sus (clasele sunt in `ScapaDeStoc.tsx`).

  ⚠ DE CE NU AMANDOUA PE TELEFON, cum iesise prima forma inainte de a ascunde
  unul: doua butoane de partener lasau cautarii 91 px la un ecran de 390 si 70 la
  unul de 360, adica o caseta in care se vad trei litere. Cu unul singur are 135
  si 105.
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
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <SemnHontrio className="h-3.5" />
      <span className="hidden whitespace-nowrap xl:inline">{INDEMN_HONTRIO}</span>
    </a>
  );
}

/**
 * Aceeasi usa, ca rand in meniul lateral de pe telefon si de pe tableta.
 *
 * Acolo butonul din bara e doar semnul „H", fara eticheta, iar pe un ecran cu
 * atingere nu exista nici indiciul de la trecerea cu mausul. Randul asta e locul
 * in care scrie si ce face.
 *
 * ⚠ ARE CHEIA LUI DE RAPORT (`meniu-telefon`), nu pe a butonului: altfel apasarile
 * din meniu s-ar aduna cu cele din bara si nu s-ar mai vedea daca randul e
 * folosit de cineva.
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
