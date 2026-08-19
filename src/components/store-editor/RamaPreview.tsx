"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Latimile la care se randeaza previzualizarea, pe dispozitiv.
 *
 * Numere REALE de viewport, nu cat loc a ramas pe ecranul editorului. Asta e tot
 * defectul pe care il repara componenta asta.
 */
export const LATIMI_DISPOZITIV = { mobil: 390, tableta: 768, desktop: 1280 } as const;

export type Dispozitiv = keyof typeof LATIMI_DISPOZITIV;

/**
 * Magazinul, randat la latimea unui dispozitiv si micsorat ca sa incapa.
 *
 * ⚠ PREVIZUALIZAREA NU ARATA CE VAD CLIENTII DACA IFRAME-UL PRIMESTE LATIMEA
 * PANOULUI.
 *
 * Breakpoint-urile CSS se uita la latimea IFRAME-ului, nu la a ecranului. In
 * „Editeaza magazinul", rama avea `max-w-sm` — 384 de pixeli, sub toate pragurile
 * Tailwind — deci magazinul se randa mereu in forma lui cea mai ingusta: meniu
 * hamburger, grila pe doua coloane, fara sagetile de carusel. Nu exista niciun
 * comutator care sa arate altceva, iar comerciantul regla pe telefon un magazin
 * pe care clientii il deschid mai ales pe calculator. In editorul de design,
 * „Desktop" insemna „100%", adica latimea panoului: pe un ecran de 1440 raman
 * vreo 780 de pixeli dupa bara laterala si lista de sectiuni — tot o tableta.
 *
 * Solutia e cea folosita deja de miniaturile din galerie: randeaza la latimea
 * adevarata si micsoreaza cu `transform: scale`. Continutul e identic cu al unui
 * ecran real, doar desenat mai mic.
 *
 * Inaltimea iframe-ului se imparte la scara tocmai ca, dupa micsorare, sa umple
 * exact cadrul: altfel „desktop" ar arata o fasie de pagina cu o dunga goala sub
 * ea.
 */
export function RamaPreview({
  src,
  dispozitiv,
  cheie,
  rama,
  titlu,
}: {
  src: string;
  dispozitiv: Dispozitiv;
  /** Bumpata din afara, remonteaza iframe-ul. */
  cheie?: number;
  /** Referinta catre iframe, pentru cine ii trimite mesaje. */
  rama?: RefObject<HTMLIFrameElement | null>;
  titlu: string;
}) {
  const cutie = useRef<HTMLDivElement>(null);
  const [masura, setMasura] = useState({ latime: 0, inaltime: 0 });

  useEffect(() => {
    const el = cutie.current;
    if (!el) return;
    const observator = new ResizeObserver(([intrare]) => {
      const { width, height } = intrare.contentRect;
      // Un 0x0 inseamna „panoul e ascuns acum", nu „cadrul s-a facut mic": pastram
      // ultima masuratoare buna, ca revenirea sa nu treaca printr-o stare in care
      // previzualizarea n-are nicio dimensiune.
      if (width === 0 && height === 0) return;
      setMasura({ latime: width, inaltime: height });
    });
    observator.observe(el);
    return () => observator.disconnect();
  }, []);

  const latime = LATIMI_DISPOZITIV[dispozitiv];
  // Se micsoreaza, dar nu se mareste NICIODATA peste marimea reala: un telefon
  // de 390 desenat la 780 ar arata un magazin pe care nu-l vede nimeni asa.
  const scara = Math.min(masura.latime > 0 ? masura.latime / latime : 0, 1);

  return (
    <div ref={cutie} className="relative w-full h-full overflow-hidden bg-surface">
      {/*
        ⚠ Iframe-ul se randeaza MEREU, si se ascunde doar vizual pana exista o
        masuratoare. Conditionat pe `scara > 0`, se demonta de fiecare data cand
        panoul era ascuns — pe telefon, la fiecare comutare intre „Editor" si
        „Previzualizare", containerul are 0x0, deci magazinul se reincarca de la
        zero: ecran alb si derulare pierduta. Exact ce voia sa evite trecerea de
        la remontare la `reload()`.
      */}
      <iframe
        key={cheie}
        ref={rama}
        src={src}
        title={titlu}
        className="absolute top-0 origin-top-left border-0"
        style={{
          width: latime,
          height: scara > 0 ? masura.inaltime / scara : "100%",
          left: Math.max(0, (masura.latime - latime * scara) / 2),
          transform: `scale(${scara || 1})`,
          visibility: scara > 0 ? "visible" : "hidden",
        }}
      />
    </div>
  );
}
