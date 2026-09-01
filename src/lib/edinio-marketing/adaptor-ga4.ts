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
import { codGa4 } from "./mediu";
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

  gata: () => gtag() !== null,

  trimite(ev, context) {
    const g = gtag();
    if (!g) return;

    const nume = numeGa4(ev);
    if (!nume) return;

    const { name: _nume, ...parametri } = ev;
    void _nume;

    /*
      ⚠ ADRESA SE CURATA AICI, nu la apelant. Un `page_view` trimis dintr-o
      componenta care a uitat sa curete ar duce un jeton de dezabonare in
      rapoarte — de unde nu se mai scoate. Locul potrivit pentru paza e cel prin
      care trec TOATE, nu fiecare apelant.
    */
    if ("page_location" in parametri && typeof parametri.page_location === "string") {
      parametri.page_location = curataAdresa(parametri.page_location);
    }

    g("event", nume, { ...parametri, ...context });
  },
};

/**
 * Configurarea etichetei, pentru scriptul de pornire.
 *
 * ⚠ `send_page_view: false` E MIEZUL. Eticheta trage singura un `page_view` la
 * incarcare. Dar aplicatia e App Router: navigarea dintre pagini nu reincarca
 * documentul, deci evenimentul acela ar veni O SINGURA DATA pe toata sesiunea,
 * oricate pagini ar vedea omul. Iar daca il tragem si noi, prima pagina ar fi
 * numarata de doua ori.
 *
 * Deci: eticheta tace, iar `page_view` il trimitem noi — o data la incarcare si
 * o data la fiecare schimbare de cale. Vezi `RuntimeMarketing`.
 */
export function configurareGa4(): { cod: string; optiuni: Record<string, unknown> } | null {
  const cod = codGa4();
  if (!cod) return null;
  return {
    cod,
    optiuni: {
      send_page_view: false,
      /*
        ⚠ Fara `user_id`, dinadins, si fara nimic care leaga sesiunea de un cont.
        Masuram anonim; daca vom avea vreodata nevoie de altceva, e o hotarare
        separata, cu textele legale schimbate odata cu ea.
      */
    },
  };
}
