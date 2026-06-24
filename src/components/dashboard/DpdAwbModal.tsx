"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Package, Loader2, Download, Trash2 } from "lucide-react";
import { createDpdShipmentAction, cancelDpdShipmentAction } from "@/lib/actions/dpd.actions";
import { euCountryByIso2 } from "@/lib/eu-countries";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type ShippingAddress = {
  name?: string;
  city?: string;
  address?: string;
  street?: string;
  street_no?: string;
  postal_code?: string;
};

export function DpdAwbModal({
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
    dpd_shipment_id?: number | null;
    dpd_awb_number?: string | null;
  };

  const hasAwb = !!orderData.dpd_awb_number;
  const addr = order.shipping_address as (ShippingAddress & { country?: string; postal_code?: string }) | null;
  // International order? The destination service is auto-discovered server-side.
  const intlCountry = euCountryByIso2(addr?.country);

  const [weight, setWeight] = useState("1");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [cashOnDelivery, setCashOnDelivery] = useState("0");
  const [shipmentNote, setShipmentNote] = useState("");
  const [content, setContent] = useState(() => {
    const items = (Array.isArray(order.items) ? order.items : []) as { name?: string }[];
    const names = items.map((i) => i?.name).filter(Boolean).join(", ");
    return (names || "Produse").slice(0, 50);
  });

  const [recipientName, setRecipientName] = useState(order.customer_name);
  const [recipientPhone, setRecipientPhone] = useState(order.customer_phone);
  const [recipientEmail, setRecipientEmail] = useState(order.customer_email ?? "");
  const [recipientCity, setRecipientCity] = useState(addr?.city ?? "");
  const [recipientStreet, setRecipientStreet] = useState(addr?.street ?? addr?.address ?? "");
  const [recipientStreetNo, setRecipientStreetNo] = useState(addr?.street_no ?? "");
  const [recipientAddressNote, setRecipientAddressNote] = useState("");

  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<"A4" | "A6" | null>(null);

  useEffect(() => {
    if (open && !hasAwb) {
      if (order.payment_method === "cash_on_delivery") {
        setCashOnDelivery(String(Number(order.total).toFixed(2)));
      } else {
        setCashOnDelivery("0");
      }
    }
  }, [open, hasAwb, order.payment_method, order.total]);

  async function handleCreate() {
    if (!recipientName.trim()) return toast.error("Numele destinatarului este obligatoriu");
    if (!recipientPhone.trim()) return toast.error("Telefonul destinatarului este obligatoriu");
    if (!recipientCity.trim()) return toast.error("Orasul destinatarului este obligatoriu");
    if (intlCountry) {
      // DPD: email is mandatory for international shipments, and the address goes
      // into addressLine1 (required for foreign addresses).
      if (!recipientStreet.trim()) return toast.error("Adresa destinatarului este obligatorie pentru livrarea internationala");
      if (!recipientEmail.trim()) return toast.error("Email-ul destinatarului este obligatoriu pentru livrarea internationala");
    }
    if (!content.trim()) return toast.error("Continutul coletului este obligatoriu");
    const weightNum = parseFloat(weight) || 0;
    if (weightNum <= 0) return toast.error("Greutatea trebuie sa fie mai mare decat 0");

    setCreating(true);
    const result = await createDpdShipmentAction(businessId, order.id, {
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      recipientEmail: recipientEmail.trim(),
      recipientCity: recipientCity.trim(),
      recipientStreet: recipientStreet.trim(),
      recipientStreetNo: recipientStreetNo.trim(),
      recipientAddressNote: recipientAddressNote.trim(),
      weightKg: weightNum,
      length: length ? parseInt(length) : undefined,
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      cashOnDelivery: parseFloat(cashOnDelivery) || 0,
      ref1: order.order_number,
      shipmentNote: shipmentNote.trim(),
      content: content.trim(),
    });
    setCreating(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(`AWB DPD ${result.barcode} creat`);
      onSuccess();
    }
  }

  async function handleCancel() {
    setCancelling(true);
    const result = await cancelDpdShipmentAction(businessId, order.id);
    setCancelling(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Expeditie DPD anulata");
      onSuccess();
    }
  }

  async function handleDownload(format: "A4" | "A6") {
    setDownloadingFormat(format);
    try {
      const url = `/api/dpd/awb?orderId=${order.id}&businessId=${businessId}&format=${format}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? "Eroare la descarcarea PDF");
        return;
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = format === "A4"
        ? `awb-dpd-${orderData.dpd_awb_number}-a4.pdf`
        : `awb-dpd-${orderData.dpd_awb_number}-eticheta.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      toast.error("Eroare la descarcarea AWB");
    } finally {
      setDownloadingFormat(null);
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
            <img src="/integrations/dpd.svg" alt="DPD" className="h-5 w-auto" />
            <div>
              <p className="text-sm font-semibold text-foreground">AWB DPD</p>
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
              <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-700 mb-1">AWB generat</p>
                <p className="text-lg font-mono font-bold text-red-900">{orderData.dpd_awb_number}</p>
                {orderData.dpd_shipment_id && (
                  <p className="text-xs text-red-600 mt-1">Shipment ID: {orderData.dpd_shipment_id}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleDownload("A4")}
                  disabled={downloadingFormat !== null}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-muted/40 hover:bg-muted text-sm font-semibold text-foreground transition-colors disabled:opacity-50"
                >
                  {downloadingFormat === "A4" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Descarca A4
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload("A6")}
                  disabled={downloadingFormat !== null}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-muted/40 hover:bg-muted text-sm font-semibold text-foreground transition-colors disabled:opacity-50"
                >
                  {downloadingFormat === "A6" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Eticheta A6
                </button>
              </div>

              <div className="pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {cancelling ? "Se anuleaza..." : "Anuleaza expeditia"}
                </button>
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  Expeditia poate fi anulata doar inainte ca pachetul sa fie preluat de curier
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
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Oras/Localitate *</label>
                    <input
                      type="text"
                      value={recipientCity}
                      onChange={e => setRecipientCity(e.target.value)}
                      placeholder="ex: Cluj-Napoca"
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Strada</label>
                      <input
                        type="text"
                        value={recipientStreet}
                        onChange={e => setRecipientStreet(e.target.value)}
                        placeholder="ex: Strada Florilor"
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Nr.</label>
                      <input
                        type="text"
                        value={recipientStreetNo}
                        onChange={e => setRecipientStreetNo(e.target.value)}
                        placeholder="ex: 12A"
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Detalii adresa</label>
                    <input
                      type="text"
                      value={recipientAddressNote}
                      onChange={e => setRecipientAddressNote(e.target.value)}
                      placeholder="ex: Bloc A3, Ap 10, Interfon 304"
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Colet */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Detalii colet</p>
                <div className="space-y-3">
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
                    Serviciu: <span className="font-bold">{intlCountry ? `DPD International (${intlCountry.name})` : "DPD Classic Romania"}</span>
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
                      value={cashOnDelivery}
                      onChange={e => setCashOnDelivery(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Continut colet *</label>
                    <input
                      type="text"
                      value={content}
                      onChange={e => setContent(e.target.value)}
                      maxLength={50}
                      placeholder="ex: Imbracaminte, Accesorii..."
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Descrierea continutului (obligatorie de DPD, mai ales pentru vama internationala).</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Observatii</label>
                    <textarea
                      value={shipmentNote}
                      onChange={e => setShipmentNote(e.target.value)}
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
                {creating ? "Se genereaza AWB..." : "Genereaza AWB DPD"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
