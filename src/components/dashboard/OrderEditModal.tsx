"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import { invoiceVat } from "@/lib/billing/invoice-vat";
import {
  X, Pencil, Loader2, Plus, Minus, Trash2, Search, AlertTriangle,
  Package, Info, Truck, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateOrderDetails, searchOrderProducts, getOrderEditContext } from "@/lib/actions/order.actions";
import { getShippingOptions } from "@/lib/actions/shipping.actions";
import { deleteSamedayAwbAction } from "@/lib/actions/sameday.actions";
import { deleteCargusAwbAction } from "@/lib/actions/cargus.actions";
import { cancelDpdShipmentAction } from "@/lib/actions/dpd.actions";
import { deleteFanCourierAwbAction } from "@/lib/actions/fancourier.actions";
import { cancelWootAwb } from "@/lib/actions/woot.actions";
import { deleteGlsAwbAction } from "@/lib/actions/gls.actions";
import { deletePallexAwbAction } from "@/lib/actions/pallex.actions";
import { detachCOAwb } from "@/lib/actions/colete.actions";
import { VariantPicker } from "@/components/ministore/VariantPicker";
import { comboTitle, findCombo } from "@/lib/storefront/variants";
import {
  cheieLinie,
  planificaAdaugarea,
  recalculeazaTotal,
  sumaExtraoptiunilor,
  variantsDinSlim,
  type CatalogEdit,
  type PlanEditare,
  type VarianteSlim,
} from "@/lib/orders/edit-pricing";
import { parseCodFeeConfig } from "@/lib/payment-methods";
import { formatPrice } from "@/lib/utils/format";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

interface ShippingAddress {
  county?: string;
  city?: string;
  address?: string;
  postal_code?: string;
  country?: string;
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
  /** `null` cand produsul nu are variante de ales. */
  variante: VarianteSlim | null;
  trepte: unknown;
}

interface AddedLine extends PickerProduct {
  quantity: number;
  /** `null` pentru produsele simple. */
  variantTitle: string | null;
  /** Pretul combinatiei alese, sau cel de baza. Doar pentru afisare. */
  unitPrice: number;
}

interface EditContext {
  vat_enabled: boolean;
  vat_rate: number;
  prices_include_vat: boolean;
  free_shipping_threshold: number | null;
  cod_fee_config: unknown;
}

/**
 * Starea previzualizarii, ca uniune discriminata: „gata" e singura care are
 * cifre, deci nu se poate afisa din greseala un total pe jumatate calculat.
 */
type Previzualizare =
  | { stare: "eroare"; error: string }
  /** Reglajele magazinului inca nu s-au incarcat: nu ghicim un total. */
  | { stare: "indisponibil"; plan: PlanEditare }
  | {
    stare: "gata";
    subtotal: number;
    extras: number;
    codFee: number;
    plan: PlanEditare;
    total: number;
    vatAmount: number;
    /** Cota chiar folosita la calcul: a comenzii, nu cea de azi a magazinului. */
    vatRate: number;
    shipping: number;
    /** Cat se schimba totalul comenzii; negativ cand scade. */
    diferenta: number;
  };

const inputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Culoarea de brand, ceruta de `VariantPicker` ca hex (isi compune singur alfa). */
const CULOARE_BRAND = "#1AB554";

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

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

  // Reglajele magazinului: fara ele previzualizarea ar ghici, deci nu ghiceste.
  const [ctx, setCtx] = useState<EditContext | null>(null);

  // Alegerea variantei pentru produsul pe care tocmai l-a apasat comerciantul.
  const [picking, setPicking] = useState<PickerProduct | null>(null);
  const [pickSel, setPickSel] = useState<Record<string, string>>({});

  // Re-cotarea transportului dupa schimbarea destinatiei.
  const [requoting, setRequoting] = useState(false);
  // Cotatia isi poarta destinatia pentru care a fost ceruta, ca sa se poata
  // sti daca mai e valabila. Vezi `cotatieValida` mai jos.
  const [quote, setQuote] = useState<{ price: number; token: string; label: string; county: string; city: string } | null>(null);
  const [quoteApplied, setQuoteApplied] = useState(false);

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
    setPicking(null);
    setPickSel({});
    setQuote(null);
    setQuoteApplied(false);
    setCtx(null);
    getOrderEditContext(businessId).then((res) => setCtx("error" in res ? null : res));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order.id, businessId]);

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
    if (order.gls_awb_number) list.push({ key: "gls", label: "GLS", awb: order.gls_awb_number });
    if (order.pallex_awb_number) list.push({ key: "pallex", label: "Pall-Ex", awb: order.pallex_awb_number });
    if (order.colete_awb_number) list.push({ key: "colete", label: "Colete Online", awb: order.colete_awb_number, manualOnly: true });
    return list;
  }, [order]);

  const isPaid = order.payment_status === "paid";
  const hasInvoice = !!(order.smartbill_invoice_number || order.oblio_invoice_number || order.fgo_invoice_number);
  const numarFactura = order.smartbill_invoice_number || order.oblio_invoice_number || order.fgo_invoice_number;
  const isLocker = addr.delivery_type === "locker";
  const prevItems = useMemo(() => (Array.isArray(order.items) ? (order.items as unknown[]) : []), [order.items]);

  /*
   * Cotatia moare odata cu destinatia pentru care a fost ceruta.
   *
   * Semnatura leaga pretul de judet si oras. Daca se mai schimba unul dintre ele
   * dupa „Aplica", serverul refuza cotatia — corect, dar in TACERE — si scrie
   * transportul vechi, in timp ce panoul ar fi continuat sa arate totalul cu cel
   * nou si sa anunte „Comanda a fost actualizata". Se DEDUCE, nu se sterge dintr-un
   * efect: asa nu exista nicio clipa in care starea sa fie aplicata si invalida.
   */
  const cotatieValida = !!quote && quote.county === county.trim() && quote.city === city.trim();
  const cotatieAplicata = quoteApplied && cotatieValida;

  /*
   * PREVIZUALIZAREA cheama exact aceleasi doua functii pure ca serverul.
   *
   * Pana acum modalul aduna `order.total + suma adaugata` si numea alt numar:
   * pe o comanda cu subtotal 108 si prag 150 arata 193,00 acolo unde serverul
   * scria 173,00, fiindca adaugarea facea transportul gratuit. Pe cifra aia
   * scrie „diferenta de X nu se incaseaza automat", iar rambursul de pe AWB se
   * ia din totalul serverului.
   */
  const previzualizare = useMemo<Previzualizare>(() => {
    const catalog = new Map<string, CatalogEdit>(
      added.map((l) => [l.id, {
        name: l.name, price: l.price, is_bundle: l.is_bundle, variante: l.variante, trepte: l.trepte,
      }]),
    );
    const plan = planificaAdaugarea(
      prevItems,
      added.map((l) => ({ product_id: l.id, variant_title: l.variantTitle, quantity: l.quantity })),
      catalog,
    );
    if ("error" in plan) return { stare: "eroare", error: plan.error };
    if (!ctx) return { stare: "indisponibil", plan };

    const subtotal = round2(Number(order.subtotal) + plan.deltaSubtotal);
    const extras = sumaExtraoptiunilor(prevItems);
    // Cota INGHETATA a comenzii, ca pe server: o comanda vanduta cu 19% nu
    // capata 21% fiindca s-a schimbat setarea magazinului intre timp. Regula sta
    // in `invoiceVat`, aceeasi pe care o cheama si serverul si cele trei case de
    // facturare — scrisa aici a doua oara, previzualizarea si totalul salvat s-ar
    // fi despartit la prima corectie facuta doar intr-un loc.
    const vat = {
      vat_enabled: ctx.vat_enabled,
      vat_rate: invoiceVat(order, {
        vat_enabled: ctx.vat_enabled, vat_rate: ctx.vat_rate, prices_include_vat: ctx.prices_include_vat,
      }).rate,
      prices_include_vat: ctx.prices_include_vat,
    };
    // Aceeasi formula ca pe server: taxa se SCALEAZA cu baza, pastrand cota
    // convenita la plasare, si numai daca a existat de la bun inceput.
    const cfgTaxa = parseCodFeeConfig(ctx.cod_fee_config);
    const taxaVeche = round2(Number(order.cod_fee_amount) || 0);
    const bazaVeche = round2(Number(order.subtotal) + extras - (Number(order.discount_amount) || 0));
    const bazaNoua = round2(subtotal + extras - (Number(order.discount_amount) || 0));
    const codFee = cfgTaxa.type === "percent" && plan.deltaSubtotal !== 0 && taxaVeche > 0 && bazaVeche > 0
      ? round2(taxaVeche * (bazaNoua / bazaVeche))
      : taxaVeche;

    const r = recalculeazaTotal({
      subtotal,
      extras,
      discount: Number(order.discount_amount) || 0,
      cardDiscount: Number(order.card_discount_amount) || 0,
      codDiscount: Number(order.cod_discount_amount) || 0,
      codFee,
      shipping: cotatieAplicata && quote ? quote.price : Math.max(0, round2(Number(order.shipping_cost) || 0)),
      freeShippingThreshold: ctx.free_shipping_threshold,
      vat,
    });
    return {
      stare: "gata", subtotal, extras, codFee, plan,
      total: r.total, vatAmount: r.vatAmount, vatRate: vat.vat_rate, shipping: r.shipping,
      diferenta: round2(r.total - Number(order.total)),
    };
  }, [added, prevItems, ctx, order, quote, cotatieAplicata]);

  const areEroarePlan = previzualizare.stare === "eroare";
  const diferenta = previzualizare.stare === "gata" ? previzualizare.diferenta : 0;

  // ── Re-cotarea transportului ──
  const destinatieSchimbata = city.trim() !== (addr.city ?? "").trim() || county.trim() !== (addr.county ?? "").trim();
  const eIntern = !addr.country || addr.country.toUpperCase() === "RO";
  // Lockerele sunt excluse: pretul ar veni pentru orasul nou, dar `locker_id` ar
  // ramane al lockerului din orasul VECHI, si coletul ar pleca spre el.
  const potRecota = destinatieSchimbata && eIntern && !!addr.courier && !isPaid && !isLocker
    && activeAwbs.length === 0 && !hasInvoice && Number(order.shipping_cost) > 0;

  function addProduct(p: PickerProduct, variantTitle: string | null, unitPrice: number) {
    setAdded((prev) => {
      const cheie = cheieLinie(p.id, variantTitle);
      const existing = prev.find((l) => cheieLinie(l.id, l.variantTitle) === cheie);
      if (existing) {
        return prev.map((l) => (cheieLinie(l.id, l.variantTitle) === cheie ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { ...p, quantity: 1, variantTitle, unitPrice }];
    });
  }

  function setQty(cheie: string, qty: number) {
    setAdded((prev) => prev
      .map((l) => (cheieLinie(l.id, l.variantTitle) === cheie ? { ...l, quantity: qty } : l))
      .filter((l) => l.quantity > 0));
  }

  function handleRequote() {
    setRequoting(true);
    const marfa = (previzualizare.stare === "eroare" ? prevItems : previzualizare.plan.items)
      .map((i) => i as { product_id?: string | null; quantity?: number })
      .filter((i) => typeof i.product_id === "string" && !i.product_id.startsWith("extra_"));
    getShippingOptions(businessId, {
      county: county.trim(),
      city: city.trim(),
      cart: marfa.map((i) => ({ productId: i.product_id as string, quantity: Number(i.quantity) || 1 })),
      subtotal: previzualizare.stare === "gata" ? previzualizare.subtotal : Number(order.subtotal),
      // Rambursul cotat e cel NOU: prima curierului se calculeaza pe suma pe
      // care o incaseaza el, iar aceea include produsele tocmai adaugate. Si aici
      // conteaza BANII, nu metoda: o comanda cu plata online neincasata pleaca cu
      // ramburs, deci ar fi fost cotata gresit. Vezi `rambursDeIncasat`.
      cod: rambursDeIncasat({
        payment_status: order.payment_status,
        total: previzualizare.stare === "gata" ? previzualizare.total : Number(order.total),
      }),
    }).then((optiuni) => {
      setRequoting(false);
      const potrivita = optiuni.find((o) => o.courier === addr.courier
        && o.deliveryType === (isLocker ? "locker" : "address") && o.token);
      if (!potrivita?.token) {
        setQuote(null);
        toast.error("Nu am gasit acelasi serviciu de curierat pentru noua destinatie. Verifica transportul manual.");
        return;
      }
      setQuote({ price: potrivita.price, token: potrivita.token, label: potrivita.courierLabel, county: county.trim(), city: city.trim() });
      setQuoteApplied(false);
    }).catch(() => {
      setRequoting(false);
      toast.error("Nu s-a putut cere cotatia de transport. Incearca din nou.");
    });
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
      else if (key === "gls") res = await deleteGlsAwbAction(businessId, order.id);
      else if (key === "pallex") res = await deletePallexAwbAction(businessId, order.id);
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
        added_items: added.map((l) => ({ product_id: l.id, variant_title: l.variantTitle, quantity: l.quantity })),
        // Eticheta pleaca odata cu pretul si cu tokenul: e semnata, deci fara ea
        // verificarea de pe server nu are cum sa bata.
        ...(cotatieAplicata && quote
          ? { shipping_cost: quote.price, shipping_token: quote.token, courier_label: quote.label }
          : {}),
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

  // Combinatia aleasa in panoul de variante, cand e completa.
  const pickVariants = picking?.variante ? variantsDinSlim(picking.variante) : null;
  const pickTitle = pickVariants ? comboTitle(pickVariants.options, pickSel) : null;
  const pickCombo = pickVariants ? findCombo(pickVariants, pickTitle) : null;
  const pickSlim = picking?.variante?.combos.find((c) => c.title === pickTitle) ?? null;
  const pickEpuizat = pickSlim?.stock === 0;

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

              {/* Transportul nu se muta singur cu destinatia: se cere si se aplica explicit. */}
              {destinatieSchimbata && (
                <div className="p-3 bg-info/5 border border-info/20 rounded-lg space-y-2">
                  <div className="flex items-start gap-2">
                    <Truck className="h-4 w-4 text-info mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-foreground">
                      Ai schimbat destinatia. Transportul din comanda ({formatPrice(Number(order.shipping_cost))}) a fost
                      cotat pentru adresa veche{potRecota ? " — poti cere o cotatie noua." : "."}
                    </p>
                  </div>
                  {potRecota && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleRequote} disabled={requoting}>
                        {requoting ? <Loader2 className="animate-spin" /> : <Truck />}
                        Recoteaza transportul
                      </Button>
                      {quote && cotatieValida && (
                        <>
                          <span className="text-xs text-foreground">
                            {quote.label}: <strong>{formatPrice(quote.price)}</strong>
                          </span>
                          <Button size="sm" variant={cotatieAplicata ? "secondary" : "default"}
                            onClick={() => setQuoteApplied((v) => !v)}>
                            {cotatieAplicata ? <><Check /> Aplicat</> : "Aplica"}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {!potRecota && (
                    <p className="text-[11px] text-muted-foreground">
                      {hasInvoice ? "Comanda are factura emisa, deci transportul nu se mai poate schimba din panou."
                        : isPaid ? "Comanda e platita online, deci transportul nu se schimba automat."
                        : activeAwbs.length > 0 ? "Anuleaza intai AWB-ul ca sa poti recota transportul."
                        : Number(order.shipping_cost) <= 0 ? "Comanda are livrare gratuita, care se pastreaza."
                        : "Transportul ramane cel din comanda."}
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Add products */}
            <section className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Adauga produse in comanda</p>

              {hasInvoice ? (
                <div className="flex items-start gap-2 p-3 bg-muted/40 border border-border rounded-lg">
                  <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Comanda are factura <strong>{numarFactura}</strong>. Nu se mai pot adauga produse:
                    documentul fiscal a plecat deja cu totalul lui. Emite storno in contul de facturare,
                    apoi fa o comanda noua pentru diferenta. Datele clientului si adresa se pot corecta si acum.
                  </p>
                </div>
              ) : (
                <>
                  {added.length > 0 && (
                    <div className="space-y-2">
                      {added.map((l) => {
                        const cheie = cheieLinie(l.id, l.variantTitle);
                        // Cat adauga LINIA ASTA la comanda, nu `pret x cantitate`:
                        // la trepte si la contopire cele doua nu sunt acelasi
                        // numar, si randul se batea cap in cap cu subtotalul de
                        // dedesubt (342,00 langa o crestere de 273,60).
                        const contributie = previzualizare.stare === "eroare"
                          ? null : previzualizare.plan.contributii[cheie] ?? null;
                        const altPret = contributie !== null
                          && Math.abs(contributie - l.unitPrice * l.quantity) > 0.005;
                        return (
                          <div key={cheie} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                            {/* Numele intreg, ca la detaliile comenzii: taiat, nu se mai
                                deosebeau produsele cu inceput identic. */}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm break-words text-foreground">
                                {l.name}
                                {l.variantTitle && <span className="text-muted-foreground"> ({l.variantTitle})</span>}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatPrice(l.unitPrice)} / buc
                                {altPret && <span className="text-primary font-medium"> · pret de pachet</span>}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button onClick={() => setQty(cheie, l.quantity - 1)}
                                className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-8 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                              <button onClick={() => setQty(cheie, l.quantity + 1)}
                                className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <span className="w-20 text-right text-sm font-semibold text-foreground shrink-0">
                              {formatPrice(contributie ?? l.unitPrice * l.quantity)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Panoul de variante: un produs variabil nu se poate adauga fara marime. */}
                  {picking && pickVariants && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">{picking.name}</p>
                        <button onClick={() => { setPicking(null); setPickSel({}); }}
                          className="p-1 rounded-lg hover:bg-muted transition-colors shrink-0">
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </div>
                      <VariantPicker
                        variants={pickVariants}
                        selected={pickSel}
                        onSelect={(optiune, valoare) => setPickSel((prev) => ({ ...prev, [optiune]: valoare }))}
                        color={CULOARE_BRAND}
                        compact
                      />
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <p className="text-xs text-muted-foreground">
                          {!pickTitle ? "Alege toate optiunile."
                            : !pickCombo ? "Combinatia asta nu este disponibila."
                            : pickEpuizat ? "Varianta aleasa are stoc zero."
                            : `Pret: ${formatPrice(pickSlim?.price ?? picking.price)}`}
                        </p>
                        <Button size="sm" disabled={!pickCombo || pickEpuizat}
                          onClick={() => {
                            if (!pickCombo || !pickTitle) return;
                            addProduct(picking, pickTitle, pickSlim?.price ?? picking.price);
                            setPicking(null);
                            setPickSel({});
                          }}>
                          <Plus /> Adauga
                        </Button>
                      </div>
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
                        const areVariante = !!p.variante;
                        // Un produs variabil ramas fara nicio combinatie activa nu se
                        // poate adauga deloc: pretul de baza nu e unul pe care sa il
                        // fi pus cineva in vanzare.
                        const faraCombinatii = areVariante && p.variante!.combos.length === 0;
                        // Stocul de PRODUS conteaza si la produsele variabile:
                        // combinatiile fara numar completat mostenesc stocul
                        // produsului, iar un produs pe zero nu se poate vinde
                        // oricat de plina ar parea marimea.
                        const outProdus = p.track_inventory && (p.stock_quantity ?? 0) <= 0;
                        const out = faraCombinatii || outProdus
                          || (areVariante && p.variante!.combos.every((c) => c.stock === 0));
                        return (
                          <button key={p.id}
                            onClick={() => {
                              if (out) return;
                              if (areVariante) { setPicking(p); setPickSel({}); return; }
                              addProduct(p, null, p.price);
                            }}
                            disabled={out}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm text-foreground truncate">{p.name}</span>
                              {faraCombinatii && <span className="text-[10px] font-bold text-destructive shrink-0">FARA VARIANTE ACTIVE</span>}
                              {out && !faraCombinatii && <span className="text-[10px] font-bold text-destructive shrink-0">STOC 0</span>}
                              {!out && areVariante && <span className="text-[10px] text-primary font-medium shrink-0">ALEGE OPTIUNILE</span>}
                              {!out && !areVariante && p.track_inventory && (
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
                </>
              )}
            </section>

            {/* Warnings */}
            {isPaid && diferenta > 0 && (
              <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <p className="text-xs text-foreground">
                  Comanda este deja <strong>platita online</strong>. Diferenta de {formatPrice(diferenta)} <strong>nu se incaseaza automat</strong> —
                  trebuie recuperata separat de la client (ex. link de plata sau ramburs).
                </p>
              </div>
            )}
            {isPaid && diferenta < 0 && (
              <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <p className="text-xs text-foreground">
                  Comanda este deja <strong>platita online</strong>, iar totalul nou este mai mic cu {formatPrice(Math.abs(diferenta))}.
                  Diferenta trebuie returnata clientului separat.
                </p>
              </div>
            )}

            {/* Totals */}
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total actual</span>
                <span className="font-medium text-foreground">{formatPrice(Number(order.total))}</span>
              </div>
              {previzualizare.stare === "eroare" ? (
                <p className="text-xs text-destructive pt-1">{previzualizare.error}</p>
              ) : previzualizare.stare === "indisponibil" ? (
                (added.length > 0 || cotatieAplicata) && (
                  <p className="text-xs text-muted-foreground pt-1">Totalul se recalculeaza la salvare.</p>
                )
              ) : (added.length > 0 || cotatieAplicata) && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Produse</span>
                    <span className="font-medium text-foreground">{formatPrice(previzualizare.subtotal)}</span>
                  </div>
                  {previzualizare.extras > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Extraoptiuni</span>
                      <span className="font-medium text-foreground">{formatPrice(previzualizare.extras)}</span>
                    </div>
                  )}
                  {previzualizare.codFee > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Taxa ramburs</span>
                      <span className="font-medium text-foreground">{formatPrice(previzualizare.codFee)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Transport</span>
                    <span className="font-medium text-foreground">
                      {previzualizare.shipping > 0 ? formatPrice(previzualizare.shipping) : "Gratuit"}
                    </span>
                  </div>
                  {previzualizare.vatAmount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      {/* Cota COMENZII, nu cea de azi a magazinului: pe o comanda
                          vanduta la 19 intr-un magazin trecut pe 21, eticheta
                          scria „TVA (21%)" peste o suma calculata cu 19. */}
                      <span className="text-muted-foreground">TVA ({previzualizare.vatRate}%)</span>
                      <span className="font-medium text-foreground">{formatPrice(previzualizare.vatAmount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm border-t border-border pt-1.5">
                    <span className="font-semibold text-foreground">Total nou</span>
                    <span className="font-bold text-foreground">{formatPrice(previzualizare.total)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={saving}>Renunta</Button>
              <Button onClick={handleSave} disabled={saving || areEroarePlan || !name.trim() || !phone.trim() || !address.trim() || !city.trim() || !county.trim()}>
                {saving ? <><Loader2 className="animate-spin" /> Se salveaza...</> : "Salveaza modificarile"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
