"use client";

import { useState, useMemo } from "react";
import {
  Search, Globe, Clock, CheckCircle2, XCircle,
  Loader2, ChevronLeft, ChevronRight, ChevronDown,
  Eye, X, Save,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { useRouter } from "next/navigation";

interface DomainOrder {
  id: string;
  business_id: string;
  user_id: string;
  domain: string;
  tld: string;
  period: number;
  price_per_year: number;
  total_price: number;
  status: string;
  contact_info: Record<string, string>;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  business_name: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: "In asteptare",  color: "bg-amber-100 text-amber-700" },
  processing:  { label: "In procesare",  color: "bg-blue-100 text-blue-700" },
  completed:   { label: "Finalizata",    color: "bg-green-100 text-green-700" },
  cancelled:   { label: "Anulata",       color: "bg-red-100 text-red-700" },
  refunded:    { label: "Rambursata",    color: "bg-zinc-100 text-zinc-500" },
};

const PAGE_SIZE = 30;

export function AdminDomainOrdersClient({ orders }: { orders: DomainOrder[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Detail modal
  const [selected, setSelected] = useState<DomainOrder | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Stats
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const processingCount = orders.filter((o) => o.status === "processing").length;
  const completedCount = orders.filter((o) => o.status === "completed").length;

  const filtered = useMemo(() => {
    let list = [...orders];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (o) =>
          o.domain.toLowerCase().includes(q) ||
          o.business_name.toLowerCase().includes(q) ||
          (o.contact_info?.email ?? "").toLowerCase().includes(q) ||
          (o.contact_info?.firstname ?? "").toLowerCase().includes(q) ||
          (o.contact_info?.lastname ?? "").toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((o) => o.status === statusFilter);
    }
    return list;
  }, [orders, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openDetail(order: DomainOrder) {
    setSelected(order);
    setNewStatus(order.status);
    setNotes(order.admin_notes ?? "");
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);

    try {
      const res = await fetch("/api/admin/domain-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selected.id,
          status: newStatus,
          admin_notes: notes || null,
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!data.success) {
        toast.error(data.error ?? "Eroare la actualizare");
        return;
      }

      toast.success(
        newStatus === "completed"
          ? `Domeniul ${selected.domain} a fost marcat ca finalizat si conectat automat la magazin.`
          : "Comanda actualizata."
      );
      setSelected(null);
      router.refresh();
    } catch {
      toast.error("Eroare de retea");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Comenzi domenii</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestioneaza cererile de inregistrare domenii de la clienti.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-2xl font-bold text-amber-700">{pendingCount}</p>
          <p className="text-xs text-amber-600 font-medium">In asteptare</p>
        </div>
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="text-2xl font-bold text-blue-700">{processingCount}</p>
          <p className="text-xs text-blue-600 font-medium">In procesare</p>
        </div>
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-2xl font-bold text-green-700">{completedCount}</p>
          <p className="text-xs text-green-600 font-medium">Finalizate</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Cauta dupa domeniu, magazin, email..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">Toate ({orders.length})</option>
          <option value="pending">In asteptare ({pendingCount})</option>
          <option value="processing">In procesare ({processingCount})</option>
          <option value="completed">Finalizate ({completedCount})</option>
          <option value="cancelled">Anulate</option>
          <option value="refunded">Rambursate</option>
        </select>
      </div>

      {/* Table */}
      {paginated.length === 0 ? (
        <div className="text-center py-16">
          <Globe className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nicio comanda gasita.</p>
        </div>
      ) : (
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-[1fr_140px_80px_90px_100px_50px] gap-3 px-5 py-3 border-b border-border bg-muted/30">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Domeniu</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Magazin</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Perioada</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Total</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
            <span />
          </div>

          <div className="divide-y divide-border">
            {paginated.map((o) => {
              const cfg = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pending;
              return (
                <div
                  key={o.id}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_140px_80px_90px_100px_50px] gap-1 sm:gap-3 items-center px-5 py-3.5 hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => openDetail(o)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground font-mono truncate">{o.domain}</p>
                    <p className="text-xs text-muted-foreground sm:hidden">{o.business_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString("ro-RO")} &middot; {o.contact_info?.email ?? ""}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate hidden sm:block">{o.business_name}</p>
                  <p className="text-xs text-muted-foreground hidden sm:block">{o.period} {o.period === 1 ? "an" : "ani"}</p>
                  <p className="text-sm font-semibold text-foreground hidden sm:block">{o.total_price} lei</p>
                  <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit", cfg.color)}>
                    {cfg.label}
                  </span>
                  <button
                    type="button"
                    className="hidden sm:flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                    onClick={(e) => { e.stopPropagation(); openDetail(o); }}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "comanda" : "comenzi"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full sm:max-w-xl bg-background border border-border sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95dvh]">
            {/* Header */}
            <div className="px-6 py-5 border-b border-border flex items-start justify-between flex-shrink-0">
              <div>
                <p className="text-base font-bold text-foreground font-mono">{selected.domain}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Comanda din {new Date(selected.created_at).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
              {/* Order info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Magazin</p>
                  <p className="text-sm font-medium text-foreground">{selected.business_name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Extensie</p>
                  <p className="text-sm font-medium text-foreground">{selected.tld}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Perioada</p>
                  <p className="text-sm font-medium text-foreground">{selected.period} {selected.period === 1 ? "an" : "ani"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total</p>
                  <p className="text-sm font-bold text-primary">{selected.total_price} lei</p>
                </div>
              </div>

              {/* Contact info */}
              <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date titular</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Nume: </span>
                    <span className="font-medium">{selected.contact_info?.firstname} {selected.contact_info?.lastname}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Firma: </span>
                    <span className="font-medium">{selected.contact_info?.companyname || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Email: </span>
                    <span className="font-medium">{selected.contact_info?.email}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Telefon: </span>
                    <span className="font-medium">{selected.contact_info?.phonenumber}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">Adresa: </span>
                    <span className="font-medium">
                      {selected.contact_info?.address1}, {selected.contact_info?.city}, {selected.contact_info?.state}, {selected.contact_info?.postcode}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status change */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actualizeaza status</p>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="pending">In asteptare</option>
                  <option value="processing">In procesare</option>
                  <option value="completed">Finalizata (activeaza domeniul)</option>
                  <option value="cancelled">Anulata</option>
                  <option value="refunded">Rambursata</option>
                </select>

                {newStatus === "completed" && selected.status !== "completed" && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
                    <p className="text-xs text-green-700">
                      Marcand comanda ca finalizata, domeniul <strong>{selected.domain}</strong> va fi
                      adaugat automat in lista de domenii a magazinului si conectat ca domeniu custom.
                    </p>
                  </div>
                )}
              </div>

              {/* Admin notes */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Note interne
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Note vizibile doar pentru admin..."
                  className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex items-center gap-3 bg-muted/20 flex-shrink-0">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Inchide
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-60 ml-auto"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Se salveaza..." : "Salveaza"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
