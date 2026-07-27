"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Check, ChevronRight, Minus, Package, Plus, ShoppingCart, X } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { gtagEvent } from "@/lib/marketing";
import { CartRecommendations } from "@/components/ministore/CartRecommendations";
import { lineKey, useCart } from "@/components/storefront/cart/CartProvider";
import { computeCartPricing } from "@/lib/storefront/cart/pricing";

/**
 * Sertarul de cos, varianta classic.
 *
 * Mutat din MiniStoreRenderer fara nicio schimbare de marcaj: de aici pornesc
 * variantele de design ale cosului, iar miniatura din catalog randeaza chiar
 * componenta asta, nu o copie de prezentare care s-ar desincroniza de ea.
 *
 * "inline" e singura adaugire: sertarul iese din pozitionarea fixa si se aseaza
 * in fluxul paginii, pentru miniatura din galeria de design-uri. Din magazin nu
 * se trimite niciodata, deci calea reala ramane neatinsa.
 */
export function CartDrawerClassic({
  open, onClose, color, basePath, businessId, onCheckout, shippingCost, freeShippingThreshold, minOrderAmount,
  inline = false,
}: {
  open: boolean; onClose: () => void; color: string; basePath: string; businessId: string; onCheckout: () => void;
  shippingCost: number; freeShippingThreshold: number | null; minOrderAmount: number | null;
  /**
   * Randare in fluxul paginii, pentru miniatura din catalogul de design-uri:
   * fara fundalul negru si fara pozitionare fixa. Un panou fix ar innegri tot
   * cardul, s-ar lipi de marginea cadrului si i-ar raporta inaltimea ferestrei
   * in loc de a lui.
   */
  inline?: boolean;
}) {
  const { items, addItem, removeItem, updateQty, total, count } = useCart();
  // Aritmetica e comuna cu paginile de cos si cu bara de progres de pe pagina de
  // magazin: aceleasi numere, oriunde le-ar vedea clientul.
  const { shipping, grandTotal, belowMinOrder, freeShippingPct: progressPct } = computeCartPricing({
    total, shippingCost, freeShippingThreshold, minOrderAmount,
  });

  // GA4 view_cart when the drawer opens with items.
  useEffect(() => {
    if (inline || !open || items.length === 0) return;
    gtagEvent("view_cart", { currency: "RON", value: total, items: items.map((i) => ({ item_id: i.productId, item_name: i.name, price: i.price, quantity: i.quantity })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <>
      {!inline && <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />}
      {/* Sirul de clase e scris intreg pe fiecare ramura, nu compus din parte
          fixa si parte variabila: reordonarea claselor ar aparea ca diferenta la
          compararea marcajului cu productia, desi CSS-ul e acelasi. */}
      <div className={inline
        ? "relative mx-auto h-[620px] w-full max-w-sm bg-background flex flex-col shadow-2xl"
        : "fixed inset-y-0 right-0 w-full max-w-sm bg-background z-50 flex flex-col shadow-2xl"}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-foreground">Cosul tau</h2>
            <p className="text-xs text-muted-foreground">{count} {count === 1 ? "produs" : "produse"}</p>
          </div>
          <button
            aria-label="Inchide cosul"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {freeShippingThreshold && (
          <div className="px-5 py-3 bg-muted/40 border-b border-border">
            {total >= freeShippingThreshold ? (
              <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color }}>
                <Check className="h-3.5 w-3.5" /> Ai obtinut livrare gratuita!
              </p>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">
                  Mai adauga <strong className="text-foreground">{formatPrice(freeShippingThreshold - total)}</strong> pentru livrare gratuita
                </p>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <ShoppingCart className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Cosul este gol</p>
              <p className="text-xs text-muted-foreground">Adauga produse pentru a continua</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const href = item.slug ? `${basePath}/product/${item.slug}` : null;
                const thumbCls = "relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-muted border border-border";
                const thumb = item.imageUrl ? (
                  <Image src={item.imageUrl} alt={item.name} fill sizes="64px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                );
                const key = lineKey(item);
                return (
                <div key={key} className="flex items-start gap-3">
                  {href ? (
                    <a href={href} onClick={onClose} className={thumbCls}>{thumb}</a>
                  ) : (
                    <div className={thumbCls}>{thumb}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    {href ? (
                      <a href={href} onClick={onClose} className="block">
                        <p className="text-sm font-medium text-foreground leading-snug truncate hover:opacity-70 transition-opacity">{item.name}</p>
                      </a>
                    ) : (
                      <p className="text-sm font-medium text-foreground leading-snug truncate">{item.name}</p>
                    )}
                    {item.variantTitle && <p className="text-xs text-muted-foreground leading-snug truncate">{item.variantTitle}</p>}
                    <p className="text-sm font-semibold mt-0.5" style={{ color }}>{formatPrice(item.price)}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button type="button" aria-label="Scade cantitatea" onClick={() => updateQty(key, item.quantity - 1)}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-semibold w-5 text-center tabular-nums">{item.quantity}</span>
                      <button type="button" aria-label="Creste cantitatea" onClick={() => updateQty(key, item.quantity + 1)}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <button type="button" aria-label="Sterge produsul" onClick={() => { gtagEvent("remove_from_cart", { currency: "RON", value: item.price * item.quantity, items: [{ item_id: item.productId, item_name: item.name, price: item.price, quantity: item.quantity }] }); removeItem(key); }}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors mt-0.5 rounded-md hover:bg-muted">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* In miniatura, recomandarile ar insemna cate o interogare pe server
            pentru fiecare card din galerie, cu id-uri de produse demonstrative. */}
        {items.length > 0 && !inline && (
          <CartRecommendations businessId={businessId} color={color} basePath={basePath}
            cartProductIds={items.map((i) => i.productId)}
            onAdd={(p) => addItem({ productId: p.id, slug: p.slug ?? undefined, name: p.name, price: p.price, imageUrl: p.imageUrl })} />
        )}

        {items.length > 0 && (
          <div className="px-5 py-5 border-t border-border space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-medium text-foreground">{formatPrice(total)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Livrare</span>
                <span className={shipping === 0 ? "font-medium" : "font-medium text-foreground"} style={shipping === 0 ? { color } : undefined}>
                  {shipping === 0 ? "Gratuita" : formatPrice(shipping)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-base text-foreground pt-2 border-t border-border">
                <span>Total</span>
                <span style={{ color }}>{formatPrice(grandTotal)}</span>
              </div>
            </div>
            {belowMinOrder && (
              <p className="text-xs text-center text-muted-foreground">
                Comanda minima este <strong className="text-foreground">{formatPrice(minOrderAmount!)}</strong>. Mai adauga <strong className="text-foreground">{formatPrice(minOrderAmount! - total)}</strong> pentru a finaliza.
              </p>
            )}
            <button type="button" onClick={onCheckout} disabled={belowMinOrder}
              className="flex items-center justify-center gap-2 w-full py-3.5 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
              style={{ backgroundColor: color }}>
              Finalizeaza comanda
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
