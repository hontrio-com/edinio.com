"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Package, ShoppingCart, Settings2,
  User, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Globe, ToggleLeft, ToggleRight, Loader2, Truck, CreditCard,
  Mail, MapPin, CheckCircle2, FileText, Palette,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toast } from "sonner";
import { PLAN_LABELS } from "@/lib/plans";

interface Business {
  id: string; business_name: string; store_name: string | null; slug: string;
  type: string; is_published: boolean; created_at: string; primary_color: string;
  user_id: string; niche_id: string | null; description: string | null;
  email: string | null; phone: string | null; address: string | null;
  city: string | null; county: string | null; cui: string | null;
  custom_domain: string | null; whatsapp: string | null; website: string | null;
  suspended_until: string | null; logo_url: string | null; cover_url: string | null;
}
interface Order {
  id: string; order_number: string; customer_name: string | null; customer_email: string | null;
  customer_phone: string | null; total: number | null; status: string; payment_method: string | null;
  created_at: string; shipping_address: unknown;
}
interface Product {
  id: string; name: string; price: number | null; is_active: boolean; created_at: string;
}
interface Domain {
  id: string; domain: string; status: string; source: string;
  expiry_date: string | null; auto_renew: boolean; created_at: string;
}
interface StoreSettings {
  currency: string;
  default_shipping_cost: number;
  free_shipping_threshold: number | null;
  min_order_amount: number | null;
  shipping_enabled: boolean;
  prices_include_vat: boolean;
  show_vat_breakdown: boolean;
  order_counter: number;
  order_number_format: string;
  payment_methods: unknown;
  shipping_zones: unknown;
  sameday_config: unknown;
  fan_courier_config: unknown;
  cargus_config: unknown;
  dpd_config: unknown;
  colete_config: unknown;
  fgo_config: unknown;
  netopia_config: unknown;
  stripe_config: unknown;
  smartbill_config: unknown;
  oblio_config: unknown;
  smso_config: unknown;
  notifications_config: unknown;
  marketing_config: unknown;
  store_policies: unknown;
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

function CourierStatus({ config, name }: { config: unknown; name: string }) {
  const enabled = config && typeof config === "object" && "enabled" in config && (config as { enabled: boolean }).enabled;
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{name}</span>
      {enabled ? (
        <span className="flex items-center gap-1 text-xs font-semibold text-green-600"><CheckCircle2 className="h-3 w-3" /> Activ</span>
      ) : (
        <span className="text-xs text-zinc-400">Inactiv</span>
      )}
    </div>
  );
}

export function AdminBusinessDetailClient({
  business, orders, products, owner, ownerEmail, settings, domains,
}: {
  business: Business;
  orders: Order[];
  products: Product[];
  owner: { id: string; full_name: string; plan: string; role: string; created_at: string } | null;
  ownerEmail: string;
  settings: StoreSettings | null;
  domains: Domain[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"orders" | "products" | "settings" | "info">("info");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<OrderSortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [publishing, setPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(business.is_published);
  const [changingPlan, setChangingPlan] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(owner?.plan ?? "free");

  const revenue = orders.filter((o) => !["cancelled", "refunded"].includes(o.status)).reduce((s, o) => s + (o.total ?? 0), 0);
  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const deliveredOrders = orders.filter((o) => o.status === "delivered").length;

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

  async function handleChangePlan() {
    if (selectedPlan === owner?.plan) return;
    setChangingPlan(true);
    try {
      const res = await fetch(`/api/admin/users/${owner?.id}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Plan schimbat la ${PLAN_LABELS[selectedPlan] ?? selectedPlan}`);
      router.refresh();
    } catch {
      toast.error("Eroare la schimbarea planului");
    } finally {
      setChangingPlan(false);
    }
  }

  // Payment methods helper
  const paymentMethods = settings?.payment_methods;
  const paymentList: { key: string; label: string; enabled: boolean }[] = [];
  if (paymentMethods && typeof paymentMethods === "object" && !Array.isArray(paymentMethods)) {
    const pm = paymentMethods as Record<string, unknown>;
    if (pm.cash !== undefined) paymentList.push({ key: "cash", label: "Numerar / Ramburs", enabled: !!pm.cash });
    if (pm.card !== undefined) paymentList.push({ key: "card", label: "Card online", enabled: !!pm.card });
    if (pm.transfer !== undefined) paymentList.push({ key: "transfer", label: "Transfer bancar", enabled: !!pm.transfer });
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
                {business.suspended_until && (
                  <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">Suspendat</span>
                )}
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800">
          {[
            { label: "Comenzi", value: orders.length, color: "text-zinc-900 dark:text-white" },
            { label: "In asteptare", value: pendingOrders, color: pendingOrders > 0 ? "text-amber-600" : "text-zinc-400" },
            { label: "Livrate", value: deliveredOrders, color: "text-green-600" },
            { label: "Produse", value: products.length, color: "text-zinc-900 dark:text-white" },
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
          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-3 flex-wrap">
            <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600 flex-shrink-0">
              {owner.full_name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <Link href={`/admin/utilizatori/${owner.id}`} className="text-sm font-semibold text-zinc-900 dark:text-white hover:underline">
                {owner.full_name}
              </Link>
              <p className="text-xs text-zinc-400">{ownerEmail} · Inregistrat {new Date(owner.created_at).toLocaleDateString("ro-RO")}</p>
            </div>
            <div className="flex items-center gap-2">
              <select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}
                className="h-8 px-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                <option value="free">Free</option>
                <option value="trial">Trial</option>
                <option value="basic">Basic</option>
                <option value="premium">Premium</option>
                <option value="ultra">Ultra</option>
              </select>
              {selectedPlan !== owner.plan && (
                <button onClick={handleChangePlan} disabled={changingPlan}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50">
                  {changingPlan ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Schimba plan
                </button>
              )}
            </div>
            <Link href={`/admin/utilizatori/${owner.id}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
              <User className="h-3.5 w-3.5" /> Profil
            </Link>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 w-fit overflow-x-auto">
        {([
          { key: "info", label: "Informatii", icon: FileText },
          { key: "orders", label: "Comenzi", icon: ShoppingCart },
          { key: "products", label: "Produse", icon: Package },
          { key: "settings", label: "Setari", icon: Settings2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap",
              tab === key ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Info tab */}
      {tab === "info" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Business details */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-zinc-400" /> Detalii business
            </h2>
            <div className="space-y-3">
              <InfoRow label="Nume legal" value={business.business_name} />
              <InfoRow label="Nume magazin" value={business.store_name} />
              <InfoRow label="CUI" value={business.cui} />
              <InfoRow label="Email" value={business.email} />
              <InfoRow label="Telefon" value={business.phone} />
              <InfoRow label="WhatsApp" value={business.whatsapp} />
              <InfoRow label="Adresa" value={[business.address, business.city, business.county].filter(Boolean).join(", ") || null} />
              <InfoRow label="Website" value={business.website} />
              <InfoRow label="Descriere" value={business.description} />
            </div>
          </div>

          {/* Domain info */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
              <Globe className="h-4 w-4 text-zinc-400" /> Domenii
            </h2>
            {business.custom_domain && (
              <div className="mb-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                <p className="text-xs text-zinc-500">Domeniu custom activ</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{business.custom_domain}</p>
              </div>
            )}
            {domains.length > 0 ? (
              <div className="space-y-2">
                {domains.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{d.domain}</p>
                      <p className="text-xs text-zinc-400">
                        {d.source} · {d.expiry_date ? `Expira ${new Date(d.expiry_date).toLocaleDateString("ro-RO")}` : "Fara expirare"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                        d.status === "active" ? "bg-green-100 text-green-700" :
                        d.status === "pending" ? "bg-amber-100 text-amber-700" :
                        "bg-zinc-100 text-zinc-500"
                      )}>{d.status}</span>
                      {d.auto_renew && <span className="text-[10px] text-zinc-400">Auto-renew</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Niciun domeniu inregistrat.</p>
            )}

            {/* Branding */}
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white mt-6 mb-3 flex items-center gap-2">
              <Palette className="h-4 w-4 text-zinc-400" /> Branding
            </h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 w-24">Culoare</span>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md border" style={{ backgroundColor: business.primary_color }} />
                  <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">{business.primary_color}</span>
                </div>
              </div>
              <InfoRow label="Logo" value={business.logo_url ? "Da" : "Nu"} />
              <InfoRow label="Cover" value={business.cover_url ? "Da" : "Nu"} />
            </div>
          </div>
        </div>
      )}

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
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">Plata</th>
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
                    <tr><td colSpan={6} className="text-center py-12 text-sm text-zinc-400">Nicio comanda</td></tr>
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
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-xs text-zinc-500 capitalize">{o.payment_method ?? "—"}</span>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Shipping & Couriers */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
              <Truck className="h-4 w-4 text-zinc-400" /> Livrare & Curieri
            </h2>
            {settings ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Livrare activata</span>
                  <span className={cn("text-xs font-semibold", settings.shipping_enabled ? "text-green-600" : "text-zinc-400")}>
                    {settings.shipping_enabled ? "Da" : "Nu"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Cost livrare default</span>
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{settings.default_shipping_cost} lei</span>
                </div>
                {settings.free_shipping_threshold && (
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Transport gratuit de la</span>
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{settings.free_shipping_threshold} lei</span>
                  </div>
                )}
                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 mt-3">
                  <p className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wide">Curieri configurati</p>
                  <CourierStatus config={settings.sameday_config} name="Sameday" />
                  <CourierStatus config={settings.fan_courier_config} name="FanCourier" />
                  <CourierStatus config={settings.cargus_config} name="Cargus" />
                  <CourierStatus config={settings.dpd_config} name="DPD" />
                  <CourierStatus config={settings.colete_config} name="Colete Online" />
                  <CourierStatus config={settings.fgo_config} name="FGO" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Nicio setare de livrare.</p>
            )}
          </div>

          {/* Payment & Billing */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-zinc-400" /> Plati & Facturare
            </h2>
            {settings ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Moneda</span>
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{settings.currency?.toUpperCase()}</span>
                </div>
                {settings.min_order_amount && (
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Comanda minima</span>
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{settings.min_order_amount} lei</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Preturi includ TVA</span>
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{settings.prices_include_vat ? "Da" : "Nu"}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Afiseaza TVA</span>
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{settings.show_vat_breakdown ? "Da" : "Nu"}</span>
                </div>

                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 mt-3">
                  <p className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wide">Metode de plata</p>
                  {paymentList.length > 0 ? paymentList.map((pm) => (
                    <div key={pm.key} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">{pm.label}</span>
                      {pm.enabled ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-green-600"><CheckCircle2 className="h-3 w-3" /> Activ</span>
                      ) : (
                        <span className="text-xs text-zinc-400">Inactiv</span>
                      )}
                    </div>
                  )) : (
                    <p className="text-xs text-zinc-400">Nicio metoda configurata</p>
                  )}
                </div>

                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 mt-3">
                  <p className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wide">Integrari plati</p>
                  <CourierStatus config={settings.stripe_config} name="Stripe" />
                  <CourierStatus config={settings.netopia_config} name="Netopia" />
                </div>

                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 mt-3">
                  <p className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wide">Facturare</p>
                  <CourierStatus config={settings.smartbill_config} name="SmartBill" />
                  <CourierStatus config={settings.oblio_config} name="Oblio" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Nicio setare de plati.</p>
            )}
          </div>

          {/* Notifications & Marketing */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
              <Mail className="h-4 w-4 text-zinc-400" /> Notificari & Marketing
            </h2>
            {settings ? (
              <div className="space-y-3">
                <CourierStatus config={settings.smso_config} name="SMSO (SMS)" />
                <CourierStatus config={settings.marketing_config} name="Marketing config" />
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Counter comenzi</span>
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">#{settings.order_counter}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Format nr. comanda</span>
                  <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300">{settings.order_number_format}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Nicio setare.</p>
            )}
          </div>

          {/* Raw JSON fallback */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-zinc-400" /> Date brute (debug)
            </h2>
            {settings ? (
              <pre className="text-[10px] text-zinc-500 bg-zinc-50 dark:bg-zinc-800 rounded-xl p-3 overflow-auto max-h-64">
                {JSON.stringify(settings, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-zinc-400">Nicio setare.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-zinc-500 w-24 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-zinc-900 dark:text-white break-words">{value || <span className="text-zinc-400">—</span>}</span>
    </div>
  );
}
