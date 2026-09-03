"use client";

import { useEffect, useRef } from "react";
import { urmareste } from "@/lib/edinio-marketing/magistrala";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CAT S-A CITIT DINTR-UN ARTICOL — MASURAT IN CORPUL LUI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE NU FOLOSIM `scroll_depth`-ul obisnuit. Acela masoara procente din TOT
  documentul: antet, articol, indemn, autor, articole inrudite, abonare la
  newsletter, subsol. Pe o pagina de blog, corpul articolului e poate jumatate din
  inaltime — deci „a derulat 90% din pagina" nu inseamna „a citit articolul", si
  „a citit articolul" se intampla undeva pe la 50-60% din pagina.

  Un raport construit pe procente de pagina spune ceva despre subsol, nu despre
  text. Aici reperele se pun INAUNTRUL corpului articolului.

  ⚠ SI DE CE TOT CU `IntersectionObserver`: fara niciun ascultator de derulare,
  fara sondaje. Aceeasi regula ca in restul masuratorii — browserul face treaba.

  ⚠ „CITIT COMPLET" INSEAMNA 90% DIN CORP, si e o alegere, nu un adevar. Ultimele
  procente ale unui articol sunt aproape mereu o incheiere scurta pe care multi
  n-o mai parcurg cu ochii; 100% ar masura rabdarea de a derula, nu cititul.
*/

const PRAGURI: ReadonlyArray<25 | 50 | 75 | 90> = [25, 50, 75, 90];

export function UrmaArticol({
  articolId,
  slug,
  categorie,
  autor,
}: {
  articolId: string;
  slug: string;
  categorie?: string;
  autor?: string;
}) {
  const vazut = useRef(false);

  useEffect(() => {
    /*
      ⚠ O SINGURA VIZUALIZARE CAT TRAIESTE COMPONENTA. Efectul se poate aprinde de
      doua ori pentru ACEEASI instanta — modul strict din dezvoltare il ruleaza
      dinadins de doua ori, si o schimbare de dependinte l-ar relua. Fara paza,
      articolul s-ar numara dublu si media de angajament ar iesi injumatatita.

      ⚠ SI NU APARA DE O REMONTARE ADEVARATA, cum a scris aici o vreme: `useRef` e
      stare a INSTANTEI, deci o instanta noua porneste cu paza deschisa. Acolo ne
      apara altceva — o remontare inseamna alta pagina, deci alta vizualizare, care
      CHIAR trebuie numarata.
    */
    if (vazut.current) return;
    vazut.current = true;

    urmareste({
      name: "article_view",
      article_id: articolId,
      article_slug: slug,
      article_category: categorie,
      article_author: autor,
    });
  }, [articolId, slug, categorie, autor]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const corp = document.querySelector<HTMLElement>("[data-articol-corp]");
    if (!corp) return;

    /*
      ⚠ UN ARTICOL FOARTE SCURT nu se masoara pe praguri. Daca tot corpul incape
      pe un ecran, omul l-a vazut intreg fara sa deruleze — patru praguri s-ar
      aprinde deodata si ar spune ca „a citit 90%" cineva care poate n-a citit
      niciun rand. Se trage doar vizualizarea, si atat.
    */
    const inaltime = corp.offsetHeight;
    if (inaltime < window.innerHeight * 1.2) return;

    const trase = new Set<number>();
    const obs = new IntersectionObserver((intrari) => {
      for (const i of intrari) {
        if (!i.isIntersecting) continue;
        const el = i.target as HTMLElement;
        const p = Number(el.dataset.articolPrag) as 25 | 50 | 75 | 90;
        if (!trase.has(p)) {
          trase.add(p);
          urmareste({ name: "article_read_progress", article_id: articolId, read_depth: p });
          /* 90% din corp = „citit complet". Vezi nota de sus pentru de ce nu 100. */
          if (p === 90) urmareste({ name: "article_read_complete", article_id: articolId });
        }
        obs.unobserve(el);
      }
    }, { threshold: 0 });

    /*
      Reperele stau in corp, cu pozitie absoluta fata de el. `position: relative`
      se pune aici, nu in CSS: componenta care il randeaza n-are de ce sa stie ca
      e masurat.
    */
    const pozitieVeche = corp.style.position;
    if (!pozitieVeche) corp.style.position = "relative";

    const repere: HTMLElement[] = [];
    for (const p of PRAGURI) {
      const r = document.createElement("div");
      r.dataset.articolPrag = String(p);
      r.setAttribute("aria-hidden", "true");
      Object.assign(r.style, {
        position: "absolute", left: "0", width: "1px", height: "1px",
        pointerEvents: "none", top: `${Math.round((inaltime * p) / 100)}px`,
      });
      corp.appendChild(r);
      repere.push(r);
      obs.observe(r);
    }

    return () => {
      obs.disconnect();
      for (const r of repere) r.remove();
      if (!pozitieVeche) corp.style.position = "";
    };
  }, [articolId]);

  return null;
}
