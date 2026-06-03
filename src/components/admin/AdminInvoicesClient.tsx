"use client";

import { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, Receipt, AlertCircle, XCircle, RefreshCw, Loader2, Trash2, Download } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toast } from "sonner";
import { PLAN_LABELS } from "@/lib/plans";

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

// PLAN_LABELS imported from @/lib/plans

const PAGE_SIZE = 30;

export function AdminInvoicesClient({ invoices: initialInvoices }: { invoices: Invoice[] }) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const totalRevenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const failedCount = invoices.filter((i) => i.status === "failed").length;
  const smartbillErrors = invoices.filter((i) => i.smartbill_error).length;

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/export/invoices");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `facturi_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export descarcat");
    } catch { toast.error("Eroare la export"); }
    finally { setExporting(false); }
  }

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

  async function handleCancel(id: string) {
    if (!confirm("Anulezi aceasta factura?")) return;
    setActionLoading(id + "_cancel");
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "void" }),
      });
      if (!res.ok) throw new Error();
      setInvoices((prev) => prev.map((i) => i.id === id ? { ...i, status: "void" } : i));
      toast.success("Factura anulata");
    } catch { toast.error("Eroare la anulare"); }
    finally { setActionLoading(null); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Stergi definitiv aceasta factura? Actiunea este ireversibila.")) return;
    setActionLoading(id + "_delete");
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setInvoices((prev) => prev.filter((i) => i.id !== id));
      toast.success("Factura stearsa");
    } catch { toast.error("Eroare la stergere"); }
    finally { setActionLoading(null); }
  }

  async function handleReissue(id: string) {
    setActionLoading(id + "_reissue");
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { invoice } = await res.json() as { invoice: Invoice & { user_name?: string } };
      const original = invoices.find((i) => i.id === id);
      setInvoices((prev) => [{ ...invoice, user_name: original?.user_name ?? "—" }, ...prev]);
      toast.success("Factura reemisa cu status 'In asteptare'");
    } catch { toast.error("Eroare la reemitere"); }
    finally { setActionLoading(null); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Facturi</h1>
          <p className="text-sm text-zinc-500 mt-1">{invoices.length} facturi totale</p>
        </div>
        <button onClick={handleExport} disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50">
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Totale", value: invoices.length, color: "text-zinc-700" },
          { label: "Platite", value: invoices.filter((i) => i.status === "paid").length, color: "text-green-600" },
          { label: "Esuate", value: failedCount, color: failedCount > 0 ? "text-red-600" : "text-zinc-400" },
          { label: "Venituri totale", value: `${totalRevenue.toLocaleString("ro-RO")} lei`, color: "text-primary" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
            <p className={cn("text-2xl font-black", color)}>{value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {(failedCount > 0 || smartbillErrors > 0) && (
        <div className="space-y-2">
          {failedCount > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {failedCount} {failedCount === 1 ? "factura esuata" : "facturi esuate"} — verifica erorile SmartBill.
            </div>
          )}
          {smartbillErrors > 0 && smartbillErrors !== failedCount && (
            <div className="flex items-center gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-xl text-sm text-orange-700 dark:text-orange-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {smartbillErrors} {smartbillErrors === 1 ? "factura cu eroare" : "facturi cu erori"} SmartBill — reemite facturile afectate.
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Cauta dupa client, nr. factura, Stripe ID..."
            className="w-full pl-9 pr-3 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">Stripe ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Suma</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">Data</th>
                <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-right">Actiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-sm text-zinc-400">
                    <Receipt className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
                    Nicio factura gasita
                  </td>
                </tr>
              ) : paged.map((inv) => {
                const sc = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.pending;
                const hasError = inv.status === "failed" && inv.smartbill_error;
                const loadingCancel = actionLoading === inv.id + "_cancel";
                const loadingReissue = actionLoading === inv.id + "_reissue";
                return (
                  <tr key={inv.id} className={cn("hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors", hasError && "bg-red-50/30 dark:bg-red-950/10")}>
                    <td className="px-4 py-3">
                      {inv.smartbill_series && inv.smartbill_number
                        ? <span className="text-sm font-mono font-semibold text-zinc-900 dark:text-white">{inv.smartbill_series}-{inv.smartbill_number}</span>
                        : <span className="text-sm text-zinc-400">—</span>
                      }
                      {hasError && (
                        <p className="text-[10px] text-red-500 mt-0.5 max-w-[160px] truncate" title={inv.smartbill_error ?? ""}>{inv.smartbill_error}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-white">{inv.user_name}</td>
                    <td className="px-4 py-3 text-sm text-zinc-500">{PLAN_LABELS[inv.plan] ?? inv.plan}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {inv.stripe_invoice_id
                        ? <span className="text-xs font-mono text-zinc-400 truncate max-w-[100px] block">{inv.stripe_invoice_id}</span>
                        : <span className="text-sm text-zinc-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full", sc.color)}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:text-white whitespace-nowrap">
                      {inv.amount.toLocaleString("ro-RO")} {inv.currency?.toUpperCase() ?? "RON"}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500 hidden sm:table-cell">
                      {new Date(inv.created_at).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {inv.status !== "void" && (
                          <button onClick={() => handleCancel(inv.id)} disabled={!!actionLoading}
                            title="Anuleaza factura"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors disabled:opacity-40">
                            {loadingCancel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <button onClick={() => handleReissue(inv.id)} disabled={!!actionLoading}
                          title="Reemite factura"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40">
                          {loadingReissue ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => handleDelete(inv.id)} disabled={!!actionLoading}
                          title="Sterge factura"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40">
                          {actionLoading === inv.id + "_delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
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
