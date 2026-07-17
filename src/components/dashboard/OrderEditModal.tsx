"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  X, Pencil, Loader2, Plus, Minus, Trash2, Search, AlertTriangle,
  Package, Info, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateOrderDetails, searchOrderProducts } from "@/lib/actions/order.actions";
import { deleteSamedayAwbAction } from "@/lib/actions/sameday.actions";
import { deleteCargusAwbAction } from "@/lib/actions/cargus.actions";
import { cancelDpdShipmentAction } from "@/lib/actions/dpd.actions";
import { deleteFanCourierAwbAction } from "@/lib/actions/fancourier.actions";
import { cancelWootAwb } from "@/lib/actions/woot.actions";
import { detachCOAwb } from "@/lib/actions/colete.actions";
import { formatPrice } from "@/lib/utils/format";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

interface ShippingAddress {
  county?: string;
  city?: string;
  address?: string;
  postal_code?: string;
  delivery_type?: string;
  locker_name?: string;
  courier?: string;
}

interface PickerProduct {
  id: string;
  name: string;
  price: number;
  stock_quantity: number | null;
  track_inventory: boolean;
  is_bundle: boolean;
}

interface AddedLine extends PickerProduct {
  quantity: number;
}

const inputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function OrderEditModal({ open, onClose, order, businessId, onSaved }: {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSaved: () => void;
}) {
  const router = useRouter();
  const addr = (order.shipping_address ?? {}) as ShippingAddress;

  // ── Form state (re-seeded every time the modal opens) ──
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("");
  const [postal, setPostal] = useState("");
  const [added, setAdded] = useState<AddedLine[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, startSave] = useTransition();
  const [cancellingKey, setCancellingKey] = useState<string | null>(null);
  const [cancelPending, startCancel] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(order.customer_name ?? "");
    setPhone(order.customer_phone ?? "");
    setEmail(order.customer_email ?? "");
    setAddress(addr.address ?? "");
    setCity(addr.city ?? "");
    setCounty(addr.county ?? "");
    setPostal(addr.postal_code ?? "");
    setAdded([]);
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order.id]);

  // Debounced product search (also fires on open with an empty query → top products).
  useEffect(() => {
    if (!open) return;
    setSearching(true);
    const t = setTimeout(() => {
      searchOrderProducts(businessId, query).then((res) => {
        setResults("error" in res ? [] : res.products);
        setSearching(false);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [open, query, businessId]);

  // ── Active AWBs on this order (cancel before regenerating) ──
  const activeAwbs = useMemo(() => {
    const list: { key: string; label: string; awb: string; manualOnly?: boolean }[] = [];
    if (order.woot_awb_number) list.push({ key: "woot", label: "Woot", awb: order.woot_awb_number });
    if (order.sameday_awb_number) list.push({ key: "sameday", label: "Sameday", awb: order.sameday_awb_number });
    if (order.cargus_awb_number) list.push({ key: "cargus", label: "Cargus", awb: order.cargus_awb_number });
    if (order.dpd_awb_number) list.push({ key: "dpd", label: "DPD", awb: order.dpd_awb_number });
    if (order.fan_courier_awb_number) list.push({ key: "fan_courier", label: "FAN Courier", awb: order.fan_courier_awb_number });
    if (order.colete_awb_number) list.push({ key: "colete", label: "Colete Online", awb: order.colete_awb_number, manualOnly: true });
    return list;
  }, [order]);

  const addedSum = added.reduce((s, l) => s + l.price * l.quantity, 0);
  const newTotal = Math.round((Number(order.total) + addedSum) * 100) / 100;
  const isPaid = order.payment_status === "paid";
  const hasInvoice = !!(order.smartbill_invoice_number || order.oblio_invoice_number || order.fgo_invoice_number);
  const isLocker = addr.delivery_type === "locker";

  function addProduct(p: PickerProduct) {
    setAdded((prev) => {
      const existing = prev.find((l) => l.id === p.id);
      if (existing) return prev.map((l) => (l.id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { ...p, quantity: 1 }];
    });
  }

  function setQty(id: string, qty: number) {
    setAdded((prev) => prev
      .map((l) => (l.id === id ? { ...l, quantity: qty } : l))
      .filter((l) => l.quantity > 0));
  }

  function handleCancelAwb(key: string) {
    if (key === "woot" && !order.woot_order_id) {
      toast.error("Comanda nu are ID-ul expedierii Woot. Anuleaza AWB-ul din contul Woot, apoi contacteaza suportul.");
      return;
    }
    setCancellingKey(key);
    startCancel(async () => {
      let res: { success?: boolean; error?: string };
      if (key === "woot") res = await cancelWootAwb(businessId, order.id, String(order.woot_order_id ?? ""));
      else if (key === "sameday") res = await deleteSamedayAwbAction(businessId, order.id);
      else if (key === "cargus") res = await deleteCargusAwbAction(businessId, order.id);
      else if (key === "dpd") res = await cancelDpdShipmentAction(businessId, order.id);
      else if (key === "fan_courier") res = await deleteFanCourierAwbAction(businessId, order.id);
      else res = await detachCOAwb(businessId, order.id);
      setCancellingKey(null);
      if (res.error) { toast.error(res.error); return; }
      toast.success(key === "colete" ? "AWB detasat. Nu uita sa anulezi expedierea si in contul Colete Online." : "AWB anulat.");
      router.refresh();
    });
  }

  function handleSave() {
    startSave(async () => {
      const res = await updateOrderDetails(order.id, {
        customer_name: name,
        customer_phone: phone,
        customer_email: email,
        address,
        city,
        county,
        postal_code: postal,
        added_items: added.map((l) => ({ product_id: l.id, quantity: l.quantity })),
      });
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Comanda a fost actualizata.");
      if (activeAwbs.length === 0 && addr.courier) {
        toast.message("Poti genera acum AWB-ul cu datele noi, din sectiunea curierului.");
      }
      onSaved();
    });
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
                <Pencil className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Editeaza comanda</p>
                <p className="text-xs text-muted-foreground">{order.order_number} — {order.customer_name}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Active AWB — must be cancelled so the courier gets the new data */}
            {activeAwbs.length > 0 && (
              <div className="p-4 bg-warning/5 border border-warning/20 rounded-xl space-y-3">
                <div className="flex items-start gap-2">
                  <Truck className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-foreground leading-relaxed">
                    Comanda are AWB generat. Modificarile <strong>nu ajung la curier</strong> pe AWB-ul existent —
                    anuleaza-l aici, salveaza modificarile, apoi genereaza un AWB nou din sectiunea curierului.
                  </p>
                </div>
                {activeAwbs.map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                    <p className="text-sm text-foreground min-w-0 truncate">
                      {a.label}: <span className="font-mono font-semibold">{a.awb}</span>
                    </p>
                    <Button variant="destructive" size="sm" className="shrink-0"
                      disabled={cancelPending}
                      onClick={() => handleCancelAwb(a.key)}>
                      {cancelPending && cancellingKey === a.key ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      {a.manualOnly ? "Detaseaza AWB" : "Anuleaza AWB"}
                    </Button>
                  </div>
                ))}
                {activeAwbs.some((a) => a.manualOnly) && (
                  <p className="text-[11px] text-muted-foreground">
                    Colete Online nu permite anularea prin API: anuleaza expedierea din contul tau Colete Online,
                    apoi apasa „Detaseaza AWB" ca sa poti genera unul nou.
                  </p>
                )}
              </div>
            )}

            {/* Customer */}
            <section className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Date client</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Nume complet</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Telefon</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Email (optional)</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                </div>
              </div>
            </section>

            {/* Address */}
            <section className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Adresa de livrare</p>
              {isLocker && (
                <div className="flex items-start gap-2 p-3 bg-info/5 border border-info/20 rounded-lg">
                  <Info className="h-4 w-4 text-info mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-info">
                    Comanda se livreaza la locker{addr.locker_name ? ` (${addr.locker_name})` : ""}. Adresa de mai jos este
                    informativa — pentru alt locker, anuleaza AWB-ul si alege lockerul in fereastra curierului.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Strada si numar</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Oras</label>
                  <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Judet</label>
                  <input value={county} onChange={(e) => setCounty(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Cod postal (optional)</label>
                  <input value={postal} onChange={(e) => setPostal(e.target.value)} className={inputCls} />
                </div>
              </div>
            </section>

            {/* Add products */}
            <section className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Adauga produse in comanda</p>

              {added.length > 0 && (
                <div className="space-y-2">
                  {added.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">{l.name}</p>
                        <p className="text-xs text-muted-foreground">{formatPrice(l.price)} / buc</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => setQty(l.id, l.quantity - 1)}
                          className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                        <button onClick={() => setQty(l.id, l.quantity + 1)}
                          className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="w-20 text-right text-sm font-semibold text-foreground shrink-0">{formatPrice(l.price * l.quantity)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cauta un produs..."
                  className={`${inputCls} pl-9`} />
              </div>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {searching ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                ) : results.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">Niciun produs gasit.</p>
                ) : (
                  results.map((p) => {
                    const out = p.track_inventory && (p.stock_quantity ?? 0) <= 0;
                    return (
                      <button key={p.id} onClick={() => !out && addProduct(p)} disabled={out}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm text-foreground truncate">{p.name}</span>
                          {out && <span className="text-[10px] font-bold text-destructive shrink-0">STOC 0</span>}
                          {p.track_inventory && !out && (
                            <span className="text-[10px] text-muted-foreground shrink-0">stoc {p.stock_quantity}</span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-foreground shrink-0">{formatPrice(p.price)}</span>
                        <Plus className="h-4 w-4 text-primary shrink-0" />
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            {/* Warnings */}
            {isPaid && addedSum > 0 && (
              <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <p className="text-xs text-foreground">
                  Comanda este deja <strong>platita online</strong>. Diferenta de {formatPrice(addedSum)} <strong>nu se incaseaza automat</strong> —
                  trebuie recuperata separat de la client (ex. link de plata sau ramburs).
                </p>
              </div>
            )}
            {hasInvoice && (
              <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <p className="text-xs text-foreground">
                  Comanda are <strong>factura emisa</strong>. Dupa editare, factura nu mai corespunde —
                  emite storno si refactureaza din sectiunea de facturare.
                </p>
              </div>
            )}

            {/* Totals */}
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total actual</span>
                <span className="font-medium text-foreground">{formatPrice(Number(order.total))}</span>
              </div>
              {addedSum > 0 && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Produse adaugate</span>
                    <span className="font-medium text-foreground">+{formatPrice(addedSum)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm border-t border-border pt-1.5">
                    <span className="font-semibold text-foreground">Total nou</span>
                    <span className="font-bold text-foreground">{formatPrice(newTotal)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={saving}>Renunta</Button>
              <Button onClick={handleSave} disabled={saving || !name.trim() || !phone.trim() || !address.trim() || !city.trim() || !county.trim()}>
                {saving ? <><Loader2 className="animate-spin" /> Se salveaza...</> : "Salveaza modificarile"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
