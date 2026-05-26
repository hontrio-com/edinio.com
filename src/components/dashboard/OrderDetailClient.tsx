"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, User, Phone, MapPin, Package, Banknote, CreditCard, FileText } from "lucide-react";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { updateOrder } from "@/lib/actions/order.actions";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
}

interface ShippingAddress {
  county: string;
  city: string;
  address: string;
}

const STATUS_OPTIONS = [
  { value: "pending",    label: "In asteptare",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "confirmed",  label: "Confirmat",     cls: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "processing", label: "In procesare",  cls: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "shipped",    label: "Expediat",      cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "delivered",  label: "Livrat",        cls: "bg-green-50 text-green-700 border-green-200" },
  { value: "cancelled",  label: "Anulat",        cls: "bg-red-50 text-red-700 border-red-200" },
  { value: "refunded",   label: "Rambursat",     cls: "bg-gray-100 text-gray-500 border-gray-200" },
];

const PAYMENT_OPTIONS = [
  { value: "unpaid",   label: "Neplatit",  cls: "bg-red-50 text-red-700 border-red-200" },
  { value: "paid",     label: "Platit",    cls: "bg-green-50 text-green-700 border-green-200" },
  { value: "refunded", label: "Rambursat", cls: "bg-gray-100 text-gray-500 border-gray-200" },
];

function Badge({ cls, label }: { cls: string; label: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

export function OrderDetailClient({ order }: { order: Order }) {
  const router = useRouter();
  const [status, setStatus] = useState(order.status as string);
  const [paymentStatus, setPaymentStatus] = useState(order.payment_status as string);
  const [isPending, startTransition] = useTransition();

  const items = (order.items as unknown as OrderItem[]) ?? [];
  const address = (order.shipping_address as unknown as ShippingAddress) ?? {};
  const notes = order.notes as Record<string, string> | null;

  const currentStatus = STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0];
  const currentPayment = PAYMENT_OPTIONS.find(p => p.value === paymentStatus) ?? PAYMENT_OPTIONS[0];

  const hasChanges = status !== order.status || paymentStatus !== order.payment_status;

  function handleSave() {
    startTransition(async () => {
      const result = await updateOrder(order.id, { status, payment_status: paymentStatus });
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Comanda actualizata.");
        router.refresh();
      }
    });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => router.push("/dashboard/orders")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-0.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Inapoi
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-foreground font-mono">{order.order_number}</h1>
            <Badge cls={currentStatus.cls} label={currentStatus.label} />
            <Badge cls={currentPayment.cls} label={currentPayment.label} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatDate(new Date(order.created_at))}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Client */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Informatii client</h2>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground font-medium">{order.customer_name}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <a href={`tel:${order.customer_phone}`} className="text-primary hover:underline">
                {order.customer_phone}
              </a>
            </div>
            {address.county && (
              <div className="flex items-start gap-2.5 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="text-muted-foreground leading-relaxed">
                  <div>{address.address}</div>
                  <div>{address.city}, {address.county}</div>
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

        {/* Produse + sumar */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Produse comandate</h2>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground truncate">{item.name}</span>
                  <span className="text-muted-foreground flex-shrink-0">x{item.quantity}</span>
                </div>
                <span className="font-medium text-foreground flex-shrink-0 ml-3">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatPrice(Number(order.subtotal))}</span>
            </div>
            {Number(order.discount_amount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount {order.discount_code ? `(${order.discount_code})` : ""}</span>
                <span className="font-medium">-{formatPrice(Number(order.discount_amount))}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Transport</span>
              <span>{Number(order.shipping_cost) === 0 ? "Gratuit" : formatPrice(Number(order.shipping_cost))}</span>
            </div>
            <div className="flex justify-between font-semibold text-foreground text-base pt-1 border-t border-border">
              <span>Total</span>
              <span>{formatPrice(Number(order.total))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Campuri custom / note */}
      {notes && Object.keys(notes).length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Campuri aditionale
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

      {/* Editare */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
        <h2 className="text-sm font-semibold text-foreground">Editeaza comanda</h2>

        {/* Status comanda */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">Status comanda</label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  status === opt.value
                    ? opt.cls + " ring-2 ring-offset-1 ring-current"
                    : "border-border text-muted-foreground hover:border-primary/40 bg-muted/30"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status plata */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">Status plata</label>
          <div className="flex gap-2">
            {PAYMENT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPaymentStatus(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  paymentStatus === opt.value
                    ? opt.cls + " ring-2 ring-offset-1 ring-current"
                    : "border-border text-muted-foreground hover:border-primary/40 bg-muted/30"
                }`}
              >
                <CreditCard className="h-3 w-3" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !hasChanges}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Se salveaza..." : "Salveaza modificarile"}
          </button>
        </div>
      </div>
    </div>
  );
}
