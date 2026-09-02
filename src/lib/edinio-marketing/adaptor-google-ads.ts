import type { Adaptor } from "./magistrala";
import type { EvenimentEdinio } from "./evenimente";
import { trimiteCatre } from "./pixel-google-ads";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ADAPTORUL GOOGLE ADS
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ ALTFEL DECAT CEILALTI TREI, si merita spus de la inceput.

  GA4, Meta si TikTok primesc un NUME de eveniment si il numara. Google Ads nu:
  el numara ACTIUNI DE CONVERSIE create de mana in contul lui, fiecare cu eticheta
  ei. Noi trimitem mereu acelasi nume — `conversion` — si spunem prin `send_to`
  CARE actiune e.

  De aceea aici nu exista o cartografiere de nume, ci una de ETICHETE. Si de aceea
  o conversie fara eticheta nu se poate trimite „cumva": n-ar cadea cu eroare,
  s-ar pierde tacut.

  ⚠ SI DE CE NU TRIMITEM TOT CE TRIMITEM ALTORA. Un cont de reclame numara
  conversii, nu comportament. `scroll_depth`, `section_view` sau `faq_open`
  trimise aici ar deveni actiuni de conversie inexistente — adica zgomot catre un
  capat care oricum le ignora. Aici pleaca numai ce am fost rugati sa numaram.
*/

type Gtag = (comanda: string, nume: string, parametri?: Record<string, unknown>) => void;

function gtag(): Gtag | null {
  const g = (window as unknown as { gtag?: Gtag }).gtag;
  return typeof g === "function" ? g : null;
}

/**
 * Ce trimitem pentru un eveniment, sau `null` daca nu-l numaram.
 *
 * ⚠ SE PASTREAZA `transaction_id`, si nu e un moft. Google deduplica dupa el:
 * daca aceeasi conversie ajunge de doua ori — o pagina reincarcata, un buton
 * apasat de doua ori — o numara O data. Fara el, un abonament ar putea aparea ca
 * doua vanzari, iar licitatia ar invata pe cifre umflate.
 */
export function catreGoogleAds(ev: EvenimentEdinio): Record<string, unknown> | null {
  const send_to = trimiteCatre(ev.name);
  if (!send_to) return null;

  const idEveniment = (ev as { event_id?: string }).event_id;
  const valoare = (ev as { value?: number }).value;
  const moneda = (ev as { currency?: string }).currency;

  /*
    ⚠ VALOAREA PLEACA NUMAI CU MONEDA EI. O cifra fara unitate devine „venit" in
    rapoartele lor, socotit in moneda contului — deci 99 de lei ar putea fi cititi
    ca 99 de euro. Aceeasi regula ca la TikTok si Meta, din acelasi motiv.
  */
  const cuValoare = typeof valoare === "number" && !!moneda
    ? { value: valoare, currency: moneda }
    : {};

  return {
    send_to,
    ...(idEveniment ? { transaction_id: idEveniment } : {}),
    ...cuValoare,
  };
}

export const adaptorGoogleAds: Adaptor = {
  nume: "google-ads",
  categorie: "marketing",

  /*
    ═══ ⚠ STEAGUL PROPRIU, NU `window.gtag` ═══

    Toti furnizorii Google impart aceeasi functie `gtag`. Forma veche intreba
    `gtag() !== null` si aici, si in adaptorul GA4 — deci indata ce UNUL
    din ei se incarca, amandoi se credeau gata.

    ⚠ CE STRICA ASTA, si nu e o teorie: `gtag` exista din clipa in care corpul de
    baza a rulat, dar o conversie ajunge la contul de reclame abia dupa `gtag('config', AW-…)`.
    Intre cele doua clipe, un eveniment trimis pleaca fara cont — se pierde tacut,
    fiindca nimic nu cade si nimeni nu raspunde cu eroare.

    Steagul se ridica in chiar scriptul care face `config`, in aceeasi bucata.
    Deci „gata" inseamna aici „contul MEU e configurat", nu „exista un gtag".
  */
  gata: () => gtag() !== null && (window as unknown as Record<string, unknown>).__edinioAdsPornit === true,

  trimite(ev) {
    const g = gtag();
    if (!g) return;

    const parametri = catreGoogleAds(ev);
    if (!parametri) return;

    g("event", "conversion", parametri);
  },
};
