"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Package, Loader2, Download, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createCargusAwbAction, deleteCargusAwbAction } from "@/lib/actions/cargus.actions";
import { getCargusServiceId } from "@/lib/cargus";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type ShippingAddress = {
  name?: string;
  county?: string;
  city?: string;
  address?: string;
  street?: string;
  postal_code?: string;
};

export function CargusAwbModal({
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
    cargus_awb_number?: string | null;
    cargus_service_name?: string | null;
  };

  const hasAwb = !!orderData.cargus_awb_number;
  const addr = order.shipping_address as ShippingAddress | null;

  // Form state
  const [weight, setWeight] = useState("1");
  const [parcels, setParcels] = useState("1");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [cashRepayment, setCashRepayment] = useState("");
  const [openPackage, setOpenPackage] = useState(false);
  const [observations, setObservations] = useState("");
  const [packageContent, setPackageContent] = useState("");

  const [recipientName, setRecipientName] = useState(order.customer_name);
  const [recipientPhone, setRecipientPhone] = useState(order.customer_phone);
  const [recipientEmail, setRecipientEmail] = useState(order.customer_email ?? "");
  const [recipientCounty, setRecipientCounty] = useState(addr?.county ?? "");
  const [recipientCity, setRecipientCity] = useState(addr?.city ?? "");
  const [recipientAddress, setRecipientAddress] = useState(addr?.address ?? addr?.street ?? "");
  const [recipientPostalCode, setRecipientPostalCode] = useState(addr?.postal_code ?? "");

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<0 | 1 | null>(null);

  // Pre-fill COD for cash on delivery orders
  useEffect(() => {
    if (open && !hasAwb) {
      if (order.payment_method === "cash_on_delivery") {
        setCashRepayment(String(Number(order.total).toFixed(2)));
      } else {
        setCashRepayment("0");
      }
    }
  }, [open, hasAwb, order.payment_method, order.total]);

  const weightNum = parseFloat(weight) || 1;
  const service = getCargusServiceId(weightNum);

  async function handleCreate() {
    if (!recipientName.trim()) return toast.error("Numele destinatarului este obligatoriu");
    if (!recipientPhone.trim()) return toast.error("Telefonul destinatarului este obligatoriu");
    if (!recipientCounty.trim()) return toast.error("Judetul destinatarului este obligatoriu");
    if (!recipientCity.trim()) return toast.error("Localitatea destinatarului este obligatorie");
    if (weightNum <= 0) return toast.error("Greutatea trebuie sa fie mai mare decat 0");

    setCreating(true);
    const result = await createCargusAwbAction(businessId, order.id, {
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      recipientEmail: recipientEmail.trim(),
      recipientCounty: recipientCounty.trim(),
      recipientCity: recipientCity.trim(),
      recipientAddress: recipientAddress.trim(),
      recipientPostalCode: recipientPostalCode.trim(),
      parcels: parseInt(parcels) || 1,
      totalWeightKg: weightNum,
      cashRepayment: parseFloat(cashRepayment) || 0,
      openPackage,
      observations: observations.trim(),
      packageContent: packageContent.trim(),
      customString: order.order_number,
      parcelsDetails: [{
        weight: weightNum,
        length: length ? parseInt(length) : undefined,
        width: width ? parseInt(width) : undefined,
        height: height ? parseInt(height) : undefined,
      }],
    });
    setCreating(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(`AWB Cargus ${result.barCode} creat — ${result.serviceName}`);
      onSuccess();
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteCargusAwbAction(businessId, order.id);
    setDeleting(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("AWB Cargus sters");
      onSuccess();
    }
  }

  async function handleDownload(format: 0 | 1) {
    setDownloadingFormat(format);
    try {
      const url = `/api/cargus/awb?orderId=${order.id}&businessId=${businessId}&format=${format}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? "Eroare la descarcarea PDF");
        return;
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = format === 1
        ? `awb-cargus-${orderData.cargus_awb_number}-eticheta.pdf`
        : `awb-cargus-${orderData.cargus_awb_number}-a4.pdf`;
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
            <img src="/integrations/cargus.svg" alt="Cargus" className="h-5 w-auto" />
            <div>
              <p className="text-sm font-semibold text-foreground">AWB Cargus</p>
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
                <p className="text-lg font-mono font-bold text-foreground">{orderData.cargus_awb_number}</p>
                {orderData.cargus_service_name && (
                  <p className="text-xs text-info mt-1">{orderData.cargus_service_name}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" size="lg" onClick={() => handleDownload(0)} disabled={downloadingFormat !== null} className="w-full">
                  {downloadingFormat === 0 ? <Loader2 className="animate-spin" /> : <Download />}
                  Descarca A4
                </Button>
                <Button variant="outline" size="lg" onClick={() => handleDownload(1)} disabled={downloadingFormat !== null} className="w-full">
                  {downloadingFormat === 1 ? <Loader2 className="animate-spin" /> : <ExternalLink />}
                  Eticheta 10x14
                </Button>
              </div>

              <div className="pt-2 border-t border-border">
                <Button variant="destructive" size="lg" onClick={handleDelete} disabled={deleting} className="w-full">
                  {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {deleting ? "Se sterge..." : "Sterge AWB"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  AWB-ul poate fi sters doar daca nu are niciun checkpoint Cargus
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
                        value={recipientCity}
                        onChange={e => setRecipientCity(e.target.value)}
                        placeholder="ex: Cluj-Napoca"
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Adresa</label>
                      <input
                        type="text"
                        value={recipientAddress}
                        onChange={e => setRecipientAddress(e.target.value)}
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
                        max="15"
                        value={parcels}
                        onChange={e => setParcels(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Dimensiuni (optionale) */}
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-2">Dimensiuni cm (optional, pentru calcul volumetric)</p>
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

                  {/* Service auto-select */}
                  <div className={cn(
                    "px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2",
                    "bg-primary/5 border border-primary/20 text-primary"
                  )}>
                    <Package className="h-3.5 w-3.5 flex-shrink-0" />
                    Serviciu: <span className="font-bold">{service.name}</span>
                    <span className="text-primary/60">
                      ({weightNum <= 31 ? "≤31kg" : weightNum <= 50 ? "31-50kg" : ">50kg"})
                    </span>
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
                      value={cashRepayment}
                      onChange={e => setCashRepayment(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <p className="text-xs font-semibold text-foreground">Deschidere la livrare</p>
                      <p className="text-[11px] text-muted-foreground">Destinatarul poate verifica coletul inainte de acceptare</p>
                    </div>
                    <Switch checked={openPackage} onCheckedChange={setOpenPackage} className="shrink-0" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Continut colet</label>
                    <input
                      type="text"
                      value={packageContent}
                      onChange={e => setPackageContent(e.target.value)}
                      placeholder="ex: Haine, Electronice..."
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Observatii</label>
                    <textarea
                      value={observations}
                      onChange={e => setObservations(e.target.value)}
                      rows={2}
                      placeholder="Observatii pentru curier..."
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors resize-none"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleCreate} disabled={creating} size="lg" className="w-full">
                {creating ? <Loader2 className="animate-spin" /> : <Package />}
                {creating ? "Se genereaza AWB..." : "Genereaza AWB Cargus"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
