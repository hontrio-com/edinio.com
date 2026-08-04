"use client";

import { useEffect, useRef } from "react";
import { recordOfferImpressions } from "@/lib/actions/offer.actions";

/**
 * Afisarea ofertelor de pe pagina de produs, numarata O SINGURA DATA, cand
 * sectiunea chiar intra pe ecran.
 *
 * Doua decizii stau aici, si stau intr-un singur loc fiindca ambele designuri de
 * pagina de produs (`ProductPageClassic` si `ProductPageDetailed`) au nevoie de
 * ele si diverg imediat ce sunt scrise de doua ori:
 *
 * 1. Se numara din BROWSER, nu la randare. `resolveProductOffers` ruleaza pe
 *    server la fiecare cerere (pagina e dinamica), iar `next/link` cere pagina si
 *    la simpla trecere cu mausul peste un card din catalog. Un contor crescut
 *    acolo ar fi numarat preincarcari si crawlere, si — mai rau — ar fi pus o
 *    scriere in baza pe drumul critic al FIECAREI incarcari de pagina de produs,
 *    la toate magazinele, inclusiv la cele fara nicio oferta.
 *
 * 2. Se numara la INTRAREA IN ECRAN, nu la incarcare. Sectiunea de oferte sta
 *    mult sub prima imagine, deci majoritatea vizitatorilor n-ajung niciodata la
 *    ea; numarata la incarcare, fiecare oferta ar fi aratat o rata de acceptare
 *    de cateva ori mai mica decat cea adevarata. Tot asa se numara si pe
 *    celelalte doua suprafete — acolo lista se cere abia cand se deschide
 *    sertarul de cos sau formularul de comanda, adica tot cand ajunge pe ecran —
 *    deci cele trei suprafete raman comparabile intre ele in acelasi contor.
 *
 * Intoarce ref-ul care trebuie pus pe invelisul sectiunii de oferte.
 */
export function useAfisariOferte(businessId: string, offerIds: string[], activ: boolean) {
  // Cheia e sirul, nu tabloul: un tablou nou la fiecare randare ar reporni
  // efectul (si observatorul) la fiecare alegere de varianta.
  const cheie = offerIds.join(",");
  const gazda = useRef<HTMLDivElement | null>(null);
  const trimise = useRef("");

  useEffect(() => {
    if (!activ || !cheie || trimise.current === cheie) return;
    const numara = () => {
      // `trimise` face ca o incarcare de pagina sa insemne o singura afisare,
      // oricate re-randari si oricate treceri prin StrictMode ar urma.
      if (trimise.current === cheie) return;
      trimise.current = cheie;
      recordOfferImpressions(businessId, cheie.split(",")).catch(() => {});
    };

    const nod = gazda.current;
    // Fara nod montat sau fara IntersectionObserver se numara pe loc: o afisare
    // optimista e mai buna decat un contor care ramane pe zero — exact defectul
    // reparat aici.
    if (!nod || typeof IntersectionObserver === "undefined") {
      numara();
      return;
    }
    // Prag 0: sectiunea de oferte poate fi mai inalta decat ecranul unui telefon,
    // iar un prag procentual n-ar fi fost atins niciodata acolo.
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
