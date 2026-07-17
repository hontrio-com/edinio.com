"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Users, Search, Phone, Mail, MapPin, ShoppingBag, TrendingUp, Repeat,
  X, ChevronLeft, ChevronRight, Calendar, ExternalLink, ArrowUpDown, Loader2,
} from "lucide-react";
import { formatPrice, formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Customer, CustomerOrder, CustomersSummary } from "@/lib/customers";
import { getCustomerOrders } from "@/lib/actions/customer.actions";
import { CUSTOMERS_PAGE_SIZE } from "@/lib/orders/pagination";
import { orderStatus } from "@/lib/orders/status";

type SortKey = "recent" | "spent" | "orders" | "name";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Activitate recenta" },
  { key: "spent",  label: "Total cheltuit" },
  { key: "orders", label: "Numar comenzi" },
  { key: "name",   label: "Nume (A-Z)" },
];

function StatCard({ icon: Icon, label, value, tint }: {
  icon: typeof Users; label: string; value: string; tint: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center", tint)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export function CustomersClient({ customers, summary, totalCount, page, searchQuery, sort, businessId }: {
  /** Pagina curenta de clienti (max CUSTOMERS_PAGE_SIZE), agregata in Postgres. */
  customers: Customer[];
  summary: CustomersSummary;
  /** Total clienti pentru cautarea curenta (count exact din DB). */
  totalCount: number;
  page: number;
  searchQuery: string;
  sort: string;
  businessId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startNavTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(searchQuery);
  const lastNavQ = useRef(searchQuery);
  const [selected, setSelected] = useState<Customer | null>(null);

  // Datele vin gata agregate/cautate/paginate din SQL; interactiunile devin
  // parametri de URL (q, sort, page), deci functioneaza la orice volum.
  const totalPages = Math.max(1, Math.ceil(totalCount / CUSTOMERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const buildUrl = useCallback((next: { q?: string; sort?: string; page?: number }) => {
    const params = new URLSearchParams();
    const nq = next.q ?? searchQuery;
    const nsort = next.sort ?? sort;
    const npage = next.page ?? page;
    if (nq) params.set("q", nq);
    if (nsort !== "recent") params.set("sort", nsort);
    if (npage > 1) params.set("page", String(npage));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchQuery, sort, page]);

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

  function goTo(next: { q?: string; sort?: string; page?: number }) {
    startNavTransition(() => router.push(buildUrl(next), { scroll: false }));
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-foreground">Clienti</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Toti clientii care au comandat din magazin, grupati automat dupa numarul de telefon.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard icon={Users} label="Clienti" value={String(summary.totalCustomers)} tint="bg-primary/10 text-primary" />
        <StatCard icon={Repeat} label="Clienti fideli" value={String(summary.returningCustomers)} tint="bg-info/10 text-info" />
        <StatCard icon={ShoppingBag} label="Venit total" value={formatPrice(summary.totalRevenue)} tint="bg-success/10 text-success" />
        <StatCard icon={TrendingUp} label="Valoare medie comanda" value={formatPrice(summary.averageOrderValue)} tint="bg-warning/10 text-warning" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cauta dupa nume, telefon sau email..."
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
            {searchQuery ? "Incearca alta cautare." : "Clientii apar aici dupa prima comanda din magazin."}
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
                  {c.paidOrderCount > 1 && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold text-info bg-info/10 border border-info/20 rounded-full px-1.5 py-0.5">
                      <Repeat className="h-2.5 w-2.5" /> Fidel
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {c.phone}{c.email ? ` · ${c.email}` : ""}
                </p>
              </div>
              <div className="hidden sm:block text-right flex-shrink-0">
                <p className="text-xs text-muted-foreground">{c.orderCount} {c.orderCount === 1 ? "comanda" : "comenzi"}</p>
                <p className="text-[11px] text-muted-foreground/70">{formatDate(c.lastOrderAt)}</p>
              </div>
              <div className="text-right flex-shrink-0 w-24">
                <p className="text-sm font-bold text-foreground tabular-nums">{formatPrice(c.totalSpent)}</p>
                <p className="text-[11px] text-muted-foreground">cheltuit</p>
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
      const res = await getCustomerOrders(businessId, customer.key, offset);
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
              {customer.paidOrderCount > 1 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-info bg-info/10 border border-info/20 rounded-full px-1.5 py-0.5 flex-shrink-0">
                  <Repeat className="h-2.5 w-2.5" /> Fidel
                </span>
              )}
            </div>
            <div className="mt-1 space-y-0.5">
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <Phone className="h-3 w-3" /> {customer.phone}
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
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{customer.orderCount}</p>
              <p className="text-[11px] text-muted-foreground">Comenzi</p>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{formatPrice(customer.totalSpent)}</p>
              <p className="text-[11px] text-muted-foreground">Total cheltuit</p>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{formatPrice(customer.aov)}</p>
              <p className="text-[11px] text-muted-foreground">Valoare medie</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> Prima comanda: <span className="text-foreground font-medium">{formatDate(customer.firstOrderAt)}</span>
            </span>
            <span className="text-muted-foreground">Ultima: <span className="text-foreground font-medium">{formatDate(customer.lastOrderAt)}</span></span>
          </div>

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
                          <p className="text-sm font-semibold text-foreground truncate">#{o.order_number}</p>
                          <span className={cn("text-[10px] font-semibold rounded-full px-1.5 py-0.5", st.className)}>{st.label}</span>
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
