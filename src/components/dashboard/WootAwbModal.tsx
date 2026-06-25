"use client";

import { useState, useEffect, useTransition } from "react";
import { X, Loader2, Package, Truck, ChevronRight, Download, AlertCircle, CheckCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getWootPrices, createWootAwb, cancelWootAwb } from "@/lib/actions/woot.actions";
import type { WootPriceResult, WootParcel, WootCounty, WootCity } from "@/lib/woot";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

interface ShippingAddress {
  county?: string;
  city?: string;
  address?: string;
  woot_service_id?: number;
  woot_courier_name?: string;
  woot_service_name?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
}

const inputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function WootAwbModal({ open, onClose, order, businessId, onSuccess }: Props) {
  const addr = order.shipping_address as ShippingAddress;
  const isCod = (order.payment_method ?? "") === "cash_on_delivery" && order.payment_status === "unpaid";

  // Receiver state
  const [counties, setCounties] = useState<WootCounty[]>([]);
  const [cities, setCities] = useState<WootCity[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [countyId, setCountyId] = useState(0);
  const [cityId, setCityId] = useState(0);
  const [receiverAddress, setReceiverAddress] = useState(addr.address ?? "");
  const [receiverPhone, setReceiverPhone] = useState(order.customer_phone ?? "");
  const [receiverEmail, setReceiverEmail] = useState(order.customer_email ?? "");

  // Parcel state
  const [parcelType, setParcelType] = useState<"package" | "envelope">("package");
  const [weight, setWeight] = useState("1");
  const [length, setLength] = useState("30");
  const [width, setWidth] = useState("20");
  const [height, setHeight] = useState("10");
  const [content, setContent] = useState("Produse comerciale");
  const [repayment, setRepayment] = useState(isCod ? String(Math.round(Number(order.total))) : "0");
  const [opdEnabled, setOpdEnabled] = useState(false);

  // Prices state
  const [prices, setPrices] = useState<WootPriceResult[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedService, setSelectedService] = useState<WootPriceResult | null>(null);
  const [calculatingPrices, setCalculatingPrices] = useState(false);
  const [pricesError, setPricesError] = useState("");
  const [pricesFetched, setPricesFetched] = useState(false);

  // Create state
  const [creating, startCreate] = useTransition();
  const [cancelling, startCancel] = useTransition();

  const hasAwb = !!order.woot_awb_number;

  // Load counties on open
  useEffect(() => {
    if (!open) return;
    fetch("/api/woot/counties")
      .then(r => r.json())
      .then((data: WootCounty[]) => {
        setCounties(data);
        // Auto-match county by name
        const orderCounty = addr.county ?? "";
        const match = data.find(c =>
          c.name.toLowerCase().includes(orderCounty.toLowerCase()) ||
          orderCounty.toLowerCase().includes(c.name.toLowerCase())
        );
        if (match) setCountyId(match.id);
      })
      .catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load cities when county changes
  useEffect(() => {
    if (!countyId) { setCities([]); setCityId(0); return; }
    setLoadingCities(true);
    fetch(`/api/woot/cities?county_id=${countyId}`)
      .then(r => r.json())
      .then((data: WootCity[]) => {
        setCities(data);
        setLoadingCities(false);
        // Auto-match city
        const orderCity = addr.city ?? "";
        const match = data.find(c =>
          c.name.toLowerCase().includes(orderCity.toLowerCase()) ||
          orderCity.toLowerCase().includes(c.name.toLowerCase())
        );
        if (match) setCityId(match.id);
      })
      .catch(() => setLoadingCities(false));
  }, [countyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPrices([]);
      setSelectedServiceId(null);
      setSelectedService(null);
      setPricesError("");
      setPricesFetched(false);
    }
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [open, onClose]);

  function buildParcels(): WootParcel[] {
    return [{
      type: parcelType,
      content,
      ...(parcelType === "package" ? {
        length: Number(length),
        width: Number(width),
        height: Number(height),
        weight: Number(weight),
      } : {}),
    }];
  }

  function buildReceiver() {
    return {
      contact: order.customer_name,
      phone: receiverPhone,
      email: receiverEmail || undefined,
      country_id: 189,
      city_id: cityId,
      address: receiverAddress,
    };
  }

  async function handleCalculate() {
    if (!cityId) { toast.error("Selecteaza orasul destinatarului."); return; }
    if (!receiverAddress.trim()) { toast.error("Introdu adresa destinatarului."); return; }
    if (parcelType === "package" && (!weight || !length || !width || !height)) {
      toast.error("Completeaza dimensiunile coletului.");
      return;
    }

    setCalculatingPrices(true);
    setPricesError("");
    setPrices([]);
    setPricesFetched(false);
    setSelectedServiceId(null);
    setSelectedService(null);

    const rep = Number(repayment);
    const result = await getWootPrices(
      businessId,
      buildReceiver(),
      buildParcels(),
      rep > 0 ? rep : undefined
    );

    setCalculatingPrices(false);
    if (!result.success) {
      setPricesError(result.error ?? "Eroare la calculul preturilor.");
      return;
    }
    const sorted = (result.prices ?? []).sort((a, b) => a.final_total - b.final_total);
    setPrices(sorted);
    setPricesFetched(true);
    if (sorted.length === 0) setPricesError("Niciun serviciu disponibil pentru aceasta ruta.");
    // Pre-select the courier the customer chose at checkout, if still offered.
    else if (addr.woot_service_id) {
      const chosen = sorted.find((p) => p.service_id === addr.woot_service_id);
      if (chosen) { setSelectedServiceId(chosen.service_id); setSelectedService(chosen); }
    }
  }

  function handleSelectService(p: WootPriceResult) {
    setSelectedServiceId(p.service_id);
    setSelectedService(p);
  }

  function handleCreate() {
    if (!selectedService) { toast.error("Selecteaza un curier."); return; }
    startCreate(async () => {
      const rep = Number(repayment);
      const result = await createWootAwb(
        businessId,
        order.id,
        selectedService.service_id,
        `${selectedService.courier_name} — ${selectedService.service_name}`,
        buildReceiver(),
        buildParcels(),
        rep > 0 ? rep : undefined,
        { opd: opdEnabled || undefined }
      );
      if (!result.success) {
        toast.error(result.error ?? "Eroare la crearea AWB.");
        return;
      }
      toast.success(`AWB creat: ${result.awbNumber ?? "—"}`);
      onSuccess();
      onClose();
    });
  }

  function handleCancel() {
    if (!order.woot_order_id) return;
    startCancel(async () => {
      const result = await cancelWootAwb(businessId, order.id, order.woot_order_id!);
      if (!result.success) { toast.error(result.error ?? "Eroare la anulare."); return; }
      toast.success("AWB anulat.");
      onSuccess();
      onClose();
    });
  }

  function handleDownload(format: "A4" | "A6") {
    window.open(`/api/woot/awb?orderId=${order.id}&businessId=${businessId}&format=${format}`, "_blank");
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background z-10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Truck className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {hasAwb ? "AWB Woot" : "Creeaza AWB"}
                </p>
                <p className="text-xs text-muted-foreground">{order.order_number} — {order.customer_name}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* If AWB already exists */}
            {hasAwb ? (
              <div className="space-y-4">
                <div className="p-4 bg-success/5 border border-success/20 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                    <p className="text-sm font-semibold text-success">AWB generat</p>
                  </div>
                  <p className="text-xs text-success">Nr. AWB: <strong className="font-mono">{order.woot_awb_number}</strong></p>
                  {order.woot_service_name && (
                    <p className="text-xs text-success mt-0.5">Curier: {order.woot_service_name}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => handleDownload("A4")}>
                    <Download />
                    Descarca A4
                  </Button>
                  <Button variant="outline" onClick={() => handleDownload("A6")}>
                    <Download />
                    Descarca A6
                  </Button>
                  <Button variant="destructive" onClick={handleCancel} disabled={cancelling} className="ml-auto">
                    {cancelling ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    Anuleaza AWB
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Courier chosen by the customer at checkout */}
                {addr.woot_courier_name && (
                  <div className="flex items-start gap-2 p-3 bg-info/5 border border-info/20 rounded-lg">
                    <Truck className="h-4 w-4 text-info mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-info">
                      Clientul a ales la comanda: <strong>{addr.woot_courier_name}</strong>
                      {addr.woot_service_name ? ` — ${addr.woot_service_name}` : ""}. Apasa
                      &nbsp;„Calculeaza preturi" ca sa se preselecteze automat.
                    </p>
                  </div>
                )}

                {/* Receiver section */}
                <section className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Destinatar</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Judet</label>
                      <select value={countyId || ""} onChange={e => { setCountyId(Number(e.target.value)); setCityId(0); }} className={inputCls}>
                        <option value="">Selecteaza judetul</option>
                        {counties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Oras</label>
                      <select value={cityId || ""} onChange={e => setCityId(Number(e.target.value))} disabled={!countyId || loadingCities} className={inputCls}>
                        <option value="">{loadingCities ? "Se incarca..." : "Selecteaza orasul"}</option>
                        {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Adresa</label>
                    <input value={receiverAddress} onChange={e => setReceiverAddress(e.target.value)} className={inputCls} placeholder="Strada, nr." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Telefon</label>
                      <input value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} className={inputCls} placeholder="+40721000000" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Email (optional)</label>
                      <input value={receiverEmail} onChange={e => setReceiverEmail(e.target.value)} className={inputCls} placeholder="client@email.ro" />
                    </div>
                  </div>
                </section>

                {/* Parcel section */}
                <section className="space-y-3 pt-4 border-t border-border">
                  <p className="text-sm font-semibold text-foreground">Detalii colet</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setParcelType("package")}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${parcelType === "package" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"}`}>
                      <Package className="h-4 w-4" />Pachet
                    </button>
                    <button type="button" onClick={() => setParcelType("envelope")}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${parcelType === "envelope" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"}`}>
                      <Package className="h-4 w-4" />Plic
                    </button>
                  </div>

                  {parcelType === "package" && (
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "Greutate (kg)", value: weight, set: setWeight },
                        { label: "Lungime (cm)", value: length, set: setLength },
                        { label: "Latime (cm)", value: width, set: setWidth },
                        { label: "Inaltime (cm)", value: height, set: setHeight },
                      ].map(({ label, value, set: setter }) => (
                        <div key={label}>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                          <input type="number" min="0.1" step="0.1" value={value}
                            onChange={e => setter(e.target.value)} className={inputCls} />
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Continut colet</label>
                    <input value={content} onChange={e => setContent(e.target.value)} className={inputCls} placeholder="Produse comerciale" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Ramburs (RON) {!isCod && <span className="text-muted-foreground/60">— plata online</span>}
                      </label>
                      <input type="number" min="0" step="0.01" value={repayment}
                        onChange={e => setRepayment(e.target.value)} className={inputCls} />
                    </div>
                    <div className="flex items-end pb-0.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => setOpdEnabled(v => !v)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${opdEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}>
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${opdEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                        <span className="text-xs font-medium text-foreground">Deschidere la livrare</span>
                      </label>
                    </div>
                  </div>
                </section>

                {/* Calculate button */}
                <button type="button" onClick={handleCalculate} disabled={calculatingPrices}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold border-2 border-primary text-primary rounded-xl hover:bg-primary/5 transition-colors disabled:opacity-60">
                  {calculatingPrices ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                  {calculatingPrices ? "Se calculeaza..." : "Calculeaza preturi curieri"}
                </button>

                {/* Error */}
                {pricesError && (
                  <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-destructive">{pricesError}</p>
                  </div>
                )}

                {/* Price results */}
                {pricesFetched && prices.length > 0 && (
                  <section className="space-y-2 pt-1 border-t border-border">
                    <p className="text-sm font-semibold text-foreground">Alege curier</p>
                    <div className="space-y-2">
                      {prices.map(p => {
                        const selected = selectedServiceId === p.service_id;
                        return (
                          <button key={p.service_id} type="button" onClick={() => handleSelectService(p)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
                            style={selected
                              ? { borderColor: "var(--color-primary)", backgroundColor: "var(--color-primary)/5" }
                              : { borderColor: "var(--color-border)", backgroundColor: "transparent" }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground">{p.courier_name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{p.service_name}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-base font-black text-foreground">{p.final_total.toFixed(2)} RON</p>
                              <p className="text-[10px] text-muted-foreground">cu TVA</p>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${selected ? "border-primary bg-primary" : "border-border"}`}>
                              {selected && <CheckCircle className="h-3 w-3 text-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {selectedService && (
                      <Button onClick={handleCreate} disabled={creating} size="lg" className="w-full mt-3">
                        {creating ? <Loader2 className="animate-spin" /> : <ChevronRight />}
                        {creating
                          ? "Se creeaza AWB..."
                          : `Creeaza AWB — ${selectedService.courier_name} — ${selectedService.final_total.toFixed(2)} RON`}
                      </Button>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
