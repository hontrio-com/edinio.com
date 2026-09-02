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

    ⚠ AICI A STAT O LISTA SCRISA DE MANA cu „trase azi". Numara paisprezece nume;
    cand am numarat-o pe 03.09.2026 se trageau douazeci si noua. Imbatranise
    tacut, ca orice lista de felul asta — si tocmai in fisierul in care scrie de
    ce nu tinem promisiuni pe care nimeni nu le verifica.

    Lista adevarata se numara din cod, nu se scrie: `document-configurare.test.ts`
    o calculeaza si cade daca documentul nu se potriveste. Numele fara niciun
    apelant sunt cerute separat, mai jos, de `taxonomie-fara-apelant.test.ts`.
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
  /*
    ⚠ `search_results` E PARTEA CARE CONTEAZA, si de aceea e obligatoriu.

    „Ce cauta oamenii" e o intrebare frumoasa si aproape nefolositoare. „Ce cauta
    si NU gasesc" e o lista de articole de scris. Fara numarul de rezultate, cele
    doua ajung amestecate pe acelasi rand si nu se mai pot desparti.
  */
  /*
    ═══ ⚠ FARA `search_term`, SI DE CE A FOST SCOS PE 03.09.2026 ═══

    Trimiteam textul brut al cautarii. Paza anti-PII il trecea prin tiparele
    personale — email, telefon, CNP, IBAN, card — si atat prindea.

    ⚠ CE NU PRINDEA NICIUN TIPAR: „Ion Popescu". „Strada Victoriei 123". Un nume
    de utilizator. Un telefon strain. Google avertizeaza chiar despre casetele de
    cautare ca fiind una din caile pe care datele personale ajung din greseala in
    Analytics — si o data ajunse acolo, nu se mai pot scoate.

    ⚠ CE RAMANE, si de ce e destul pentru intrebarea care conta. `search_results`
    spune cate raspunsuri a primit omul; `zero_results` spune ca n-a gasit nimic.
    Cate cautari raman fara raspuns pe blog fata de ajutor se poate afla in
    continuare — numai CE anume s-a cautat nu mai pleaca spre un furnizor.

    ⚠ SI DACA VREM CANDVA CHIAR TEXTUL, locul lui e un jurnal al NOSTRU, cu
    pastrarea si stergerea lui, nu un cont de analiza al altcuiva.
  */
  | { name: "view_search_results"; search_scope: "blog" | "help"; search_results: number; zero_results: boolean }
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

  /* ─── Comercial: de la alegerea planului la abonament ──────────────────── */
  /*
    ⚠ NUMELE SUNT ALE GA4 unde GA4 are unul (`begin_checkout`,
    `add_payment_info`, `purchase`). Numai `trial_start` si `landing_view` sunt
    ale noastre: GA4 n-are un nume standard pentru ele.

    ⚠ `event_id` NUMAI LA CELE DOUA CARE SE INCHEIE CU UN MAGAZIN CREAT.

    Id-ul exista ca sa uneasca evenimentul din browser cu acelasi eveniment
    trimis de pe server (CAPI) — fara el, un singur abonament ar aparea ca doua
    conversii, si costul pe achizitie raportat s-ar injumatati. In favoarea
    noastra, deci nimeni n-ar pune-o la indoiala.

    Dar `begin_checkout` si `add_payment_info` NU pleaca niciodata de pe server:
    se intampla in browser si nicaieri altundeva. Un `event_id` cerut si acolo ar
    fi trebuit inventat la fata locului — un id pe care serverul nu-l poate
    reproduce, adica o promisiune de deduplicare care nu deduplica nimic.

    ⚠ SI `plan_id` E OPTIONAL LA `begin_checkout`: evenimentul se trage la
    intrarea pe pagina de planuri, cand omul inca n-a ales niciunul.
  */
  | { name: "begin_checkout"; plan_id?: string; billing_period: "monthly" | "annual" }
  | { name: "add_payment_info"; plan_id: string; billing_period: "monthly" | "annual" }
  /*
    ⚠ `event_id` E ID-UL MAGAZINULUI CREAT, nu un numar aleator. Serverul il
    stie (`createBusiness` il intoarce), deci cand se adauga trimiterea de pe
    server ea poate folosi EXACT acelasi id, fara sa-l care nimeni prin cookie-uri.
    Si e unic prin constructie: un magazin se creeaza o singura data.
  */
  | { name: "trial_start"; plan_id: string; event_id: string }
  | {
      name: "purchase";
      plan_id: string; billing_period: "monthly" | "annual";
      value: number; currency: "RON"; event_id: string;
    }
  /*
    ⚠ `landing_view` EXISTA NUMAI PENTRU RECLAME, si merita spus de ce, fiindca
    pare o dublare a lui `page_view`.

    Meta si TikTok construiesc audiente de retargetare din `ViewContent`. GA4 n-are
    nevoie de el: acolo pagina e deja numarata de `page_view`, cu `page_type` si
    `page_group`. Deci evenimentul asta pleaca la cei doi si NU la GA4 — vezi
    `numeGa4`, care intoarce `null` pentru el.
  */
  | { name: "landing_view"; content_name: string; content_category: string }
  | { name: "onboarding_step_view"; onboarding_step: string; onboarding_step_index: number }
  | { name: "onboarding_step_complete"; onboarding_step: string; onboarding_step_index: number }
  | { name: "onboarding_complete" };

export type NumeEveniment = EvenimentEdinio["name"];

/**
 * Aceleasi nume, dar la RULARE.
 *
 * ⚠ DE CE E NEVOIE DE ELE SI CA VALORI. Taxonomia de mai sus e un TIP: ea nu
 * exista dupa compilare, deci nicio proba nu poate merge prin toate evenimentele.
 * Iar cea mai buna plasa pe care o avem — maturarea intregii taxonomii prin paza
 * anti-PII — are nevoie exact de asta.
 *
 * ⚠ SI NU SE POATE DESPARTI DE TIP, fiindca sub ea sta o verificare pe care o
 * face COMPILATORUL: daca se adauga un eveniment in tip si se uita aici (sau
 * invers), `tsc` cade. Nu e nevoie de disciplina, si nici de o proba.
 */
/*
  ⚠ DE CE E UN OBIECT SI NU O LISTA. `Record<NumeEveniment, true>` face
  COMPILATORUL sa ceara exact taxonomia, in amandoua directiile, fara nicio
  disciplina si fara nicio proba:

    - un eveniment adaugat in tip si uitat aici  -> lipseste o cheie, `tsc` cade
    - un nume ramas aici dupa ce a iesit din tip -> cheie in plus, `tsc` cade

  O lista simpla n-ar fi facut nici una, nici alta: ea ar fi imbatranit tacut, si
  proba care matura taxonomia ar fi maturat trecutul.
*/
const TOATE_EVENIMENTELE: Record<NumeEveniment, true> = {
  page_view: true,
  section_view: true, scroll_depth: true, cta_click: true,
  navigation_click: true, outbound_click: true,
  billing_period_change: true, plan_select: true, faq_open: true,
  integration_filter: true, integration_view: true,
  form_start: true, form_submit: true, form_error: true, generate_lead: true,
  article_view: true, article_read_progress: true, article_read_complete: true,
  article_cta_click: true, article_share: true, view_search_results: true,
  newsletter_subscribe_request: true, newsletter_subscribe_confirmed: true,
  registration_view: true, registration_start: true, sign_up: true,
  onboarding_step_view: true, onboarding_step_complete: true, onboarding_complete: true,
  begin_checkout: true, add_payment_info: true, trial_start: true, purchase: true,
  landing_view: true,
};

export const NUME_TAXONOMIE = Object.keys(TOATE_EVENIMENTELE) as NumeEveniment[];

/**
 * Evenimentele care sunt CONVERSII de afacere.
 *
 * ⚠ Astea PATRU se marcheaza „key event" in GA4, si numai astea. Un clic pe un
 * buton nu e o conversie; marcat asa, optimizarea campaniilor invata sa caute
 * clicuri in loc de clienti.
 *
 * ⚠ LISTA ASTA E CITITA, nu decorativa: `EDINIO_MARKETING_ANALYTICS_SETUP.md` o
 * foloseste drept lista de bifat in interfata GA4. Iar tipul `NumeEveniment` o
 * apara singur: un nume scos din taxonomie si ramas aici cade la compilare.
 */
export const CONVERSII: ReadonlyArray<NumeEveniment> = [
  "generate_lead", "sign_up", "trial_start", "purchase",
];

/*
  ⚠ AICI A FOST `CATRE_RECLAME`, o lista cu evenimentele care au voie sa plece
  spre Meta si TikTok. Am scos-o pe 01.09.2026, si merita spus de ce, fiindca
  arata a paza:

  1. NIMENI N-O CITEA. Era o promisiune, nu o poarta — acelasi lucru pe care
     l-am scos azi din trei comentarii care pomeneau probe inexistente.
  2. AR FI DEVENIT MINCINOASA. Cei doi furnizori nu numesc la fel aceleasi
     lucruri: o cerere de oferta e `Lead` la Meta si `SubmitForm` la TikTok. O
     lista comuna de NUME nu poate descrie doua vocabulare deosebite.

  Poarta adevarata e acum harta din fiecare adaptor (`catreMeta`, `catreTikTok`):
  ce nu are cartografiere nu pleaca, fiindca nu exista unde sa plece.
*/
