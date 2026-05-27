"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ShoppingCart, ChevronRight, ChevronLeft, FileText, FileCheck, XCircle, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { generateOrderInvoice } from "@/lib/actions/smartbill.actions";
import { generateOblioInvoice, generateOblioProforma, stornoOblioInvoice } from "@/lib/actions/oblio.actions";
import { generateFgoInvoice, stornoFgoInvoiceAction } from "@/lib/actions/fgo.actions";
import { CargusAwbModal } from "@/components/dashboard/CargusAwbModal";
import { DpdAwbModal } from "@/components/dashboard/DpdAwbModal";
import { FanCourierAwbModal } from "@/components/dashboard/FanCourierAwbModal";
import { SamedayAwbModal } from "@/components/dashboard/SamedayAwbModal";
import { WootAwbModal } from "@/components/dashboard/WootAwbModal";
import { ColeteAwbModal } from "@/components/dashboard/ColeteAwbModal";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending:    { label: "In asteptare", className: "bg-amber-50 text-amber-700 border border-amber-200" },
  confirmed:  { label: "Confirmat",    className: "bg-blue-50 text-blue-700 border border-blue-200" },
  processing: { label: "In procesare", className: "bg-purple-50 text-purple-700 border border-purple-200" },
  shipped:    { label: "Expediat",     className: "bg-indigo-50 text-indigo-700 border border-indigo-200" },
  delivered:  { label: "Livrat",       className: "bg-green-50 text-green-700 border border-green-200" },
  cancelled:  { label: "Anulat",       className: "bg-red-50 text-red-700 border border-red-200" },
  refunded:   { label: "Rambursat",    className: "bg-gray-100 text-gray-500 border border-gray-200" },
};

const STATUS_TABS = [
  { key: "all",        label: "Toate" },
  { key: "pending",    label: "In asteptare" },
  { key: "confirmed",  label: "Confirmate" },
  { key: "processing", label: "In procesare" },
  { key: "shipped",    label: "Expediate" },
  { key: "delivered",  label: "Livrate" },
  { key: "cancelled",  label: "Anulate" },
  { key: "refunded",   label: "Rambursate" },
];

const PAGE_SIZE = 50;

export function OrdersClient({ orders, pendingCount, smartbillEnabled, wootEnabled, coleteEnabled, oblioEnabled, fgoEnabled, cargusEnabled, dpdEnabled, fanCourierEnabled, samedayEnabled, businessId }: {
  orders: Order[];
  pendingCount: number;
  smartbillEnabled?: boolean;
  wootEnabled?: boolean;
  coleteEnabled?: boolean;
  oblioEnabled?: boolean;
  fgoEnabled?: boolean;
  cargusEnabled?: boolean;
  dpdEnabled?: boolean;
  fanCourierEnabled?: boolean;
  samedayEnabled?: boolean;
  businessId?: string;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [generatingOrderId, setGeneratingOrderId] = useState<string | null>(null);
  const [, startGenerateTransition] = useTransition();
  const [wootModalOrder, setWootModalOrder] = useState<Order | null>(null);
  const [coleteModalOrder, setColeteModalOrder] = useState<Order | null>(null);
  const [oblioActionOrderId, setOblioActionOrderId] = useState<string | null>(null);
  const [oblioAction, setOblioAction] = useState<"invoice" | "proforma" | "storno" | null>(null);
  const [, startOblioTransition] = useTransition();
  const [cargusModalOrder, setCargusModalOrder] = useState<Order | null>(null);
  const [dpdModalOrder, setDpdModalOrder] = useState<Order | null>(null);
  const [fanCourierModalOrder, setFanCourierModalOrder] = useState<Order | null>(null);
  const [samedayModalOrder, setSamedayModalOrder] = useState<Order | null>(null);
  const [fgoActionOrderId, setFgoActionOrderId] = useState<string | null>(null);
  const [fgoAction, setFgoAction] = useState<"invoice" | "storno" | null>(null);
  const [, startFgoTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter(o => {
      const matchesSearch = !q ||
        o.order_number.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        (o.customer_phone ?? "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleFilterChange(key: string) {
    setStatusFilter(key);
    setPage(1);
  }

  function handleSearch(q: string) {
    setSearchQuery(q);
    setPage(1);
  }

  function handleOblioAction(e: React.MouseEvent, orderId: string, action: "invoice" | "proforma" | "storno") {
    e.stopPropagation();
    if (!businessId) return;
    setOblioActionOrderId(orderId);
    setOblioAction(action);
    startOblioTransition(async () => {
      let result: { error: string } | { number: string; series: string } | { success: true };
      if (action === "invoice") result = await generateOblioInvoice(businessId, orderId);
      else if (action === "proforma") result = await generateOblioProforma(businessId, orderId);
      else result = await stornoOblioInvoice(businessId, orderId);
      setOblioActionOrderId(null);
      setOblioAction(null);
      if ("error" in result) {
        toast.error(result.error);
      } else if ("number" in result) {
        const labels = { invoice: "Factura", proforma: "Proforma", storno: "Storno" };
        toast.success(`${labels[action]} Oblio ${result.series}${result.number} generata`);
        router.refresh();
      }
    });
  }

  function handleFgoAction(e: React.MouseEvent, orderId: string, action: "invoice" | "storno") {
    e.stopPropagation();
    if (!businessId) return;
    setFgoActionOrderId(orderId);
    setFgoAction(action);
    startFgoTransition(async () => {
      const result = action === "invoice"
        ? await generateFgoInvoice(businessId, orderId)
        : await stornoFgoInvoiceAction(businessId, orderId);
      setFgoActionOrderId(null);
      setFgoAction(null);
      if ("error" in result) {
        toast.error(result.error);
      } else if ("number" in result) {
        const label = action === "invoice" ? "Factura fGO" : "Storno fGO";
        toast.success(`${label} ${result.series}${result.number} generata`);
        router.refresh();
      }
    });
  }

  function handleGenerateInvoice(e: React.MouseEvent, orderId: string) {
    e.stopPropagation();
    if (!businessId) return;
    setGeneratingOrderId(orderId);
    startGenerateTransition(async () => {
      const result = await generateOrderInvoice(businessId, orderId);
      setGeneratingOrderId(null);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`Factura ${result.series}${result.number} generata.`);
        router.refresh();
      }
    });
  }

  return (
    <>
      {wootModalOrder && businessId && (
        <WootAwbModal
          open={!!wootModalOrder}
          onClose={() => setWootModalOrder(null)}
          order={wootModalOrder}
          businessId={businessId}
          onSuccess={() => { setWootModalOrder(null); router.refresh(); }}
        />
      )}
      {cargusModalOrder && businessId && (
        <CargusAwbModal
          open={!!cargusModalOrder}
          onClose={() => setCargusModalOrder(null)}
          order={cargusModalOrder}
          businessId={businessId}
          onSuccess={() => { setCargusModalOrder(null); router.refresh(); }}
        />
      )}
      {dpdModalOrder && businessId && (
        <DpdAwbModal
          open={!!dpdModalOrder}
          onClose={() => setDpdModalOrder(null)}
          order={dpdModalOrder}
          businessId={businessId}
          onSuccess={() => { setDpdModalOrder(null); router.refresh(); }}
        />
      )}
      {fanCourierModalOrder && businessId && (
        <FanCourierAwbModal
          open={!!fanCourierModalOrder}
          onClose={() => setFanCourierModalOrder(null)}
          order={fanCourierModalOrder}
          businessId={businessId}
          onSuccess={() => { setFanCourierModalOrder(null); router.refresh(); }}
        />
      )}
      {coleteModalOrder && businessId && (
        <ColeteAwbModal
          open={!!coleteModalOrder}
          onClose={() => setColeteModalOrder(null)}
          order={coleteModalOrder}
          businessId={businessId}
          onSuccess={() => { setColeteModalOrder(null); router.refresh(); }}
        />
      )}
      {samedayModalOrder && businessId && (
        <SamedayAwbModal
          open={!!samedayModalOrder}
          onClose={() => setSamedayModalOrder(null)}
          order={samedayModalOrder}
          businessId={businessId}
          onSuccess={() => { setSamedayModalOrder(null); router.refresh(); }}
        />
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">Comenzi</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Toate comenzile primite</p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
              {pendingCount} in asteptare
            </span>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Cauta comanda, client..."
              className="pl-9 pr-8 py-2 text-sm border border-border rounded-xl bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors w-52"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-4 scrollbar-hide">
        {STATUS_TABS.map(tab => {
          const count = tab.key === "all" ? orders.length : orders.filter(o => o.status === tab.key).length;
          if (count === 0 && tab.key !== "all") return null;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleFilterChange(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                statusFilter === tab.key
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                statusFilter === tab.key ? "bg-white/20 text-white" : "bg-background text-muted-foreground"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search result info */}
      {searchQuery.trim() && (
        <p className="text-sm text-muted-foreground mb-3">
          {filtered.length === 0
            ? `Niciun rezultat pentru "${searchQuery}"`
            : `${filtered.length} ${filtered.length === 1 ? "rezultat" : "rezultate"} pentru "${searchQuery}"`}
        </p>
      )}

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {filtered.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Comanda</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Client</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Data</th>
                    {wootEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB Woot</th>
                    )}
                    {cargusEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB Cargus</th>
                    )}
                    {dpdEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB DPD</th>
                    )}
                    {fanCourierEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB FAN Courier</th>
                    )}
                    {samedayEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB Sameday</th>
                    )}
                    {coleteEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB Colete</th>
                    )}
                    {oblioEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Oblio</th>
                    )}
                    {fgoEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">fGO</th>
                    )}
                    {smartbillEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Documente</th>
                    )}
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((order) => {
                    const status = STATUS_MAP[order.status] ?? STATUS_MAP.pending;
                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer group"
                        onClick={() => window.location.href = `/dashboard/orders/${order.id}`}
                      >
                        <td className="px-5 py-3.5 font-mono text-sm font-semibold text-foreground">{order.order_number}</td>
                        <td className="px-5 py-3.5 text-muted-foreground hidden sm:table-cell">
                          <div className="font-medium text-foreground">{order.customer_name}</div>
                          <div className="text-xs">{order.customer_phone}</div>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-foreground">{formatPrice(Number(order.total))}</td>
                        <td className="px-5 py-3.5">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", status.className)}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground hidden md:table-cell">
                          {formatDate(new Date(order.created_at))}
                        </td>
                        {wootEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {order.woot_awb_number ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setWootModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {order.woot_awb_number}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setWootModalOrder(order); }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {cargusEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {order.cargus_awb_number ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setCargusModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {order.cargus_awb_number}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setCargusModalOrder(order); }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {dpdEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {(order as unknown as Record<string, unknown>)["dpd_awb_number"] ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setDpdModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {(order as unknown as Record<string, unknown>)["dpd_awb_number"] as string}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setDpdModalOrder(order); }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {fanCourierEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {(order as unknown as Record<string, unknown>)["fan_courier_awb_number"] ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setFanCourierModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {(order as unknown as Record<string, unknown>)["fan_courier_awb_number"] as string}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setFanCourierModalOrder(order); }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {samedayEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {(order as unknown as Record<string, unknown>)["sameday_awb_number"] ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setSamedayModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {(order as unknown as Record<string, unknown>)["sameday_awb_number"] as string}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setSamedayModalOrder(order); }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {coleteEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {(order as unknown as Record<string, unknown>)["colete_awb_number"] ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setColeteModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {(order as unknown as Record<string, unknown>)["colete_awb_number"] as string}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setColeteModalOrder(order); }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {oblioEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {order.oblio_storno_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 border border-red-200">
                                  <XCircle className="h-3 w-3" />
                                  Storno {order.oblio_storno_series}{order.oblio_storno_number}
                                </span>
                              ) : order.oblio_invoice_number ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                                    <FileCheck className="h-3 w-3" />
                                    Factura {order.oblio_invoice_series}{order.oblio_invoice_number}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={e => handleOblioAction(e, order.id, "storno")}
                                    disabled={oblioActionOrderId === order.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                                  >
                                    {oblioActionOrderId === order.id && oblioAction === "storno" ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                                    Storno
                                  </button>
                                </>
                              ) : order.oblio_proforma_number ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                                    <FileText className="h-3 w-3" />
                                    Proforma {order.oblio_proforma_series}{order.oblio_proforma_number}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={e => handleOblioAction(e, order.id, "invoice")}
                                    disabled={oblioActionOrderId === order.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                                  >
                                    {oblioActionOrderId === order.id && oblioAction === "invoice" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
                                    Factura
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={e => handleOblioAction(e, order.id, "invoice")}
                                    disabled={oblioActionOrderId === order.id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
                                  >
                                    {oblioActionOrderId === order.id && oblioAction === "invoice" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
                                    Factura
                                  </button>
                                  <button
                                    type="button"
                                    onClick={e => handleOblioAction(e, order.id, "proforma")}
                                    disabled={oblioActionOrderId === order.id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
                                  >
                                    {oblioActionOrderId === order.id && oblioAction === "proforma" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                                    Proforma
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                        {fgoEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(order as unknown as Record<string, unknown>)["fgo_storno_number"] ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 border border-red-200">
                                  <XCircle className="h-3 w-3" />
                                  Storno {(order as unknown as Record<string, unknown>)["fgo_storno_series"] as string}{(order as unknown as Record<string, unknown>)["fgo_storno_number"] as string}
                                </span>
                              ) : (order as unknown as Record<string, unknown>)["fgo_invoice_number"] ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                                    <FileCheck className="h-3 w-3" />
                                    {(order as unknown as Record<string, unknown>)["fgo_invoice_series"] as string}{(order as unknown as Record<string, unknown>)["fgo_invoice_number"] as string}
                                  </span>
                                  {(order as unknown as Record<string, unknown>)["fgo_invoice_link"] && (
                                    <a
                                      href={(order as unknown as Record<string, unknown>)["fgo_invoice_link"] as string}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                                    >
                                      <FileText className="h-3 w-3" />
                                      PDF
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={e => handleFgoAction(e, order.id, "storno")}
                                    disabled={fgoActionOrderId === order.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                                  >
                                    {fgoActionOrderId === order.id && fgoAction === "storno" ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                                    Storno
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={e => handleFgoAction(e, order.id, "invoice")}
                                  disabled={fgoActionOrderId === order.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
                                >
                                  {fgoActionOrderId === order.id && fgoAction === "invoice" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
                                  Factura
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                        {smartbillEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            <div className="flex items-center gap-1.5">
                              {order.smartbill_storno_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 border border-red-200">
                                  <XCircle className="h-3 w-3" />
                                  Storno
                                </span>
                              ) : order.smartbill_invoice_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                                  <FileCheck className="h-3 w-3" />
                                  Factura
                                </span>
                              ) : order.smartbill_estimate_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                                  <FileText className="h-3 w-3" />
                                  Proforma
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={e => handleGenerateInvoice(e, order.id)}
                                  disabled={generatingOrderId === order.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
                                >
                                  {generatingOrderId === order.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <img src="/integrations/smartbill.svg" alt="SmartBill" className="h-3.5 w-auto" style={{ maxWidth: 14, objectFit: "contain" }} />
                                  )}
                                  Factura
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="px-5 py-3.5">
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} din {filtered.length} comenzi
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
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
                          onClick={() => setPage(item as number)}
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
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-16 text-center">
            {searchQuery.trim() ? (
              <>
                <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">Niciun rezultat</p>
                <p className="text-xs text-muted-foreground mb-4">Incearca un alt termen de cautare</p>
                <button
                  type="button"
                  onClick={() => handleSearch("")}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                  Sterge cautarea
                </button>
              </>
            ) : (
              <>
                <ShoppingCart className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">
                  {statusFilter === "all" ? "Nicio comanda inca" : `Nicio comanda cu statusul "${STATUS_MAP[statusFilter]?.label}"`}
                </p>
                <p className="text-xs text-muted-foreground">Comenzile clientilor vor aparea aici</p>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
