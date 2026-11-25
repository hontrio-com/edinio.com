"use client";

/*
  Lista de Comenzi in asezarile ei noi: „Registru" (implicita), „Flux", „Două panouri" si „Pe
  zile". Hotarate de proprietar pe 24.11.2026, dintre patru variante incercate pe comenzile
  adevarate ale magazinului; din 25.11.2026 sunt chiar pagina de Comenzi.

  Aici se alege asezarea si se pun in jurul ei navigarea prin filtre (in adresa), deschiderea
  comenzii la clic pe rand si fereastra de confirmare. Datele vin gata filtrate de pe server;
  ce se FACE cu o comanda vine din `OrdersClient`, prin `actiuni.tsx`.
*/

import { useNavigare } from "@/components/dashboard/liste/navigare";
import { AsezareFlux } from "./AsezareFlux";
import { AsezarePanouri } from "./AsezarePanouri";
import { AsezareRegistru } from "./AsezareRegistru";
import { AsezareZile } from "./AsezareZile";
import { FurnizorConfirmare, ListaProvider, type NavigareComenzi } from "./comune";
import type { ComandaLista, SursaFiltru } from "./date";
import { adresaFiltrelor, type FiltreComenzi } from "./filtre";

/** Ce primeste lista: comenzile de pe ecran, gata filtrate pe server, si numerele din jurul lor. */
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

export function ListaComenzi(date: DateLista) {
  const nav = useNavigare(date.filtre, adresaFiltrelor);
  const pentruAsezare: DateAsezare = { ...date, nav };
  const asezare = date.filtre.asezare;
  return (
    <FurnizorConfirmare>
      <ListaProvider filtre={date.filtre}>
        {asezare === "flux" ? <AsezareFlux {...pentruAsezare} />
          : asezare === "panouri" ? <AsezarePanouri {...pentruAsezare} />
            : asezare === "zile" ? <AsezareZile {...pentruAsezare} />
              : <AsezareRegistru {...pentruAsezare} />}
      </ListaProvider>
    </FurnizorConfirmare>
  );
}
