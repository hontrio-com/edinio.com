import { culoareSigura } from "@/lib/pages/culori";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CULOAREA MAGAZINULUI, SIGURA DE PUS INTR-UN `style`                 (19.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Gasit la auditul temelor: `businesses.primary_color` e `text` fara nicio constrangere in baza, iar comerciantul isi
  poate scrie randul si direct, pe langa panou. Vitrina il punea neschimbat in `style` (variabilele `--st-*`, fundaluri,
  culori de text). La randarea pe server React scapa ghilimelele dintr-o valoare de stil, dar NU si `;`, deci un
  `#fff;position:fixed;inset:0;background:url(//altundeva)` adauga proprietati intregi pe elementul acela.

  Culorile blocurilor treceau deja prin `culoareSigura` (`lib/pages/culori.ts`, 25.09.2026); culoarea magazinului si
  fundalul din „Stil” (`page_content.store_bg_color`), nu. Aici e poarta lor: formele de culoare cunoscute trec
  neschimbate (hex, `rgb()`/`hsl()`, nume), orice altceva cade pe rezerva.
*/

/** Verdele platformei: culoarea unui magazin care n-are una valida. */
export const CULOARE_PLATFORMA = "#07c527";

/** Culoarea principala a magazinului, din `businesses.primary_color`. */
export function culoareMagazin(valoare: unknown): string {
  return culoareSigura(valoare) ?? CULOARE_PLATFORMA;
}

/** O culoare aleasa de comerciant (fundalul din „Stil”), sau `null` cand lipseste ori nu e o culoare. */
export function culoareAleasa(valoare: unknown): string | null {
  return culoareSigura(valoare);
}
