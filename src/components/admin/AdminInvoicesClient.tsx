"use client";

import { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, Receipt, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Invoice {
  id: string;
  user_id: string;
  user_name: string;
  plan: string;
  amount: number;
  currency: string;
  smartbill_series: string | null;
  smartbill_number: string | null;
  stripe_invoice_id: string | null;
  status: string;
  created_at: string;
  smartbill_error: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  paid: { label: "Platita", color: "bg-green-100 text-green-700" },
  pending: { label: "In asteptare", color: "bg-amber-100 text-amber-700" },
  failed: { label: "Esuata", color: "bg-red-100 text-red-700" },
  void: { label: "Anulata", color: "bg-zinc-100 text-zinc-500" },
};

const PLAN_LABELS: Record<string, string> = {
  free: "Gratuit",
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

const PAGE_SIZE = 30;

export function AdminInvoicesClient({ invoices }: { invoices: Invoice[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const totalRevenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const failedCount = invoices.filter((i) => i.status === "failed").length;

  const filtered = useMemo(() => {
    let list = [...invoices];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (i) =>
          i.user_name.toLowerCase().includes(q) ||
          i.smartbill_number?.toLowerCase().includes(q) ||
          i.stripe_invoice_id?.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    return list;
  }, [invoices, query, statusFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Facturi</h1>
        <p className="text-sm text-zinc-500 mt-1">{invoices.length} facturi totale</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Totale", value: invoices.length, color: "text-zinc-700" },
          { label: "Platite", value: invoices.filter((i) => i.status === "paid").length, color: "text-green-600" },
          { label: "Esuate", value: failedCount, color: failedCount > 0 ? "text-red-600" : "text-zinc-400" },
          { label: "Venituri totale", value: `${(totalRevenue / 100).toLocaleString("ro-RO")} lei`, color: "text-primary" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
            <p className={cn("text-2xl font-black", color)}>{value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Failed alert */}
      {failedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {failedCount} {failedCount === 1 ? "factura esuata" : "facturi esuate"} — verifica erorile SmartBill.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Cauta dupa client, nr. factura, Stripe ID..."
            className="w-full pl-9 pr-3 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">Toate statusurile</option>
          <option value="paid">Platite</option>
          <option value="pending">In asteptare</option>
          <option value="failed">Esuate</option>
          <option value="void">Anulate</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Nr. Factura</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Stripe ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Suma</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-sm text-zinc-400">
                    <Receipt className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
                    Nicio factura gasita
                  </td>
                </tr>
              ) : paged.map((inv) => {
                const sc = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.pending;
                const hasError = inv.status === "failed" && inv.smartbill_error;
                return (
                  <tr key={inv.id} className={cn("hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors", hasError && "bg-red-50/30 dark:bg-red-950/10")}>
                    <td className="px-4 py-3">
                      {inv.smartbill_series && inv.smartbill_number
                        ? <span className="text-sm font-mono font-semibold text-zinc-900 dark:text-white">{inv.smartbill_series}-{inv.smartbill_number}</span>
                        : <span className="text-sm text-zinc-400">—</span>
                      }
                      {hasError && (
                        <p className="text-[10px] text-red-500 mt-0.5 max-w-[180px] truncate" title={inv.smartbill_error ?? ""}>{inv.smartbill_error}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-white">{inv.user_name}</td>
                    <td className="px-4 py-3 text-sm text-zinc-500">{PLAN_LABELS[inv.plan] ?? inv.plan}</td>
                    <td className="px-4 py-3">
                      {inv.stripe_invoice_id
                        ? <span className="text-xs font-mono text-zinc-400 truncate max-w-[120px] block">{inv.stripe_invoice_id}</span>
                        : <span className="text-sm text-zinc-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full", sc.color)}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:text-white">
                      {(inv.amount / 100).toLocaleString("ro-RO", { minimumFractionDigits: 2 })} {inv.currency?.toUpperCase() ?? "RON"}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">
                      {new Date(inv.created_at).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })}
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
