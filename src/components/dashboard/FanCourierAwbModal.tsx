"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Package, Loader2, Download, Trash2, MapPin } from "lucide-react";
import { createFanCourierAwbAction, deleteFanCourierAwbAction } from "@/lib/actions/fancourier.actions";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type ShippingAddress = {
  name?: string;
  county?: string;
  city?: string;
  address?: string;
  street?: string;
  street_no?: string;
  postal_code?: string;
  courier?: string;
  delivery_type?: string;
  locker_id?: string;
  locker_name?: string;
  locker_address?: string;
  locker_city?: string;
  locker_county?: string;
};

// FANbox limits from the FAN Courier API docs ("FANbox particularities").
const FANBOX_MAX_WEIGHT_KG = 30;
const FANBOX_COMPARTMENT_CM = [40.4, 44.3, 45]; // sorted min→max
const FAN_MAX_COD = 10000;

export function FanCourierAwbModal({
  open,
  onClose,
  order,
  businessId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
}) {
  const orderData = order as typeof order & {
    fan_courier_awb_number?: string | null;
  };

  const hasAwb = !!orderData.fan_courier_awb_number;
  const addr = order.shipping_address as ShippingAddress | null;

  // FANbox delivery needs the locker ID: the AWB carries pickupLocationId and
  // the locker's own county/locality (resolved server-side from the ID).
  const isFanboxDelivery =
    (addr?.courier === "fan-courier" || addr?.courier === "fancourier") &&
    addr?.delivery_type === "locker" &&
    !!addr?.locker_id;

  const [weight, setWeight] = useState("1");
  const [parcels, setParcels] = useState("1");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [cod, setCod] = useState("0");
  const [content, setContent] = useState("");
  const [observation, setObservation] = useState("");

  const [recipientName, setRecipientName] = useState(order.customer_name);
  const [recipientPhone, setRecipientPhone] = useState(order.customer_phone);
  const [recipientEmail, setRecipientEmail] = useState(order.customer_email ?? "");
  const [recipientCounty, setRecipientCounty] = useState(
    isFanboxDelivery ? (addr?.locker_county ?? addr?.county ?? "") : (addr?.county ?? ""),
  );
  const [recipientLocality, setRecipientLocality] = useState(
    isFanboxDelivery ? (addr?.locker_city ?? addr?.city ?? "") : (addr?.city ?? ""),
  );
  const [recipientStreet, setRecipientStreet] = useState(addr?.street ?? addr?.address ?? "");
  const [recipientStreetNo, setRecipientStreetNo] = useState(addr?.street_no ?? "");
  const [recipientZipCode, setRecipientZipCode] = useState(addr?.postal_code ?? "");

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const codNum = parseFloat(cod) || 0;
  const autoService = isFanboxDelivery
    ? (codNum > 0 ? "FANbox Cont Colector" : "FANbox")
    : (codNum > 0 ? "Cont Colector" : "Standard");

  useEffect(() => {
    if (open && !hasAwb) {
      if (order.payment_method === "cash_on_delivery") {
        setCod(String(Number(order.total).toFixed(2)));
      } else {
        setCod("0");
      }
    }
  }, [open, hasAwb, order.payment_method, order.total]);

  async function handleCreate() {
    if (!recipientName.trim()) return toast.error("Numele destinatarului este obligatoriu");
    if (!recipientPhone.trim()) return toast.error("Telefonul destinatarului este obligatoriu");
    if (!isFanboxDelivery) {
      if (!recipientCounty.trim()) return toast.error("Judetul destinatarului este obligatoriu");
      if (!recipientLocality.trim()) return toast.error("Localitatea destinatarului este obligatorie");
    }
    const weightNum = parseFloat(weight) || 0;
    if (weightNum <= 0) return toast.error("Greutatea trebuie sa fie mai mare decat 0");
    if (codNum > FAN_MAX_COD) return toast.error("Rambursul maxim acceptat de FAN Courier este 10.000 lei");

    if (isFanboxDelivery) {
      if (!recipientEmail.trim()) return toast.error("Emailul destinatarului este obligatoriu pentru livrarea la FANbox");
      if (weightNum > FANBOX_MAX_WEIGHT_KG) return toast.error(`Greutatea maxima pentru FANbox este ${FANBOX_MAX_WEIGHT_KG} kg`);
      if ((parseInt(parcels) || 1) > 1) return toast.error("FANbox accepta un singur colet per AWB");
      const dims = [length, width, height].map(v => parseFloat(v));
      if (!dims.every(d => d > 0)) {
        return toast.error("Dimensiunile coletului (L x l x H) sunt obligatorii pentru FANbox");
      }
      const sorted = [...dims].sort((a, b) => a - b);
      if (sorted.some((d, i) => d > FANBOX_COMPARTMENT_CM[i])) {
        return toast.error(`Coletul depaseste compartimentul FANbox (max ${FANBOX_COMPARTMENT_CM.join(" x ")} cm)`);
      }
    }

    setCreating(true);
    const result = await createFanCourierAwbAction(businessId, order.id, {
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      recipientEmail: recipientEmail.trim(),
      recipientCounty: recipientCounty.trim(),
      recipientLocality: recipientLocality.trim(),
      recipientStreet: recipientStreet.trim(),
      recipientStreetNo: recipientStreetNo.trim(),
      recipientZipCode: recipientZipCode.trim(),
      parcels: isFanboxDelivery ? 1 : (parseInt(parcels) || 1),
      weightKg: weightNum,
      length: length ? parseInt(length) : undefined,
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      cod: codNum,
      content: content.trim() || order.order_number,
      observation: observation.trim(),
      fanboxId: isFanboxDelivery ? addr!.locker_id : undefined,
    });
    setCreating(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(`AWB FAN Courier ${result.awbNumber} creat (${autoService})`);
      onSuccess();
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteFanCourierAwbAction(businessId, order.id);
    setDeleting(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("AWB FAN Courier sters");
      onSuccess();
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const url = `/api/fancourier/awb?orderId=${order.id}&businessId=${businessId}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? "Eroare la descarcarea PDF");
        return;
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `awb-fancourier-${orderData.fan_courier_awb_number}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      toast.error("Eroare la descarcarea AWB");
    } finally {
      setDownloading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl border border-border shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2.5">
            <img src="/integrations/fan-courier.svg" alt="FAN Courier" className="h-5 w-auto" />
            <div>
              <p className="text-sm font-semibold text-foreground">AWB FAN Courier</p>
              <p className="text-xs text-muted-foreground">Comanda {order.order_number}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {hasAwb ? (
            /* ── AWB existent ── */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-info/5 border border-info/20">
                <p className="text-xs font-semibold text-info mb-1">AWB generat</p>
                <p className="text-lg font-mono font-bold text-foreground">{orderData.fan_courier_awb_number}</p>
              </div>

              <Button variant="outline" size="lg" onClick={handleDownload} disabled={downloading} className="w-full">
                {downloading ? <Loader2 className="animate-spin" /> : <Download />}
                {downloading ? "Se descarca..." : "Descarca eticheta PDF"}
              </Button>

              <a
                href={`https://www.fancourier.ro/awb-tracking/?tracking=${encodeURIComponent(orderData.fan_courier_awb_number ?? "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium border border-border rounded-lg text-foreground hover:bg-muted transition-colors"
              >
                <MapPin className="h-4 w-4" />
                Urmareste expedierea
              </a>

              <div className="pt-2 border-t border-border">
                <Button variant="destructive" size="lg" onClick={handleDelete} disabled={deleting} className="w-full">
                  {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {deleting ? "Se sterge..." : "Sterge AWB"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  AWB-ul poate fi sters doar daca nu a fost preluat de curier
                </p>
              </div>
            </div>
          ) : (
            /* ── Creare AWB ── */
            <div className="space-y-5">
              {/* Destinatar */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Destinatar</p>
                <div className="space-y-3">
                  {isFanboxDelivery && (
                    <div className="p-3 rounded-xl bg-info/5 border border-info/20">
                      <p className="text-xs font-semibold text-info mb-0.5">Livrare la FANbox</p>
                      <p className="text-sm font-medium text-foreground">{addr?.locker_name}</p>
                      {(addr?.locker_address || addr?.locker_city) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[addr?.locker_address, addr?.locker_city, addr?.locker_county].filter(Boolean).join(", ")}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Judetul si localitatea AWB-ului se preiau automat de la locker, conform cerintelor FAN Courier.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Nume *</label>
                      <input
                        type="text"
                        value={recipientName}
                        onChange={e => setRecipientName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Telefon *</label>
                      <input
                        type="tel"
                        value={recipientPhone}
                        onChange={e => setRecipientPhone(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{isFanboxDelivery ? "Email *" : "Email"}</label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={e => setRecipientEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                    {isFanboxDelivery && (
                      <p className="text-[11px] text-muted-foreground mt-1">FAN Courier trimite codul de ridicare pe email.</p>
                    )}
                  </div>
                  {!isFanboxDelivery && (<>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Judet *</label>
                      <input
                        type="text"
                        value={recipientCounty}
                        onChange={e => setRecipientCounty(e.target.value)}
                        placeholder="ex: Cluj"
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Localitate *</label>
                      <input
                        type="text"
                        value={recipientLocality}
                        onChange={e => setRecipientLocality(e.target.value)}
                        placeholder="ex: Cluj-Napoca"
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Strada</label>
                      <input
                        type="text"
                        value={recipientStreet}
                        onChange={e => setRecipientStreet(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Nr.</label>
                      <input
                        type="text"
                        value={recipientStreetNo}
                        onChange={e => setRecipientStreetNo(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Cod postal</label>
                    <input
                      type="text"
                      value={recipientZipCode}
                      onChange={e => setRecipientZipCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                  </>)}
                </div>
              </div>

              {/* Colet */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Detalii colet</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Greutate (kg) *</label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Nr. colete</label>
                      <input
                        type="number"
                        min="1"
                        max={isFanboxDelivery ? 1 : undefined}
                        value={isFanboxDelivery ? "1" : parcels}
                        onChange={e => setParcels(e.target.value)}
                        disabled={isFanboxDelivery}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors disabled:opacity-60"
                      />
                      {isFanboxDelivery && (
                        <p className="text-[11px] text-muted-foreground mt-1">FANbox: un singur colet, max {FANBOX_MAX_WEIGHT_KG} kg</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      {isFanboxDelivery ? "Dimensiuni cm (obligatoriu la FANbox — determina compartimentul)" : "Dimensiuni cm (optional)"}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "L", value: length, set: setLength },
                        { label: "l", value: width, set: setWidth },
                        { label: "H", value: height, set: setHeight },
                      ].map(({ label, value, set }) => (
                        <div key={label}>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">{label} (cm)</label>
                          <input
                            type="number"
                            min="1"
                            value={value}
                            onChange={e => set(e.target.value)}
                            placeholder="0"
                            className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 bg-primary/5 border border-primary/20 text-primary">
                    <Package className="h-3.5 w-3.5 flex-shrink-0" />
                    Serviciu auto-selectat: <span className="font-bold">{autoService}</span>
                    {codNum > 0 && <span className="text-primary/60">(ramburs {codNum.toFixed(2)} lei)</span>}
                  </div>
                </div>
              </div>

              {/* Optiuni */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Optiuni</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Ramburs (lei)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cod}
                      onChange={e => setCod(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Continut colet</label>
                    <input
                      type="text"
                      value={content}
                      onChange={e => setContent(e.target.value)}
                      placeholder={`Comanda ${order.order_number}`}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Observatii</label>
                    <textarea
                      value={observation}
                      onChange={e => setObservation(e.target.value)}
                      rows={2}
                      placeholder="Observatii pentru curier..."
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors resize-none"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleCreate} disabled={creating} size="lg" className="w-full">
                {creating ? <Loader2 className="animate-spin" /> : <Package />}
                {creating ? "Se genereaza AWB..." : "Genereaza AWB FAN Courier"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
