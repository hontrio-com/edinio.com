"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { inregistreazaAdaptor, goleste, urmareste } from "@/lib/edinio-marketing/magistrala";
import { adaptorGa4 } from "@/lib/edinio-marketing/adaptor-ga4";
import { faraUrmarire } from "@/lib/platform/fara-urmarire";

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
    /*
      Eticheta cheama `window.__edinioMarketingGata('ga4')` din chiar scriptul ei
      de pornire, sincron, imediat dupa ce defineste `gtag`. Asa coada se goleste
      fara sa depinda de vreo potrivire de momente cu React.
    */
    const w = window as unknown as { __edinioMarketingGata?: (n: string) => void };
    w.__edinioMarketingGata = (n: string) => goleste(n);
    /* Daca eticheta s-a incarcat deja inaintea noastra, golim acum. */
    goleste("ga4");
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

    const trage = () => urmareste({
      name: "page_view",
      page_location: window.location.href,
      page_title: document.title,
    });

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
    const obs = new MutationObserver(odata);
    obs.observe(titlu, { childList: true, characterData: true, subtree: true });
    const ceas = setTimeout(odata, 2000);

    return () => { obs.disconnect(); clearTimeout(ceas); };
  }, [cale]);

  /* ── Un singur ascultator de clic, delegat ───────────────────────────── */
  useEffect(() => {
    if (faraUrmarire(cale)) return;

    function laClic(e: MouseEvent) {
      const tinta = e.target as Element | null;
      if (!tinta || typeof tinta.closest !== "function") return;

      const cta = tinta.closest<HTMLElement>("[data-analytics-cta]");
      if (cta) {
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
