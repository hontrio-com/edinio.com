"use client";

import { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, ShoppingBag, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Order {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  total: number | null;
  status: string;
  payment_method: string | null;
  created_at: string;
  business_id: string;
  business_name: string;
  shipping_address: unknown;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "In asteptare", color: "bg-amber-100 text-amber-700" },
  confirmed: { label: "Confirmat", color: "bg-blue-100 text-blue-700" },
  processing: { label: "In procesare", color: "bg-purple-100 text-purple-700" },
  shipped: { label: "Expediat", color: "bg-cyan-100 text-cyan-700" },
  delivered: { label: "Livrat", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Anulat", color: "bg-red-100 text-red-700" },
  refunded: { label: "Rambursat", color: "bg-zinc-100 text-zinc-500" },
};

const PAYMENT_LABELS: Record<string, string> = {
  card: "Card",
  cash: "Numerar",
  bank_transfer: "Transfer",
  online: "Online",
};

const PAGE_SIZE = 30;
type SortKey = "created_at" | "total" | "order_number";

export function AdminOrdersClient({ orders }: { orders: Order[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const totalRevenue = orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded").reduce((s, o) => s + (o.total ?? 0), 0);

  const filtered = useMemo(() => {
    let list = [...orders];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (o) =>
          o.order_number?.toLowerCase().includes(q) ||
          o.customer_name?.toLowerCase().includes(q) ||
          o.customer_email?.toLowerCase().includes(q) ||
          o.business_name.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") list = list.filter((o) => o.status === statusFilter);
    list.sort((a, b) => {
      let av: number | string = a[sortKey] ?? "";
      let bv: number | string = b[sortKey] ?? "";
      if (sortKey === "total") { av = a.total ?? 0; bv = b.total ?? 0; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [orders, query, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Comenzi</h1>
        <p className="text-sm text-zinc-500 mt-1">{orders.length} comenzi totale</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Totale", value: orders.length, color: "text-zinc-700" },
          { label: "In asteptare", value: orders.filter((o) => o.status === "pending").length, color: "text-amber-600" },
          { label: "Livrate", value: orders.filter((o) => o.status === "delivered").length, color: "text-green-600" },
          { label: "Venituri", value: `${totalRevenue.toLocaleString("ro-RO")} lei`, color: "text-primary" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
            <p className={cn("text-2xl font-black", color)}>{value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Cauta dupa nr comanda, client, magazin..."
            className="w-full pl-9 pr-3 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">Toate statusurile</option>
          <option value="pending">In asteptare</option>
          <option value="confirmed">Confirmat</option>
          <option value="processing">In procesare</option>
          <option value="shipped">Expediat</option>
          <option value="delivered">Livrat</option>
          <option value="cancelled">Anulat</option>
          <option value="refunded">Rambursat</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <tr>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide cursor-pointer hover:text-zinc-700"
                  onClick={() => toggleSort("order_number")}
                >
                  <span className="flex items-center gap-1">Nr. Comanda <SortIcon col="order_number" /></span>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Magazin</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Plata</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide cursor-pointer hover:text-zinc-700"
                  onClick={() => toggleSort("total")}
                >
                  <span className="flex items-center justify-end gap-1">Total <SortIcon col="total" /></span>
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide cursor-pointer hover:text-zinc-700"
                  onClick={() => toggleSort("created_at")}
                >
                  <span className="flex items-center gap-1">Data <SortIcon col="created_at" /></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-sm text-zinc-400">
                    <ShoppingBag className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
                    Nicio comanda gasita
                  </td>
                </tr>
              ) : paged.map((o) => {
                const sc = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pending;
                return (
                  <tr key={o.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono font-semibold text-zinc-900 dark:text-white">#{o.order_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">{o.customer_name ?? "—"}</p>
                      <p className="text-xs text-zinc-400">{o.customer_email ?? o.customer_phone ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 max-w-[160px] truncate">{o.business_name}</td>
                    <td className="px-4 py-3 text-sm text-zinc-500">{PAYMENT_LABELS[o.payment_method ?? ""] ?? o.payment_method ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full", sc.color)}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:text-white">
                      {o.total != null ? `${o.total.toLocaleString("ro-RO")} lei` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">
                      {new Date(o.created_at).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} din {filtered.length}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-xs px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
