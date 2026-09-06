"use client";

import Image from "next/image";
import { formatPrice } from "@/lib/utils/format";
import { lineKey, useCart } from "@/components/storefront/cart/CartProvider";
import type { CheckoutEngine } from "./checkout-core";

/**
 * Rezumatul comenzii: ce cumperi si cat costa.
 *
 * Sta separat pentru ca apare in doua locuri — in modal, in curgerea
 * formularului, si pe pagina, in coloana din dreapta. Scris o singura data,
 * totalurile din cele doua n-au cum sa difere.
 *
 * Toate sumele trec prin `formatPrice`: interpolate brut, ieseau cu punct
 * zecimal langa preturile formatate din restul magazinului, iar scaderile in
 * virgula mobila ajungeau pe ecran ca „30.00999999999999 lei".
 */

/** Liniile de cos, asa cum apar in formularul de comanda. */
export function CheckoutCartLines({ motor, color }: { motor: CheckoutEngine; color: string }) {
  const { items } = motor;
  // Totalul liniei vine tot de la cos, ca sa fie acelasi numar aici, in sertar,
  // pe pagina de cos si la server.
  const { lineTotal, lineSavings, lineUnit } = useCart();
  return (
      <div className="space-y-2">
        {items.map((item) => (
          <div key={lineKey(item)} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40">
            {item.imageUrl && (
              <Image src={item.imageUrl} alt={item.name} width={48} height={48} className="rounded-lg object-cover border border-border shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-foreground truncate">{item.name}</p>
              {item.variantTitle && <p className="text-xs text-muted-foreground truncate">{item.variantTitle}</p>}
              {/* Pretul pe bucata vine de la COS, nu din `item.price`: acela e
                  instantaneul din localStorage, iar totalul de langa el vine deja
                  de la server. Aici e capatul fluxului pe care il repara
                  constatarea 20 — degeaba se aduna randurile in sertar daca la
                  finalizare tot doua numere care nu se inmultesc se vad. */}
              <p className="text-xs text-muted-foreground mt-0.5">{item.quantity} buc &times; {formatPrice(lineUnit(item))}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold" style={{ color }}>{formatPrice(lineTotal(item))}</p>
              {lineSavings(item) > 0 && (
                <p className="text-[11px] text-muted-foreground line-through tabular-nums">{formatPrice(lineUnit(item) * item.quantity)}</p>
              )}
            </div>
          </div>
        ))}
      </div>
  );
}

/** Caseta cu produse, transport, TVA, reduceri si total. */
export function CheckoutTotals({
  motor,
  color,
  freeShippingThreshold,
}: {
  motor: CheckoutEngine;
  color: string;
  freeShippingThreshold: number | null;
}) {
  const {
    acceptedBumpOffers, appliedDiscount, cardDiscountAmount, codDiscountAmount, codFeeAmount, discountAmount,
    extrasTotal, goodsTotal, grandTotal, isFreeShippingDiscount, shipping,
    total, vatAmount, vatConfig,
  } = motor;
  return (
      <div className="rounded-xl p-3 space-y-1.5 text-sm bg-muted/40 border border-border">
        <div className="flex justify-between text-muted-foreground">
          <span>Produse</span>
          <span className="font-medium text-foreground">{formatPrice(total)}</span>
        </div>
        {acceptedBumpOffers.map((o) => (
          <div key={o.id} className="flex justify-between" style={{ color }}>
            <span className="truncate pr-2">+ {o.products[0]!.name}</span>
            <span className="font-medium whitespace-nowrap">{formatPrice(o.pricing!.price)}</span>
          </div>
        ))}
        {extrasTotal > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Optiuni extra</span>
            <span className="font-medium text-foreground">+{formatPrice(extrasTotal)}</span>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <span>Transport</span>
          <span className={shipping === 0 ? "font-medium" : "font-medium text-foreground"} style={shipping === 0 ? { color } : undefined}>
            {shipping === 0 ? "Gratuit" : formatPrice(shipping)}
          </span>
        </div>
        {vatConfig.vat_enabled && vatConfig.show_vat_breakdown && vatAmount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>TVA ({vatConfig.vat_rate}%){vatConfig.prices_include_vat ? " inclus" : ""}</span>
            <span className="font-medium text-foreground">{formatPrice(vatAmount)}</span>
          </div>
        )}
        {appliedDiscount && (discountAmount > 0 || isFreeShippingDiscount) && (
          <div className="flex justify-between" style={{ color }}>
            <span>Reducere ({appliedDiscount.code})</span>
            <span className="font-medium">{isFreeShippingDiscount && discountAmount === 0 ? "Transport gratuit" : `-${formatPrice(discountAmount)}`}</span>
          </div>
        )}
        {cardDiscountAmount > 0 && (
          <div className="flex justify-between" style={{ color }}>
            <span>Reducere plata cu cardul</span>
            <span className="font-medium">-{formatPrice(cardDiscountAmount)}</span>
          </div>
        )}
        {codDiscountAmount > 0 && (
          <div className="flex justify-between" style={{ color }}>
            <span>Reducere plata ramburs</span>
            <span className="font-medium">-{formatPrice(codDiscountAmount)}</span>
          </div>
        )}
        {/* Taxa de ramburs se aduna, deci NU poarta culoarea magazinului: aia e
            rezervata sumelor in favoarea clientului. */}
        {codFeeAmount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Taxa plata ramburs</span>
            <span className="font-medium">{formatPrice(codFeeAmount)}</span>
          </div>
        )}
        {freeShippingThreshold && goodsTotal < freeShippingThreshold && (
          <p className="text-xs text-muted-foreground">
            Mai adauga <strong>{formatPrice(freeShippingThreshold - goodsTotal)}</strong> pentru livrare gratuita
          </p>
        )}
        <div className="flex justify-between font-bold text-base border-t border-border pt-2">
          <span>Total</span>
          <span style={{ color }}>{formatPrice(grandTotal)}</span>
        </div>
      </div>
  );
}
