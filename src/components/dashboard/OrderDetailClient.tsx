"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, User, Phone, MapPin, Package, Banknote, CreditCard,
  FileText, Receipt, Loader2, CheckCircle, Download, Mail, MessageSquare,
  RotateCcw, AlertTriangle, XCircle, ArrowRight, FileCheck, Trash2, Truck,
  ExternalLink, Pencil,
} from "lucide-react";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { updateOrder, deleteOrder, sendCustomerNotification, sendCustomerSms } from "@/lib/actions/order.actions";
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
import { euCountryByIso2 } from "@/lib/eu-countries";
import { SamedayAwbModal } from "@/components/dashboard/SamedayAwbModal";
import { ColeteAwbModal } from "@/components/dashboard/ColeteAwbModal";
import { OrderEditModal } from "@/components/dashboard/OrderEditModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  customization?: Record<string, { type: string; label: string; value: string | string[] }>;
}

interface ShippingAddress {
  county: string;
  city: string;
  address: string;
  country?: string;
  postal_code?: string;
  courier?: string;
  courier_label?: string;
  delivery_type?: string;
  locker_id?: string;
  locker_name?: string;
}

const STATUS_OPTIONS = [
  { value: "pending",    label: "In asteptare",  cls: "bg-warning/10 text-warning border-warning/20" },
  { value: "confirmed",  label: "Confirmat",     cls: "bg-info/10 text-info border-info/20" },
  { value: "processing", label: "In procesare",  cls: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  { value: "shipped",    label: "Expediat",      cls: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" },
  { value: "delivered",  label: "Livrat",        cls: "bg-success/10 text-success border-success/20" },
  { value: "cancelled",  label: "Anulat",        cls: "bg-destructive/10 text-destructive border-destructive/20" },
  { value: "refunded",   label: "Rambursat",     cls: "bg-muted text-muted-foreground border-border" },
];

const PAYMENT_OPTIONS = [
  { value: "unpaid",   label: "Neplatit",  cls: "bg-destructive/10 text-destructive border-destructive/20" },
  { value: "paid",     label: "Platit",    cls: "bg-success/10 text-success border-success/20" },
  { value: "refunded", label: "Rambursat", cls: "bg-muted text-muted-foreground border-border" },
];

// Visible milestones for the fulfillment stepper. "processing" folds into "Confirmata".
const STEPPER = [
  { keys: ["pending"], label: "Primita" },
  { keys: ["confirmed", "processing"], label: "Confirmata" },
  { keys: ["shipped"], label: "Expediata" },
  { keys: ["delivered"], label: "Livrata" },
];

function Badge({ cls, label }: { cls: string; label: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function StatusStepper({ status }: { status: string }) {
  if (status === "cancelled" || status === "refunded") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
        <span className="font-medium text-destructive">
          {status === "cancelled" ? "Comanda anulata" : "Comanda rambursata"}
        </span>
      </div>
    );
  }
  const current = STEPPER.findIndex(s => s.keys.includes(status));
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {STEPPER.map((s, i) => {
        const done = i <= current;
        return (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${done ? "bg-primary" : "bg-border"}`} />
            <span className={`text-[11px] font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
            {i < STEPPER.length - 1 && (
              <span className={`h-px w-4 sm:w-7 ${i < current ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
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
      <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
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
  onSend,
  sending,
}: {
  defaultEmail: string;
  onSend: (email: string) => void;
  sending: boolean;
}) {
  const [email, setEmail] = useState(defaultEmail);
  return (
    <div className="flex gap-2 items-center mt-2">
      <Input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="email@client.ro"
        className="flex-1"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onSend(email)}
        disabled={sending || !email.trim()}
      >
        {sending ? <Loader2 className="animate-spin" /> : <Mail />}
        Trimite
      </Button>
    </div>
  );
}

// A compact courier option (logo + name + AWB state) used in the "alt curier" list and fallback grid.
function CourierButton({ logo, name, awb, onClick }: { logo: string; name: string; awb: string | null; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors text-left w-full">
      <img src={logo} alt={name} className="h-6 w-6 object-contain flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{name}</p>
        {awb
          ? <p className="text-[11px] font-mono text-success truncate">AWB: {awb}</p>
          : <p className="text-[11px] text-muted-foreground">Creeaza AWB</p>}
      </div>
    </button>
  );
}

const CARD = "bg-surface border border-border rounded-xl";

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
  smsoEnabled,
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
  smsoEnabled?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(order.status as string);
  const [paymentStatus, setPaymentStatus] = useState(order.payment_status as string);
  const [isPending, startTransition] = useTransition();

  const items = (order.items as unknown as OrderItem[]) ?? [];
  const address = (order.shipping_address as unknown as ShippingAddress) ?? {};
  const notes = order.notes as Record<string, string> | null;
  const ord = order as unknown as Record<string, unknown>;

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

  // Status/payment change confirmation + delete + customer notifications
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, startDeleteTransition] = useTransition();
  const [notifChannel, setNotifChannel] = useState<"email" | "sms">("email");
  const [notifTemplate, setNotifTemplate] = useState("");
  const [notifSubject, setNotifSubject] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [sendingNotif, startNotifTransition] = useTransition();
  const [smsTemplate, setSmsTemplate] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [sendingSms, startSmsTransition] = useTransition();

  const customerEmail = (order.customer_email as string | null) ?? "";
  const customerPhone = (order.customer_phone as string | null) ?? "";
  const customerName = (order.customer_name as string | null) ?? "client";
  const orderNumber = order.order_number as string;
  const canStorno = !stornoNumber && (status === "cancelled" || status === "refunded");

  // Courier AWB modals
  const [editModalOpen, setEditModalOpen] = useState(false);
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

  // ── Invoicing providers (unified card) ──
  const invoicingProviders = ([
    smartbillEnabled && { id: "smartbill" as const, name: "SmartBill", logo: "/integrations/smartbill.webp" },
    oblioEnabled && { id: "oblio" as const, name: "Oblio", logo: "/integrations/oblio.webp" },
    fgoEnabled && { id: "fgo" as const, name: "fGO", logo: "/integrations/fgo.svg" },
  ].filter(Boolean)) as { id: "smartbill" | "oblio" | "fgo"; name: string; logo: string }[];

  const smartbillHasDoc = !!(invoiceNumber || estimateNumber || stornoNumber);
  const oblioHasDoc = !!(order.oblio_invoice_number || order.oblio_proforma_number || order.oblio_storno_number);
  const fgoHasDoc = !!(ord["fgo_invoice_number"] || ord["fgo_storno_number"]);
  const defaultProvider = smartbillHasDoc ? "smartbill" : oblioHasDoc ? "oblio" : fgoHasDoc ? "fgo" : invoicingProviders[0]?.id;
  const [activeProvider, setActiveProvider] = useState<"smartbill" | "oblio" | "fgo" | undefined>(defaultProvider);
  const activeProviderMeta = invoicingProviders.find(p => p.id === activeProvider) ?? invoicingProviders[0];

  // ── Couriers (Expediere card) ──
  const couriers = [
    { id: "sameday", name: "Sameday", logo: "/integrations/sameday.webp", enabled: !!samedayEnabled, awb: (order.sameday_awb_number as string | null) ?? null, open: () => setSamedayModalOpen(true) },
    { id: "fan-courier", name: "FAN Courier", logo: "/integrations/fan-courier.svg", enabled: !!fanCourierEnabled, awb: (order.fan_courier_awb_number as string | null) ?? null, open: () => setFanCourierModalOpen(true) },
    { id: "cargus", name: "Cargus", logo: "/integrations/cargus.svg", enabled: !!cargusEnabled, awb: (order.cargus_awb_number as string | null) ?? null, open: () => setCargusModalOpen(true) },
    { id: "dpd", name: "DPD", logo: "/integrations/dpd.svg", enabled: !!dpdEnabled, awb: (order.dpd_awb_number as string | null) ?? null, open: () => setDpdModalOpen(true) },
    { id: "colete", name: "Colete Online", logo: "/integrations/colete-online.svg", enabled: !!coleteEnabled, awb: (order.colete_awb_number as string | null) ?? null, open: () => setColeteModalOpen(true) },
    { id: "woot", name: "Woot", logo: "/integrations/woot.webp", enabled: !!wootEnabled, awb: (order.woot_awb_number as string | null) ?? null, open: () => setWootModalOpen(true) },
  ];
  const enabledCouriers = couriers.filter(c => c.enabled);
  const shippedCourier = enabledCouriers.find(c => c.awb);
  const chosenCourier = enabledCouriers.find(c => c.id === address.courier);
  const primaryCourier = shippedCourier ?? chosenCourier ?? enabledCouriers[0];
  const otherCouriers = enabledCouriers.filter(c => c.id !== primaryCourier?.id);
  const deliveryInfo = address.delivery_type === "locker" && address.locker_name ? address.locker_name : null;

  const NOTIF_TEMPLATES: Record<string, { label: string; subject: string; body: string }> = {
    confirmed: { label: "Comanda confirmata", subject: `Comanda ${orderNumber} a fost confirmata`, body: `Buna ${customerName},\n\nComanda ta ${orderNumber} a fost confirmata si intra in pregatire. Te anuntam imediat ce este expediata.\n\nMultumim pentru comanda!` },
    shipped: { label: "Comanda expediata", subject: `Comanda ${orderNumber} a fost expediata`, body: `Buna ${customerName},\n\nComanda ta ${orderNumber} a fost predata curierului si este pe drum. O vei primi in cel mai scurt timp.\n\nMultumim!` },
    delivered: { label: "Comanda livrata", subject: `Comanda ${orderNumber} a fost livrata`, body: `Buna ${customerName},\n\nComanda ta ${orderNumber} a fost livrata. Speram sa te bucuri de produse!\n\nDaca ai intrebari, suntem aici pentru tine.` },
    delay: { label: "Intarziere livrare", subject: `Update despre comanda ${orderNumber}`, body: `Buna ${customerName},\n\nIti scriem in legatura cu comanda ${orderNumber}. Din pacate intampinam o mica intarziere, dar lucram sa o expediem cat mai repede. Iti multumim pentru rabdare!` },
    info: { label: "Solicitare informatii", subject: `Avem nevoie de cateva detalii pentru comanda ${orderNumber}`, body: `Buna ${customerName},\n\nPentru a procesa comanda ${orderNumber} avem nevoie de cateva informatii suplimentare. Te rugam sa ne raspunzi la acest email.\n\nMultumim!` },
  };

  // Short SMS variants (kept under ~160 chars where possible).
  const SMS_TEMPLATES: Record<string, { label: string; body: string }> = {
    confirmed: { label: "Confirmata", body: `Comanda ${orderNumber} a fost confirmata. Multumim!` },
    shipped: { label: "Expediata", body: `Comanda ${orderNumber} a fost expediata si este pe drum. Multumim!` },
    delivered: { label: "Livrata", body: `Comanda ${orderNumber} a fost livrata. Iti multumim!` },
    delay: { label: "Intarziere", body: `Comanda ${orderNumber} are o mica intarziere. Multumim pentru rabdare!` },
  };

  function applyTemplate(key: string) {
    setNotifTemplate(key);
    const t = NOTIF_TEMPLATES[key];
    if (t) { setNotifSubject(t.subject); setNotifMessage(t.body); }
  }

  function applySmsTemplate(key: string) {
    setSmsTemplate(key);
    const t = SMS_TEMPLATES[key];
    if (t) setSmsMessage(t.body);
  }

  function confirmSave() {
    setShowSaveConfirm(false);
    startTransition(async () => {
      const result = await updateOrder(order.id, { status, payment_status: paymentStatus });
      if ("error" in result) { toast.error(result.error); } else {
        toast.success("Comanda actualizata.");
        router.refresh();
      }
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteOrder(order.id);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Comanda a fost stearsa.");
      router.push("/dashboard/orders");
    });
  }

  function handleSendNotification() {
    startNotifTransition(async () => {
      const result = await sendCustomerNotification(order.id, notifSubject, notifMessage);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Notificarea a fost trimisa clientului.");
    });
  }

  function handleSendSms() {
    startSmsTransition(async () => {
      const result = await sendCustomerSms(order.id, smsMessage);
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("SMS trimis clientului.");
    });
  }

  function handleGenerateInvoice() {
    startInvoiceTransition(async () => {
      const result = await generateOrderInvoice(businessId, order.id);
      if ("error" in result) { toast.error(result.error); return; }
      setInvoiceNumber(result.number);
      setInvoiceSeries(result.series);
      toast.success(`Factura ${result.series}${result.number} generata.`);
      if (result.emailWarning) toast.warning(result.emailWarning);
    });
  }

  function handleGenerateEstimate() {
    startEstimateTransition(async () => {
      const result = await generateOrderEstimate(businessId, order.id);
      if ("error" in result) { toast.error(result.error); return; }
      setEstimateNumber(result.number);
      setEstimateSeries(result.series);
      toast.success(`Proforma ${result.series}${result.number} generata.`);
      if (result.emailWarning) toast.warning(result.emailWarning);
    });
  }

  function handleConvert() {
    startConvertTransition(async () => {
      const result = await convertEstimateToInvoice(businessId, order.id);
      if ("error" in result) { toast.error(result.error); return; }
      setInvoiceNumber(result.number);
      setInvoiceSeries(result.series);
      toast.success(`Factura ${result.series}${result.number} emisa din proforma.`);
      if (result.emailWarning) toast.warning(result.emailWarning);
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

  const smsLen = smsMessage.length;
  const smsSegments = smsLen === 0 ? 0 : Math.ceil(smsLen / 160);

  // Mobile sticky action bar: single most relevant next action.
  const mobileAction = hasChanges
    ? { label: isPending ? "Se salveaza..." : "Salveaza modificarile", onClick: () => setShowSaveConfirm(true), disabled: isPending }
    : (!shippedCourier && primaryCourier)
      ? { label: `Creeaza AWB ${primaryCourier.name}`, onClick: primaryCourier.open, disabled: false }
      : null;

  // ── Provider bodies for the unified Facturare card ──
  function renderSmartbill() {
    // Link privat spre documentul din SmartBill Cloud (returnat la emitere);
    // editare -> vizualizare, ca in modulul oficial.
    const sbViewLink = (raw: unknown) =>
      typeof raw === "string" && raw ? raw.replace("editare", "vizualizare") : null;
    const invoiceUrl = sbViewLink(ord["smartbill_invoice_url"]);
    const estimateUrl = sbViewLink(ord["smartbill_estimate_url"]);
    const sbLinkBtn = (href: string) => (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
        <ExternalLink className="h-3.5 w-3.5" />SmartBill
      </a>
    );
    return (
      <div className="space-y-5">
        {hasEstimateSeries && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Proforma</p>
            {estimateNumber && estimateSeries ? (
              <>
                <DocRow label="Proforma emisa" docNumber={`${estimateSeries}${estimateNumber}`}
                  onDownload={() => handleDownloadPdf("estimate")} downloading={downloadingPdf === "estimate"}>
                  <button type="button" onClick={() => setShowResendEstimate(o => !o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <Mail className="h-3.5 w-3.5" />Retrimite
                  </button>
                  {estimateUrl && sbLinkBtn(estimateUrl)}
                </DocRow>
                {showResendEstimate && (
                  <ResendEmailForm defaultEmail={customerEmail} onSend={handleResendEstimate} sending={resendingEstimate} />
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
                  {generatingEstimate ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {generatingEstimate ? "Se genereaza..." : "Genereaza proforma"}
                </button>
              )
            )}
          </div>
        )}

        {hasEstimateSeries && <div className="border-t border-border" />}

        <div className="space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Factura</p>
          {invoiceNumber && invoiceSeries ? (
            <>
              <DocRow label="Factura emisa" docNumber={`${invoiceSeries}${invoiceNumber}`}
                onDownload={() => handleDownloadPdf("invoice")} downloading={downloadingPdf === "invoice"}>
                <button type="button" onClick={() => setShowResendInvoice(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <Mail className="h-3.5 w-3.5" />Retrimite
                </button>
                {invoiceUrl && sbLinkBtn(invoiceUrl)}
              </DocRow>
              {showResendInvoice && (
                <ResendEmailForm defaultEmail={customerEmail} onSend={handleResendInvoice} sending={resendingInvoice} />
              )}
              {stornoNumber && stornoSeries ? (
                // SmartBill /invoice/reverse nu returneaza mereu numarul stornoului;
                // in acel caz marcam factura originala ca stornata (fallback), fara
                // un PDF de storno propriu — asa ca nu oferim un download inselator.
                (stornoSeries === invoiceSeries && stornoNumber === invoiceNumber) ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
                    <RotateCcw className="h-4 w-4 text-destructive flex-shrink-0" />
                    <p className="text-xs text-destructive flex-1">
                      Factura a fost stornata in SmartBill. Documentul de stornare este disponibil in contul tau SmartBill.
                    </p>
                  </div>
                ) : (
                  <DocRow label="Factura stornata" docNumber={`${stornoSeries}${stornoNumber}`}
                    onDownload={() => handleDownloadPdf("storno")} downloading={downloadingPdf === "storno"} />
                )
              ) : canStorno ? (
                showStornoConfirm ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                    <p className="text-xs text-destructive flex-1">Aceasta actiune storneaza factura in SmartBill. Nu poate fi anulata.</p>
                    <Button type="button" size="sm" onClick={handleStorno} disabled={stornoing} className="bg-destructive text-white hover:bg-destructive/90">
                      {stornoing ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                      Confirma storno
                    </Button>
                    <button type="button" onClick={() => setShowStornoConfirm(false)}
                      className="p-1.5 text-destructive/60 hover:text-destructive transition-colors">
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowStornoConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10 transition-colors">
                    <RotateCcw className="h-4 w-4" />Emite storno
                  </button>
                )
              ) : null}
            </>
          ) : (
            <button type="button" onClick={handleGenerateInvoice} disabled={generatingInvoice}
              className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
              {generatingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
              {generatingInvoice ? "Se genereaza..." : "Genereaza factura"}
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderOblio() {
    // Oblio returneaza un link public semnat = singurul acces la PDF (nu exista
    // endpoint PDF autentificat), deci deschidem direct link-ul stocat.
    const oblioPdfBtn = (link: string | null | undefined) => link ? (
      <a href={link} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors">
        <Download className="h-3.5 w-3.5" /> PDF
      </a>
    ) : null;
    return order.oblio_storno_number ? (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
          <p className="text-sm font-mono font-bold text-destructive">Storno {order.oblio_storno_series}{order.oblio_storno_number}</p>
        </div>
        {oblioPdfBtn(order.oblio_storno_link)}
      </div>
    ) : order.oblio_invoice_number ? (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-success flex-shrink-0" />
          <p className="text-sm font-mono font-bold text-foreground">Factura {order.oblio_invoice_series}{order.oblio_invoice_number}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {oblioPdfBtn(order.oblio_invoice_link)}
          <button type="button" onClick={() => handleOblioAction("storno")} disabled={oblioActionPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">
            {oblioActionPending && oblioAction === "storno" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Emite storno
          </button>
        </div>
      </div>
    ) : order.oblio_proforma_number ? (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-info flex-shrink-0" />
          <p className="text-sm font-mono font-bold text-foreground">Proforma {order.oblio_proforma_series}{order.oblio_proforma_number}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {oblioPdfBtn(order.oblio_proforma_link)}
          <button type="button" onClick={() => handleOblioAction("invoice")} disabled={oblioActionPending}
            className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
            {oblioActionPending && oblioAction === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
            Genereaza factura
          </button>
        </div>
      </div>
    ) : (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => handleOblioAction("invoice")} disabled={oblioActionPending}
          className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
          {oblioActionPending && oblioAction === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
          Genereaza factura
        </button>
        <button type="button" onClick={() => handleOblioAction("proforma")} disabled={oblioActionPending}
          className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
          {oblioActionPending && oblioAction === "proforma" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Genereaza proforma
        </button>
      </div>
    );
  }

  function renderFgo() {
    return (ord["fgo_storno_number"]) ? (
      <div className="flex items-center gap-2">
        <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
        <p className="text-sm font-mono font-bold text-destructive">Storno {ord["fgo_storno_series"] as string}{ord["fgo_storno_number"] as string}</p>
      </div>
    ) : (ord["fgo_invoice_number"]) ? (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-success flex-shrink-0" />
          <p className="text-sm font-mono font-bold text-foreground">Factura {ord["fgo_invoice_series"] as string}{ord["fgo_invoice_number"] as string}</p>
        </div>
        {!!(ord["fgo_invoice_link"]) && (
          <a href={ord["fgo_invoice_link"] as string} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors">
            <Download className="h-3.5 w-3.5" /> PDF
          </a>
        )}
        <button type="button" onClick={() => handleFgoAction("storno")} disabled={fgoActionPending}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">
          {fgoActionPending && fgoAction === "storno" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Emite storno
        </button>
      </div>
    ) : (
      <button type="button" onClick={() => handleFgoAction("invoice")} disabled={fgoActionPending}
        className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
        {fgoActionPending && fgoAction === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
        Genereaza factura
      </button>
    );
  }

  return (
    <div className="p-4 sm:p-6 pb-24 lg:pb-6">
      {/* ── Header ── */}
      <div className="flex items-start gap-4 mb-5">
        <button type="button" onClick={() => router.push("/dashboard/orders")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-0.5">
          <ArrowLeft className="h-4 w-4" />Inapoi
        </button>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-foreground font-mono">{order.order_number}</h1>
            <Badge cls={currentStatus.cls} label={currentStatus.label} />
            <Badge cls={currentPayment.cls} label={currentPayment.label} />
            <span className="text-sm text-muted-foreground">{formatDate(new Date(order.created_at))}</span>
          </div>
          <StatusStepper status={status} />
        </div>
        <button type="button" onClick={() => setEditModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors flex-shrink-0">
          <Pencil className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Editeaza comanda</span>
          <span className="sm:hidden">Editeaza</span>
        </button>
      </div>

      {/* ── Two-column operational area (single column on mobile) ── */}
      <div className="flex flex-col lg:flex-row lg:gap-5 lg:items-start gap-5">
        {/* MAIN: order content */}
        <div className="lg:flex-1 min-w-0 space-y-5">
          {/* Client */}
          <div className={`${CARD} p-5 space-y-3`}>
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
              {customerEmail && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a href={`mailto:${customerEmail}`} className="text-primary hover:underline truncate">{customerEmail}</a>
                </div>
              )}
              {(address.county || address.country) && (
                <div className="flex items-start gap-2.5 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="text-muted-foreground leading-relaxed">
                    <div>{address.address}</div>
                    <div>
                      {[address.city, address.county, address.postal_code].filter(Boolean).join(", ")}
                    </div>
                    {address.country && address.country !== "RO" && (
                      <div className="font-semibold text-foreground">
                        {euCountryByIso2(address.country)?.name ?? address.country}
                      </div>
                    )}
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
          <div className={`${CARD} p-5 space-y-3 overflow-hidden`}>
            <h2 className="text-sm font-semibold text-foreground">Produse comandate</h2>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-foreground truncate min-w-0">{item.name}</span>
                      <span className="text-muted-foreground flex-shrink-0">x{item.quantity}</span>
                    </div>
                    <span className="font-medium text-foreground flex-shrink-0 ml-3">{formatPrice(item.price * item.quantity)}</span>
                  </div>
                  {item.customization && Object.keys(item.customization).length > 0 && (
                    <div className="ml-6 mt-1.5 pl-3 border-l-2 border-purple-200 space-y-1.5">
                      <p className="text-[10px] font-bold text-purple-500 uppercase tracking-widest">Personalizare</p>
                      {Object.values(item.customization).map((field, fi) => (
                        <div key={fi}>
                          <p className="text-[11px] font-semibold text-purple-600 uppercase tracking-wide">{field.label}</p>
                          {field.type === "image" && Array.isArray(field.value) ? (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {(field.value as string[]).map((url, imgI) => (
                                <a key={imgI} href={url} target="_blank" rel="noopener noreferrer"
                                  className="relative block w-14 h-14 rounded-lg overflow-hidden border border-border hover:border-primary transition-colors">
                                  <Image src={url} alt={`Personalizare ${imgI + 1}`} fill sizes="56px" className="object-cover" />
                                </a>
                              ))}
                            </div>
                          ) : field.type === "color" ? (
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="w-5 h-5 rounded border border-border" style={{ backgroundColor: field.value as string }} />
                              <span className="text-xs text-muted-foreground font-mono">{field.value}</span>
                            </div>
                          ) : (
                            <p className="text-sm text-foreground">{field.value as string}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span><span>{formatPrice(Number(order.subtotal))}</span>
              </div>
              {Number(order.discount_amount) > 0 && (
                <div className="flex justify-between text-success">
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

          {/* Custom fields / notes */}
          {notes && Object.keys(notes).length > 0 && (
            <div className={`${CARD} p-5 space-y-3`}>
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
        </div>

        {/* RAIL: operational actions (sticky on desktop) */}
        <div className="lg:w-[360px] lg:shrink-0 lg:sticky lg:top-6 space-y-4">
          {/* Status & plata */}
          <div className={`${CARD} p-5 space-y-4`}>
            <h2 className="text-sm font-semibold text-foreground">Status comanda</h2>
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
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Status plata</label>
              <div className="flex flex-wrap gap-2">
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
            <Button onClick={() => setShowSaveConfirm(true)} disabled={isPending || !hasChanges} className="w-full">
              {isPending ? "Se salveaza..." : "Salveaza modificarile"}
            </Button>
          </div>

          {/* Facturare (unified) */}
          {invoicingProviders.length > 0 && (
            <div className={`${CARD} overflow-hidden`}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Facturare</span>
                {invoicingProviders.length === 1 && activeProviderMeta && (
                  <img src={activeProviderMeta.logo} alt={activeProviderMeta.name} className="h-5 w-auto object-contain ml-auto" />
                )}
              </div>
              {invoicingProviders.length > 1 && (
                <div className="flex gap-1.5 p-2 border-b border-border bg-muted/10">
                  {invoicingProviders.map(p => (
                    <button key={p.id} type="button" onClick={() => setActiveProvider(p.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        activeProvider === p.id ? "border-primary/40 bg-primary/5 text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/40"
                      }`}>
                      <img src={p.logo} alt={p.name} className="h-4 w-4 object-contain" />{p.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="p-4">
                {activeProvider === "smartbill" && renderSmartbill()}
                {activeProvider === "oblio" && renderOblio()}
                {activeProvider === "fgo" && renderFgo()}
              </div>
            </div>
          )}

          {/* Expediere */}
          {enabledCouriers.length > 0 && (
            <div className={`${CARD} overflow-hidden`}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Expediere</span>
              </div>
              <div className="p-4 space-y-3">
                {shippedCourier ? (
                  <>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-success/5 border border-success/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={shippedCourier.logo} alt={shippedCourier.name} className="h-7 w-7 object-contain flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-success">Expediat cu {shippedCourier.name}</p>
                        <p className="text-sm font-mono font-bold text-success truncate">AWB: {shippedCourier.awb}</p>
                      </div>
                    </div>
                    <button type="button" onClick={shippedCourier.open}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors">
                      <Package className="h-4 w-4" />Gestioneaza AWB
                    </button>
                  </>
                ) : primaryCourier ? (
                  <>
                    <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                      <p className="text-[11px] font-bold text-primary uppercase tracking-widest">
                        {chosenCourier ? "Clientul a ales" : "Curier recomandat"}
                      </p>
                      <div className="flex items-center gap-3">
                        <img src={primaryCourier.logo} alt={primaryCourier.name} className="h-7 w-7 object-contain flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{address.courier_label ?? primaryCourier.name}</p>
                          {deliveryInfo && <p className="text-xs text-muted-foreground truncate">{deliveryInfo}</p>}
                        </div>
                      </div>
                      <button type="button" onClick={primaryCourier.open}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 transition-colors">
                        <Package className="h-4 w-4" />Creeaza AWB {primaryCourier.name}
                      </button>
                    </div>
                    {otherCouriers.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Sau expediaza cu alt curier</p>
                        {otherCouriers.map(c => (
                          <CourierButton key={c.id} logo={c.logo} name={c.name} awb={c.awb} onClick={c.open} />
                        ))}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Customer notifications (full width) ── */}
      <div className={`${CARD} p-5 space-y-4 mt-5`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Notificari client</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Trimite un mesaj direct clientului prin email sau SMS.</p>
          </div>
          <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border">
            <button type="button" onClick={() => setNotifChannel("email")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                notifChannel === "email" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              <Mail className="h-3.5 w-3.5" />Email
            </button>
            <button type="button" onClick={() => setNotifChannel("sms")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                notifChannel === "sms" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              <MessageSquare className="h-3.5 w-3.5" />SMS
            </button>
          </div>
        </div>

        {notifChannel === "email" ? (
          customerEmail ? (
            <>
              <div className="flex flex-wrap gap-2">
                {Object.entries(NOTIF_TEMPLATES).map(([key, t]) => (
                  <button key={key} type="button" onClick={() => applyTemplate(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      notifTemplate === key ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-muted/40"
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Subiect</label>
                <Input type="text" value={notifSubject} onChange={e => setNotifSubject(e.target.value)} placeholder="Subiectul emailului" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Mesaj</label>
                <Textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)} rows={5} placeholder="Scrie mesajul pentru client..." className="resize-none" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground truncate">Catre: <strong className="text-foreground">{customerEmail}</strong></p>
                <Button onClick={handleSendNotification} disabled={sendingNotif || !notifSubject.trim() || !notifMessage.trim()} className="shrink-0">
                  {sendingNotif ? <Loader2 className="animate-spin" /> : <Mail />}
                  Trimite email
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Clientul nu a lasat o adresa de email, asa ca nu poti trimite notificari pe email pentru aceasta comanda.</p>
          )
        ) : !smsoEnabled ? (
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border">
            <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Conecteaza <Link href="/dashboard/features/smso" className="text-primary font-medium hover:underline">SMSO</Link> ca sa poti trimite SMS-uri clientilor direct din comanda.
            </p>
          </div>
        ) : !customerPhone ? (
          <p className="text-sm text-muted-foreground">Clientul nu a lasat un numar de telefon, asa ca nu poti trimite SMS pentru aceasta comanda.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SMS_TEMPLATES).map(([key, t]) => (
                <button key={key} type="button" onClick={() => applySmsTemplate(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    smsTemplate === key ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-muted/40"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Mesaj SMS</label>
              <Textarea value={smsMessage} onChange={e => setSmsMessage(e.target.value)} rows={3} placeholder="Scrie mesajul SMS..." className="resize-none" />
              <p className="text-[11px] text-muted-foreground mt-1">{smsLen} caractere · {smsSegments} SMS</p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground truncate">Catre: <strong className="text-foreground">{customerPhone}</strong></p>
              <Button onClick={handleSendSms} disabled={sendingSms || !smsMessage.trim()} className="shrink-0">
                {sendingSms ? <Loader2 className="animate-spin" /> : <MessageSquare />}
                Trimite SMS
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ── Danger zone ── */}
      <div className={`${CARD} border-destructive/30 p-5 flex items-center justify-between gap-3 mt-5`}>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Sterge comanda</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Stergerea este definitiva si nu poate fi anulata.</p>
        </div>
        <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)} disabled={deleting} className="shrink-0">
          <Trash2 /> Sterge definitiv
        </Button>
      </div>

      {/* ── Mobile sticky action bar (above bottom nav) ── */}
      {mobileAction && (
        <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur px-4 py-3">
          <Button size="lg" onClick={mobileAction.onClick} disabled={mobileAction.disabled} className="w-full">
            <Package />{mobileAction.label}
          </Button>
        </div>
      )}

      {/* ── Order edit modal ── */}
      <OrderEditModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        order={order}
        businessId={businessId}
        onSaved={() => { setEditModalOpen(false); router.refresh(); }}
      />

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

      {/* ── Status/payment change confirmation ── */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowSaveConfirm(false)}>
          <div className="bg-background rounded-2xl border border-border shadow-2xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-foreground mb-2">Confirmi modificarile?</h3>
            <div className="text-sm text-muted-foreground mb-4 space-y-1">
              <p>Status comanda: <strong className="text-foreground">{currentStatus.label}</strong></p>
              <p>Status plata: <strong className="text-foreground">{currentPayment.label}</strong></p>
              {status !== order.status && (customerEmail || customerPhone) && (
                <p className="text-xs mt-2">Clientul va fi notificat automat despre schimbarea statusului.</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowSaveConfirm(false)}>Anuleaza</Button>
              <Button type="button" onClick={confirmSave} disabled={isPending}>Confirma</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-background rounded-2xl border border-border shadow-2xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-foreground mb-2">Stergi comanda {orderNumber}?</h3>
            <p className="text-sm text-muted-foreground mb-4">Aceasta actiune este definitiva si nu poate fi anulata.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowDeleteConfirm(false)}>Anuleaza</Button>
              <Button type="button" onClick={handleDelete} disabled={deleting} className="bg-destructive text-white hover:bg-destructive/90">
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />} Sterge definitiv
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
