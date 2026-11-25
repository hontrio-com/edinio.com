"use client";

/*
  Lista de Comenzi in asezarile ei noi: „Registru" (implicita), „Flux", „Două panouri" si „Pe
  zile". Hotarate de proprietar pe 24.11.2026, dintre patru variante incercate pe comenzile
  adevarate ale magazinului; din 25.11.2026 sunt chiar pagina de Comenzi.

  Aici se alege asezarea si se pun in jurul ei navigarea prin filtre (in adresa), deschiderea
  comenzii la clic pe rand si fereastra de confirmare. Datele vin gata filtrate de pe server;
  ce se FACE cu o comanda vine din `OrdersClient`, prin `actiuni.tsx`.

  ⚠ Randurile vin cum sunt in baza si se aduc la forma listei AICI (`laForma`), nu in parinte:
  componenta asta sta sub `PlasaAsezarii`, deci o comanda cu o forma neasteptata, care ar arunca
  la citire, lasa in loc tabelul de dinainte, nu o pagina de eroare.
*/

import { useMemo } from "react";
import { useNavigare } from "@/components/dashboard/liste/navigare";
import { AsezareFlux } from "./AsezareFlux";
import { AsezarePanouri } from "./AsezarePanouri";
import { AsezareRegistru } from "./AsezareRegistru";
import { AsezareZile } from "./AsezareZile";
import { FurnizorConfirmare, ListaProvider, type NavigareComenzi } from "./comune";
import type { ComandaLista, SursaFiltru } from "./date";
import { adresaFiltrelor, type FiltreComenzi } from "./filtre";

/** Ce deseneaza o asezare: comenzile de pe ecran, gata filtrate pe server, si numerele din jurul lor. */
export interface DateLista {
  filtre: FiltreComenzi;
  /** Ghicit pe server dupa agentul de utilizator: un telefon primeste doar forma de fise. */
  telefon: boolean;
  /** Pagina curenta de comenzi („Registru", „Două panouri", „Pe zile"). */
  comenzi: ComandaLista[];
  /** Cate comenzi are filtrul curent, pe toate paginile. */
  totalFiltru: number;
  /** Culoarele „Fluxului": primele comenzi ale fiecarei etape si cate are etapa in total. */
  culoare: { cheie: string; comenzi: ComandaLista[]; total: number }[];
  /** Cate comenzi are magazinul in fiecare stare. */
  numarari: Record<string, number>;
  /** Toate comenzile magazinului. */
  total: number;
  /** Sursele care chiar au comenzi, pentru filtru. */
  surse: SursaFiltru[];
}

/** Ce primeste fiecare asezare: datele listei si navigarea prin filtre. */
export interface DateAsezare extends DateLista {
  nav: NavigareComenzi;
}

/** Ce primeste lista de la `OrdersClient`: randurile cum vin din baza si functia care le aduce la forma listei. */
export interface DateBrute<R> extends Omit<DateLista, "comenzi" | "culoare"> {
  randuri: readonly R[];
  culoare: readonly { cheie: string; comenzi: readonly R[]; total: number }[];
  /** Aduce un rand la forma listei. Aceeasi functie de la o desenare la alta, cat nu se schimba magazinul. */
  laForma: (rand: R) => ComandaLista;
}

export function ListaComenzi<R>({ randuri, culoare, laForma, ...restul }: DateBrute<R>) {
  const nav = useNavigare(restul.filtre, adresaFiltrelor);
  const comenzi = useMemo(() => randuri.map(laForma), [randuri, laForma]);
  const culoareLista = useMemo(
    () => culoare.map((cu) => ({ cheie: cu.cheie, total: cu.total, comenzi: cu.comenzi.map(laForma) })),
    [culoare, laForma],
  );
  const pentruAsezare: DateAsezare = { ...restul, comenzi, culoare: culoareLista, nav };
  const asezare = restul.filtre.asezare;
  return (
    <FurnizorConfirmare>
      <ListaProvider filtre={restul.filtre}>
        {asezare === "flux" ? <AsezareFlux {...pentruAsezare} />
          : asezare === "panouri" ? <AsezarePanouri {...pentruAsezare} />
            : asezare === "zile" ? <AsezareZile {...pentruAsezare} />
              : <AsezareRegistru {...pentruAsezare} />}
      </ListaProvider>
    </FurnizorConfirmare>
  );
}
