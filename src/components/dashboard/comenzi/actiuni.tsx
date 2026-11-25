"use client";

/*
  Ce stie lista de Comenzi sa FACA: ferestrele de AWB, facturile, starea, etichetele, lotul,
  ridicarile de curier si exportul.

  ⚠ Piesele asezarilor NU scriu nimic si nu cheama nicio actiune de server. Ele cer, prin
  contextele de aici, lui `OrdersClient`: acolo stau de la inceput ferestrele fiecarui curier,
  manerele de factura, lotul cu confirmarile lui si tot ce le pazeste (poarta de AWB, „nu stim
  daca s-a emis", lotul oprit la timp). Asezarile sunt doar alta fata peste aceleasi manere,
  deci o regula reparata acolo e reparata peste tot.

  ⚠ DOUA contexte, nu unul. Selectia se schimba la fiecare bifa; daca ar sta langa actiunile
  unei comenzi, fiecare bifa ar redesena toate butoanele din toate randurile (o pagina are 50 de
  comenzi, fiecare cu trei-patru piese care asculta). Asa, bifa redeseneaza doar randul ei si
  bara de selectie.
*/

import { createContext, useContext } from "react";
import type { BulkCourier, BulkResult, InvoiceProvider } from "@/lib/actions/bulk-orders.actions";
import type { CasaFacturare } from "@/lib/integrari/parteneri";
import type { CurierPropriu } from "@/lib/orders/awb-propriu";
import type { Asezare, FiltreComenzi } from "./filtre";

/* ── O comanda si antetul ─────────────────────────────────────────────────── */

export interface ActiuniComenzi {
  /**
   * Fereastra curierului pentru comanda: emite AWB-ul, sau il arata pe cel emis (eticheta,
   * urmarirea, anularea). La emitere, daca poarta de AWB refuza comanda, spune de ce.
   */
  awb: (idComanda: string, curier: CurierPropriu, emite: boolean) => void;
  emiteFactura: (idComanda: string, casa: CasaFacturare) => void;
  /** Comanda pentru care se emite acum un document (rotita pe butonul ei). */
  facturaInLucru: string | null;
  /** Deschide documentul comenzii: la casa de facturare, ca PDF, sau in pagina comenzii. */
  deschideDocumentul: (idComanda: string) => void;
  schimbaStarea: (iduri: readonly string[], stare: string) => void;
  /** Se schimba o stare: butoanele de stare se sting pana raspunde serverul. */
  stareInLucru: boolean;
  /** Printeaza eticheta AWB-ului unei comenzi. */
  eticheta: (idComanda: string) => void;

  /** Fereastra de chemare a curierului (FAN Courier, DPD, Cargus). */
  cheamaCurierul: (curier: CurierPropriu) => void;
  /** Curierii conectati care au chemare din lista. */
  cuRidicare: readonly CurierPropriu[];
  /** Descarca .xlsx cu toate comenzile filtrului de pe ecran. */
  exporta: () => void;
  exportInLucru: boolean;
  /**
   * Trece lista in alta asezare si o tine minte. Filtrele se golesc (fiecare asezare le are pe ale
   * ei), in afara de cele date aici: „Fluxul" trimite in „Registru" cu fila unei stari.
   */
  alegeAsezarea: (asezare: Asezare, filtre?: Partial<Pick<FiltreComenzi, "status">>) => void;
}

const ContextActiuni = createContext<ActiuniComenzi | null>(null);

/** Il pune `OrdersClient` in jurul asezarilor. */
export const FurnizorActiuniComenzi = ContextActiuni.Provider;

export function useActiuni(): ActiuniComenzi {
  const actiuni = useContext(ContextActiuni);
  if (!actiuni) throw new Error("Piesele listei de comenzi se deseneaza sub <FurnizorActiuniComenzi> (OrdersClient).");
  return actiuni;
}

/* ── Mai multe comenzi: selectia si lotul ─────────────────────────────────── */

/** Comenzile bifate, pentru o actiune pe mai multe. */
export interface SelectieComenzi {
  alese: ReadonlySet<string>;
  /** Aceeasi functie la fiecare desenare: randurile sunt memorate. */
  comuta: (id: string) => void;
  /** Bifeaza sau debifeaza mai multe deodata (toata pagina, o zi, un culoar). */
  pune: (iduri: readonly string[], alese: boolean) => void;
  goleste: () => void;
}

/** Lotul: actiunile pe comenzile bifate, cu ce are magazinul conectat. */
export interface LotComenzi {
  /** Casele de facturare conectate; cu mai multe, omul alege una sau lasa „automat". */
  case_: readonly { key: InvoiceProvider; label: string }[];
  /** Curierii la care se pot emite AWB-uri in lot. */
  curieri: readonly { key: BulkCourier; label: string }[];
  facturi: (casa: InvoiceProvider) => void;
  awburi: (curier: BulkCourier) => void;
  /** Trimite documentele comenzilor bifate in SAGA; lipseste cand SAGA nu e conectat. */
  saga?: () => void;
  /** Fereastra lotului Woot (cere o cotatie, deci nu intra in „AWB-uri"); lipseste fara Woot. */
  woot?: () => void;
  etichete: (mod: "descarca" | "printeaza", format: "A4" | "A6") => void;
  exporta: () => void;
  /** Se emite sau se muta ceva: butoanele care scriu se sting. */
  ocupat: boolean;
  eticheteInLucru: boolean;
  /** Ce a iesit din ultimul lot, cu motivele celor sarite si esuate. */
  rezultat: { title: string; result: BulkResult } | null;
  inchideRezultatul: () => void;
  /** Etichetele care n-au intrat in document, cu motivul fiecareia. */
  eticheteSarite: readonly { comanda: string; motiv: string }[];
  eticheteInPlus: number;
  inchideEtichetele: () => void;
}

export interface LotSiSelectie {
  selectie: SelectieComenzi;
  lot: LotComenzi;
}

const ContextLot = createContext<LotSiSelectie | null>(null);

/** Il pune `OrdersClient` in jurul asezarilor, langa `FurnizorActiuniComenzi`. */
export const FurnizorLotComenzi = ContextLot.Provider;

export function useLot(): LotSiSelectie {
  const lot = useContext(ContextLot);
  if (!lot) throw new Error("Selectia si lotul listei de comenzi se citesc sub <FurnizorLotComenzi> (OrdersClient).");
  return lot;
}
