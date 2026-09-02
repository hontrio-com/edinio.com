/*
  ═══════════════════════════════════════════════════════════════════════════════
  ADAPTORUL META — SINGURUL LOC CARE STIE CE E `fbq`
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ AL EDINIO, NU AL VREUNUI COMERCIANT. Pixelul din magazinele lor sta in
  `components/public/FacebookPixel.tsx`, cu id-ul fiecaruia, si nu se intalneste
  niciodata cu asta. Vezi `lib/granita-tracking.test.ts`.

  ═══ ⚠ `page_view` NU SE TRIMITE DE AICI. MASURAT, NU PRESUPUS. ═══

  Prima forma a fisierului trimitea `PageView` la fiecare navigare, fiindca in
  App Router documentul nu se reincarca si pareau pierdute.

  Masurat pe `www.edinio.com` in 01.09.2026, cu doua navigari fara reincarcare
  (`/` → `/preturi` → `/integrari`): pixelul Meta a trimis SINGUR cate un
  `PageView` la fiecare. `fbevents.js` isi pune propriul carlig pe schimbarea
  istoricului.

  Deci un `PageView` trimis si de noi ar fi DUBLAT fiecare vizualizare de pagina
  din contul de reclame — si nimic n-ar fi cazut. Exact felul de defect care se
  vede abia cand cineva compara doua rapoarte.

  ⚠ DACA VREODATA SE OPRESTE „Track Events Automatically" din setarile pixelului,
  numaratoarea de pagini se stinge si trebuie repornita DE ACOLO, nu de aici.
*/

import type { Adaptor } from "./magistrala";
import type { EvenimentEdinio } from "./evenimente";

type Fbq = (...a: unknown[]) => void;

function fbq(): Fbq | null {
  const f = (window as unknown as { fbq?: Fbq }).fbq;
  return typeof f === "function" ? f : null;
}

type Trimitere = {
  nume: string;
  date: Record<string, unknown>;
  /** Id-ul cu care Meta uneste evenimentul din browser cu cel de pe server. */
  eventID?: string;
};

/*
  ⚠ HARTA E SINGURA POARTA. Ce nu e aici nu pleaca spre Meta — nu fiindca o lista
  separata spune asa, ci fiindca nu exista cartografiere.

  Prima forma avea si o constanta `CATRE_RECLAME` cu numele evenimentelor voie sa
  plece. Am scos-o: nimeni n-o citea, deci era o promisiune, nu o paza. Si ar fi
  devenit mincinoasa oricum — Meta si TikTok nu numesc la fel aceleasi lucruri
  (`Lead` la unul, `SubmitForm` la celalalt).

  ⚠ CATRE META PLEACA PUTIN, DINADINS. Analiza se face in GA4. Aici merg numai
  lucrurile pe care algoritmul lor le poate folosi la optimizare; restul umple
  contul de zgomot si incetineste invatarea.
*/
export function catreMeta(ev: EvenimentEdinio): Trimitere | null {
  switch (ev.name) {
    case "landing_view":
      return { nume: "ViewContent", date: { content_name: ev.content_name, content_category: ev.content_category } };

    case "generate_lead":
      return { nume: "Lead", date: { content_name: ev.form_name }, eventID: ev.event_id };

    case "sign_up":
      return { nume: "CompleteRegistration", date: {}, eventID: ev.event_id };

    case "begin_checkout":
      return { nume: "InitiateCheckout", date: { content_name: ev.plan_id } };

    case "add_payment_info":
      return { nume: "AddPaymentInfo", date: { content_name: ev.plan_id } };

    case "trial_start":
      return { nume: "StartTrial", date: { content_name: ev.plan_id, currency: "RON", value: 0 }, eventID: ev.event_id };

    /*
      ⚠ `predicted_ltv: 0` DINADINS, nu din lene. Meta il foloseste ca valoare
      prezisa pe viata clientului; un numar inventat de noi ar invata licitatia
      pe o minciuna. Zero inseamna „nu stim", si e adevarat: nu avem inca un
      model de retentie.
    */
    case "purchase":
      return {
        nume: "Subscribe",
        date: { value: ev.value, currency: ev.currency, content_name: ev.plan_id, predicted_ltv: 0 },
        eventID: ev.event_id,
      };

    default:
      return null;
  }
}

export const adaptorMeta: Adaptor = {
  nume: "meta",
  categorie: "marketing",

  gata: () => fbq() !== null,

  trimite(ev) {
    const f = fbq();
    if (!f) return;

    const t = catreMeta(ev);
    if (!t) return;

    /*
      ⚠ CONTEXTUL PAGINII NU PLEACA SPRE META. `page_type` si `page_group` sunt
      dimensiuni de analiza, folositoare in GA4 si fara rost intr-un cont de
      reclame — unde ar deveni parametri personalizati pe care nu-i citeste
      nimeni.
    */
    if (t.eventID) f("track", t.nume, t.date, { eventID: t.eventID });
    else f("track", t.nume, t.date);
  },
};
