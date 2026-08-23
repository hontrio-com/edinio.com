"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Învelișul care spune „am intrat în ecran", o singură dată.
 *
 * ⚠ E DOAR ÎNVELIȘUL: ce se animează vine gata randat de pe server, ca
 * `children`. Aici nu se desenează nimic — se ascultă intrarea în ecran și se
 * scrie un atribut. Desenul îl face foaia de stil, la `.se-aseaza` din
 * `globals.css`.
 *
 * Îl folosesc două ilustrații de pe pagină: teancul de comenzi și cele trei
 * carduri de produs. Nu știe nimic despre niciuna — de aceea se și cheamă după ce
 * face, nu după ce învelește.
 *
 * Aceeași împărțire ca la `FerireDeCursor` / `CampSigle` de pe pagina „Integrări",
 * și din același motiv: dacă ilustrația întreagă ar deveni componentă de client,
 * tot marcajul ei ar pleca în pachetul din browser ca să câștige un observator de
 * cincisprezece rânduri.
 *
 * ⚠ ĂSTA E PRIMUL JAVASCRIPT DIN CORPUL PAGINII /migrare. Până acum tot ce se
 * încarcă acolo vine din layout (bara de sus și bara de contact); secțiunile sunt
 * toate de server. Deci nu e „încă unul", e „primul" — de aceea suprafața lui e
 * cât se poate de mică.
 *
 * ═══ DE CE NU MERGE FĂRĂ JAVASCRIPT ═══
 *
 * Fără declanșator, animația ar porni la încărcarea paginii — adică s-ar termina
 * cu mult înainte ca omul să deruleze până la ea. Secțiunea „Comenzi" e a treia pe
 * pagină, deci sigur sub linia de plutire. Exact bug-ul pe care îl are `gauge-1`
 * de pe „Optimizare", notat acolo în cod.
 *
 * `animation-timeline: view()` ar fi mers fără nicio linie de JavaScript, dar e
 * respins de trei ori în depozit, în scris: leagă progresul de poziția derulării
 * (teancul s-ar desface la derulare înapoi, ca un cursor tras cu mâna) și nu
 * rulează deloc sub Chrome 115 / Safari 26. Vezi `globals.css`, la nota despre
 * cronologiile de derulare.
 *
 * ⚠ Nu ține nicio stare React: observatorul scrie direct un atribut. Cu `useState`
 * ar fi fost o re-randare în plus pentru ceva pur vizual, plus regula proiectului
 * despre stare pusă din efecte.
 *
 * ⚠ `data-arrive="go"`, nu un nume nou: e deja convenția firului de mesaje de pe
 * „Problema". Un al doilea nume pentru exact același lucru ar fi însemnat două
 * feluri de a spune „a intrat în ecran".
 */
export function LaIntrareInEcran({ children }: { children: ReactNode }) {
  const gazda = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nod = gazda.current;
    if (!nod) return;

    /* Browser fără `IntersectionObserver`: arată teancul pur și simplu. */
    if (typeof IntersectionObserver === "undefined") {
      nod.dataset.arrive = "go";
      return;
    }

    const observator = new IntersectionObserver(
      (intrari) => {
        for (const intrare of intrari) {
          if (!intrare.isIntersecting) continue;
          nod.dataset.arrive = "go";
          /* Gata, nu mai avem ce urmări: se joacă o singură dată. Teancul s-a
             așezat; nu se așază din nou la fiecare trecere prin dreptul lui. */
          observator.disconnect();
        }
      },
      /* Nu de la primul pixel: la 45% ilustrația e clar în ecran, deci începutul
         animației prinde omul uitându-se la ea, nu ghicind-o cu coada ochiului.
         Aceeași valoare ca la firul de mesaje. */
      { threshold: 0.45 },
    );

    observator.observe(nod);
    return () => observator.disconnect();
  }, []);

  return (
    <div ref={gazda}>
      {/*
        Fără JavaScript nu vine nimeni să pună `data-arrive`, iar starea de pornire
        a lui `.se-aseaza` e „ascuns" — deci ilustrația n-ar apărea deloc. Sunt
        ilustrațiile secțiunilor, nu ornamente: fără ele, jumătatea din dreapta
        rămâne goală.

        ⚠ Stă AICI, nu în fiecare ilustrație. Copiată la fiecare, prima adăugată
        fără ea ar fi fost invizibilă exact la oamenii care n-ar fi raportat-o
        niciodată — și n-ar fi crăpat nimic care să ne spună.

        Aceeași plasă ca la firul de mesaje de pe „Problema", și tot din motivul
        ăla: o animație pornită la derulare TREBUIE să pornească din ascuns, deci
        nu poate folosi tiparul „poziția de repaus stă pe element" al arcului din
        hero, care se joacă la încărcare.
      */}
      <noscript>
        <style>{`.se-aseaza{opacity:var(--aseaza-opacitate,1);transform:none}`}</style>
      </noscript>
      {children}
    </div>
  );
}
