"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X, ShoppingCart, ChevronRight, ChevronLeft, FileText, FileCheck, XCircle, Loader2, Package, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatPrice } from "@/lib/utils/format";
import {
  bulkGenerateInvoices, bulkGenerateAwbs, bulkUpdateOrderStatus,
  type BulkResult, type InvoiceProvider, type BulkCourier,
} from "@/lib/actions/bulk-orders.actions";
import { generateOrderInvoice } from "@/lib/actions/smartbill.actions";
import { generateOblioInvoice, generateOblioProforma, stornoOblioInvoice } from "@/lib/actions/oblio.actions";
import { generateFgoInvoice, stornoFgoInvoiceAction } from "@/lib/actions/fgo.actions";
import { CargusAwbModal } from "@/components/dashboard/CargusAwbModal";
import { DpdAwbModal } from "@/components/dashboard/DpdAwbModal";
import { FanCourierAwbModal } from "@/components/dashboard/FanCourierAwbModal";
import { FanCourierPickupModal } from "@/components/dashboard/FanCourierPickupModal";
import { DpdPickupModal } from "@/components/dashboard/DpdPickupModal";
import { CargusPickupModal } from "@/components/dashboard/CargusPickupModal";
import { SamedayAwbModal } from "@/components/dashboard/SamedayAwbModal";
import { WootAwbModal } from "@/components/dashboard/WootAwbModal";
import { ColeteAwbModal } from "@/components/dashboard/ColeteAwbModal";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS, orderStatus, type OrderStatus } from "@/lib/orders/status";
import { ORDERS_PAGE_SIZE } from "@/lib/orders/pagination";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

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

export function OrdersClient({ orders, totalCount, statusCounts, page, searchQuery, statusFilter, pendingCount, smartbillEnabled, wootEnabled, coleteEnabled, oblioEnabled, fgoEnabled, cargusEnabled, dpdEnabled, fanCourierEnabled, samedayEnabled, businessId, fanPickup }: {
  /** Pagina curenta de comenzi (max ORDERS_PAGE_SIZE), gata filtrata pe server. */
  orders: Order[];
  /** Total comenzi pentru filtrul+cautarea curenta (count exact din DB). */
  totalCount: number;
  /** Comenzi per status, pe tot magazinul (pentru tab-uri). */
  statusCounts: Record<string, number>;
  page: number;
  searchQuery: string;
  statusFilter: string;
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
  fanPickup?: { lastDate: string | null; lastId: string | null };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startNavTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(searchQuery);
  const lastNavQ = useRef(searchQuery);
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
  const [fanPickupOpen, setFanPickupOpen] = useState(false);
  const [dpdPickupOpen, setDpdPickupOpen] = useState(false);
  const [cargusPickupOpen, setCargusPickupOpen] = useState(false);
  const [samedayModalOrder, setSamedayModalOrder] = useState<Order | null>(null);
  const [fgoActionOrderId, setFgoActionOrderId] = useState<string | null>(null);
  const [fgoAction, setFgoAction] = useState<"invoice" | "storno" | null>(null);
  const [, startFgoTransition] = useTransition();

  // ── Bulk selection ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ title: string; result: BulkResult } | null>(null);
  const [invoiceProvider, setInvoiceProvider] = useState<InvoiceProvider>("auto");
  const [awbCourier, setAwbCourier] = useState<BulkCourier>("auto");
  const [bulkStatus, setBulkStatus] = useState("");

  const invoiceProviders = useMemo(() => {
    const list: { key: InvoiceProvider; label: string }[] = [];
    if (smartbillEnabled) list.push({ key: "smartbill", label: "SmartBill" });
    if (oblioEnabled) list.push({ key: "oblio", label: "Oblio" });
    if (fgoEnabled) list.push({ key: "fgo", label: "fGO" });
    return list;
  }, [smartbillEnabled, oblioEnabled, fgoEnabled]);
  const anyInvoice = invoiceProviders.length > 0;

  const awbCouriers = useMemo(() => {
    const list: { key: BulkCourier; label: string }[] = [];
    if (cargusEnabled) list.push({ key: "cargus", label: "Cargus" });
    if (samedayEnabled) list.push({ key: "sameday", label: "Sameday" });
    if (fanCourierEnabled) list.push({ key: "fancourier", label: "FAN Courier" });
    if (dpdEnabled) list.push({ key: "dpd", label: "DPD" });
    return list;
  }, [cargusEnabled, samedayEnabled, fanCourierEnabled, dpdEnabled]);
  const anyAwb = awbCouriers.length > 0;

  const pageOrderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const selectedOnPage = pageOrderIds.filter((id) => selected.has(id));
  const allPageSelected = pageOrderIds.length > 0 && selectedOnPage.length === pageOrderIds.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageOrderIds.forEach((id) => next.delete(id));
      else pageOrderIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function clearSelection() { setSelected(new Set()); setBulkResult(null); }

  async function runBulk(title: string, fn: () => Promise<BulkResult | { error: string }>) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setBulkResult(null);
    const res = await fn();
    setBulkBusy(false);
    if ("error" in res) { toast.error(res.error); return; }
    setBulkResult({ title, result: res });
    const parts = [`${res.done} reușite`];
    if (res.skipped) parts.push(`${res.skipped} sărite`);
    if (res.failed) parts.push(`${res.failed} eșuate`);
    if (res.failed > 0) toast.error(`${title}: ${parts.join(", ")}`);
    else toast.success(`${title}: ${parts.join(", ")}`);
    router.refresh();
  }

  function runBulkInvoices() {
    void runBulk("Facturi", () => bulkGenerateInvoices(businessId!, [...selected], invoiceProvider));
  }
  function runBulkAwbs() {
    // With a single connected courier, target it directly; otherwise honor the
    // dropdown ("după client" = each order's checkout courier).
    const courier: BulkCourier = awbCouriers.length === 1 ? awbCouriers[0].key : awbCourier;
    void runBulk("AWB-uri", () => bulkGenerateAwbs(businessId!, [...selected], courier));
  }
  function runBulkStatus() {
    if (!bulkStatus) { toast.error("Alege un status."); return; }
    const label = ORDER_STATUS[bulkStatus as OrderStatus]?.label ?? bulkStatus;
    setBulkBusy(true);
    setBulkResult(null);
    bulkUpdateOrderStatus(businessId!, [...selected], bulkStatus).then((res) => {
      setBulkBusy(false);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(`${res.updated} comenzi → ${label}`);
      clearSelection();
      router.refresh();
    });
  }

  // Datele vin gata filtrate si paginate de pe server; interactiunile devin
  // parametri de URL (q, status, page), deci functioneaza la orice volum.
  const totalPages = Math.max(1, Math.ceil(totalCount / ORDERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const allCount = Object.values(statusCounts).reduce((s, n) => s + n, 0);

  const buildUrl = useCallback((next: { q?: string; status?: string; page?: number }) => {
    const params = new URLSearchParams();
    const nq = next.q ?? searchQuery;
    const nstatus = next.status ?? statusFilter;
    const npage = next.page ?? page;
    if (nq) params.set("q", nq);
    if (nstatus !== "all") params.set("status", nstatus);
    if (npage > 1) params.set("page", String(npage));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchQuery, statusFilter, page]);

  // Navigare externa (back/forward, link cu ?q=) → resincronizeaza inputul.
  useEffect(() => {
    if (searchQuery !== lastNavQ.current) {
      lastNavQ.current = searchQuery;
      setSearchInput(searchQuery);
    }
  }, [searchQuery]);

  // Cautarea e debounced si dusa in URL; filtrarea o face serverul, in SQL.
  useEffect(() => {
    if (searchInput === searchQuery) return;
    const t = setTimeout(() => {
      lastNavQ.current = searchInput;
      setSelected(new Set());
      setBulkResult(null);
      startNavTransition(() => router.replace(buildUrl({ q: searchInput, page: 1 }), { scroll: false }));
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, searchQuery, buildUrl, router]);

  function goTo(next: { q?: string; status?: string; page?: number }) {
    // Selection is per-view — reset it when changing page / filter so a bulk
    // action never spans invisible orders on other pages.
    setSelected(new Set());
    setBulkResult(null);
    startNavTransition(() => router.push(buildUrl(next), { scroll: false }));
  }

  function handleFilterChange(key: string) {
    goTo({ status: key, page: 1 });
  }

  function handleSearch(q: string) {
    setSearchInput(q);
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
      {fanPickupOpen && businessId && (
        <FanCourierPickupModal
          open={fanPickupOpen}
          onClose={() => setFanPickupOpen(false)}
          businessId={businessId}
          lastPickupDate={fanPickup?.lastDate}
          lastPickupId={fanPickup?.lastId}
          onChanged={() => router.refresh()}
        />
      )}
      {dpdPickupOpen && businessId && (
        <DpdPickupModal
          open={dpdPickupOpen}
          onClose={() => setDpdPickupOpen(false)}
          businessId={businessId}
        />
      )}
      {cargusPickupOpen && businessId && (
        <CargusPickupModal
          open={cargusPickupOpen}
          onClose={() => setCargusPickupOpen(false)}
          businessId={businessId}
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
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Comenzi</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Toate comenzile primite</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {fanCourierEnabled && businessId && (
              <button
                type="button"
                onClick={() => setFanPickupOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full border border-border bg-surface text-foreground hover:bg-muted transition-colors"
              >
                Cheama curierul FAN
              </button>
            )}
            {dpdEnabled && businessId && (
              <button
                type="button"
                onClick={() => setDpdPickupOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full border border-border bg-surface text-foreground hover:bg-muted transition-colors"
              >
                Cheama curierul DPD
              </button>
            )}
            {cargusEnabled && businessId && (
              <button
                type="button"
                onClick={() => setCargusPickupOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full border border-border bg-surface text-foreground hover:bg-muted transition-colors"
              >
                Cheama curierul Cargus
              </button>
            )}
            {pendingCount > 0 && (
              <span className="px-3 py-1.5 bg-warning/10 text-warning text-xs font-semibold rounded-full border border-warning/20">
                {pendingCount} in asteptare
              </span>
            )}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Cauta comanda, client..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-xl bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
          />
          {searchInput && (
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

      {/* Status tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-4 scrollbar-hide">
        {STATUS_TABS.map(tab => {
          const count = tab.key === "all" ? allCount : (statusCounts[tab.key] ?? 0);
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
          {totalCount === 0
            ? `Niciun rezultat pentru "${searchQuery}"`
            : `${totalCount} ${totalCount === 1 ? "rezultat" : "rezultate"} pentru "${searchQuery}"`}
        </p>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-20 mb-3 rounded-xl border border-primary/30 bg-surface shadow-sm">
          <div className="flex flex-wrap items-center gap-2 p-3">
            <div className="mr-auto flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <CheckSquare className="h-4 w-4 text-primary" />
                {selected.size} {selected.size === 1 ? "selectată" : "selectate"}
              </span>
              <button type="button" onClick={clearSelection} className="text-xs text-muted-foreground underline hover:text-foreground">
                Deselectează
              </button>
            </div>

            {/* Status change */}
            <div className="flex items-center gap-1.5">
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                disabled={bulkBusy}
                aria-label="Schimbă statusul"
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface text-foreground disabled:opacity-50"
              >
                <option value="">Schimbă status…</option>
                {STATUS_TABS.filter((t) => t.key !== "all").map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={runBulkStatus}
                disabled={bulkBusy || !bulkStatus}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-surface text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                Aplică
              </button>
            </div>

            {/* Bulk invoices */}
            {anyInvoice && businessId && (
              <div className="flex items-center gap-1.5">
                {invoiceProviders.length > 1 && (
                  <select
                    value={invoiceProvider}
                    onChange={(e) => setInvoiceProvider(e.target.value as InvoiceProvider)}
                    disabled={bulkBusy}
                    aria-label="Furnizor factură"
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface text-foreground disabled:opacity-50"
                  >
                    <option value="auto">Factură: automat</option>
                    {invoiceProviders.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                )}
                <button
                  type="button"
                  onClick={runBulkInvoices}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-surface text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <FileCheck className="h-3.5 w-3.5" /> Generează facturi
                </button>
              </div>
            )}

            {/* Bulk AWBs */}
            {anyAwb && businessId && (
              <div className="flex items-center gap-1.5">
                {awbCouriers.length > 1 && (
                  <select
                    value={awbCourier}
                    onChange={(e) => setAwbCourier(e.target.value as BulkCourier)}
                    disabled={bulkBusy}
                    aria-label="Curier AWB"
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface text-foreground disabled:opacity-50"
                  >
                    <option value="auto">AWB: după client</option>
                    {awbCouriers.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                )}
                <button
                  type="button"
                  onClick={runBulkAwbs}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-surface text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <Package className="h-3.5 w-3.5" /> Generează AWB{awbCouriers.length === 1 ? ` ${awbCouriers[0].label}` : "-uri"}
                </button>
              </div>
            )}

            {bulkBusy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </div>

          {/* Results (esp. failures) */}
          {bulkResult && (
            <div className="border-t border-border px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{bulkResult.title}:</span>{" "}
                  <span className="text-success">{bulkResult.result.done} reușite</span>
                  {bulkResult.result.skipped > 0 && <span> · {bulkResult.result.skipped} sărite</span>}
                  {bulkResult.result.failed > 0 && <span className="text-destructive"> · {bulkResult.result.failed} eșuate</span>}
                </p>
                <button type="button" onClick={() => setBulkResult(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {bulkResult.result.errors.length > 0 && (
                <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto">
                  {bulkResult.result.errors.slice(0, 20).map((er, i) => (
                    <li key={i} className="text-[11px] text-destructive">
                      <span className="font-mono font-semibold">{er.order}</span>: {er.message}
                    </li>
                  ))}
                </ul>
              )}
              {bulkResult.result.skipped > 0 && bulkResult.title === "AWB-uri" && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Comenzile Woot / Colete sau cele fără curier potrivit se generează individual din tabel.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className={cn("bg-surface border border-border rounded-xl overflow-hidden transition-opacity", isPending && "opacity-60")}>
        {orders.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        ref={(el) => { if (el) el.indeterminate = selectedOnPage.length > 0 && !allPageSelected; }}
                        onChange={toggleAllPage}
                        aria-label="Selectează toate comenzile de pe pagină"
                        className="h-4 w-4 rounded border-border accent-primary cursor-pointer align-middle"
                      />
                    </th>
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
                  {orders.map((order) => {
                    const status = orderStatus(order.status);
                    return (
                      <tr
                        key={order.id}
                        className={cn("hover:bg-muted/30 transition-colors cursor-pointer group", selected.has(order.id) && "bg-primary/5")}
                        onClick={() => window.location.href = `/dashboard/orders/${order.id}`}
                      >
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(order.id)}
                            onChange={() => toggleOne(order.id)}
                            aria-label={`Selectează comanda ${order.order_number}`}
                            className="h-4 w-4 rounded border-border accent-primary cursor-pointer align-middle"
                          />
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm font-semibold text-foreground">{order.order_number}</td>
                        <td className="px-5 py-3.5 text-muted-foreground hidden sm:table-cell">
                          <div className="font-medium text-foreground">{order.customer_name}</div>
                          <div className="text-xs">{order.customer_phone}</div>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-foreground">{formatPrice(Number(order.total))}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap", status.className)}>
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
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
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
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
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
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
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
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
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
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
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
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
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
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive">
                                  <XCircle className="h-3 w-3" />
                                  Storno {order.oblio_storno_series}{order.oblio_storno_number}
                                </span>
                              ) : order.oblio_invoice_number ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success">
                                    <FileCheck className="h-3 w-3" />
                                    Factura {order.oblio_invoice_series}{order.oblio_invoice_number}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={e => handleOblioAction(e, order.id, "storno")}
                                    disabled={oblioActionOrderId === order.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                                  >
                                    {oblioActionOrderId === order.id && oblioAction === "storno" ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                                    Storno
                                  </button>
                                </>
                              ) : order.oblio_proforma_number ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info">
                                    <FileText className="h-3 w-3" />
                                    Proforma {order.oblio_proforma_series}{order.oblio_proforma_number}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={e => handleOblioAction(e, order.id, "invoice")}
                                    disabled={oblioActionOrderId === order.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-success/20 bg-success/5 text-success hover:bg-success/10 transition-colors disabled:opacity-50"
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
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive">
                                  <XCircle className="h-3 w-3" />
                                  Storno {(order as unknown as Record<string, unknown>)["fgo_storno_series"] as string}{(order as unknown as Record<string, unknown>)["fgo_storno_number"] as string}
                                </span>
                              ) : (order as unknown as Record<string, unknown>)["fgo_invoice_number"] ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success">
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
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
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
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive">
                                  <XCircle className="h-3 w-3" />
                                  Storno
                                </span>
                              ) : order.smartbill_invoice_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success">
                                  <FileCheck className="h-3 w-3" />
                                  Factura
                                </span>
                              ) : order.smartbill_estimate_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info">
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
                                    <img src="/integrations/smartbill.webp" alt="SmartBill" className="h-3.5 w-auto" style={{ maxWidth: 14, objectFit: "contain" }} />
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
                  {(currentPage - 1) * ORDERS_PAGE_SIZE + 1}–{Math.min(currentPage * ORDERS_PAGE_SIZE, totalCount)} din {totalCount} comenzi
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
          </>
        ) : (
          <div className="py-16 text-center">
            {searchQuery.trim() ? (
              <>
                <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">Niciun rezultat</p>
                <p className="text-xs text-muted-foreground mb-4">Incearca un alt termen de cautare</p>
                <Button variant="outline" onClick={() => handleSearch("")}>
                  <X />
                  Sterge cautarea
                </Button>
              </>
            ) : (
              <>
                <ShoppingCart className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">
                  {statusFilter === "all" ? "Nicio comanda inca" : `Nicio comanda cu statusul "${ORDER_STATUS[statusFilter as OrderStatus]?.label}"`}
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
