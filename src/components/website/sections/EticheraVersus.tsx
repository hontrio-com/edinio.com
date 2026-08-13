import { CULORI_MARCI, type VersusKey } from "@/lib/website/versus-culori";

/**
 * Rândul de deasupra titlului pe paginile „Edinio vs …": numele celor două
 * platforme, fiecare în culoarea mărcii lui.
 *
 * ═══ ÎNAPOI LA TEXT, DUPĂ SIGLE ═══
 *
 * A trecut prin trei forme, iar a treia e chiar prima: text simplu, apoi sigle,
 * apoi iar text — de data asta colorat. Siglele au fost scoase la cererea
 * clientului (14.08), cu tot cu fișierele lor.
 *
 * Merită spus de ce au fost grele, fiindcă e o lecție despre ce cere un rând de
 * sigle: șapte mărci desenate de șapte oameni diferiți n-au nimic comun — nici
 * proporția (0,88 la Shopify, 5,56 la Cartum), nici cât desen au în cutie (0,15
 * la WooCommerce, 0,79 la OpenCart), nici măcar dacă fișierul e strâns pe desen
 * sau plutește într-o cutie mai mare. Ca să pară egale a trebuit: strânse toate
 * fișierele, măsurată cerneala fiecăreia, ales un model între „înălțime egală" și
 * „suprafață egală", plus corecții hotărâte privind. Cu text, nimic din toate
 * astea nu mai există — literele au deja aceeași mărime.
 *
 * ═══ CULORILE ═══
 *
 * ⚠ SUNT ALE MĂRCILOR, DAR ÎNTUNECATE CÂT SĂ SE CITEASCĂ. Verdele Shopify pe alb
 * dă un contrast de 2,14 — sub jumătate din pragul de 4,5 cerut pentru un text
 * mic; albastrul OpenCart, 2,24. Scrise așa, la 13px cu majuscule răsfirate, ar
 * fi fost aproape invizibile pe hero-ul deschis. Socoteala și valorile măsurate
 * sunt în `versus-culori.ts`.
 *
 * ⚠ Desenul rândului e cel de la `SectionEyebrow` — aceeași mărime, aceeași
 * răsfirare a literelor, aceeași margine de compensare la capăt. Nu se folosește
 * chiar componenta aia fiindcă ea primește un singur șir, iar aici sunt trei
 * bucăți cu trei culori. Dacă se schimbă acolo, se schimbă și aici.
 */
export function EticheraVersus({ cheie }: { cheie: VersusKey }) {
  const marca = CULORI_MARCI[cheie];

  return (
    <p className="pe-[0.18em] text-[13px] font-semibold uppercase tracking-[0.18em]">
      {/* Numele nostru în verdele nostru, al lor în al lor. „vs" rămâne stins: e
          legătura dintre două nume, nu un al treilea nume. */}
      <span style={{ color: CULORI_MARCI.edinio.culoare }}>Edinio</span>
      <span className="text-ink-3"> vs </span>
      <span style={{ color: marca.culoare }}>{marca.nume}</span>
    </p>
  );
}
