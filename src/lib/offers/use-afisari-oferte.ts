"use client";

import { useEffect, useRef } from "react";
import { recordOfferImpressions } from "@/lib/actions/offer.actions";
import { deNumaratAcum, maiEDeNumarat } from "./o-data-pe-vizita";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CÂND SE NUMĂRĂ CĂ O OFERTĂ A FOST VĂZUTĂ                      (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ CE SCRIA AICI ERA NEADEVĂRAT, ȘI DE-AIA S-A REFĂCUT.
 *
 * Comentariul de până azi spunea că „tot așa se numără și pe celelalte două
 * suprafețe… deci cele trei suprafețe rămân comparabile între ele în același
 * contor”. Baliza fusese însă legată DOAR la pagina de produs. Măsurat pe
 * producție la 22.09.2026, asta se vedea în cifre: ofertele de tip `cross_sell`
 * aveau 405 afișări și 0 conversii, iar cele de tip `order_bump` 0 afișări și 29
 * de conversii. Fiecare tip era numărat pe jumătate — și fiecare jumătate arăta
 * ca o măsurătoare întreagă.
 *
 * ⚠ REGULA, ACUM UNA SINGURĂ PENTRU TOATE PATRU SUPRAFEȚELE: o ofertă se
 * numără O DATĂ PE VIZITĂ, când chiar ajunge pe ecran.
 *
 * 1. Se numără din BROWSER, nu la randare. `resolveProductOffers` rulează pe
 *    server la fiecare cerere (pagina e dinamică), iar `next/link` cere pagina și
 *    la simpla trecere cu mausul peste un card din catalog. Un contor crescut
 *    acolo ar fi numărat preîncărcări și crawlere, și — mai rău — ar fi pus o
 *    scriere în bază pe drumul critic al FIECĂREI încărcări de pagină de produs.
 *    La fel pe celelalte: `getCheckoutBumps` se re-cheamă la fiecare schimbare a
 *    coșului, deci numărat acolo un bump ar fi strâns câteva afișări dintr-o
 *    singură deschidere a formularului.
 *
 * 2. Se numără la INTRAREA ÎN ECRAN, nu la montare. Secțiunea de oferte stă mult
 *    sub prima imagine, deci majoritatea vizitatorilor n-ajung niciodată la ea;
 *    numărată la încărcare, fiecare ofertă ar fi arătat o rată de acceptare de
 *    câteva ori mai mică decât cea adevărată.
 *
 * 3. ⚠⚠ O DATĂ PE VIZITĂ, NU O DATĂ PE MONTARE — `o-data-pe-vizita.ts`. Cine
 *    deschide sertarul de coș de trei ori a avut o singură ocazie să accepte
 *    recomandarea, nu trei. Și conversiile se numără o dată pe comandă, adică
 *    cel mult una pe vizită; numărate pe montare, afișările ar fi crescut singure
 *    la fiecare redeschidere, iar rata ar fi scăzut fără ca nimic să se schimbe.
 *
 * ⚠ REGULA „o dată pe vizită” STĂ ÎN `o-data-pe-vizita.ts`, nu aici: fișierul de
 * față aduce `recordOfferImpressions` dintr-unul `"use server"`, care la rândul lui
 * aduce `next/headers` — deci n-ar fi putut fi încărcat de o probă. Acolo se
 * măsoară cu numere; aici rămâne doar CÂND se întreabă.
 */

/**
 * Întoarce ref-ul care trebuie pus pe învelișul în care se văd ofertele.
 *
 * `activ` oprește numărătoarea acolo unde ecranul e doar o demonstrație.
 */
export function useAfisariOferte(businessId: string, offerIds: string[], activ: boolean) {
  // Cheia e șirul, nu tabloul: un tablou nou la fiecare randare ar reporni
  // efectul (și observatorul) la fiecare alegere de variantă.
  const cheie = offerIds.join(",");
  const gazda = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activ || !cheie) return;
    const ids = cheie.split(",");
    // Toate văzute deja în vizita asta — nu se mai pune nici observator, nici
    // cerere. Doar întrebat: însemnate aici, ofertele la care vizitatorul nu
    // coboară niciodată ar fi ieșit din socoteală ca și cum le-ar fi văzut.
    if (!maiEDeNumarat(ids)) return;

    const numara = () => {
      const acum = deNumaratAcum(ids);
      if (acum.length === 0) return;
      recordOfferImpressions(businessId, acum).catch(() => {});
    };

    const nod = gazda.current;
    // Fără nod montat sau fără IntersectionObserver se numără pe loc: o afișare
    // optimistă e mai bună decât un contor care rămâne pe zero — exact defectul
    // reparat aici.
    if (!nod || typeof IntersectionObserver === "undefined") {
      numara();
      return;
    }
    // Prag 0: secțiunea de oferte poate fi mai înaltă decât ecranul unui telefon,
    // iar un prag procentual n-ar fi fost atins niciodată acolo.
    const obs = new IntersectionObserver((intrari) => {
      if (intrari.some((i) => i.isIntersecting)) {
        numara();
        obs.disconnect();
      }
    }, { threshold: 0 });
    obs.observe(nod);
    return () => obs.disconnect();
  }, [businessId, cheie, activ]);

  return gazda;
}
