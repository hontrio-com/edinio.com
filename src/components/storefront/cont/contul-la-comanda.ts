"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { useContulMagazinului } from "./ContulMagazinului";

/**
 * Contul, in formularul de comanda, cand magazinul il cere.
 *
 * ⚠⚠ POARTA ADEVARATA E PE SERVER (`poartaContuluiLaComanda`, in `placeOrder` si
 * `placeCartOrder`). Aici e doar ecranul: pasul de intrare apare DE LA DESCHIDERE,
 * nu dupa ce omul a completat tot si a apasat „Trimite", iar evenimentele de plata
 * catre pixeli (`AddPaymentInfo`) nu mai pleaca pentru o trimitere pe care
 * serverul oricum o refuza.
 *
 * ⚠ Formularul intreaba serverul (`/api/cont/stare`) NUMAI cand magazinul cere
 * cont; la celelalte nu pleaca nicio cerere in plus.
 *
 * ⚠ Cand raspunsul lipseste (pana, retea), pasul NU se arata si trimiterea merge
 * la server ca de obicei: acolo se hotaraste, iar un refuz aprinde pasul
 * (`ceruDeServer`).
 */

type Stare = { cere: boolean; logat: boolean; email: string | null };

export type ContulLaComanda = {
  /** Magazinul cere cont si omul nu e in cont: pasul de intrare se arata. */
  necesar: boolean;
  /** Omul e in cont (aflat de la server sau chiar acum, in pas). */
  logat: boolean;
  /** Adresa contului, cand o stim. */
  email: string | null;
  /** Id-ul blocului de intrare, ca formularul sa poata duce privirea la el. */
  idBloc: string;
  /** Serverul a refuzat trimiterea pentru ca lipseste contul: pasul apare, si privirea merge la el. */
  ceruDeServer: () => void;
  /** Intrarea a reusit, in pasul din formular. */
  aIntrat: (email: string) => void;
  /**
   * Chiar inainte de trimitere, cand pasul e deschis: mai e nevoie de el? Omul
   * poate fi intrat intre timp din alt tab, sau plafonul de coduri s-a epuizat si
   * serverul primeste acum comanda ca vizitator.
   */
  maiECerut: () => Promise<boolean>;
  /** Duce privirea si focusul la pasul de intrare. */
  duLaBloc: () => void;
};

function duLa(id: string) {
  const bloc = document.getElementById(id);
  if (!bloc) return;
  bloc.scrollIntoView({ block: "center", behavior: "smooth" });
  bloc.querySelector("input")?.focus({ preventScroll: true });
}

async function intreaba(): Promise<Stare | null> {
  try {
    const r = await fetch("/api/cont/stare", { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return { cere: j?.cere === true, logat: j?.logat === true, email: typeof j?.email === "string" ? j.email : null };
  } catch {
    return null;
  }
}

export function useContulLaComanda({
  activ,
  laAdresa,
}: {
  /** Formularul e deschis si e cel adevarat (nu miniatura din galerie). */
  activ: boolean;
  /** Adresa contului, cand se afla: formularul o pune in campul de email, daca e gol. */
  laAdresa?: (email: string) => void;
}): ContulLaComanda {
  const { obligatoriu } = useContulMagazinului();
  const idBloc = useId();
  const [stare, setStare] = useState<Stare | null>(null);
  const cerut = obligatoriu && activ;
  /*
    ⚠ Ultima stare CUNOSCUTA, pentru functiile chemate din afara randarii (refuzul
    serverului vine dupa un `await`, cu valorile de la apasare), si o numaratoare a
    intrebarilor: un raspuns plecat INAINTEA unei intrari reusite n-are voie sa
    redeschida pasul dupa ea.
  */
  const necesarAcum = useRef(false);
  const intrebare = useRef(0);

  const aflat = useEffectEvent((s: Stare, numar: number) => {
    if (numar !== intrebare.current) return;
    necesarAcum.current = s.cere;
    setStare(s);
    if (s.logat && s.email) laAdresa?.(s.email);
  });

  useEffect(() => {
    if (!cerut) return;
    let anulat = false;
    const numar = ++intrebare.current;
    void intreaba().then((s) => {
      if (!anulat && s) aflat(s, numar);
    });
    return () => {
      anulat = true;
    };
  }, [cerut]);

  /*
    ⚠ Cand omul se intoarce in pagina (de pilda din aplicatia de email, cu codul
    citit, sau dintr-un tab in care a intrat deja), starea se reciteste.
  */
  const necesar = stare?.cere === true;
  /* ⚠ Pe `activ`, nu pe `cerut`: daca magazinul a facut contul obligatoriu DUPA ce
     s-a incarcat pagina, pasul apare abia la refuzul serverului, iar `cerut` (luat
     la incarcare) ar fi oprit recitirea tocmai atunci. */
  useEffect(() => {
    if (!activ || !necesar) return;
    const laIntoarcere = () => {
      const numar = ++intrebare.current;
      void intreaba().then((s) => {
        if (s) aflat(s, numar);
      });
    };
    window.addEventListener("focus", laIntoarcere);
    return () => window.removeEventListener("focus", laIntoarcere);
  }, [activ, necesar]);

  /*
    ⚠ Dupa un refuz al serverului, blocul apare abia cand se incheie tranzitia
    trimiterii, deci privirea se muta DUPA randare, nu in acelasi pas.
  */
  const sariLaBloc = useRef(false);
  useEffect(() => {
    if (!necesar || !sariLaBloc.current) return;
    sariLaBloc.current = false;
    duLa(idBloc);
  }, [necesar, idBloc]);

  return {
    necesar,
    logat: stare?.logat === true,
    email: stare?.email ?? null,
    idBloc,
    ceruDeServer: () => {
      /* Blocul deja deschis nu se mai randeaza din nou, deci efectul n-ar mai rula. */
      if (necesarAcum.current) duLa(idBloc);
      else sariLaBloc.current = true;
      intrebare.current++;
      necesarAcum.current = true;
      setStare({ cere: true, logat: false, email: null });
    },
    aIntrat: (email) => {
      intrebare.current++;
      necesarAcum.current = false;
      setStare({ cere: false, logat: true, email: email || null });
      if (email) laAdresa?.(email);
    },
    maiECerut: async () => {
      if (!necesarAcum.current) return false;
      const numar = ++intrebare.current;
      const s = await intreaba();
      if (!s || numar !== intrebare.current) return false;
      necesarAcum.current = s.cere;
      setStare(s);
      if (s.logat && s.email) laAdresa?.(s.email);
      return s.cere;
    },
    duLaBloc: () => duLa(idBloc),
  };
}
