"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Package, Loader2, Download, Trash2 } from "lucide-react";
import { createSamedayAwbAction, deleteSamedayAwbAction } from "@/lib/actions/sameday.actions";
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
};

export function SamedayAwbModal({
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
    sameday_awb_number?: string | null;
  };

  const hasAwb = !!orderData.sameday_awb_number;
  const addr = order.shipping_address as ShippingAddress | null;

  const [weight, setWeight] = useState("1");
  const [packageNumber, setPackageNumber] = useState("1");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [cod, setCod] = useState("0");
  const [insuredValue, setInsuredValue] = useState("0");
  const [observation, setObservation] = useState("");

  const [recipientName, setRecipientName] = useState(order.customer_name);
  const [recipientPhone, setRecipientPhone] = useState(order.customer_phone);
  const [recipientCounty, setRecipientCounty] = useState(addr?.county ?? "");
  const [recipientCity, setRecipientCity] = useState(addr?.city ?? "");
  const [recipientAddress, setRecipientAddress] = useState(
    [addr?.street ?? addr?.address, addr?.street_no].filter(Boolean).join(" nr. ") ?? ""
  );
  const [recipientPostalCode, setRecipientPostalCode] = useState(addr?.postal_code ?? "");
  const [labelFormat, setLabelFormat] = useState<"A6" | "A4">("A6");

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (open && !hasAwb) {
      if (order.payment_method === "cash_on_delivery") {
        setCod(String(Number(order.total).toFixed(2)));
        setInsuredValue(String(Number(order.total).toFixed(2)));
      } else {
        setCod("0");
        setInsuredValue("0");
      }
    }
  }, [open, hasAwb, order.payment_method, order.total]);

  async function handleCreate() {
    if (!recipientName.trim()) return toast.error("Numele destinatarului este obligatoriu");
    if (!recipientPhone.trim()) return toast.error("Telefonul destinatarului este obligatoriu");
    if (!recipientCounty.trim()) return toast.error("Judetul destinatarului este obligatoriu");
    if (!recipientCity.trim()) return toast.error("Localitatea destinatarului este obligatorie");
    if (!recipientAddress.trim()) return toast.error("Adresa destinatarului este obligatorie");
    const weightNum = parseFloat(weight) || 0;
    if (weightNum <= 0) return toast.error("Greutatea trebuie sa fie mai mare decat 0");

    setCreating(true);
    const lockerId = addr?.delivery_type === "locker" && addr?.locker_id
      ? parseInt(addr.locker_id)
      : undefined;
    const result = await createSamedayAwbAction(businessId, order.id, {
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      recipientCounty: recipientCounty.trim(),
      recipientCity: recipientCity.trim(),
      recipientAddress: recipientAddress.trim(),
      recipientPostalCode: recipientPostalCode.trim(),
      packageType: 0,
      packageNumber: parseInt(packageNumber) || 1,
      weightKg: weightNum,
      length: length ? parseInt(length) : undefined,
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      cashOnDelivery: parseFloat(cod) || 0,
      insuredValue: parseFloat(insuredValue) || 0,
      observation: observation.trim(),
      clientInternalReference: order.order_number,
      lockerId: lockerId && !isNaN(lockerId) ? lockerId : undefined,
    });
    setCreating(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(`AWB Sameday ${result.awbNumber} creat`);
      onSuccess();
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteSamedayAwbAction(businessId, order.id);
    setDeleting(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("AWB Sameday sters");
      onSuccess();
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const url = `/api/sameday/awb?orderId=${order.id}&businessId=${businessId}&format=${labelFormat}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? "Eroare la descarcarea PDF");
        return;
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `awb-sameday-${orderData.sameday_awb_number}-${labelFormat}.pdf`;
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
            <img src="/integrations/sameday.svg" alt="Sameday" className="h-5 w-auto" />
            <div>
              <p className="text-sm font-semibold text-foreground">AWB Sameday</p>
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
                <p className="text-lg font-mono font-bold text-blue-900">{orderData.sameday_awb_number}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Format eticheta</label>
                <div className="flex gap-2">
                  {(["A6", "A4"] as const).map(fmt => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setLabelFormat(fmt)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        labelFormat === fmt
                          ? "bg-primary text-white border-primary"
                          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-muted/40 hover:bg-muted text-sm font-semibold text-foreground transition-colors disabled:opacity-50"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading ? "Se descarca..." : `Descarca eticheta ${labelFormat} PDF`}
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
                        value={recipientCity}
                        onChange={e => setRecipientCity(e.target.value)}
                        placeholder="ex: Cluj-Napoca"
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Adresa *</label>
                    <input
                      type="text"
                      value={recipientAddress}
                      onChange={e => setRecipientAddress(e.target.value)}
                      placeholder="Strada, nr., bl., ap."
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Cod postal</label>
                    <input
                      type="text"
                      value={recipientPostalCode}
                      onChange={e => setRecipientPostalCode(e.target.value)}
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
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Greutate totala (kg) *</label>
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
                        value={packageNumber}
                        onChange={e => setPackageNumber(e.target.value)}
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
                </div>
              </div>

              {/* Optiuni */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Optiuni</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
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
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Valoare asigurata (lei)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={insuredValue}
                        onChange={e => setInsuredValue(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
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
                {creating ? "Se genereaza AWB..." : "Genereaza AWB Sameday"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
