/*
  ═══════════════════════════════════════════════════════════════════════════════
  ADAPTORUL GA4 — SINGURUL LOC CARE STIE CE E `gtag`
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ NUMELE NOASTRE SUNT DEJA CELE ALE GA4 acolo unde GA4 are un nume potrivit, deci
  cartografierea e aproape una la unu. Exceptiile sunt scrise mai jos, fiecare cu
  motivul ei — o cartografiere fara motiv scris devine, peste sase luni, o
  ciudatenie pe care nimeni nu indrazneste s-o atinga.
*/

import type { Adaptor } from "./magistrala";
import type { EvenimentEdinio } from "./evenimente";
import { eDepanare } from "./mediu";
import { curataAdresa } from "./adresa-curata";

type Gtag = (...a: unknown[]) => void;

function gtag(): Gtag | null {
  const g = (window as unknown as { gtag?: Gtag }).gtag;
  return typeof g === "function" ? g : null;
}

/*
  ⚠ EVENIMENTELE PE CARE GA4 LE TRAGE SINGUR NU SE TRIMIT DE MANA.
  `session_start`, `first_visit` si `user_engagement` sunt puse de eticheta.
  Trimise si de noi, ar aparea de doua ori si ar strica numaratoarea sesiunilor.
  Lista e aici ca sa fie limpede ce NU facem, nu doar ce facem.
*/
export const TRASE_DE_GA4_SINGUR = ["session_start", "first_visit", "user_engagement"] as const;

/**
 * Numele GA4 pentru un eveniment de-al nostru.
 *
 * `null` inseamna „nu se trimite in Analytics" — nu „nu se trimite nicaieri".
 */
function numeGa4(ev: EvenimentEdinio): string | null {
  switch (ev.name) {
    /*
      ⚠ SINGURUL EVENIMENT CARE NU INTRA IN ANALYTICS. `landing_view` exista
      numai ca sa hraneasca audientele de retargetare din Meta si TikTok, care se
      construiesc din `ViewContent`.

      In GA4 pagina e deja numarata de `page_view`, cu `page_type` si
      `page_group`. Trimis si aici, ar fi un al doilea nume pentru acelasi lucru
      — iar cine ar face un raport pe el ar numara vizitele de doua ori.
    */
    case "landing_view":
      return null;

    /*
      ⚠ `form_start` / `form_submit` / `form_error` poarta `form_name` ca
      parametru, in loc sa fie evenimente deosebite pe formular. Trei formulare x
      trei momente ar fi noua nume; asa raman trei, si se pot compara intre ele.
    */
    default:
      return ev.name;
  }
}

/** Adaptorul, gata de inregistrat in magistrala. */
export const adaptorGa4: Adaptor = {
  nume: "ga4",
  categorie: "statistici",

  /*
    ═══ ⚠ STEAGUL PROPRIU, NU `window.gtag` ═══

    Toti furnizorii Google impart aceeasi functie `gtag`. Forma veche intreba
    `gtag() !== null` si aici, si in adaptorul Google Ads — deci indata ce UNUL
    din ei se incarca, amandoi se credeau gata.

    ⚠ CE STRICA ASTA, si nu e o teorie: `gtag` exista din clipa in care corpul de
    baza a rulat, dar o masuratoare ajunge la proprietatea GA4 abia dupa `gtag('config', G-…)`.
    Intre cele doua clipe, un eveniment trimis pleaca fara cont — se pierde tacut,
    fiindca nimic nu cade si nimeni nu raspunde cu eroare.

    Steagul se ridica in chiar scriptul care face `config`, in aceeasi bucata.
    Deci „gata" inseamna aici „contul MEU e configurat", nu „exista un gtag".
  */
  gata: () => gtag() !== null && (window as unknown as Record<string, unknown>).__edinioGa4Pornit === true,

  trimite(ev, context) {
    const g = gtag();
    if (!g) return;

    const nume = numeGa4(ev);
    if (!nume) return;

    const { name: _nume, ...restul } = ev;
    void _nume;
    /*
      Tipul larg e pentru compilator, nu pentru siguranta: `...restul` face deja
      o copie, deci evenimentul primit nu se atinge — si nici nu are voie, el
      pleaca si spre celelalte adaptoare dupa noi. Dar tipul lui e o REUNIUNE de
      forme, iar mai jos se adauga o cheie care nu exista in niciuna
      (`transaction_id`), asa ca aici se pierde dinadins ingustimea.
    */
    const parametri: Record<string, unknown> = { ...restul };

    /*
      ⚠ ADRESA SE CURATA AICI, nu la apelant. Un `page_view` trimis dintr-o
      componenta care a uitat sa curete ar duce un jeton de dezabonare in
      rapoarte — de unde nu se mai scoate. Locul potrivit pentru paza e cel prin
      care trec TOATE, nu fiecare apelant.
    */
    if ("page_location" in parametri && typeof parametri.page_location === "string") {
      parametri.page_location = curataAdresa(parametri.page_location);
    }

    /*
      ⚠ LA `purchase`, GA4 CERE `transaction_id`. Fara el, doua abonamente cu
      aceeasi valoare in aceeasi zi pot fi socotite acelasi eveniment, iar
      raportul de venituri iese mai mic decat adevarul — in tacere, fiindca GA4
      nu respinge evenimentul, doar il deduplica.

      Noi avem deja un id unic pe eveniment, nascut pe server: `event_id`, acelasi
      pe care Meta si TikTok il folosesc ca sa uneasca browserul cu serverul. Il
      dam si aici, sub numele pe care il asteapta GA4.
    */
    if (ev.name === "purchase") {
      parametri.transaction_id = ev.event_id;
    }

    /*
      ═══ ⚠ `debug_mode` FACE EVENIMENTUL VIZIBIL IN DEBUGVIEW ═══

      Fara el, DebugView-ul din GA4 nu arata NIMIC — si asta e singurul loc unde
      poti vedea, eveniment cu eveniment, ce a ajuns chiar la Google si cu ce
      parametri. Documentul de configurare trimitea omul acolo; pana pe
      02.09.2026 il trimitea degeaba.

      ⚠ SE APRINDE ODATA CU JURNALUL DIN CONSOLA, adica numai la cine si-a pus
      cheia in `localStorage`. Un vizitator obisnuit nu trimite niciodata
      `debug_mode`.

      ⚠ SI NU MURDARESTE RAPOARTELE: GA4 tine evenimentele cu `debug_mode` in
      afara rapoartelor obisnuite, tocmai ca sa se poata proba pe viu.
    */
    if (eDepanare()) parametri.debug_mode = true;

    g("event", nume, { ...parametri, ...context });
  },
};

