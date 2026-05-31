"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, User, Phone, MapPin, Package, Banknote, CreditCard,
  FileText, Receipt, Loader2, CheckCircle, Download, Mail,
  RotateCcw, AlertTriangle, XCircle, FilePlus, ArrowRight, FileCheck,
} from "lucide-react";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { updateOrder } from "@/lib/actions/order.actions";
import {
  generateOrderInvoice,
  generateOrderEstimate,
  convertEstimateToInvoice,
  stornoOrderInvoice,
  resendSmartbillEmail,
} from "@/lib/actions/smartbill.actions";
import { generateOblioInvoice, generateOblioProforma, stornoOblioInvoice } from "@/lib/actions/oblio.actions";
import { generateFgoInvoice, stornoFgoInvoiceAction } from "@/lib/actions/fgo.actions";
import { WootAwbModal } from "@/components/dashboard/WootAwbModal";
import { CargusAwbModal } from "@/components/dashboard/CargusAwbModal";
import { DpdAwbModal } from "@/components/dashboard/DpdAwbModal";
import { FanCourierAwbModal } from "@/components/dashboard/FanCourierAwbModal";
import { SamedayAwbModal } from "@/components/dashboard/SamedayAwbModal";
import { ColeteAwbModal } from "@/components/dashboard/ColeteAwbModal";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
}

interface ShippingAddress {
  county: string;
  city: string;
  address: string;
}

const STATUS_OPTIONS = [
  { value: "pending",    label: "In asteptare",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "confirmed",  label: "Confirmat",     cls: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "processing", label: "In procesare",  cls: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "shipped",    label: "Expediat",      cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "delivered",  label: "Livrat",        cls: "bg-green-50 text-green-700 border-green-200" },
  { value: "cancelled",  label: "Anulat",        cls: "bg-red-50 text-red-700 border-red-200" },
  { value: "refunded",   label: "Rambursat",     cls: "bg-gray-100 text-gray-500 border-gray-200" },
];

const PAYMENT_OPTIONS = [
  { value: "unpaid",   label: "Neplatit",  cls: "bg-red-50 text-red-700 border-red-200" },
  { value: "paid",     label: "Platit",    cls: "bg-green-50 text-green-700 border-green-200" },
  { value: "refunded", label: "Rambursat", cls: "bg-gray-100 text-gray-500 border-gray-200" },
];

function Badge({ cls, label }: { cls: string; label: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function DocRow({
  label,
  docNumber,
  onDownload,
  downloading,
  children,
}: {
  label: string;
  docNumber: string;
  onDownload: () => void;
  downloading: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-mono font-bold text-foreground">{docNumber}</p>
      </div>
      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50"
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        PDF
      </button>
      {children}
    </div>
  );
}

function ResendEmailForm({
  defaultEmail,
  docType,
  onSend,
  sending,
}: {
  defaultEmail: string;
  docType: "invoice" | "estimate";
  onSend: (email: string) => void;
  sending: boolean;
}) {
  const [email, setEmail] = useState(defaultEmail);
  return (
    <div className="flex gap-2 items-center mt-2">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="email@client.ro"
        className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <button
        type="button"
        onClick={() => onSend(email)}
        disabled={sending || !email.trim()}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        Trimite
      </button>
    </div>
  );
}

export function OrderDetailClient({
  order,
  businessId,
  smartbillEnabled,
  hasEstimateSeries,
  wootEnabled,
  coleteEnabled,
  oblioEnabled,
  fgoEnabled,
  cargusEnabled,
  dpdEnabled,
  fanCourierEnabled,
  samedayEnabled,
}: {
  order: Order;
  businessId: string;
  smartbillEnabled: boolean;
  hasEstimateSeries: boolean;
  wootEnabled?: boolean;
  coleteEnabled?: boolean;
  oblioEnabled?: boolean;
  fgoEnabled?: boolean;
  cargusEnabled?: boolean;
  dpdEnabled?: boolean;
  fanCourierEnabled?: boolean;
  samedayEnabled?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(order.status as string);
  const [paymentStatus, setPaymentStatus] = useState(order.payment_status as string);
  const [isPending, startTransition] = useTransition();

  const items = (order.items as unknown as OrderItem[]) ?? [];
  const address = (order.shipping_address as unknown as ShippingAddress) ?? {};
  const notes = order.notes as Record<string, string> | null;

  const currentStatus = STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0];
  const currentPayment = PAYMENT_OPTIONS.find(p => p.value === paymentStatus) ?? PAYMENT_OPTIONS[0];
  const hasChanges = status !== order.status || paymentStatus !== order.payment_status;

  // SmartBill state
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(order.smartbill_invoice_number as string | null ?? null);
  const [invoiceSeries, setInvoiceSeries] = useState<string | null>(order.smartbill_invoice_series as string | null ?? null);
  const [estimateNumber, setEstimateNumber] = useState<string | null>(order.smartbill_estimate_number as string | null ?? null);
  const [estimateSeries, setEstimateSeries] = useState<string | null>(order.smartbill_estimate_series as string | null ?? null);
  const [stornoNumber, setStornoNumber] = useState<string | null>(order.smartbill_storno_number as string | null ?? null);
  const [stornoSeries, setStornoSeries] = useState<string | null>(order.smartbill_storno_series as string | null ?? null);

  const [generatingInvoice, startInvoiceTransition] = useTransition();
  const [generatingEstimate, startEstimateTransition] = useTransition();
  const [converting, startConvertTransition] = useTransition();
  const [stornoing, startStornoTransition] = useTransition();
  const [resendingInvoice, startResendInvoiceTransition] = useTransition();
  const [resendingEstimate, startResendEstimateTransition] = useTransition();
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);

  const [showStornoConfirm, setShowStornoConfirm] = useState(false);
  const [showResendInvoice, setShowResendInvoice] = useState(false);
  const [showResendEstimate, setShowResendEstimate] = useState(false);

  const customerEmail = (order.customer_email as string | null) ?? "";
  const canStorno = !stornoNumber && (status === "cancelled" || status === "refunded");

  // Courier AWB modals
  const [wootModalOpen, setWootModalOpen] = useState(false);
  const [cargusModalOpen, setCargusModalOpen] = useState(false);
  const [dpdModalOpen, setDpdModalOpen] = useState(false);
  const [fanCourierModalOpen, setFanCourierModalOpen] = useState(false);
  const [samedayModalOpen, setSamedayModalOpen] = useState(false);
  const [coleteModalOpen, setColeteModalOpen] = useState(false);

  // Oblio state
  const [oblioActionPending, startOblioTransition] = useTransition();
  const [oblioAction, setOblioAction] = useState<"invoice" | "proforma" | "storno" | null>(null);

  // fGO state
  const [fgoActionPending, startFgoTransition] = useTransition();
  const [fgoAction, setFgoAction] = useState<"invoice" | "storno" | null>(null);

  function handleSave() {
    startTransition(async () => {
      const result = await updateOrder(order.id, { status, payment_status: paymentStatus });
      if ("error" in result) { toast.error(result.error); } else {
        toast.success("Comanda actualizata.");
        router.refresh();
      }
    });
  }

  function handleGenerateInvoice() {
    startInvoiceTransition(async () => {
      const result = await generateOrderInvoice(businessId, order.id);
      if ("error" in result) { toast.error(result.error); return; }
      setInvoiceNumber(result.number);
      setInvoiceSeries(result.series);
      toast.success(`Factura ${result.series}${result.number} generata.`);
    });
  }

  function handleGenerateEstimate() {
    startEstimateTransition(async () => {
      const result = await generateOrderEstimate(businessId, order.id);
      if ("error" in result) { toast.error(result.error); return; }
      setEstimateNumber(result.number);
      setEstimateSeries(result.series);
      toast.success(`Proforma ${result.series}${result.number} generata.`);
    });
  }

  function handleConvert() {
    startConvertTransition(async () => {
      const result = await convertEstimateToInvoice(businessId, order.id);
      if ("error" in result) { toast.error(result.error); return; }
      setInvoiceNumber(result.number);
      setInvoiceSeries(result.series);
      toast.success(`Factura ${result.series}${result.number} emisa din proforma.`);
    });
  }

  function handleStorno() {
    setShowStornoConfirm(false);
    startStornoTransition(async () => {
      const result = await stornoOrderInvoice(businessId, order.id);
      if ("error" in result) { toast.error(result.error); return; }
      setStornoNumber(result.stornoNumber ?? invoiceNumber);
      setStornoSeries(result.stornoSeries ?? invoiceSeries);
      toast.success("Factura a fost stornata cu succes.");
    });
  }

  function handleResendInvoice(email: string) {
    startResendInvoiceTransition(async () => {
      const result = await resendSmartbillEmail(businessId, order.id, email, "invoice");
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Factura retrimisa pe email.");
      setShowResendInvoice(false);
    });
  }

  function handleResendEstimate(email: string) {
    startResendEstimateTransition(async () => {
      const result = await resendSmartbillEmail(businessId, order.id, email, "estimate");
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Proforma retrimisa pe email.");
      setShowResendEstimate(false);
    });
  }

  async function handleDownloadPdf(docType: "invoice" | "estimate" | "storno") {
    setDownloadingPdf(docType);
    try {
      const res = await fetch(`/api/smartbill/pdf?orderId=${order.id}&type=${docType}`);
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        toast.error(data.error ?? "Eroare la descarcarea PDF-ului.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `document_${docType}.pdf`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Eroare la descarcarea PDF-ului.");
    } finally {
      setDownloadingPdf(null);
    }
  }

  function handleOblioAction(action: "invoice" | "proforma" | "storno") {
    setOblioAction(action);
    startOblioTransition(async () => {
      let result: { error: string } | { number: string; series: string } | { success: true };
      if (action === "invoice") result = await generateOblioInvoice(businessId, order.id);
      else if (action === "proforma") result = await generateOblioProforma(businessId, order.id);
      else result = await stornoOblioInvoice(businessId, order.id);
      setOblioAction(null);
      if ("error" in result) { toast.error(result.error); return; }
      if ("number" in result) {
        const labels = { invoice: "Factura", proforma: "Proforma", storno: "Storno" };
        toast.success(`${labels[action]} Oblio ${result.series}${result.number} generata`);
      }
      router.refresh();
    });
  }

  function handleFgoAction(action: "invoice" | "storno") {
    setFgoAction(action);
    startFgoTransition(async () => {
      const result = action === "invoice"
        ? await generateFgoInvoice(businessId, order.id)
        : await stornoFgoInvoiceAction(businessId, order.id);
      setFgoAction(null);
      if ("error" in result) { toast.error(result.error); return; }
      if ("number" in result) {
        const label = action === "invoice" ? "Factura fGO" : "Storno fGO";
        toast.success(`${label} ${result.series}${result.number} generata`);
      }
      router.refresh();
    });
  }

  const anyCourierEnabled = wootEnabled || cargusEnabled || dpdEnabled || fanCourierEnabled || samedayEnabled || coleteEnabled;

  // Courier AWB data helpers
  const ord = order as unknown as Record<string, unknown>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button type="button" onClick={() => router.push("/dashboard/orders")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-0.5">
          <ArrowLeft className="h-4 w-4" />Inapoi
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-foreground font-mono">{order.order_number}</h1>
            <Badge cls={currentStatus.cls} label={currentStatus.label} />
            <Badge cls={currentPayment.cls} label={currentPayment.label} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{formatDate(new Date(order.created_at))}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Client */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Informatii client</h2>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground font-medium">{order.customer_name}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <a href={`tel:${order.customer_phone}`} className="text-primary hover:underline">{order.customer_phone}</a>
            </div>
            {address.county && (
              <div className="flex items-start gap-2.5 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="text-muted-foreground leading-relaxed">
                  <div>{address.address}</div>
                  <div>{address.city}, {address.county}</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-sm">
              <Banknote className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">
                {order.payment_method === "cash_on_delivery" ? "Plata la livrare" : order.payment_method}
              </span>
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Produse comandate</h2>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground truncate">{item.name}</span>
                  <span className="text-muted-foreground flex-shrink-0">x{item.quantity}</span>
                </div>
                <span className="font-medium text-foreground flex-shrink-0 ml-3">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{formatPrice(Number(order.subtotal))}</span>
            </div>
            {Number(order.discount_amount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount {order.discount_code ? `(${order.discount_code})` : ""}</span>
                <span className="font-medium">-{formatPrice(Number(order.discount_amount))}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Transport</span>
              <span>{Number(order.shipping_cost) === 0 ? "Gratuit" : formatPrice(Number(order.shipping_cost))}</span>
            </div>
            {Number(order.vat_amount) > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>TVA ({Number(order.vat_rate)}%)</span>
                <span>{formatPrice(Number(order.vat_amount))}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-foreground text-base pt-1 border-t border-border">
              <span>Total</span><span>{formatPrice(Number(order.total))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Custom fields / notes */}
      {notes && Object.keys(notes).length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />Campuri aditionale
          </h2>
          <div className="divide-y divide-border">
            {Object.entries(notes).map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">{key}</span>
                <span className="text-sm text-foreground text-right">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SmartBill card ── */}
      {smartbillEnabled && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {/* Card header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
            <img src="/integrations/smartbill.svg" alt="SmartBill" className="h-6 w-auto object-contain" />
          </div>

          <div className="p-5 space-y-5">
            {/* ── PROFORMA section ── */}
            {hasEstimateSeries && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Proforma</p>

                {estimateNumber && estimateSeries ? (
                  <>
                    <DocRow
                      label="Proforma emisa"
                      docNumber={`${estimateSeries}${estimateNumber}`}
                      onDownload={() => handleDownloadPdf("estimate")}
                      downloading={downloadingPdf === "estimate"}
                    >
                      <button type="button" onClick={() => setShowResendEstimate(o => !o)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Mail className="h-3.5 w-3.5" />Retrimite
                      </button>
                    </DocRow>
                    {showResendEstimate && (
                      <ResendEmailForm
                        defaultEmail={customerEmail}
                        docType="estimate"
                        onSend={handleResendEstimate}
                        sending={resendingEstimate}
                      />
                    )}
                    {!invoiceNumber && (
                      <button type="button" onClick={handleConvert} disabled={converting}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition-colors disabled:opacity-50">
                        {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        {converting ? "Se converteste..." : "Converteste in factura"}
                      </button>
                    )}
                  </>
                ) : (
                  !invoiceNumber && (
                    <button type="button" onClick={handleGenerateEstimate} disabled={generatingEstimate}
                      className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
                      {generatingEstimate
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <img src="/integrations/smartbill.svg" alt="" className="h-4 w-auto object-contain" />}
                      {generatingEstimate ? "Se genereaza..." : "Genereaza proforma"}
                    </button>
                  )
                )}
              </div>
            )}

            {/* Divider between sections if both visible */}
            {hasEstimateSeries && <div className="border-t border-border" />}

            {/* ── INVOICE section ── */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Factura</p>

              {invoiceNumber && invoiceSeries ? (
                <>
                  <DocRow
                    label="Factura emisa"
                    docNumber={`${invoiceSeries}${invoiceNumber}`}
                    onDownload={() => handleDownloadPdf("invoice")}
                    downloading={downloadingPdf === "invoice"}
                  >
                    <button type="button" onClick={() => setShowResendInvoice(o => !o)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      <Mail className="h-3.5 w-3.5" />Retrimite
                    </button>
                  </DocRow>
                  {showResendInvoice && (
                    <ResendEmailForm
                      defaultEmail={customerEmail}
                      docType="invoice"
                      onSend={handleResendInvoice}
                      sending={resendingInvoice}
                    />
                  )}

                  {/* Storno section */}
                  {stornoNumber && stornoSeries ? (
                    <DocRow
                      label="Factura stornata"
                      docNumber={`${stornoSeries}${stornoNumber}`}
                      onDownload={() => handleDownloadPdf("storno")}
                      downloading={downloadingPdf === "storno"}
                    />
                  ) : canStorno ? (
                    showStornoConfirm ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                        <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                        <p className="text-xs text-red-700 flex-1">Aceasta actiune storneaza factura in SmartBill. Nu poate fi anulata.</p>
                        <button type="button" onClick={handleStorno} disabled={stornoing}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                          {stornoing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          Confirma storno
                        </button>
                        <button type="button" onClick={() => setShowStornoConfirm(false)}
                          className="p-1.5 text-red-400 hover:text-red-600 transition-colors">
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setShowStornoConfirm(true)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                        <RotateCcw className="h-4 w-4" />Emite storno
                      </button>
                    )
                  ) : null}
                </>
              ) : (
                <button type="button" onClick={handleGenerateInvoice} disabled={generatingInvoice}
                  className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
                  {generatingInvoice
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <img src="/integrations/smartbill.svg" alt="" className="h-4 w-auto object-contain" />}
                  {generatingInvoice ? "Se genereaza..." : "Genereaza factura"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Courier AWB cards ── */}
      {anyCourierEnabled && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
            <Package className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Expediere / AWB</span>
          </div>
          <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {wootEnabled && (
              <button type="button" onClick={() => setWootModalOpen(true)}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors text-left">
                <img src="/integrations/woot.svg" alt="Woot" className="h-6 w-auto object-contain flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">Woot</p>
                  {order.woot_awb_number
                    ? <p className="text-[11px] font-mono text-green-600 truncate">AWB: {order.woot_awb_number}</p>
                    : <p className="text-[11px] text-muted-foreground">Creeaza AWB</p>}
                </div>
              </button>
            )}
            {cargusEnabled && (
              <button type="button" onClick={() => setCargusModalOpen(true)}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors text-left">
                <img src="/integrations/cargus.svg" alt="Cargus" className="h-6 w-auto object-contain flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">Cargus</p>
                  {order.cargus_awb_number
                    ? <p className="text-[11px] font-mono text-green-600 truncate">AWB: {order.cargus_awb_number}</p>
                    : <p className="text-[11px] text-muted-foreground">Creeaza AWB</p>}
                </div>
              </button>
            )}
            {dpdEnabled && (
              <button type="button" onClick={() => setDpdModalOpen(true)}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors text-left">
                <img src="/integrations/dpd.svg" alt="DPD" className="h-6 w-auto object-contain flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">DPD</p>
                  {ord["dpd_awb_number"]
                    ? <p className="text-[11px] font-mono text-green-600 truncate">AWB: {ord["dpd_awb_number"] as string}</p>
                    : <p className="text-[11px] text-muted-foreground">Creeaza AWB</p>}
                </div>
              </button>
            )}
            {fanCourierEnabled && (
              <button type="button" onClick={() => setFanCourierModalOpen(true)}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors text-left">
                <img src="/integrations/fancourier.svg" alt="FAN Courier" className="h-6 w-auto object-contain flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">FAN Courier</p>
                  {ord["fan_courier_awb_number"]
                    ? <p className="text-[11px] font-mono text-green-600 truncate">AWB: {ord["fan_courier_awb_number"] as string}</p>
                    : <p className="text-[11px] text-muted-foreground">Creeaza AWB</p>}
                </div>
              </button>
            )}
            {samedayEnabled && (
              <button type="button" onClick={() => setSamedayModalOpen(true)}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors text-left">
                <img src="/integrations/sameday.svg" alt="Sameday" className="h-6 w-auto object-contain flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">Sameday</p>
                  {ord["sameday_awb_number"]
                    ? <p className="text-[11px] font-mono text-green-600 truncate">AWB: {ord["sameday_awb_number"] as string}</p>
                    : <p className="text-[11px] text-muted-foreground">Creeaza AWB</p>}
                </div>
              </button>
            )}
            {coleteEnabled && (
              <button type="button" onClick={() => setColeteModalOpen(true)}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors text-left">
                <img src="/integrations/coleteonline.svg" alt="Colete Online" className="h-6 w-auto object-contain flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">Colete Online</p>
                  {ord["colete_awb_number"]
                    ? <p className="text-[11px] font-mono text-green-600 truncate">AWB: {ord["colete_awb_number"] as string}</p>
                    : <p className="text-[11px] text-muted-foreground">Creeaza AWB</p>}
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Oblio card ── */}
      {oblioEnabled && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
            <img src="/integrations/oblio.svg" alt="Oblio" className="h-6 w-auto object-contain" />
          </div>
          <div className="p-5 space-y-3">
            {order.oblio_storno_number ? (
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <p className="text-sm font-mono font-bold text-red-600">
                  Storno {order.oblio_storno_series}{order.oblio_storno_number}
                </p>
              </div>
            ) : order.oblio_invoice_number ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <p className="text-sm font-mono font-bold text-foreground">
                    Factura {order.oblio_invoice_series}{order.oblio_invoice_number}
                  </p>
                </div>
                <button type="button" onClick={() => handleOblioAction("storno")}
                  disabled={oblioActionPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                  {oblioActionPending && oblioAction === "storno" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Emite storno
                </button>
              </div>
            ) : order.oblio_proforma_number ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  <p className="text-sm font-mono font-bold text-foreground">
                    Proforma {order.oblio_proforma_series}{order.oblio_proforma_number}
                  </p>
                </div>
                <button type="button" onClick={() => handleOblioAction("invoice")}
                  disabled={oblioActionPending}
                  className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
                  {oblioActionPending && oblioAction === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                  Genereaza factura
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => handleOblioAction("invoice")}
                  disabled={oblioActionPending}
                  className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
                  {oblioActionPending && oblioAction === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                  Genereaza factura
                </button>
                <button type="button" onClick={() => handleOblioAction("proforma")}
                  disabled={oblioActionPending}
                  className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
                  {oblioActionPending && oblioAction === "proforma" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Genereaza proforma
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── fGO card ── */}
      {fgoEnabled && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
            <img src="/integrations/fgo.svg" alt="fGO" className="h-6 w-auto object-contain" />
          </div>
          <div className="p-5 space-y-3">
            {(ord["fgo_storno_number"]) ? (
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <p className="text-sm font-mono font-bold text-red-600">
                  Storno {ord["fgo_storno_series"] as string}{ord["fgo_storno_number"] as string}
                </p>
              </div>
            ) : (ord["fgo_invoice_number"]) ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <p className="text-sm font-mono font-bold text-foreground">
                    Factura {ord["fgo_invoice_series"] as string}{ord["fgo_invoice_number"] as string}
                  </p>
                </div>
                {!!(ord["fgo_invoice_link"]) && (
                  <a href={ord["fgo_invoice_link"] as string} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors">
                    <Download className="h-3.5 w-3.5" /> PDF
                  </a>
                )}
                <button type="button" onClick={() => handleFgoAction("storno")}
                  disabled={fgoActionPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                  {fgoActionPending && fgoAction === "storno" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Emite storno
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => handleFgoAction("invoice")}
                disabled={fgoActionPending}
                className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
                {fgoActionPending && fgoAction === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                Genereaza factura
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Edit order ── */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
        <h2 className="text-sm font-semibold text-foreground">Editeaza comanda</h2>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">Status comanda</label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value} type="button" onClick={() => setStatus(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  status === opt.value ? opt.cls + " ring-2 ring-offset-1 ring-current" : "border-border text-muted-foreground hover:border-primary/40 bg-muted/30"
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">Status plata</label>
          <div className="flex gap-2">
            {PAYMENT_OPTIONS.map(opt => (
              <button key={opt.value} type="button" onClick={() => setPaymentStatus(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  paymentStatus === opt.value ? opt.cls + " ring-2 ring-offset-1 ring-current" : "border-border text-muted-foreground hover:border-primary/40 bg-muted/30"
                }`}>
                <CreditCard className="h-3 w-3" />{opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={handleSave} disabled={isPending || !hasChanges}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {isPending ? "Se salveaza..." : "Salveaza modificarile"}
          </button>
        </div>
      </div>

      {/* ── Courier AWB Modals ── */}
      {wootEnabled && (
        <WootAwbModal open={wootModalOpen} onClose={() => setWootModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setWootModalOpen(false); router.refresh(); }} />
      )}
      {cargusEnabled && (
        <CargusAwbModal open={cargusModalOpen} onClose={() => setCargusModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setCargusModalOpen(false); router.refresh(); }} />
      )}
      {dpdEnabled && (
        <DpdAwbModal open={dpdModalOpen} onClose={() => setDpdModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setDpdModalOpen(false); router.refresh(); }} />
      )}
      {fanCourierEnabled && (
        <FanCourierAwbModal open={fanCourierModalOpen} onClose={() => setFanCourierModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setFanCourierModalOpen(false); router.refresh(); }} />
      )}
      {samedayEnabled && (
        <SamedayAwbModal open={samedayModalOpen} onClose={() => setSamedayModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setSamedayModalOpen(false); router.refresh(); }} />
      )}
      {coleteEnabled && (
        <ColeteAwbModal open={coleteModalOpen} onClose={() => setColeteModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setColeteModalOpen(false); router.refresh(); }} />
      )}
    </div>
  );
}
