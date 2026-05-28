"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ExternalLink, Package, ShoppingCart, Settings2,
  User, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Globe, ToggleLeft, ToggleRight, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toast } from "sonner";

interface Business {
  id: string; business_name: string; store_name: string | null; slug: string;
  type: string; is_published: boolean; created_at: string; primary_color: string;
  user_id: string; niche_id: string | null; description: string | null;
}
interface Order {
  id: string; order_number: string; customer_name: string | null; customer_email: string | null;
  customer_phone: string | null; total: number | null; status: string; payment_method: string | null;
  created_at: string; shipping_address: unknown;
}
interface Product {
  id: string; name: string; price: number | null; is_active: boolean; created_at: string;
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

const PAGE_SIZE = 20;
type OrderSortKey = "created_at" | "total" | "order_number";

export function AdminBusinessDetailClient({
  business, orders, products, owner, ownerEmail, settings,
}: {
  business: Business;
  orders: Order[];
  products: Product[];
  owner: { id: string; full_name: string; plan: string; role: string } | null;
  ownerEmail: string;
  settings: unknown | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"orders" | "products" | "settings">("orders");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<OrderSortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [publishing, setPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(business.is_published);

  const revenue = orders.filter((o) => !["cancelled", "refunded"].includes(o.status)).reduce((s, o) => s + (o.total ?? 0), 0);

  const filteredOrders = useMemo(() => {
    let list = [...orders];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((o) =>
        o.order_number?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.customer_email?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") list = list.filter((o) => o.status === statusFilter);
    list.sort((a, b) => {
      const av = sortKey === "total" ? (a.total ?? 0) : String(a[sortKey] ?? "");
      const bv = sortKey === "total" ? (b.total ?? 0) : String(b[sortKey] ?? "");
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return list;
  }, [orders, query, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);
  const paged = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(k: OrderSortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
    setPage(1);
  }

  function SortIcon({ col }: { col: OrderSortKey }) {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  async function handleTogglePublish() {
    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: !isPublished }),
      });
      if (!res.ok) throw new Error();
      setIsPublished((v) => !v);
      toast.success(isPublished ? "Magazin dezpublicat" : "Magazin publicat");
      router.refresh();
    } catch {
      toast.error("Eroare la actualizare");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/admin/magazine" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white transition-colors w-fit">
        <ArrowLeft className="h-4 w-4" /> Inapoi la magazine
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-black flex-shrink-0"
              style={{ backgroundColor: business.primary_color }}>
              {(business.store_name ?? business.business_name)[0]?.toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-zinc-900 dark:text-white">{business.store_name ?? business.business_name}</h1>
                <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full",
                  isPublished ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                )}>{isPublished ? "Publicat" : "Draft"}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-sm text-zinc-500">/{business.slug}</span>
                <span className="text-xs text-zinc-400 capitalize">{business.type}</span>
                {business.niche_id && <span className="text-xs text-zinc-400">{business.niche_id}</span>}
              </div>
              <p className="text-xs text-zinc-400 mt-1">Creat {new Date(business.created_at).toLocaleDateString("ro-RO")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a href={`/${business.slug}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 dark:text-zinc-400 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg transition-colors">
              <Globe className="h-3.5 w-3.5" /> Viziteaza
            </a>
            <button onClick={handleTogglePublish} disabled={publishing}
              className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50",
                isPublished
                  ? "text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50"
                  : "text-green-700 bg-green-50 hover:bg-green-100 dark:bg-green-950/30 dark:hover:bg-green-950/50"
              )}>
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isPublished ? <ToggleLeft className="h-3.5 w-3.5" /> : <ToggleRight className="h-3.5 w-3.5" />}
              {isPublished ? "Dezpublica" : "Publica"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800">
          {[
            { label: "Comenzi", value: orders.length, color: "text-zinc-900 dark:text-white" },
            { label: "Produse", value: products.length, color: "text-zinc-900 dark:text-white" },
            { label: "Produse active", value: products.filter((p) => p.is_active).length, color: "text-green-600" },
            { label: "Venituri", value: `${revenue.toLocaleString("ro-RO")} lei`, color: "text-primary" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className={cn("text-xl font-black", color)}>{value}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Owner */}
        {owner && (
          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600 flex-shrink-0">
              {owner.full_name[0]?.toUpperCase()}
            </div>
            <div>
              <Link href={`/admin/utilizatori/${owner.id}`} className="text-sm font-semibold text-zinc-900 dark:text-white hover:underline">
                {owner.full_name}
              </Link>
              <p className="text-xs text-zinc-400">{ownerEmail} · Plan: <span className="capitalize">{owner.plan}</span></p>
            </div>
            <Link href={`/admin/utilizatori/${owner.id}`}
              className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
              <User className="h-3.5 w-3.5" /> Profil utilizator
            </Link>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 w-fit">
        {([
          { key: "orders", label: "Comenzi", icon: ShoppingCart },
          { key: "products", label: "Produse", icon: Package },
          { key: "settings", label: "Setari", icon: Settings2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              tab === key ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Orders tab */}
      {tab === "orders" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Cauta dupa nr, client, email..."
                className="w-full pl-9 pr-3 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="all">Toate</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide cursor-pointer hover:text-zinc-700" onClick={() => toggleSort("order_number")}>
                      <span className="flex items-center gap-1">Nr <SortIcon col="order_number" /></span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide cursor-pointer hover:text-zinc-700" onClick={() => toggleSort("total")}>
                      <span className="flex items-center justify-end gap-1">Total <SortIcon col="total" /></span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide cursor-pointer hover:text-zinc-700" onClick={() => toggleSort("created_at")}>
                      <span className="flex items-center gap-1">Data <SortIcon col="created_at" /></span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {paged.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-sm text-zinc-400">Nicio comanda</td></tr>
                  ) : paged.map((o) => {
                    const sc = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pending;
                    return (
                      <tr key={o.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono font-semibold text-zinc-900 dark:text-white">#{o.order_number}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-zinc-900 dark:text-white">{o.customer_name ?? "—"}</p>
                          <p className="text-xs text-zinc-400">{o.customer_email ?? o.customer_phone ?? ""}</p>
                        </td>
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
                <p className="text-xs text-zinc-500">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredOrders.length)} din {filteredOrders.length}</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="text-xs px-2">{page} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Products tab */}
      {tab === "products" && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Produs</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pret</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Adaugat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {products.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-12 text-sm text-zinc-400">Niciun produs</td></tr>
                ) : products.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-white">{p.name}</td>
                    <td className="px-4 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
                      {p.price != null ? `${p.price.toLocaleString("ro-RO")} lei` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full",
                        p.is_active ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                      )}>{p.is_active ? "Activ" : "Inactiv"}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">
                      {new Date(p.created_at).toLocaleDateString("ro-RO")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings tab */}
      {tab === "settings" && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white mb-4">Setari magazin</h2>
          {settings ? (
            <pre className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 overflow-auto max-h-96">
              {JSON.stringify(settings, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-zinc-400">Nicio setare configurata.</p>
          )}
        </div>
      )}
    </div>
  );
}
