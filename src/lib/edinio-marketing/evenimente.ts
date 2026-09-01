/*
  ═══════════════════════════════════════════════════════════════════════════════
  TAXONOMIA: CE EVENIMENTE CUNOASTE EDINIO
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ O COMPONENTA SPUNE CE S-A INTAMPLAT, NU CUI SA-I SPUNA. Un buton trimite
  `cta_click`. El nu stie ca exista GA4, si cu atat mai putin ca exista Meta sau
  TikTok. Cartografierea catre fiecare furnizor sta in adaptoare, intr-un singur
  loc — altfel adaugarea unui furnizor nou ar cere umblat in patruzeci de
  componente, si scoaterea unuia ar lasa urme peste tot.

  ⚠ NUMELE SUNT ALE GA4 unde GA4 are deja un nume potrivit (`page_view`,
  `generate_lead`, `sign_up`, `view_search_results`). Nu inventam sinonime pentru
  lucruri care au deja un nume: un raport care spune `inregistrare` in loc de
  `sign_up` pierde tot ce stie GA4 despre evenimentul acela.

  ⚠ SI NU EXISTA UN EVENIMENT PE FIECARE BUTON. `cta_click` cu un `cta_id` e un
  raport; `click_buton_hero_verde` inmultit cu cincizeci e o mizerie in care nu se
  poate cauta. GA4 are oricum plafoane pe numarul de nume deosebite.
*/

import type { FelPagina, GrupPagina } from "./pagini";

/** Ce insoteste FIECARE eveniment, pus de magistrala, nu de componenta. */
export type ContextPagina = {
  page_type: FelPagina;
  page_group: GrupPagina;
};

/*
  ⚠ ID-URILE DE CTA SUNT STABILE SI NU DEPIND DE TEXT. Daca butonul isi schimba
  eticheta maine — si o va schimba — raportul trebuie sa ramana comparabil cu
  cel de azi. De aceea id-ul spune UNDE si CE FACE, nu ce scrie pe el.
*/
export type IdCta = string;

export type EvenimentEdinio =
  /* ─── Miez ─────────────────────────────────────────────────────────────── */
  | { name: "page_view"; page_location: string; page_title?: string }

  /* ─── Angajament ───────────────────────────────────────────────────────── */
  | { name: "section_view"; section_name: string }
  | { name: "scroll_depth"; percent: 25 | 50 | 75 | 90 }
  | { name: "cta_click"; cta_id: IdCta; cta_location: string; cta_destination?: string }
  | { name: "navigation_click"; nav_item: string; nav_location: string; destination_path: string }
  | { name: "outbound_click"; outbound_host: string; outbound_kind: "phone" | "whatsapp" | "email" | "link" }

  /*
    ═══ ⚠ DE AICI IN JOS: DECLARATE, DAR INCA NETRASE DE NICAIERI ═══

    Le las in taxonomie dinadins, si merita spus de ce — fiindca peste tot azi am
    scos exact felul asta de promisiune.

    Deosebirea: un COMENTARIU care promite o proba inexistenta insala pe cine il
    citeste. O VARIANTA de tip nu insala pe nimeni — ea nu spune „asta se
    intampla", ci „daca vei masura asta, asa se cheama si astea sunt campurile".
    Iar rostul ei e sa nu apara peste o luna trei nume deosebite pentru acelasi
    lucru, in trei componente scrise de trei oameni.

    ⚠ CE AR FI TOTUSI GRESIT: sa se creeze dimensiuni personalizate in GA4 pentru
    ele. Alea se fac numai pentru ce chiar pleaca. Lista de facut sta in
    documentul de configurare, nu aici.

    Trase azi: page_view, cta_click, navigation_click, outbound_click,
    section_view, scroll_depth, form_start/submit/error, generate_lead,
    article_view, article_read_progress, article_read_complete,
    newsletter_subscribe_request, newsletter_subscribe_confirmed.
  */

  /* ─── Preturi ──────────────────────────────────────────────────────────── */
  | { name: "billing_period_change"; billing_period: "monthly" | "annual" }
  | { name: "plan_select"; plan_id: string; billing_period: "monthly" | "annual" }
  | { name: "faq_open"; faq_id: string; faq_group: string }

  /* ─── Integrari ────────────────────────────────────────────────────────── */
  | { name: "integration_filter"; integration_category: string }
  | { name: "integration_view"; integration_id: string; integration_category?: string }

  /* ─── Formulare ────────────────────────────────────────────────────────── */
  | { name: "form_start"; form_name: "contact" | "migration" | "newsletter" }
  | { name: "form_submit"; form_name: "contact" | "migration" | "newsletter" }
  | { name: "form_error"; form_name: "contact" | "migration" | "newsletter"; error_type: string; field_name?: string }
  /*
    ⚠ `generate_lead` SE TRIMITE DOAR DUPA CE SERVERUL A CONFIRMAT. Apasarea pe
    buton nu e o conversie: poate cadea validarea, poate cadea captcha, poate
    cadea trimiterea emailului. Numarat la apasare, raportul ar arata de doua ori
    mai multe cereri decat au ajuns la noi.
  */
  | { name: "generate_lead"; lead_type: "contact" | "migration"; form_name: string; event_id: string }

  /* ─── Blog ─────────────────────────────────────────────────────────────── */
  | {
      name: "article_view";
      article_id: string; article_slug: string;
      article_category?: string; article_author?: string;
    }
  | { name: "article_read_progress"; article_id: string; read_depth: 25 | 50 | 75 | 90 }
  | { name: "article_read_complete"; article_id: string }
  | { name: "article_cta_click"; article_id: string; cta_id: IdCta; cta_position: "top" | "middle" | "bottom" | "sidebar" }
  | { name: "article_share"; article_id: string; share_method: string }
  | { name: "view_search_results"; search_term: string; search_scope: "blog" | "help" }
  /*
    ⚠ DOUA MOMENTE DEOSEBITE, si confundarea lor umfla raportul cu pana la
    jumatate. `request` = omul a cerut abonarea; `confirmed` = a apasat legatura
    din email. Intre ele se pierd cei care nu confirma niciodata.
  */
  | { name: "newsletter_subscribe_request" }
  | { name: "newsletter_subscribe_confirmed" }

  /* ─── Palnia noastra ───────────────────────────────────────────────────── */
  | { name: "registration_view" }
  | { name: "registration_start" }
  | { name: "sign_up"; signup_origin: string; event_id: string }
  | { name: "onboarding_step_view"; onboarding_step: string; onboarding_step_index: number }
  | { name: "onboarding_step_complete"; onboarding_step: string; onboarding_step_index: number }
  | { name: "onboarding_complete" };

export type NumeEveniment = EvenimentEdinio["name"];

/**
 * Evenimentele care sunt CONVERSII de afacere.
 *
 * ⚠ Se marcheaza „key event" in GA4 doar astea DOUA (randul spunea „trei" — gresit,
 * numarat inainte sa hotarasc ca abonarea confirmata nu e conversie de afacere).
 * Un clic pe un buton nu e o
 * conversie; marcat asa, optimizarea campaniilor invata sa caute clicuri in loc
 * de clienti.
 */
export const CONVERSII: ReadonlyArray<NumeEveniment> = ["generate_lead", "sign_up"];

/**
 * Evenimentele care merg si catre furnizorii de reclame, nu doar in Analytics.
 *
 * ⚠ LISTA E SCURTA DINADINS. GA4 e pentru analiza; catre Meta/TikTok se trimit
 * numai lucrurile pe care le pot folosi la optimizare. Trimise toate, ele umplu
 * contul de reclame cu zgomot si incetinesc invatarea.
 */
export const CATRE_RECLAME: ReadonlyArray<NumeEveniment> = [
  "page_view", "generate_lead", "sign_up",
];
