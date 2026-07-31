"use client";

import { useRef } from "react";
import { useStoreChromeOptional } from "@/components/storefront/StorefrontProvider";
import Image from "next/image";
import { Check, Minus, Package, Plus, ShoppingCart, Truck, X } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { gtagEvent } from "@/lib/marketing";
import { lineKey, useCart, type CartItem } from "@/components/storefront/cart/CartProvider";
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

/**
 * Butoanele de cantitate, cu stergere la scaderea sub unu.
 *
 * Etichetele poarta numele produsului: intr-un cos cu douazeci de linii, un
 * cititor de ecran anunta altfel douazeci de butoane „Scade cantitatea"
 * identice, si nu se poate sti la care linie e cursorul fara sa se reia randul.
 */
export function StepperCantitate({
  cantitate,
  nume,
  onSchimba,
  marime = "normal",
}: {
  cantitate: number;
  /** Numele produsului, pentru etichetele butoanelor. */
  nume: string;
  onSchimba: (n: number) => void;
  marime?: "normal" | "mic";
}) {
  // `shrink-0`: la 320 px coloana ramasa nu mai are loc pentru stepper si
  // butonul de stergere, iar fara asta ele se strang pana devin de neapasat.
  const buton =
    marime === "mic"
      ? "shrink-0 w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
      : "shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors";
  const iconita = marime === "mic" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`Scade cantitatea pentru ${nume}`} onClick={() => onSchimba(cantitate - 1)} className={buton}>
        <Minus className={iconita} />
      </button>
      {/* Cantitatea se schimba fara reincarcare si fara mutarea focalizarii:
          fara regiune live, apasarea butonului nu anunta nimic. */}
      <span aria-live="polite" aria-atomic="true" className="text-sm font-semibold w-6 text-center tabular-nums">{cantitate}</span>
      <button type="button" aria-label={`Creste cantitatea pentru ${nume}`} onClick={() => onSchimba(cantitate + 1)} className={buton}>
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
  const cos = useCart();
  const totalLinie = cos.lineTotal(item);
  const economie = cos.lineSavings(item);
  const rand = useRef<HTMLDivElement>(null);
  const href = item.slug ? `${basePath}/product/${item.slug}` : null;
  const latime = dens === "compact" ? "w-16 h-16" : "w-20 h-20 sm:w-24 sm:h-24";
  // `sizes` urmeaza latimile de mai sus, altfel browserul cere pentru caseta de
  // 64 px a modelului compact o imagine de 96 px — cu 50% mai lata decat trebuie,
  // pe fiecare linie de cos.
  const marimi = dens === "compact" ? "64px" : "(min-width: 640px) 96px, 80px";

  // Randul dispare cu tot cu butonul apasat — si la „Sterge", si cand cantitatea
  // scade sub unu. Fara mutarea asta, focalizarea cade pe <body>: cine sterge de
  // la tastatura se trezeste la inceputul paginii, fara sa afle ce s-a intamplat.
  // Butonul vecin, odata focalizat, isi anunta si numele produsului ramas.
  function mutaFocalizarea() {
    const vecin = rand.current?.nextElementSibling ?? rand.current?.previousElementSibling;
    vecin?.querySelector<HTMLElement>("[data-sterge-linie]")?.focus();
  }

  const poza = (
    <span className={`relative ${latime} shrink-0 rounded-xl overflow-hidden bg-muted border border-border block`}>
      {item.imageUrl ? (
        <Image src={item.imageUrl} alt={item.name} fill sizes={marimi} className="object-cover" />
      ) : (
        <span className="w-full h-full flex items-center justify-center">
          <Package className="h-5 w-5 text-muted-foreground" />
        </span>
      )}
    </span>
  );

  return (
    <div ref={rand} className="flex items-start gap-3 sm:gap-4 py-4">
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

        {/* Zona de atins a butonului „Sterge" e adusa la inaltimea stepperului
            si departata de „+": text de 12 px inseamna vreo 16 px de atins, iar
            o atingere ratata cadea pe „+" si crestea cantitatea in loc sa stearga
            linia — greseala cea mai scumpa cu putinta intr-un cos. */}
        <div className="flex items-center gap-4 mt-3">
          <StepperCantitate
            cantitate={item.quantity}
            nume={item.name}
            marime={dens === "compact" ? "mic" : "normal"}
            onSchimba={(n) => { if (n <= 0) mutaFocalizarea(); onQty(key, n); }}
          />
          <button type="button" aria-label={`Sterge ${item.name} din cos`} data-sterge-linie=""
            onClick={() => { mutaFocalizarea(); stergeCuEveniment(item, totalLinie); onRemove(key); }}
            className="h-9 -ml-2 px-2 rounded-lg text-xs text-muted-foreground hover:text-destructive transition-colors inline-flex items-center gap-1">
            <X className="h-3.5 w-3.5" />
            Sterge
          </button>
        </div>
      </div>

      {/* Totalul liniei vine de la cos, nu din inmultire locala: doar acolo se
          aplica treptele de cantitate, si tot acolo se uita si serverul. */}
      <div className="shrink-0 text-right">
        <p className="text-sm sm:text-base font-bold tabular-nums" style={{ color }}>
          {formatPrice(totalLinie)}
        </p>
        {economie > 0 && (
          <>
            <p className="text-xs text-muted-foreground line-through tabular-nums">
              {formatPrice(item.price * item.quantity)}
            </p>
            <p className="text-[11px] font-semibold" style={{ color }}>
              -{formatPrice(economie)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Acelasi eveniment pe care il trimite si sertarul la stergerea unei linii.
 *
 * Valoarea e cea REALA a liniei, cu treptele de cantitate aplicate, nu inmultirea
 * la pret intreg: altfel rapoartele arata alti bani decat cei din comenzi.
 */
function stergeCuEveniment(item: CartItem, valoare: number) {
  gtagEvent("remove_from_cart", {
    currency: "RON",
    value: valoare,
    items: [{ item_id: item.productId, item_name: item.name, price: item.price, quantity: item.quantity }],
  });
}

/** Bara catre pragul de livrare gratuita. Lipseste cand magazinul n-are prag. */
export function ProgresTransport({
  pricing,
  color,
}: {
  pricing: CartPricing;
  color: string;
}) {
  if (!pricing.areaPrag) return null;

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
      {/* Totalurile se schimba la fiecare apasare pe „+", fara reincarcare si
          fara mutarea focalizarii: fara regiune live, nimic nu se anunta. */}
      <div aria-live="polite" aria-atomic="true" className="space-y-2 text-sm">
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
 * Ce se vede pana cand cosul e citit din localStorage.
 *
 * Cealalta jumatate a distinctiei pe care o face `hydrated`: fara ea, prima
 * imagine a paginii e cosul GOL cu totalurile lui — „Subtotal 0 lei", transportul
 * intreg, iar la magazinele cu comanda minima mesajul „Mai adauga 150 lei" si
 * butonul inactiv. Cifre false, aratate la fiecare incarcare, pe pagina pe care
 * se face conversia. Marcajul e identic pe server si la prima randare din
 * browser, deci nu apare nepotrivire de hidratare.
 */
export function ScheletCos({ randuri = 3, latime = "max-w-4xl" }: { randuri?: number; latime?: string }) {
  return (
    <div className={`${latime} mx-auto px-4 sm:px-6 py-8 lg:py-12`}>
      <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-6 lg:mb-8">Cosul tau</h1>
      <div aria-hidden="true" className="animate-pulse">
        <div className="divide-y divide-border border-y border-border">
          {Array.from({ length: randuri }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 sm:gap-4 py-4">
              <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl bg-muted" />
              <div className="flex-1 min-w-0">
                <div className="h-4 w-3/5 rounded bg-muted" />
                <div className="h-3 w-1/4 rounded bg-muted mt-2" />
                <div className="h-9 w-28 rounded-lg bg-muted mt-3" />
              </div>
              <div className="h-4 w-16 rounded bg-muted shrink-0" />
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
          <div className="h-3 w-28 rounded bg-muted" />
          <div className="h-3 w-full rounded bg-muted mt-4" />
          <div className="h-3 w-2/3 rounded bg-muted mt-2" />
          <div className="h-12 w-full rounded-xl bg-muted mt-5" />
        </div>
      </div>
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
  /*
   * Iesirea din palnie duce la PRODUSE, nu la radacina magazinului.
   *
   * Cand catalogul si-a luat pagina lui, pagina principala nu mai are grila:
   * clientul care apasa „continua cumparaturile" ajungea intr-o pagina de
   * prezentare fara niciun produs. Optional fiindca miniatura din editor
   * randeaza fara chrome.
   */
  const chromeCatalog = useStoreChromeOptional();
  const catreProduse = chromeCatalog?.catalogRoot ?? `${basePath}/`;
  return (
    <div className="py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <ShoppingCart className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-base font-semibold text-foreground mb-1">Cosul este gol</p>
      <p className="text-sm text-muted-foreground mb-6">Adauga produse ca sa continui</p>
      <a href={catreProduse}
        className="inline-flex items-center justify-center h-11 px-5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: color }}>
        Vezi produsele
      </a>
    </div>
  );
}
