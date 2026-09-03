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
    ═══════════════════════════════════════════════════════════════════════════
    ⚠ AICI A STAT „DE AICI IN JOS: DECLARATE, DAR INCA NETRASE DE NICAIERI"
    ═══════════════════════════════════════════════════════════════════════════

    Era adevarat cand a fost scris. Nu mai era pe 03.09.2026: sub el ajunsesera
    `form_start`, `form_submit`, `form_error`, `generate_lead`,
    `billing_period_change` si `faq_open` — toate trase, toate vizibile in GA4.
    Cine il citea pleca crezand ca `generate_lead` nu se trimite.

    ⚠ DE CE L-AM SCOS IN LOC SA-L MUT. Orice granita desenata cu degetul intr-o
    lista care creste se muta singura, in tacere, la primul nume adaugat in locul
    gresit. Aceeasi lectie ca la lista „trase azi" din acelasi fisier.

    Care nume au si care n-au apelant se NUMARA, nu se marcheaza:
    `taxonomie-fara-apelant.test.ts` o face si cade cand lista rezervata nu se mai
    potriveste. Ce ramane adevarat si merita spus: NU se fac dimensiuni
    personalizate in GA4 pentru nume fara apelant — alea se fac numai pentru ce
    chiar pleaca, iar lista de bifat sta in documentul de configurare.
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
      /*
        ⚠ AICI A FOST `article_author`, SCOS PE 03.09.2026.

        Trimiteam intai numele autorului, apoi — dupa un audit — slugul lui, crezand
        ca aia e o anonimizare. Nu era: slugul se NASTE din nume (`slugSauMotiv` in
        `blog.actions.ts`), deci „Ion Popescu" devine `ion-popescu`, care identifica
        omul exact la fel de bine.

        ⚠ SI NU PIERDEM NIMIC. Masurat pe 03.09.2026: exista UN singur autor,
        „Edinio.com". Dimensiunea nu deosebea nimic — purta doar riscul, pentru
        clipa in care ar fi scris un om adevarat. Intrebarea „ale carui autor se
        citesc" se raspunde oricand dintr-o legatura in baza NOASTRA, pe
        `article_id`, unde numele n-a plecat nicaieri.
      */
      article_category?: string;
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
    ⚠ NUMELE SUNT ALE GA4 unde GA4 are unul (`begin_checkout`, `purchase`).
    Numai `trial_start` si `landing_view` sunt ale noastre: GA4 n-are un nume
    standard pentru ele.

    ⚠ SI UNDE NUMELE NU SE POTRIVESTE, NU SE IMPRUMUTA. `add_payment_info` a
    stat aici pana pe 03.09.2026 si pleca in clipa in care omul era PREDAT lui
    Stripe — nu cand atingea un card. Google si TikTok il definesc amandoi ca
    „si-a trimis datele de plata". Deci GA4 primea `add_payment_info`, Meta
    `AddPaymentInfo` si TikTok `AddPaymentInfo` pentru o fapta care nu se
    intamplase.

    ⚠ SI DE CE L-AM APARAT O ZI, GRESIT. Am scris ca numele imprumutat se
    plateste ca sa ramana optimizarea Meta pe un eveniment standard. Numarat:
    169 de conturi, 20 platitoare, 5 in ultimele 60 de zile. Meta are nevoie de
    zeci de conversii pe SAPTAMANA ca sa invete ceva dintr-un eveniment. Nu
    exista nicio optimizare de pastrat — argumentul meu se sprijinea pe o
    presupunere pe care n-o masurasem. Un eveniment lipsa e mai bun decat un
    eveniment standard fals.

    ⚠ `event_id` NUMAI LA CELE DOUA CARE SE INCHEIE CU UN MAGAZIN CREAT.

    Id-ul exista ca sa uneasca evenimentul din browser cu acelasi eveniment
    trimis de pe server (CAPI) — fara el, un singur abonament ar aparea ca doua
    conversii, si costul pe achizitie raportat s-ar injumatati. In favoarea
    noastra, deci nimeni n-ar pune-o la indoiala.

    Dar `begin_checkout` NU pleaca niciodata de pe server: se intampla in browser
    si nicaieri altundeva. Un `event_id` cerut si acolo ar fi trebuit inventat la
    fata locului — un id pe care serverul nu-l poate reproduce, adica o promisiune
    de deduplicare care nu deduplica nimic.

    ⚠ `plan_id` E ACUM OBLIGATORIU, si asta e chiar mutarea. Pana pe 03.09.2026
    evenimentul se tragea la INTRAREA pe pagina de planuri, cand omul inca nu
    alesese nimic — deci `plan_id` lipsea, `value` si `currency` nici nu existau,
    iar „a inceput cumpararea" insemna de fapt „a deschis pagina". Acum se trage
    la apasarea pe „continua catre plata", unde toate trei se stiu.

    ⚠ `value` E PRETUL DORIT, NU UNUL INCASAT — si deosebirea e toata. La
    `purchase` suma vine din `amount_total` de la Stripe, fiindca acolo e VENIT si
    o presupunere raportata ca venit e o minciuna. Aici nu s-a incasat inca nimic:
    numarul spune „atat costa ce vrea omul sa cumpere", si asta chiar se stie din
    planul apasat. Regula „suma vine din incasare" ramane a lui `purchase`.
  */
  | { name: "begin_checkout"; plan_id?: string; billing_period: "monthly" | "annual";
      value: number; currency: "RON" }
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
  begin_checkout: true, trial_start: true, purchase: true,
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
