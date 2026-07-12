"use client";

import { useState, type CSSProperties } from "react";
import { CheckCircle, Loader2, Package, ShieldCheck } from "lucide-react";
import { lookupReturnableOrder, submitReturnRequest, type ReturnableItem } from "@/lib/actions/return.actions";
import { formatPrice } from "@/lib/utils/format";

interface Props {
  businessId: string;
  basePath: string;
  color: string;
  storeName: string;
  prefillOrder: string;
}

interface OrderInfo {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  items: ReturnableItem[];
  hasEmail: boolean;
  deadlineNote: string;
}

type Selection = Record<string, { checked: boolean; quantity: number }>;

export function ReturnRequestClient({ businessId, basePath, color, storeName, prefillOrder }: Props) {
  const [step, setStep] = useState<"identify" | "select" | "done">("identify");
  const [orderNumber, setOrderNumber] = useState(prefillOrder);
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [selection, setSelection] = useState<Selection>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"original" | "iban">("original");
  const [refundIban, setRefundIban] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-offset-0";
  const ringStyle = { "--tw-ring-color": color } as CSSProperties;

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await lookupReturnableOrder({ businessId, orderNumber, contact });
    setLoading(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setOrder({
      orderId: res.orderId,
      orderNumber: res.orderNumber,
      customerName: res.customerName,
      items: res.items,
      hasEmail: res.hasEmail,
      deadlineNote: res.deadlineNote,
    });
    // Preselect all items at full quantity (most returns are full-order).
    const initial: Selection = {};
    res.items.forEach((i) => { initial[i.product_id] = { checked: true, quantity: i.quantity }; });
    setSelection(initial);
    setStep("select");
  }

  function toggleItem(id: string) {
    setSelection((s) => ({ ...s, [id]: { ...s[id], checked: !s[id]?.checked } }));
  }

  function setQty(id: string, qty: number, max: number) {
    const q = Math.max(1, Math.min(max, Math.floor(qty) || 1));
    setSelection((s) => ({ ...s, [id]: { checked: true, quantity: q } }));
  }

  const selectedCount = order ? order.items.filter((i) => selection[i.product_id]?.checked).length : 0;
  const ibanMissing = refundMethod === "iban" && refundIban.trim().length < 15;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    setError(null);
    if (selectedCount === 0) { setError("Selecteaza cel putin un produs pentru retur."); return; }
    if (ibanMissing) { setError("Introdu un IBAN valid pentru rambursare."); return; }

    const items = order.items
      .filter((i) => selection[i.product_id]?.checked)
      .map((i) => ({ product_id: i.product_id, quantity: selection[i.product_id]?.quantity ?? i.quantity }));

    setLoading(true);
    const res = await submitReturnRequest({
      businessId,
      orderNumber: order.orderNumber,
      contact,
      items,
      reason,
      refundMethod,
      refundIban: refundMethod === "iban" ? refundIban : "",
      honeypot,
    });
    setLoading(false);
    if ("error" in res) { setError(res.error); return; }
    setStep("done");
  }

  if (step === "done") {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${color}20` }}>
          <CheckCircle className="h-8 w-8" style={{ color }} />
        </div>
        <h2 className="text-xl font-black text-gray-900 mb-2">Cererea a fost inregistrata</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Am inregistrat cererea ta de retragere din contract pentru comanda{" "}
          <span className="font-semibold text-gray-700">{order?.orderNumber}</span>.
          {order?.hasEmail
            ? " Ti-am trimis pe email confirmarea pe suport durabil, cu data si ora inregistrarii."
            : ` ${storeName} te va contacta cu pasii urmatori pentru returnare si rambursare.`}
        </p>
        <a href={`${basePath}/`} className="mt-6 inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90" style={{ backgroundColor: color }}>
          Inapoi la magazin
        </a>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-6 text-xs font-medium">
        <span className="px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: color }}>1. Identificare</span>
        <span className="h-px flex-1 bg-gray-100" />
        <span className={`px-2.5 py-1 rounded-full ${step === "select" ? "text-white" : "bg-gray-100 text-gray-400"}`} style={step === "select" ? { backgroundColor: color } : undefined}>2. Produse</span>
      </div>

      {step === "identify" && (
        <form onSubmit={handleLookup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Numarul comenzii</label>
            <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} required placeholder="ex. #0001"
              className={inputCls} style={ringStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email sau telefon (folosit la comanda)</label>
            <input value={contact} onChange={(e) => setContact(e.target.value)} required placeholder="adresa@email.ro sau 07xxxxxxxx"
              className={inputCls} style={ringStyle} />
            <p className="text-xs text-gray-400 mt-1.5">Folosim aceste date doar ca sa identificam comanda ta.</p>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: color }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continua
          </button>
        </form>
      )}

      {step === "select" && order && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Comanda {order.orderNumber}</p>
            <p className="text-xs text-gray-500 mt-0.5">{order.deadlineNote}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Ce produse returnezi?</p>
            <div className="space-y-2">
              {order.items.map((i) => {
                const sel = selection[i.product_id];
                const checked = !!sel?.checked;
                return (
                  <div key={i.product_id} className={`rounded-xl border px-3.5 py-3 transition-colors ${checked ? "border-gray-300 bg-white" : "border-gray-100 bg-gray-50/50"}`}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggleItem(i.product_id)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300" style={{ accentColor: color }} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-gray-900">{i.name}</span>
                        <span className="block text-xs text-gray-400">{formatPrice(i.price)} · comandat: {i.quantity} buc.</span>
                      </span>
                    </label>
                    {checked && i.quantity > 1 && (
                      <div className="flex items-center gap-2 mt-2.5 pl-7">
                        <span className="text-xs text-gray-500">Cantitate de returnat:</span>
                        <input type="number" min={1} max={i.quantity} value={sel?.quantity ?? i.quantity}
                          onChange={(e) => setQty(i.product_id, Number(e.target.value), i.quantity)}
                          className="w-16 px-2 py-1 rounded-lg border border-border text-sm text-center focus:outline-none focus:ring-2"
                          style={ringStyle} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Motiv (optional)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Nu esti obligat sa oferi un motiv."
              className={inputCls} style={ringStyle} />
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700 mb-1.5">Metoda de rambursare</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 cursor-pointer text-sm ${refundMethod === "original" ? "border-gray-300 bg-white" : "border-gray-100 bg-gray-50/50"}`}>
                <input type="radio" name="refund" checked={refundMethod === "original"} onChange={() => setRefundMethod("original")} style={{ accentColor: color }} />
                Aceeasi metoda de plata
              </label>
              <label className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 cursor-pointer text-sm ${refundMethod === "iban" ? "border-gray-300 bg-white" : "border-gray-100 bg-gray-50/50"}`}>
                <input type="radio" name="refund" checked={refundMethod === "iban"} onChange={() => setRefundMethod("iban")} style={{ accentColor: color }} />
                Transfer bancar (IBAN)
              </label>
            </div>
            {refundMethod === "iban" && (
              <input value={refundIban} onChange={(e) => setRefundIban(e.target.value)} placeholder="RO00 XXXX 0000 0000 0000 0000"
                className={`${inputCls} mt-2`} style={ringStyle} />
            )}
          </div>

          {/* Honeypot (bots) */}
          <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off"
            aria-hidden="true" className="hidden" />

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500 leading-relaxed">
              Prin apasarea butonului de mai jos confirmi decizia de a te retrage din contract pentru produsele selectate.
              Vei primi confirmarea pe email.
            </p>
          </div>

          <button type="submit" disabled={loading || selectedCount === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 text-sm font-bold text-white rounded-xl transition-all hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: color }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Confirma retragerea din contract
          </button>

          <button type="button" onClick={() => { setStep("identify"); setError(null); }}
            className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Inapoi la identificare
          </button>
        </form>
      )}
    </div>
  );
}
