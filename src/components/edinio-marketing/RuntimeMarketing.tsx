"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { inregistreazaAdaptor, goleste, urmareste, redeschide } from "@/lib/edinio-marketing/magistrala";
import { adaptorGa4 } from "@/lib/edinio-marketing/adaptor-ga4";
import { adaptorMeta } from "@/lib/edinio-marketing/adaptor-meta";
import { adaptorTikTok } from "@/lib/edinio-marketing/adaptor-tiktok";
import { faraUrmarire, faraPageView } from "@/lib/edinio-marketing/fara-urmarire";
import { adaptorGoogleAds } from "@/lib/edinio-marketing/adaptor-google-ads";
import { reiaRetragerea, EVENIMENT_SCHIMBAT } from "@/lib/edinio-marketing/consimtamant-browser";
import { curataTitlu } from "@/lib/edinio-marketing/titlu-curat";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  RUNTIME-UL: UN SINGUR ASCULTATOR PENTRU TOT SITE-UL
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE NU `onClick` PE FIECARE BUTON. Sunt zeci de butoane. Fiecare `onClick`
  de urmarire e o legatura in plus intre o componenta de desen si sistemul de
  masurare, si o sansa in plus sa fie uitata la urmatorul buton. Aici e UN
  ascultator pe document, iar butoanele poarta doar niste atribute:

      data-analytics-cta="hero_incepe"
      data-analytics-location="hero"

  ⚠ SI UN SINGUR OBSERVATOR pentru sectiuni, nu cate unul pe element.

  ⚠ NIMIC NU RULEAZA IN BUCLA. Fara ascultatori pe `scroll` la fiecare cadru, fara
  `mousemove`, fara sondaje. Adancimea derularii se masoara tot cu
  `IntersectionObserver`, pe patru repere invizibile — deci browserul face treaba,
  nu noi. Auditul de performanta al site-ului e incheiat si n-are voie sa se
  strice din cauza masuratorii.

  ⚠ EXISTA UN SINGUR `MutationObserver`, si numai pe elementul `<title>`, numai
  intre o navigare si clipa in care titlul se schimba. Randul asta a scris intai
  „fara MutationObserver" — a devenit fals in aceeasi ora, cand am aflat ca titlul
  vine cu 855 ms intarziere. Vezi nota de la `page_view`. Se opreste singur si nu
  urmareste nimic altceva din document.
*/

const PRAGURI: ReadonlyArray<25 | 50 | 75 | 90> = [25, 50, 75, 90];

export function RuntimeMarketing() {
  const cale = usePathname();
  const calePrecedenta = useRef<string | null>(null);

  /* ── Adaptoarele, o singura data ─────────────────────────────────────── */
  useEffect(() => {
    inregistreazaAdaptor(adaptorGa4);
    inregistreazaAdaptor(adaptorMeta);
    inregistreazaAdaptor(adaptorTikTok);
    /*
      ⚠ GOOGLE ADS E ULTIMUL SI E ALTFEL. Ceilalti trei primesc orice eveniment
      din taxonomie si hotarasc ei ce fac cu el. El primeste tot, dar trimite
      NUMAI ce are eticheta de conversie in contul Google Ads — vezi
      `pixel-google-ads.ts`. Un cont de reclame numara conversii, nu comportament.
    */
    inregistreazaAdaptor(adaptorGoogleAds);
    /*
      Fiecare script de pornire cheama `window.__edinioMarketingGata('<nume>')`
      din el insusi, sincron, imediat dupa ce furnizorul e definit. Asa coada se
      goleste fara sa depinda de vreo potrivire de momente cu React.
    */
    const w = window as unknown as { __edinioMarketingGata?: (n: string) => void };
    w.__edinioMarketingGata = (n: string) => goleste(n);
    /*
      ⚠ SI GOLIM ODATA PENTRU FIECARE, aici. Scripturile sunt `afterInteractive`:
      unul poate sa se fi incarcat INAINTEA efectului asta, si atunci strigatul
      lui de mai sus a cazut in gol (`__edinioMarketingGata` inca nu exista).
      Fara randurile astea, evenimentele lui ar astepta la coada pana la
      urmatorul eveniment — adica `landing_view`-ul de pe pagina de intrare s-ar
      pierde exact pe paginile de campanie.

      ⚠ SI TOATE PATRU, NU TREI. Lista a stat cu „ga4", „meta", „tiktok" de cand
      erau atatia; „google-ads" s-a adaugat mai tarziu ca adaptor si a fost uitat
      aici. Uitarea tacea: conversia lui ramanea la coada pana la urmatorul
      eveniment de pe pagina — iar pe pagina de multumire dupa plata, adesea nu
      mai e niciun eveniment urmator.

      De aceea lista se ia acum din chiar adaptoarele inregistrate, nu se scrie de
      mana: al cincilea furnizor nu mai poate fi uitat.
    */
    for (const a of [adaptorGa4, adaptorMeta, adaptorTikTok, adaptorGoogleAds]) goleste(a.nume);

    /*
      ⚠ SI SE REIA O RETRAGERE RAMASA RESTANTA. Daca baza a picat exact in clipa
      apasarii, retragerea a ramas numai in browserul omului — iar cronul care
      trimite conversiile se uita in baza. Vezi `reiaRetragerea`.
    */
    reiaRetragerea();
  }, []);

  /* ── `page_view`, exact unul pe navigare ─────────────────────────────── */
  useEffect(() => {
    if (!cale || faraUrmarire(cale)) return;
    /*
      ⚠ PAZA IMPOTRIVA DUBLARII. Efectul se poate rula din nou fara ca `cale` sa
      se fi schimbat (remontare, moduri de dezvoltare). Fara comparatia asta,
      prima pagina apare de doua ori in raport — iar rata de respingere si
      paginile pe sesiune devin false, tacut.
    */
    if (calePrecedenta.current === cale) return;
    const eNavigare = calePrecedenta.current !== null;
    calePrecedenta.current = cale;

    /*
      ⚠ PANOUL SI ADMINUL NU SE NUMARA, desi ajungem aici pentru ele.

      Layoutul lor nu randeaza runtime-ul — dar in clipa unei navigari
      `usePathname` arata deja destinatia, iar efectul se aprinde inainte ca
      layoutul vechi sa se desprinda. Asa a ajuns `/dashboard` in raportul de
      pagini, cu doua vizualizari care pareau cu neputinta.

      ⚠ SE PUNE DUPA `calePrecedenta.current = cale`, dinadins: altfel intoarcerea
      pe o pagina masurata ar parea „aceeasi cale" si n-ar mai fi numarata deloc.
    */
    if (faraPageView(cale)) return;

    /*
      ⚠ TITLUL GOL NU SE TRIMITE DELOC, si asta e deosebit de a trimite `""`.

      Un sir gol intra in GA4 ca o VALOARE: raportul „Pages" capata un rand fara
      nume, care arata a pagina adevarata. Lipsa campului lasa GA4 sa-si puna
      singur titlul pe care il vede, adica raspunsul corect cand noi nu-l stim.
    */
    const trage = () => {
      /*
        ⚠ TITLUL SE CURATA. Pagina de cautare a blogului isi pune in titlu chiar ce
        a tastat omul; trimis asa, textul lui ar fi ajuns in GA4 pe usa din dos —
        si peste 100 de caractere ar fi omorat tot `page_view`-ul. Vezi
        `titlu-curat.ts`.
      */
      const titluAcum = curataTitlu(document.title, window.location.search);
      urmareste({
        name: "page_view",
        page_location: window.location.href,
        ...(titluAcum ? { page_title: titluAcum } : {}),
      });
    };

    /*
      ═══ ⚠ LA PRIMA INCARCARE TITLUL E DEJA ACOLO. LA NAVIGARE, NU. ═══

      Masurat in productie pe 01.09.2026: dupa o navigare fara reincarcare de
      document, `document.title` s-a schimbat abia dupa 855 ms. Next il pune prin
      metadate, asincron, dupa randare.

      Prima forma a randului asta trimitea `document.title` pe loc — deci in GA4
      TOATE paginile in afara de prima ar fi avut titlul GOL. Raportul „Pages" ar
      fi aratat un rand mare, fara nume, si nimic n-ar fi cazut.

      ⚠ SI NU SE REPARA CU O INTARZIERE FIXA: 855 ms azi, pe o pagina, pe reteaua
      mea. Un numar ales din burta ar fi mers uneori. Se asteapta EVENIMENTUL —
      schimbarea chiar a elementului `<title>` — cu un plafon peste care se trage
      oricum, ca sa nu pierdem vizualizarea daca titlul nu se mai schimba deloc
      (doua rute cu acelasi titlu, de pilda).
    */
    if (!eNavigare) { trage(); return; }

    const titlu = document.querySelector("title");
    if (!titlu) { trage(); return; }

    let tras = false;
    const odata = () => { if (!tras) { tras = true; obs.disconnect(); clearTimeout(ceas); trage(); } };

    /*
      ═══ ⚠ SE ASTEAPTA UN TITLU, NU O SCHIMBARE ═══

      Reparatia de ieri astepta PRIMA schimbare a lui `<title>` si tragea atunci.
      Masurat pe 02.09.2026, la o inscriere adevarata, pe `/onboarding/plan`:

        page_view {page_location: '…/onboarding/plan', page_title: '', …}

      Next GOLESTE titlul si abia apoi scrie noul titlu. Prima mutatie e golirea,
      deci observatorul se aprindea pe ea si citea nimic. Pe alte rute nu s-a
      vazut, fiindca acolo golirea si scrierea cadeau in aceeasi mutatie.

      Deci nu ne intereseaza ca s-a schimbat ceva, ci ca A APARUT un titlu.
      Golirea se ignora si se asteapta mai departe; daca nu vine niciunul pana la
      plafon, se trage fara camp — vezi `trage`.
    */
    const obs = new MutationObserver(() => { if (document.title.trim()) odata(); });
    obs.observe(titlu, { childList: true, characterData: true, subtree: true });
    const ceas = setTimeout(odata, 2000);

    return () => { obs.disconnect(); clearTimeout(ceas); };
  }, [cale]);

  /* ── Reafirmarea starilor, in clipa acordului ────────────────────────── */
  useEffect(() => {
    /*
      ═══════════════════════════════════════════════════════════════════════════
      ⚠ AICI A STAT UN MECANISM AL MEU, CU UN DEFECT DOVEDIT IN PRODUCTIE
      ═══════════════════════════════════════════════════════════════════════════

      Forma dinainte tragea ea insasi un `page_view` proaspat si tinea minte, intr-un
      set cheiat pe cale, ca pagina „a fost masurata la acordare".

      ⚠ CE STRICA, masurat pe 03.09.2026: omul acorda intai DOAR marketing. Setul
      primea calea — dar magistrala arunca evenimentul, fiindca GA4 e „statistici".
      Apoi omul acorda si statisticile pe aceeasi pagina: setul spunea deja „facut",
      deci GA4 se incarca si nu primea NICIUN `page_view`.

      ⚠ Pe `/preturi` am reprodus-o DE MANA, din consola: bannerul nu se redeschide
      (`deschideSetari()` n-are apelanti). Ecranul pe care se intampla chiar e
      `/cookies/setari` — si, mai des, `article_view`/`landing_view`, unde e destul
      sa accepti stand pe pagina pe care ai aterizat.

      ⚠ SI MAI ERA CEVA: acopereau doar `page_view`. `article_view` si `landing_view`
      se pierdeau la fel, si ar fi trebuit reparate inca de doua ori, in alte doua
      componente — iar a patra, scrisa peste sase luni, ar fi fost uitata.

      Acum magistrala retine ea starile aruncate, PE ADAPTOR, si le reafirma pe cele
      carora tocmai li s-a deschis poarta. Vezi `EVENIMENTE_DE_STARE` acolo.
    */
    const laSchimbare = () => redeschide();
    window.addEventListener(EVENIMENT_SCHIMBAT, laSchimbare);
    return () => window.removeEventListener(EVENIMENT_SCHIMBAT, laSchimbare);
  }, []);

  /* ── Un singur ascultator de clic, delegat ───────────────────────────── */
  useEffect(() => {
    if (faraUrmarire(cale)) return;

    function laClic(e: MouseEvent) {
      const tinta = e.target as Element | null;
      if (!tinta || typeof tinta.closest !== "function") return;

      const cta = tinta.closest<HTMLElement>("[data-analytics-cta]");
      if (cta) {
        /*
          ⚠ UN INDEMN DINTR-UN ARTICOL E ALT EVENIMENT, si de aceea se cauta
          intai articolul din jur.

          `cta_click` spune „cineva a apasat butonul verde din antet". Dar
          indemnul dintr-un articol de blog raspunde la o intrebare mai buna: CARE
          articol duce oameni mai departe? Amestecate sub acelasi nume, cele o
          suta de articole ar aparea ca un singur `cta_id`, si n-am mai fi stiut
          niciodata ce text merita scris din nou.

          ⚠ SI DE CE AICI, in ascultatorul delegat, si nu in componenta.
          `IndemnArticol` e componenta de SERVER. Ca sa traga singura evenimentul
          ar fi trebuit sa devina componenta de client — adica sa duca React in
          browser pentru fiecare articol, ca sa masor o apasare. Aici nu costa
          nimic: ascultatorul exista deja, si citeste doar niste atribute.
        */
        const articol = cta.closest<HTMLElement>("[data-analytics-article]");
        if (articol) {
          urmareste({
            name: "article_cta_click",
            article_id: articol.dataset.analyticsArticle ?? "necunoscut",
            cta_id: cta.dataset.analyticsCta ?? "necunoscut",
            cta_position: (cta.dataset.analyticsPosition as "top" | "middle" | "bottom" | "sidebar") ?? "middle",
          });
          return;
        }

        urmareste({
          name: "cta_click",
          cta_id: cta.dataset.analyticsCta ?? "necunoscut",
          cta_location: cta.dataset.analyticsLocation ?? "necunoscut",
          cta_destination: cta.getAttribute("href") ?? undefined,
        });
        return;
      }

      const nav = tinta.closest<HTMLElement>("[data-analytics-nav]");
      if (nav) {
        urmareste({
          name: "navigation_click",
          nav_item: nav.dataset.analyticsNav ?? "necunoscut",
          nav_location: nav.dataset.analyticsLocation ?? "necunoscut",
          destination_path: nav.getAttribute("href") ?? "",
        });
        return;
      }

      /*
        Legaturile care scot omul din site. `tel:` si `mailto:` sunt semnale de
        intentie mare — cine suna nu mai citeste inca o pagina.
      */
      const legatura = tinta.closest<HTMLAnchorElement>("a[href]");
      if (!legatura) return;
      const href = legatura.getAttribute("href") ?? "";
      if (href.startsWith("tel:")) {
        urmareste({ name: "outbound_click", outbound_host: "tel", outbound_kind: "phone" });
      } else if (href.startsWith("mailto:")) {
        /* ⚠ Numai FELUL, nu adresa. Adresa ar fi date personale in raport. */
        urmareste({ name: "outbound_click", outbound_host: "mailto", outbound_kind: "email" });
      } else if (/^https?:\/\//.test(href)) {
        try {
          const gazda = new URL(href).hostname.replace(/^www\./, "");
          if (gazda === window.location.hostname.replace(/^www\./, "")) return;
          urmareste({
            name: "outbound_click",
            outbound_host: gazda,
            outbound_kind: /wa\.me|whatsapp/.test(gazda) ? "whatsapp" : "link",
          });
        } catch { /* href ciudat: nu masuram nimic */ }
      }
    }

    document.addEventListener("click", laClic, { capture: true, passive: true });
    return () => document.removeEventListener("click", laClic, { capture: true });
  }, [cale]);

  /* ── Sectiuni si adancimea derularii, cu acelasi observator ──────────── */
  useEffect(() => {
    if (faraUrmarire(cale)) return;
    if (typeof IntersectionObserver === "undefined") return;

    const vazute = new Set<string>();
    const praguriTrase = new Set<number>();

    const obs = new IntersectionObserver(
      (intrari) => {
        for (const intrare of intrari) {
          if (!intrare.isIntersecting) continue;
          const el = intrare.target as HTMLElement;

          const prag = el.dataset.analyticsScroll;
          if (prag) {
            const p = Number(prag) as 25 | 50 | 75 | 90;
            if (!praguriTrase.has(p)) {
              praguriTrase.add(p);
              urmareste({ name: "scroll_depth", percent: p });
            }
            obs.unobserve(el);
            continue;
          }

          const nume = el.dataset.analyticsSection;
          if (nume && !vazute.has(nume)) {
            vazute.add(nume);
            urmareste({ name: "section_view", section_name: nume });
            obs.unobserve(el);
          }
        }
      },
      /* Jumatate de sectiune vazuta, nu un pixel: o derulare foarte rapida nu e
         angajament. */
      { threshold: 0.5 },
    );

    for (const el of document.querySelectorAll<HTMLElement>("[data-analytics-section]")) obs.observe(el);

    /*
      ⚠ REPERELE DE DERULARE se pun de noi, nu se cer paginilor. Patru elemente
      goale, la 25/50/75/90% din inaltimea documentului. Asa nu exista niciun
      ascultator de `scroll`, si masuratoarea costa cat costa un observator.
    */
    const repere: HTMLElement[] = [];
    const inaltime = document.documentElement.scrollHeight;
    if (inaltime > window.innerHeight * 1.5) {
      for (const p of PRAGURI) {
        const r = document.createElement("div");
        r.dataset.analyticsScroll = String(p);
        r.setAttribute("aria-hidden", "true");
        Object.assign(r.style, {
          position: "absolute", left: "0", width: "1px", height: "1px",
          pointerEvents: "none", top: `${Math.round((inaltime * p) / 100)}px`,
        });
        document.body.appendChild(r);
        repere.push(r);
        obs.observe(r);
      }
    }

    return () => {
      obs.disconnect();
      for (const r of repere) r.remove();
    };
  }, [cale]);

  return null;
}
