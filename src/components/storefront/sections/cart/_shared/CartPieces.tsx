"use client";

import Image from "next/image";
import { Check, Minus, Package, Plus, ShoppingCart, Truck, X } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { gtagEvent } from "@/lib/marketing";
import { lineKey, type CartItem } from "@/components/storefront/cart/CartProvider";
import type { CartPricing } from "@/lib/storefront/cart/pricing";

/**
 * Piesele din care sunt facute modelele de pagina de cos.
 *
 * Modelele difera prin ASEZARE — doua coloane, lista lata, compact — nu prin ce
 * scrie intr-o linie de cos sau intr-o caseta de totaluri. Tinute separat, cele
 * trei ar fi ajuns sa afiseze altfel acelasi lucru; tinute aici, o corectie se
 * face o data.
 *
 * Sertarul isi pastreaza marcajul lui: e un panou ingust, cu alte constrangeri,
 * si nu are de castigat din a fi turnat in aceleasi bucati. Ce IMPARTE cu
 * paginile e aritmetica (`lib/storefront/cart/pricing.ts`), adica exact partea
 * in care o diferenta ar insemna doua totaluri pentru acelasi cos.
 */

/** Butoanele de cantitate, cu stergere la scaderea sub unu. */
export function StepperCantitate({
  cantitate,
  onSchimba,
  marime = "normal",
}: {
  cantitate: number;
  onSchimba: (n: number) => void;
  marime?: "normal" | "mic";
}) {
  const buton =
    marime === "mic"
      ? "w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
      : "w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors";
  const iconita = marime === "mic" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Scade cantitatea" onClick={() => onSchimba(cantitate - 1)} className={buton}>
        <Minus className={iconita} />
      </button>
      <span className="text-sm font-semibold w-6 text-center tabular-nums">{cantitate}</span>
      <button type="button" aria-label="Creste cantitatea" onClick={() => onSchimba(cantitate + 1)} className={buton}>
        <Plus className={iconita} />
      </button>
    </div>
  );
}

/**
 * O linie de cos.
 *
 * `dens` schimba doar cat loc ocupa: „rand" e linia larga a paginilor cu doua
 * coloane, „compact" e varianta cu imagine mica pentru modelul dens. Pe telefon
 * amandoua se aseaza la fel, fiindca acolo nu incape decat o forma.
 */
export function CartLine({
  item,
  color,
  basePath,
  onQty,
  onRemove,
  dens = "rand",
}: {
  item: CartItem;
  color: string;
  basePath: string;
  onQty: (key: string, n: number) => void;
  onRemove: (key: string) => void;
  dens?: "rand" | "compact";
}) {
  const key = lineKey(item);
  const href = item.slug ? `${basePath}/product/${item.slug}` : null;
  const latime = dens === "compact" ? "w-16 h-16" : "w-20 h-20 sm:w-24 sm:h-24";

  const poza = (
    <span className={`relative ${latime} shrink-0 rounded-xl overflow-hidden bg-muted border border-border block`}>
      {item.imageUrl ? (
        <Image src={item.imageUrl} alt={item.name} fill sizes="96px" className="object-cover" />
      ) : (
        <span className="w-full h-full flex items-center justify-center">
          <Package className="h-5 w-5 text-muted-foreground" />
        </span>
      )}
    </span>
  );

  return (
    <div className="flex items-start gap-3 sm:gap-4 py-4">
      {href ? <a href={href}>{poza}</a> : poza}

      <div className="flex-1 min-w-0">
        {href ? (
          <a href={href} className="block hover:opacity-70 transition-opacity">
            <p className="text-sm sm:text-base font-medium text-foreground leading-snug line-clamp-2">{item.name}</p>
          </a>
        ) : (
          <p className="text-sm sm:text-base font-medium text-foreground leading-snug line-clamp-2">{item.name}</p>
        )}
        {item.variantTitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{item.variantTitle}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{formatPrice(item.price)} bucata</p>

        <div className="flex items-center gap-3 mt-3">
          <StepperCantitate
            cantitate={item.quantity}
            marime={dens === "compact" ? "mic" : "normal"}
            onSchimba={(n) => onQty(key, n)}
          />
          <button type="button" onClick={() => { stergeCuEveniment(item); onRemove(key); }}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors inline-flex items-center gap-1">
            <X className="h-3.5 w-3.5" />
            Sterge
          </button>
        </div>
      </div>

      <p className="text-sm sm:text-base font-bold shrink-0 tabular-nums" style={{ color }}>
        {formatPrice(item.price * item.quantity)}
      </p>
    </div>
  );
}

/** Acelasi eveniment pe care il trimite si sertarul la stergerea unei linii. */
function stergeCuEveniment(item: CartItem) {
  gtagEvent("remove_from_cart", {
    currency: "RON",
    value: item.price * item.quantity,
    items: [{ item_id: item.productId, item_name: item.name, price: item.price, quantity: item.quantity }],
  });
}

/** Bara catre pragul de livrare gratuita. Lipseste cand magazinul n-are prag. */
export function ProgresTransport({
  pricing,
  color,
  areaPrag,
}: {
  pricing: CartPricing;
  color: string;
  areaPrag: boolean;
}) {
  if (!areaPrag) return null;

  return (
    <div className="p-3.5 rounded-2xl border border-border bg-surface">
      {pricing.shippingIsFree ? (
        <p className="text-sm font-semibold flex items-center gap-2" style={{ color }}>
          <Check className="h-4 w-4 shrink-0" strokeWidth={3} />
          Ai obtinut livrare gratuita
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-sm text-muted-foreground">
              Mai adauga <strong className="text-foreground">{formatPrice(pricing.freeShippingRemaining)}</strong> pentru livrare gratuita
            </span>
            <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pricing.freeShippingPct}%`, backgroundColor: color }} />
          </div>
        </>
      )}
    </div>
  );
}

/** Caseta cu subtotal, transport si total, plus butonul de finalizare. */
export function RezumatCos({
  total,
  pricing,
  color,
  minOrderAmount,
  onCheckout,
  etichetaButon = "Finalizeaza comanda",
}: {
  total: number;
  pricing: CartPricing;
  color: string;
  minOrderAmount: number | null;
  onCheckout: () => void;
  etichetaButon?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="font-medium text-foreground tabular-nums">{formatPrice(total)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Livrare</span>
          <span className={pricing.shipping === 0 ? "font-medium" : "font-medium text-foreground"}
            style={pricing.shipping === 0 ? { color } : undefined}>
            {pricing.shipping === 0 ? "Gratuita" : formatPrice(pricing.shipping)}
          </span>
        </div>
        <div className="flex justify-between font-bold text-base text-foreground pt-2 border-t border-border">
          <span>Total</span>
          <span className="tabular-nums" style={{ color }}>{formatPrice(pricing.grandTotal)}</span>
        </div>
      </div>

      {pricing.belowMinOrder && minOrderAmount !== null && (
        <p className="text-xs text-center text-muted-foreground">
          Comanda minima este <strong className="text-foreground">{formatPrice(minOrderAmount)}</strong>.
          Mai adauga <strong className="text-foreground">{formatPrice(pricing.minOrderRemaining)}</strong> pentru a finaliza.
        </p>
      )}

      <button type="button" onClick={onCheckout} disabled={pricing.belowMinOrder}
        className="w-full flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
        style={{ backgroundColor: color }}>
        {etichetaButon}
      </button>
    </div>
  );
}

/**
 * Cosul gol.
 *
 * Pe o pagina de cos conteaza mai mult decat in sertar: cine ajunge aici dintr-un
 * link vechi sau dupa ce si-a golit cosul nu trebuie lasat intr-o fundatura.
 */
export function CosGol({ basePath, color }: { basePath: string; color: string }) {
  return (
    <div className="py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <ShoppingCart className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-base font-semibold text-foreground mb-1">Cosul este gol</p>
      <p className="text-sm text-muted-foreground mb-6">Adauga produse ca sa continui</p>
      <a href={`${basePath}/`}
        className="inline-flex items-center justify-center h-11 px-5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: color }}>
        Vezi produsele
      </a>
    </div>
  );
}
