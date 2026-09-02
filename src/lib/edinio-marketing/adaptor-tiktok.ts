/*
  ═══════════════════════════════════════════════════════════════════════════════
  ADAPTORUL TIKTOK — SINGURUL LOC CARE STIE CE E `ttq`
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ AL EDINIO, NU AL VREUNUI COMERCIANT. Pixelul magazinelor sta in
  `components/public/TikTokPixel.tsx`, cu id-ul fiecarui comerciant.

  ⚠ `page` NU SE TRIMITE DE AICI, din acelasi motiv ca la Meta: pixelul si-l trage
  singur la incarcare si la schimbarea rutei. Vezi nota lunga din `adaptor-meta.ts`,
  cu masuratoarea din 01.09.2026.

  ═══ ⚠ VOCABULARUL TIKTOK NU E CEL AL META ═══

  Doua deosebiri care s-au vazut deja in codul vechi si care sunt usor de ratat:

  1. O CERERE DE OFERTA e `Lead` la Meta si `SubmitForm` la TikTok. TikTok n-are
     `Lead`.
  2. TIKTOK N-ARE `StartTrial`. Lista lor de evenimente standard e: ViewContent,
     ClickButton, Search, AddToWishlist, AddToCart, InitiateCheckout,
     AddPaymentInfo, CompletePayment, PlaceAnOrder, Contact, Download,
     SubmitForm, CompleteRegistration, Subscribe.

     Deci `StartTrial` pleaca spre ei ca eveniment PERSONALIZAT — merge, se vede
     in Events Manager, dar NU apare in lista de obiective standard de
     optimizare. Cine cauta acolo si nu-l gaseste sa nu creada ca s-a stricat
     ceva: se foloseste ca „conversie personalizata".

     ⚠ Si nu se inlocuieste cu `Subscribe`: un trial gratuit trimis ca abonare ar
     invata licitatia sa caute oameni care nu platesc.
*/

import type { Adaptor } from "./magistrala";
import type { EvenimentEdinio } from "./evenimente";

type Ttq = { track: (...a: unknown[]) => void };

function ttq(): Ttq | null {
  const t = (window as unknown as { ttq?: Ttq }).ttq;
  return t && typeof t.track === "function" ? t : null;
}

type Trimitere = {
  nume: string;
  date: Record<string, unknown>;
  /** Id-ul cu care TikTok uneste evenimentul din browser cu cel de pe server. */
  eventId?: string;
};

/** Harta e singura poarta: ce nu e aici nu pleaca spre TikTok. */
export function catreTikTok(ev: EvenimentEdinio): Trimitere | null {
  switch (ev.name) {
    /*
      ═══ ⚠ `content_type` NU E TEXT LIBER LA TIKTOK ═══

      Prima forma trimitea `content_type: ev.content_category`, adica „landing" si
      „pricing". TikTok primeste evenimentul si se plange in consola:

        [TikTok Pixel] - Invalid content type
        Content type must be either "product", "product_group", "destination",
        "hotel", "flight" or "vehicle".

      E o multime INCHISA, nu o categorie a noastra. Gasit pe 02.09.2026 in
      consola productiei, nu in cod — nimic nu cadea, doar plecau date invalide.

      ⚠ SI NU SE INLOCUIESTE CU "product". Paginile noastre de aterizare nu sunt
      produse; o minciuna acolo ar strica orice audienta construita pe ea. Campul
      lipseste dinadins, iar categoria pleaca sub numele ei adevarat.

      ⚠ `content_id` E CERUT de ei pentru audiente si pentru Video Shopping Ads —
      lipsa lui era a doua plangere din aceeasi consola. Numele paginii e stabil,
      scurt si fara nimic personal, deci e un id bun.
    */
    case "landing_view":
      return {
        nume: "ViewContent",
        date: {
          content_id: ev.content_name,
          content_name: ev.content_name,
          content_category: ev.content_category,
        },
      };

    /* ⚠ `SubmitForm`, nu `Lead`. TikTok n-are `Lead`. Vezi nota de sus. */
    case "generate_lead":
      return { nume: "SubmitForm", date: { content_name: ev.form_name }, eventId: ev.event_id };

    case "sign_up":
      return { nume: "CompleteRegistration", date: {}, eventId: ev.event_id };

    case "begin_checkout":
      return { nume: "InitiateCheckout", date: { content_name: ev.plan_id } };

    case "add_payment_info":
      return { nume: "AddPaymentInfo", date: { content_name: ev.plan_id } };

    /* ⚠ Personalizat, nu standard. Vezi nota de sus. */
    case "trial_start":
      return { nume: "StartTrial", date: { content_name: ev.plan_id }, eventId: ev.event_id };

    case "purchase":
      return {
        nume: "Subscribe",
        date: { value: ev.value, currency: ev.currency, content_name: ev.plan_id },
        eventId: ev.event_id,
      };

    default:
      return null;
  }
}

export const adaptorTikTok: Adaptor = {
  nume: "tiktok",

  gata: () => ttq() !== null,

  trimite(ev) {
    const t = ttq();
    if (!t) return;

    const tr = catreTikTok(ev);
    if (!tr) return;

    /* ⚠ La TikTok cheia se numeste `event_id`, nu `eventID` ca la Meta. */
    if (tr.eventId) t.track(tr.nume, tr.date, { event_id: tr.eventId });
    else t.track(tr.nume, tr.date);
  },
};
