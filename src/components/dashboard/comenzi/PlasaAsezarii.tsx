"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { catchError, type ErrorInfo } from "next/error";
import { raporteazaEroarea } from "@/lib/sentry/raporteaza";

/*
  PLASA ASEZARILOR NOI: daca una cade la desenare, lista de comenzi NU dispare.

  Pagina de Comenzi e cea mai folosita din panou, iar asezarile noi au ajuns in ea pe 25.11.2026
  fara sa fi vazut inca toate felurile de comenzi din toate magazinele (o linie de produs cu o
  forma neasteptata, o comanda veche fara un camp). Fara plasa, o asemenea comanda ar fi inlocuit
  TOATA pagina cu „500 · Ceva nu a functionat corect", iar comerciantul n-ar mai fi ajuns la
  comenzile lui decat dupa o reparatie.

  Cu plasa: in locul asezarii cazute apare pe loc tabelul de dinainte (care citeste randurile
  direct, fara forma noua), lista e trecuta pe el si la urmatoarele intrari, omului i se spune ce
  s-a intamplat, iar eroarea pleaca la Sentry, ca lipsa sa nu ramana tacuta.

  ⚠ Sub plasa sta si ADUCEREA randurilor la forma listei (`laForma`, chemata in `ListaComenzi`),
  nu doar desenarea: acolo se citesc campurile comenzii, deci acolo ar cadea o comanda stricata.

  ⚠ Granita e a lui Next (`catchError`), ca la vitrina (`PazaSectiune`): starea de cadere se
  sterge la navigare, iar `redirect()` si `notFound()` trec mai departe.
*/

interface Proprietati {
  /** Ce se arata in locul asezarii cazute: tabelul de dinainte. */
  rezerva: ReactNode;
  /** Se cheama o data, la cadere: trece lista pe tabelul de dinainte si o spune omului. */
  laCadere: () => void;
}

/** Componenta ei, ca raportul si trecerea pe tabelul de dinainte sa plece dintr-un efect, o data pe cadere. */
function AsezareCazuta({ rezerva, laCadere, eroare }: Proprietati & { eroare: unknown }) {
  const anuntata = useRef(false);
  useEffect(() => {
    if (anuntata.current) return;
    anuntata.current = true;
    raporteazaEroarea(eroare instanceof Error ? eroare : new Error(String(eroare)), { loc: "lista de comenzi, asezare noua" });
    laCadere();
  }, [eroare, laCadere]);
  return <>{rezerva}</>;
}

export const PlasaAsezarii = catchError(function PlasaAsezarii(proprietati: Proprietati, { error }: ErrorInfo) {
  return <AsezareCazuta {...proprietati} eroare={error} />;
});
