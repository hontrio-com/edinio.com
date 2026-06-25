"use client";

import { useState, useTransition } from "react";
import { X, Loader2, Package, Truck, ChevronRight, Download, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { getCOPrices, createCOAwb } from "@/lib/actions/colete.actions";
import type { COReceiver, COParcel } from "@/lib/colete";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

interface ShippingAddress {
  county?: string;
  city?: string;
  address?: string;
  postal_code?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
}

const inputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface PriceItem {
  serviceId: number;
  courierName: string;
  serviceName: string;
  total: number;
  noVat: number;
}

export function ColeteAwbModal({ open, onClose, order, businessId, onSuccess }: Props) {
  const addr = order.shipping_address as ShippingAddress;
  const isCod = (order.payment_method ?? "") === "cash_on_delivery" && order.payment_status === "unpaid";

  const hasAwb = !!(order as unknown as Record<string, unknown>)["colete_awb_number"];
  const awbNumber = ((order as unknown as Record<string, unknown>)["colete_awb_number"] as string) ?? "";
  const orderId = ((order as unknown as Record<string, unknown>)["colete_order_id"] as string) ?? "";
  const serviceName = ((order as unknown as Record<string, unknown>)["colete_service_name"] as string) ?? "";

  // Receiver state
  const [receiverName, setReceiverName] = useState(order.customer_name ?? "");
  const [receiverPhone, setReceiverPhone] = useState(order.customer_phone ?? "");
  const [receiverEmail, setReceiverEmail] = useState(order.customer_email ?? "");
  const [receiverCounty, setReceiverCounty] = useState(addr.county ?? "");
  const [receiverCity, setReceiverCity] = useState(addr.city ?? "");
  const [receiverStreet, setReceiverStreet] = useState(addr.address ?? "");
  const [receiverStreetNumber, setReceiverStreetNumber] = useState("");
  const [receiverPostalCode, setReceiverPostalCode] = useState(addr.postal_code ?? "");

  // Parcel state
  const [parcelType, setParcelType] = useState<"package" | "envelope">("package");
  const [weight, setWeight] = useState("1");
  const [length, setLength] = useState("30");
  const [width, setWidth] = useState("20");
  const [height, setHeight] = useState("10");
  const [content, setContent] = useState("Produse comerciale");
  const [repayment, setRepayment] = useState(isCod ? String(Math.round(Number(order.total))) : "0");

  // Price state
  const [prices, setPrices] = useState<PriceItem[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedServiceName, setSelectedServiceName] = useState("");
  const [priceError, setPriceError] = useState("");
  const [, startPriceTransition] = useTransition();
  const [, startCreateTransition] = useTransition();
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  function buildReceiver(): COReceiver {
    return {
      name: receiverName,
      phone: receiverPhone,
      email: receiverEmail || undefined,
      county: receiverCounty,
      city: receiverCity,
      postal_code: receiverPostalCode,
      street: receiverStreet || "Adresa",
      street_number: receiverStreetNumber || "1",
    };
  }

  function buildParcels(): COParcel[] {
    return [{
      type: parcelType,
      weight: parseFloat(weight) || 1,
      length: parcelType === "package" ? (parseFloat(length) || 30) : undefined,
      width: parcelType === "package" ? (parseFloat(width) || 20) : undefined,
      height: parcelType === "package" ? (parseFloat(height) || 10) : undefined,
      content,
    }];
  }

  function handleCalculate() {
    if (!receiverCounty || !receiverCity) { toast.error("Completeaza judetul si orasul destinatarului"); return; }
    if (!receiverPostalCode) { toast.error("Codul postal al destinatarului este obligatoriu"); return; }
    setPriceError("");
    setPrices([]);
    setSelectedServiceId(null);
    setLoadingPrices(true);
    startPriceTransition(async () => {
      const rep = parseFloat(repayment) || 0;
      const result = await getCOPrices(businessId, buildReceiver(), buildParcels(), rep);
      setLoadingPrices(false);
      if ("error" in result) {
        setPriceError(result.error);
        toast.error(result.error);
      } else if (result.list.length === 0) {
        setPriceError("Niciun curier disponibil pentru aceasta ruta");
      } else {
        setPrices(result.list.sort((a, b) => a.total - b.total));
      }
    });
  }

  function handleCreate() {
    if (!selectedServiceId) { toast.error("Selecteaza un curier"); return; }
    setCreating(true);
    startCreateTransition(async () => {
      const rep = parseFloat(repayment) || 0;
      const result = await createCOAwb(businessId, order.id, selectedServiceId, selectedServiceName, buildReceiver(), buildParcels(), rep);
      setCreating(false);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`AWB creat: ${result.awb}`);
        onSuccess();
      }
    });
  }

  function handleDownload(format: "A4" | "A6") {
    const url = `/api/colete/awb?orderId=${order.id}&businessId=${businessId}&format=${format}`;
    window.open(url, "_blank");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-2xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface z-10">
          <div className="flex items-center gap-3">
            <img src="/integrations/colete-online.svg" alt="Colete Online" className="h-5 w-auto" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {hasAwb ? "Detalii AWB" : "Creeaza AWB"} — {order.order_number}
              </p>
              <p className="text-xs text-muted-foreground">{order.customer_name} · {order.customer_phone}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {hasAwb ? (
            /* ── AWB exists ── */
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-success/5 border border-success/20">
                <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-success">AWB generat</p>
                  <p className="text-xs text-success font-mono mt-0.5">{awbNumber}</p>
                  {serviceName && <p className="text-xs text-success mt-0.5">{serviceName}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descarca AWB</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="lg" onClick={() => handleDownload("A4")} className="w-full">
                    <Download />
                    Format A4
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => handleDownload("A6")} className="w-full">
                    <Download />
                    Format A6
                  </Button>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-warning/5 border border-warning/20">
                <p className="text-xs text-warning">
                  Anularea AWB-urilor nu este disponibila prin API. Contacteaza Colete Online direct pentru anulare.
                </p>
              </div>
            </div>
          ) : (
            /* ── Create AWB ── */
            <>
              {/* Receiver */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5" />Destinatar
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Nume *</label>
                    <input type="text" value={receiverName} onChange={e => setReceiverName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Telefon *</label>
                    <input type="text" value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Email</label>
                  <input type="email" value={receiverEmail} onChange={e => setReceiverEmail(e.target.value)} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Judet *</label>
                    <input type="text" value={receiverCounty} onChange={e => setReceiverCounty(e.target.value)} placeholder="Cluj" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Oras *</label>
                    <input type="text" value={receiverCity} onChange={e => setReceiverCity(e.target.value)} placeholder="Cluj-Napoca" className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">Strada</label>
                    <input type="text" value={receiverStreet} onChange={e => setReceiverStreet(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Numar</label>
                    <input type="text" value={receiverStreetNumber} onChange={e => setReceiverStreetNumber(e.target.value)} placeholder="1" className={inputCls} />
                  </div>
                </div>
                <div className="w-40">
                  <label className="block text-xs text-muted-foreground mb-1">Cod postal *</label>
                  <input type="text" value={receiverPostalCode} onChange={e => setReceiverPostalCode(e.target.value)} placeholder="400001" className={inputCls} />
                </div>
              </div>

              {/* Parcel */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Package className="h-3.5 w-3.5" />Colet
                </p>
                <div className="flex gap-2">
                  {(["package", "envelope"] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setParcelType(t)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${parcelType === t ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {t === "package" ? "Pachet" : "Plic"}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Greutate (kg) *</label>
                    <input type="number" min="0.1" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Continut *</label>
                    <input type="text" value={content} onChange={e => setContent(e.target.value)} className={inputCls} />
                  </div>
                </div>
                {parcelType === "package" && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Lung. (cm)</label>
                      <input type="number" min="1" value={length} onChange={e => setLength(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Lat. (cm)</label>
                      <input type="number" min="1" value={width} onChange={e => setWidth(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Inal. (cm)</label>
                      <input type="number" min="1" value={height} onChange={e => setHeight(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                )}
                <div className="w-40">
                  <label className="block text-xs text-muted-foreground mb-1">Ramburs (RON)</label>
                  <input type="number" min="0" step="0.01" value={repayment} onChange={e => setRepayment(e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Calculate prices */}
              <button
                type="button"
                onClick={handleCalculate}
                disabled={loadingPrices}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-muted hover:bg-muted/70 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loadingPrices ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                Calculeaza preturi
              </button>

              {/* Price error */}
              {priceError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {priceError}
                </div>
              )}

              {/* Price list */}
              {prices.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Selecteaza curier</p>
                  {prices.map(item => (
                    <button
                      key={item.serviceId}
                      type="button"
                      onClick={() => { setSelectedServiceId(item.serviceId); setSelectedServiceName(`${item.courierName} ${item.serviceName}`); }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors ${selectedServiceId === item.serviceId ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                    >
                      <div className="text-left">
                        <p className="text-sm font-semibold text-foreground">{item.courierName}</p>
                        <p className="text-xs text-muted-foreground">{item.serviceName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{item.total.toFixed(2)} RON</p>
                        <p className="text-[10px] text-muted-foreground">{item.noVat.toFixed(2)} fara TVA</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Create button */}
              {selectedServiceId !== null && (
                <Button onClick={handleCreate} disabled={creating} size="lg" className="w-full">
                  {creating ? <Loader2 className="animate-spin" /> : <Package />}
                  Creeaza AWB
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
