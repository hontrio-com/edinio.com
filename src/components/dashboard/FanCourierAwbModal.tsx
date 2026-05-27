"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Package, Loader2, Download, Trash2 } from "lucide-react";
import { createFanCourierAwbAction, deleteFanCourierAwbAction } from "@/lib/actions/fancourier.actions";
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
};

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
  const [recipientCounty, setRecipientCounty] = useState(addr?.county ?? "");
  const [recipientLocality, setRecipientLocality] = useState(addr?.city ?? "");
  const [recipientStreet, setRecipientStreet] = useState(addr?.street ?? addr?.address ?? "");
  const [recipientStreetNo, setRecipientStreetNo] = useState(addr?.street_no ?? "");
  const [recipientZipCode, setRecipientZipCode] = useState(addr?.postal_code ?? "");

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const codNum = parseFloat(cod) || 0;
  const autoService = codNum > 0 ? "Cont Colector" : "Standard";

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
    if (!recipientCounty.trim()) return toast.error("Judetul destinatarului este obligatoriu");
    if (!recipientLocality.trim()) return toast.error("Localitatea destinatarului este obligatorie");
    const weightNum = parseFloat(weight) || 0;
    if (weightNum <= 0) return toast.error("Greutatea trebuie sa fie mai mare decat 0");

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
      parcels: parseInt(parcels) || 1,
      weightKg: weightNum,
      length: length ? parseInt(length) : undefined,
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      cod: codNum,
      content: content.trim() || order.order_number,
      observation: observation.trim(),
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
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                <p className="text-xs font-semibold text-blue-700 mb-1">AWB generat</p>
                <p className="text-lg font-mono font-bold text-blue-900">{orderData.fan_courier_awb_number}</p>
              </div>

              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-muted/40 hover:bg-muted text-sm font-semibold text-foreground transition-colors disabled:opacity-50"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading ? "Se descarca..." : "Descarca eticheta PDF"}
              </button>

              <div className="pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {deleting ? "Se sterge..." : "Sterge AWB"}
                </button>
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
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={e => setRecipientEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
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
                        value={parcels}
                        onChange={e => setParcels(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] text-muted-foreground mb-2">Dimensiuni cm (optional)</p>
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

              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                {creating ? "Se genereaza AWB..." : "Genereaza AWB FAN Courier"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
