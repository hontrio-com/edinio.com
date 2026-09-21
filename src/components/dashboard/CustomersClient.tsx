"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Users, Search, Phone, Mail, MapPin, ShoppingBag, TrendingUp, Repeat,
  X, ChevronLeft, ChevronRight, Calendar, ExternalLink, ArrowUpDown, Loader2, Upload,
} from "lucide-react";
import { formatPrice, formatDate, formatPhoneDisplay } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Customer, CustomerOrder, CustomersSummary } from "@/lib/customers";
import { getCustomerOrders } from "@/lib/actions/customer.actions";
import { CUSTOMERS_PAGE_SIZE } from "@/lib/orders/pagination";
import { orderStatus } from "@/lib/orders/status";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { EticheteClient } from "@/components/dashboard/clienti/EticheteClient";
import { ETICHETE, PERIOADE, type NumePerioada } from "@/lib/perioade";
import {
  NUMELE_SEGMENTULUI, SEGMENTE, TREPTE_VALOARE, cateFiltre, type Segment,
} from "@/lib/customers/filtre";
import { CustomerImportModal } from "./CustomerImportModal";

type SortKey = "recent" | "spent" | "orders" | "name";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Activitate recenta" },
  { key: "spent",  label: "Total cheltuit" },
  { key: "orders", label: "Numar comenzi" },
  { key: "name",   label: "Nume (A-Z)" },
];


export function CustomersClient({ customers, summary, totalCount, page, searchQuery, sort, perioada, segment, valoare, businessId }: {
  /** Pagina curenta de clienti (max CUSTOMERS_PAGE_SIZE), agregata in Postgres. */
  customers: Customer[];
  summary: CustomersSummary;
  /** Total clienti pentru cautarea curenta (count exact din DB). */
  totalCount: number;
  page: number;
  searchQuery: string;
  sort: string;
  perioada: NumePerioada;
  segment: Segment;
  valoare: string | null;
  businessId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startNavTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(searchQuery);
  const lastNavQ = useRef(searchQuery);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [importing, setImporting] = useState(false);

  // Datele vin gata agregate/cautate/paginate din SQL; interactiunile devin
  // parametri de URL (q, sort, page), deci functioneaza la orice volum.
  const totalPages = Math.max(1, Math.ceil(totalCount / CUSTOMERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const buildUrl = useCallback((next: { q?: string; sort?: string; page?: number; perioada?: NumePerioada; segment?: Segment; valoare?: string | null }) => {
    const params = new URLSearchParams();
    const nq = next.q ?? searchQuery;
    const nsort = next.sort ?? sort;
    const npage = next.page ?? page;
    if (nq) params.set("q", nq);
    if (nsort !== "recent") params.set("sort", nsort);
    /* ⚠ „tot" nu se scrie in adresa: e implicitul, iar o adresa curata se poate trimite. */
    const nperioada = next.perioada ?? perioada;
    if (nperioada !== "tot") params.set("perioada", nperioada);
    const nsegment = next.segment ?? segment;
    if (nsegment !== "toti") params.set("segment", nsegment);
    /* `next.valoare === null` inseamna „sterge filtrul", deci nu se poate folosi `??`. */
    const nvaloare = next.valoare === undefined ? valoare : next.valoare;
    if (nvaloare) params.set("valoare", nvaloare);
    if (npage > 1) params.set("page", String(npage));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchQuery, sort, page, perioada, segment, valoare]);

  // Navigare externa (back/forward, link cu ?q=) → resincronizeaza inputul.
  useEffect(() => {
    if (searchQuery !== lastNavQ.current) {
      lastNavQ.current = searchQuery;
      setSearchInput(searchQuery);
    }
  }, [searchQuery]);

  // Cautarea e debounced si dusa in URL; cautarea reala se face in SQL.
  useEffect(() => {
    if (searchInput === searchQuery) return;
    const t = setTimeout(() => {
      lastNavQ.current = searchInput;
      startNavTransition(() => router.replace(buildUrl({ q: searchInput, page: 1 }), { scroll: false }));
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, searchQuery, buildUrl, router]);

  function goTo(next: { q?: string; sort?: string; page?: number; perioada?: NumePerioada; segment?: Segment; valoare?: string | null }) {
    startNavTransition(() => router.push(buildUrl(next), { scroll: false }));
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Clienți</h1>
          {/*
            ⚠ DESCRIEREA NU MAI E DESPRE MECANICĂ. Scria „grupați automat după
            numărul de telefon" — adevărat, dar e răspunsul la o întrebare pe care
            comerciantul n-a pus-o încă. Cum îi identificăm stă acum lângă cardul
            de contacte, unde chiar contează.
          */}
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestionează cumpărătorii, istoricul comenzilor și segmentele magazinului.
          </p>
        </div>
        {/*
          ⚠ PERIOADA STA LANGA CIFRE, nu langa lista: ea taie numai sumarul.
          Lista ramane pe tot istoricul — un client care n-a comandat luna asta e
          tot clientul magazinului, iar o lista care se goleste la schimbarea
          perioadei ar parea stricata.
        */}
        <div className="flex flex-shrink-0 items-center gap-2">
          <select
            value={perioada}
            onChange={(e) => goTo({ perioada: e.target.value as NumePerioada, page: 1 })}
            aria-label="Perioada cifrelor de mai jos"
            className="rounded-xl bg-card px-2.5 py-2 text-sm font-medium text-foreground ring-1 ring-foreground/10"
          >
            {PERIOADE.map((p) => (
              <option key={p} value={p}>{ETICHETE[p]}</option>
            ))}
          </select>
        <button
          onClick={() => setImporting(true)}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl ring-1 ring-foreground/10 bg-card text-foreground hover:bg-muted transition-colors flex-shrink-0"
        >
          <Upload className="h-4 w-4" /> <span className="hidden sm:inline">Importă clienți</span>
        </button>
        </div>
      </div>

      {importing && <CustomerImportModal onClose={() => setImporting(false)} />}

      {/*
        ═══ CELE PATRU CIFRE ═══

        ⚠ SUNT CHIAR `CardStatistica`, cel de la Statistici și de la Coșuri
        abandonate — nu unul local care semăna cu el. Cardul scris în fișierul
        paginii avea altă înălțime, altă mărime a cifrei și nicio explicație, iar
        două carduri care seamănă diverg la prima retușare.

        ⚠ „Venit total" și „Valoare medie comandă" AU IEȘIT de aici: amândouă există
        deja la Statistici. În pagina Clienți sunt utile mărimile despre RELAȚIA cu
        oamenii, nu cele despre vânzări.
      */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <CardStatistica
          icon={Users}
          label="Clienți"
          value={String(summary.totalContacts)}
          explicatie={
            /*
              ⚠ CELE TREI CIFRE NU SE ADUNĂ, și de-aia se spun toate. Măsurat pe
              demo: 358 de contacte = 338 care au comandat vreodată + 20 importate,
              dar dintre cele 338 numai 292 au măcar o comandă validă — restul au
              comandat și totul le-a fost anulat sau rambursat. Un ecran care scrie
              „292 cumpărători și 20 importate" lângă „358" se contrazice singur, iar
              cine observă nu mai crede niciuna dintre cifre.
            */
            `${summary.totalContacts - summary.importedContacts} au comandat vreodată, `
            + `${summary.importedContacts} ${summary.importedContacts === 1 ? "e contact importat" : "sunt contacte importate"}, `
            + `iar ${summary.buyers} au cel puțin o comandă validă în perioada aleasă. `
            + "Îi identificăm după numărul de telefon, iar când lipsește, după email. "
            + "Numărul de sus e pe tot istoricul, nu pe perioadă."
          }
        />
        <CardStatistica
          icon={Repeat}
          label="Clienți recurenți"
          value={String(summary.returningCustomers)}
          explicatie={
            "Cumpărători cu mai mult de o comandă validă (neanulată și nerambursată) "
            + "în perioada aleasă. ⚠ Pe o fereastră scurtă cifra e mică din fire: "
            + "oamenii rareori cumpără de două ori într-o lună."
          }
        />
        <CardStatistica
          icon={TrendingUp}
          label="Rată de revenire"
          value={String(summary.returnRate)}
          unit="%"
          explicatie={
            /*
              ⚠ NUMITORUL SE SPUNE. O rată singură nu se poate verifica; cu „86 din
              358" se poate. Și se vede imediat când stă pe prea puțini oameni ca să
              însemne ceva.
            */
            `${summary.returningCustomers} din ${summary.buyers} `
            + `${summary.buyers === 1 ? "cumpărător a comandat" : "cumpărători au comandat"} din nou, `
            + "în perioada aleasă. "
            + "Contactele importate nu intră la numitor: n-aveau cum să revină."
          }
        />
        <CardStatistica
          icon={ShoppingBag}
          label="Valoare medie per client"
          value={formatPrice(summary.valuePerCustomer)}
          explicatie={
            "Valoarea comenzilor valide din perioada aleasă, împărțită la cumpărătorii "
            + "din aceeași perioadă. Media pe COMANDĂ stă la Statistici; aici interesează "
            + "cât aduce un om."
          }
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Caută după nume, telefon sau email…"
            className="w-full pl-10 pr-3 py-2.5 text-sm border border-border rounded-xl bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
          />
        </div>
        <div className="relative">
          <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <select
            value={sort}
            onChange={(e) => goTo({ sort: e.target.value, page: 1 })}
            className="appearance-none w-full sm:w-auto pl-10 pr-9 py-2.5 text-sm border border-border rounded-xl bg-surface text-foreground focus:outline-none focus:border-primary cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/*
        ═══ FILTRELE ═══

        ⚠ SE FILTREAZĂ ÎN BAZĂ, nu peste pagina adusă: numărul total și paginarea
        trebuie să fie ale mulțimii filtrate. Vezi `customers_aggregate`.

        ⚠ NICIUN FILTRU FĂRĂ DATE PE CARE SĂ CADă. Lipsesc dinadins „acceptă
        marketing" (n-avem consimțământ pe client), „tag" (nu există etichete scrise
        de comerciant) și „adăugat manual" (nu există adăugarea manuală). Toate trei
        sunt în plan, la etapele lor. Vezi `lib/customers/filtre.ts`.
      */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={segment}
          onChange={(e) => goTo({ segment: e.target.value as Segment, page: 1 })}
          aria-label="Segment"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          {SEGMENTE.map((sg) => (
            <option key={sg} value={sg}>{NUMELE_SEGMENTULUI[sg]}</option>
          ))}
        </select>

        <select
          value={valoare ?? ""}
          onChange={(e) => goTo({ valoare: e.target.value || null, page: 1 })}
          aria-label="Valoarea comenzilor"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">Orice valoare</option>
          {TREPTE_VALOARE.map((t) => (
            <option key={t.cheie} value={t.cheie}>{t.eticheta}</option>
          ))}
        </select>

        {/*
          ⚠ „Șterge filtrele" apare DOAR când există ce șterge. Un buton mereu acolo,
          de cele mai multe ori fără efect, îl învață pe om să-l ignore — și atunci nu-l
          mai vede nici când chiar are nevoie de el.
        */}
        {cateFiltre({ segment, valoare }) > 0 && (
          <button
            type="button"
            onClick={() => goTo({ segment: "toti", valoare: null, page: 1 })}
            className="rounded-xl px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Șterge filtrele ({cateFiltre({ segment, valoare })})
          </button>
        )}

        {/*
          ⚠ CÂȚI AU IEȘIT, lângă filtre. Fără cifra asta, un filtru care nu găsește pe
          nimeni arată exact ca o pagină stricată. Cu ea, „0 clienți" e un răspuns.
        */}
        <span className="ml-auto text-xs text-muted-foreground">
          {totalCount} {totalCount === 1 ? "client" : "clienți"}
        </span>
      </div>

      {/* List */}
      {customers.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">
            {searchQuery ? "Niciun client gasit" : "Niciun client inca"}
          </p>
          <p className="text-sm text-muted-foreground">
            {searchQuery
              ? "Incearca alta cautare."
              : "Clientii apar aici dupa prima comanda din magazin, sau ii poti aduce acum prin import."}
          </p>
        </div>
      ) : (
        <div className={cn("bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border transition-opacity", isPending && "opacity-60")}>
          {customers.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setSelected(c)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
                {c.name[0]?.toUpperCase() ?? "C"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                  {/*
                    ⚠ Cele șase etichete (Nou, Recurent, VIP, Inactiv, Importat,
                    Risc de retur) au regulile în `lib/customers/etichete.ts`, cu
                    măsurătorile care le-au hotărât. Aici erau două, scrise de mână.
                  */}
                  <span className="hidden sm:contents">
                    <EticheteClient client={c} cheie={c.key} />
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {/*
                    ⚠ Trecut prin `formatPhoneDisplay`. Până acum rândurile arătau
                    numărul exact cum a fost scris la checkout, deci în listă stăteau
                    unul sub altul `0753639611`, `+40755588107` și `+359884123309`.
                    Funcția exista de mult și n-o chema nimeni.
                  */}
                  {formatPhoneDisplay(c.phone)}{c.email ? ` · ${c.email}` : ""}
                </p>
              </div>
              {/* Un client importat n-a comandat inca: nu are nici numar, nici data. */}
              <div className="hidden sm:block text-right flex-shrink-0">
                {c.lastOrderAt ? (
                  <>
                    {/*
                      ⚠ NUMĂRUL ȘI SUMA VORBEAU DESPRE MULȚIMI DIFERITE. Scria
                      „5 comenzi · 1.240 lei cheltuit", dar cele cinci puteau cuprinde
                      două anulate, pe când suma le scotea. Acum se arată câte sunt
                      valide, iar totalul doar când diferă — altfel ar fi zgomot pe
                      fiecare rând.
                    */}
                    <p className="text-xs text-muted-foreground">
                      {c.validOrderCount} {c.validOrderCount === 1 ? "comandă validă" : "comenzi valide"}
                      {c.orderCount !== c.validOrderCount && (
                        <span className="text-muted-foreground/70"> din {c.orderCount}</span>
                      )}
                    </p>
                    {/*
                      ⚠ STAREA ULTIMEI COMENZI, CU ETICHETA PANOULUI. Era un text gri
                      („achitat") sub sumă, care nu semăna cu nimic din restul panoului
                      și nu se putea deosebi dintr-o privire. Acum e același punct
                      colorat ca la Comenzi.
                    */}
                    <p className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground/70">
                      {formatDate(c.lastOrderAt)}
                      {c.lastStatus && (
                        <EtichetaStare ton={orderStatus(c.lastStatus).ton} marime="mic">
                          {orderStatus(c.lastStatus).label}
                        </EtichetaStare>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground/70">Fără comenzi</p>
                )}
              </div>
              <div className="text-right flex-shrink-0 w-24">
                {/*
                  ⚠ „VALOAREA COMENZILOR", nu „cheltuit". Suma cuprinde și comenzi
                  neachitate încă (ramburs pe drum, plată în așteptare), deci „cheltuit"
                  promitea bani intrați. Banii chiar intrați se văd în fișa clientului,
                  sub „Total încasat".
                */}
                <p className="text-sm font-bold text-foreground tabular-nums">{formatPrice(c.ordersValue)}</p>
                <p className="text-[11px] text-muted-foreground">valoare comenzi</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {(currentPage - 1) * CUSTOMERS_PAGE_SIZE + 1}–{Math.min(currentPage * CUSTOMERS_PAGE_SIZE, totalCount)} din {totalCount} clienti
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goTo({ page: Math.max(1, currentPage - 1) })}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "..." ? (
                      <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">...</span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => goTo({ page: item as number })}
                        className={cn(
                          "min-w-[28px] h-7 px-2 rounded-lg text-xs font-medium border transition-colors",
                          currentPage === item
                            ? "bg-primary text-white border-primary"
                            : "border-border hover:bg-muted text-muted-foreground"
                        )}
                      >
                        {item}
                      </button>
                    )
                  )}
                <button
                  type="button"
                  onClick={() => goTo({ page: Math.min(totalPages, currentPage + 1) })}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selected && <CustomerDetail customer={selected} businessId={businessId} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CustomerDetail({ customer, businessId, onClose }: { customer: Customer; businessId: string; onClose: () => void }) {
  const addressParts = [customer.address, customer.city, customer.county].filter(Boolean);

  // Istoricul se incarca on-demand (paginat) — clientul poate avea mii de
  // comenzi, deci lista de clienti nu il mai cara pe tot in payload.
  const [history, setHistory] = useState<CustomerOrder[]>([]);
  const [historyTotal, setHistoryTotal] = useState<number | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isLoading, startLoadTransition] = useTransition();

  const fetchHistory = useCallback((offset: number) => {
    startLoadTransition(async () => {
      let res: Awaited<ReturnType<typeof getCustomerOrders>>;
      try {
        res = await getCustomerOrders(businessId, customer.key, offset);
      } catch {
        /* ⚠ Aici nu exista `toast`: casa arata greseala in panou, prin `setHistoryError`, si asa
           ramane. Manerul porneste singur cand se deschide fisa clientului, deci un strigat peste
           ecran ar fi fost si nepoftit, si intr-un loc unde nimeni nu-l asteapta. */
        setHistoryError(
          "Nu am primit raspuns de la server, deci istoricul comenzilor nu s-a putut incarca. "
          + "Incearca din nou.",
        );
        return;
      }
      if ("error" in res) {
        setHistoryError(res.error);
        return;
      }
      setHistoryError(null);
      setHistory(prev => (offset === 0 ? res.orders : [...prev, ...res.orders]));
      setHistoryTotal(res.total);
    });
  }, [businessId, customer.key]);

  useEffect(() => {
    fetchHistory(0);
  }, [fetchHistory]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg bg-background border border-border sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-start gap-3 flex-shrink-0">
          <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0">
            {customer.name[0]?.toUpperCase() ?? "C"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground truncate">{customer.name}</h2>
              <EticheteClient client={customer} cheie={customer.key} marime="normal" />
            </div>
            <div className="mt-1 space-y-0.5">
              {/*
                ⚠ `tel:` PRIMESTE NUMARUL BRUT, nu pe cel frumos. Spatiile puse de noi
                pentru citit n-au ce cauta intr-o adresa de apel; telefonul le ignora
                de obicei, dar „de obicei" nu e o garantie cand butonul trebuie sa sune
                un client.
              */}
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <Phone className="h-3 w-3" /> {formatPhoneDisplay(customer.phone)}
                </a>
              )}
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <Mail className="h-3 w-3" /> {customer.email}
                </a>
              )}
              {addressParts.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 flex-shrink-0" /> {addressParts.join(", ")}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-5">
          {/*
            ═══ CIFRELE, DESFĂCUTE ═══

            ⚠ ERAU TREI ȘI SPUNEAU MAI PUȚIN DECÂT PĂREAU. „Comenzi" număra și
            anulările, „Total cheltuit" le scotea, iar niciuna nu spunea câți bani au
            intrat cu adevărat. Acum:

              Comenzi          valide, și totalul dedesubt când diferă
              Valoare comenzi   ce a cerut omul de la magazin (fără anulate/rambursate)
              Total încasat     ce a ajuns chiar la comerciant

            ⚠ Cele două sume NU sunt același lucru și n-au voie să fie confundate: la
            ramburs, o comandă expediată e valoare, dar nu e încă încasare. Vezi
            `lib/customers/bani.ts`.
          */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{customer.validOrderCount}</p>
              <p className="text-[11px] text-muted-foreground">
                {customer.orderCount === customer.validOrderCount
                  ? "Comenzi"
                  : `Comenzi valide, din ${customer.orderCount}`}
              </p>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{formatPrice(customer.ordersValue)}</p>
              <p className="text-[11px] text-muted-foreground">Valoare comenzi</p>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{formatPrice(customer.collectedTotal)}</p>
              <p className="text-[11px] text-muted-foreground">Total încasat</p>
            </div>
          </div>

          {/*
            Anulările și rambursările se spun pe nume, și numai când există: pe un
            client curat, un rând cu „0 anulate" ar fi zgomot.
          */}
          {(customer.cancelledCount > 0 || customer.refundedCount > 0) && (
            <p className="text-xs text-muted-foreground">
              {customer.cancelledCount > 0 && (
                <>{customer.cancelledCount} {customer.cancelledCount === 1 ? "comandă anulată" : "comenzi anulate"}</>
              )}
              {customer.cancelledCount > 0 && customer.refundedCount > 0 && " · "}
              {customer.refundedCount > 0 && (
                <>{customer.refundedCount} {customer.refundedCount === 1 ? "rambursată" : "rambursate"}</>
              )}
            </p>
          )}

          {/* Datele de comanda exista doar daca a comandat. Un client adus dintr-un
              import apare pana atunci cu contactul si adresa lui, si atat. */}
          {customer.firstOrderAt && customer.lastOrderAt ? (
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" /> Prima comanda: <span className="text-foreground font-medium">{formatDate(customer.firstOrderAt)}</span>
              </span>
              <span className="text-muted-foreground">Ultima: <span className="text-foreground font-medium">{formatDate(customer.lastOrderAt)}</span></span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Nu a plasat nicio comanda. Contactul a fost adus prin import.
            </div>
          )}

          {/* Order history */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Istoric comenzi</p>

            {historyError ? (
              <div className="text-center py-6">
                <p className="text-xs text-destructive mb-3">{historyError}</p>
                <button
                  type="button"
                  onClick={() => fetchHistory(history.length)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Incearca din nou
                </button>
              </div>
            ) : historyTotal === null ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1.5">
                {history.map((o) => {
                  const st = orderStatus(o.status);
                  return (
                    <Link
                      key={o.id}
                      href={`/dashboard/orders/${o.id}`}
                      className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {/* ⚠ Fara „#" pus de noi: numarul comenzii il poarta deja
                              („#1355"), iar al doilea ajungea pe ecran ca „##1355".
                              Comenzile de marketplace n-au niciun „#" (Trendyol
                              trimite „7016"), deci nici nu se poate adauga de-a
                              valma: se scrie asa cum vine. */}
                          <p className="text-sm font-semibold text-foreground truncate">{o.order_number}</p>
                          <EtichetaStare ton={st.ton} marime="mic">{st.label}</EtichetaStare>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDate(o.created_at)} · {o.item_count} {o.item_count === 1 ? "produs" : "produse"}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-foreground tabular-nums flex-shrink-0">{formatPrice(o.total)}</p>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0" />
                    </Link>
                  );
                })}

                {history.length < historyTotal && (
                  <button
                    type="button"
                    onClick={() => fetchHistory(history.length)}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-xl border border-border hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Incarca mai multe ({historyTotal - history.length} ramase)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
