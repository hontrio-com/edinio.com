"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
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
import { deleteEcoletAwbAction } from "@/lib/actions/ecolet.actions";
import { detachCOAwb } from "@/lib/actions/colete.actions";
import { VariantPicker } from "@/components/ministore/VariantPicker";
import { comboTitle, findCombo } from "@/lib/storefront/variants";
import {
  amprentaLinii,
  capacitatiLinii,
  cheieLinie,
  planificaEditarea,
  recalculeazaTotal,
  reducerileDepasescMarfa,
  sumaExtraoptiunilor,
  variantsDinSlim,
  type CapacitateLinie,
  type CatalogEdit,
  type ModificareLinie,
  type PlanEditare,
  type VarianteSlim,
} from "@/lib/orders/edit-pricing";
import { MAX_CANTITATE_LINIE } from "@/lib/orders/quantity";
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
  /** Mai e produsul in vanzare? Fals doar pe linii deja vandute, stinse intre timp. */
  activ: boolean;
  /** Prima poza a produsului. `null` cand n-are niciuna. */
  imagine: string | null;
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
  /** Catalogul VIU al produselor DEJA pe comanda — pentru repretuire si capacitati. */
  catalogLinii: PickerProduct[];
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

/** Butoanele de cantitate: 36px, pragul de atins cu degetul folosit in tot panoul. */
const pasCls = "w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

/** Culoarea de brand, ceruta de `VariantPicker` ca hex (isi compune singur alfa). */
const CULOARE_BRAND = "#1AB554";

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Un rand de produs din fereastra de editare — si pentru liniile care sunt DEJA
 * pe comanda, si pentru cele tocmai adaugate.
 *
 * ═══ DE CE E PE DOUA ETAJE ═══
 *
 * Randul dinainte punea numele, pasul de cantitate si suma pe acelasi rand, cu
 * latimi FIXE pe ultimele doua (100px + 80px, amandoua `shrink-0`). La 320px
 * ramaneau 10px pentru numele produsului, iar butonul de scoatere ar mai fi luat
 * inca 36 — adica latime negativa. Vezi [[depasire-orizontala-mobil]].
 *
 * Asa, numele are toata latimea si se rupe pe cate randuri ii trebuie (`break-words`,
 * nu `truncate`: pe telefon `truncate` taie exact partea care deosebeste doua
 * produse cu inceput identic — lectia deja scrisa la detaliile comenzii), iar
 * controalele stau dedesubt, unde incap la orice latime.
 */
function RandProdus({ nume, detaliu, suma, cantitate, poateCreste, motiv, onMinus, onPlus, onScoate, sters }: {
  nume: string;
  detaliu?: string | null;
  suma: number;
  cantitate: number;
  poateCreste: boolean;
  motiv?: string | null;
  onMinus: () => void;
  onPlus: () => void;
  onScoate: () => void;
  sters?: boolean;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 transition-colors ${sters ? "border-destructive/30 bg-destructive/5" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm break-words ${sters ? "text-muted-foreground line-through" : "text-foreground"}`}>{nume}</p>
          {detaliu && <p className="text-xs text-muted-foreground mt-0.5">{detaliu}</p>}
        </div>
        <span className={`text-sm font-semibold shrink-0 tabular-nums ${sters ? "text-muted-foreground" : "text-foreground"}`}>
          {formatPrice(suma)}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {sters ? (
          <p className="text-xs font-medium text-destructive">Scoasa din comanda</p>
        ) : (
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onMinus} className={pasCls} aria-label="Scade cantitatea">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center text-sm font-semibold tabular-nums">{cantitate}</span>
            <button type="button" onClick={onPlus} disabled={!poateCreste} className={pasCls}
              title={poateCreste ? "Creste cantitatea" : motiv ?? undefined} aria-label="Creste cantitatea">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
        <Button type="button" variant={sters ? "outline" : "ghost"} size="sm"
          className={sters ? "" : "text-destructive hover:text-destructive hover:bg-destructive/10"}
          onClick={onScoate}>
          {sters ? <><Check /> Pune la loc</> : <><Trash2 /> Scoate</>}
        </Button>
      </div>
      {!sters && !poateCreste && motiv && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{motiv}</p>
      )}
    </div>
  );
}

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
  /** Cantitatile noi ale liniilor EXISTENTE, pe indexul lor. `0` = scoasa. */
  const [modificari, setModificari] = useState<Record<number, number>>({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, startSave] = useTransition();
  const [cancellingKey, setCancellingKey] = useState<string | null>(null);
  const [cancelPending, startCancel] = useTransition();
  /** A pornit apasarea chiar pe fundal? Vezi invelisul, la capatul fisierului. */
  const apasatPeFundal = useRef(false);

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
    setModificari({});
    setQuery("");
    setPicking(null);
    setPickSel({});
    setQuote(null);
    setQuoteApplied(false);
    setCtx(null);
    getOrderEditContext(businessId, order.id).then((res) => setCtx("error" in res ? null : res as EditContext));
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

  /*
   * ═══ CE S-AR PIERDE DACA FEREASTRA S-AR INCHIDE ACUM ═══
   *
   * Invelisul e acum un singur `div` cu `onClick={onClose}` — asa se repara clicul
   * in gol, care inainte nu inchidea deloc (doi frati la acelasi `z-50`, al doilea
   * il acoperea pe primul). Dar exact aceeasi reparatie face ca un clic scapat in
   * afara ferestrei sa arunce tot: liniile scoase, produsele adaugate, cotatia de
   * transport si campurile corectate.
   *
   * Deci fundalul si Escape inchid doar cand nu s-a facut nimic. Cand s-a facut,
   * inchiderea ramane pe „Renunta" si pe X — doua butoane pe care nu le apesi din
   * greseala cu mouse-ul in drum.
   */
  const areSchimbari = added.length > 0
    || Object.keys(modificari).length > 0
    || quote !== null
    || name !== (order.customer_name ?? "")
    || phone !== (order.customer_phone ?? "")
    || email !== (order.customer_email ?? "")
    || address !== (addr.address ?? "")
    || city !== (addr.city ?? "")
    || county !== (addr.county ?? "")
    || postal !== (addr.postal_code ?? "");

  const inchideCuGrija = useCallback(() => {
    if (saving) return;
    if (areSchimbari) {
      toast.message("Ai modificari nesalvate. Salveaza-le, sau apasa Renunta ca sa le lasi.");
      return;
    }
    onClose();
  }, [saving, areSchimbari, onClose]);

  /*
   * Escape si blocarea derularii paginii — amandoua lipseau.
   *
   * Fara a doua, derularea modalului ajunsa la capat continua pe pagina comenzii
   * de dedesubt, si comerciantul pierde locul din formular. Valoarea dinainte se
   * salveaza si se pune la loc: pusa fix pe `""`, ar sterge o blocare pusa de
   * altcineva (pagina are si ea sertare).
   */
  useEffect(() => {
    if (!open) return;
    const laTasta = (e: KeyboardEvent) => { if (e.key === "Escape") inchideCuGrija(); };
    document.addEventListener("keydown", laTasta);
    const inainte = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", laTasta);
      document.body.style.overflow = inainte;
    };
  }, [open, inchideCuGrija]);

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
    if (order.ecolet_awb_number) list.push({ key: "ecolet", label: "eColet", awb: order.ecolet_awb_number });
    /* ⚠ Cazul propriu eColet: emiterea e asincrona, deci comanda poate avea o
       expediere REALA in curs, fara AWB inca. Fara randul asta, lista ar fi
       goala si comerciantul ar edita adresa unei comenzi care deja pleaca. */
    if (!order.ecolet_awb_number && order.ecolet_order_to_send_id) {
      /* ⚠ FARA `manualOnly`: acela aprinde nota scrisa anume pentru Colete Online
         („anuleaza si din contul Colete"), care n-are nicio legatura cu eColet. */
      list.push({ key: "ecolet", label: "eColet (se emite...)", awb: "in curs" });
    }
    if (order.colete_awb_number) list.push({ key: "colete", label: "Colete Online", awb: order.colete_awb_number, manualOnly: true });
    return list;
  }, [order]);

  const isPaid = order.payment_status === "paid";
  const hasInvoice = !!(order.smartbill_invoice_number || order.oblio_invoice_number || order.fgo_invoice_number);
  const numarFactura = order.smartbill_invoice_number || order.oblio_invoice_number || order.fgo_invoice_number;
  const isLocker = addr.delivery_type === "locker";
  const prevItems = useMemo(() => (Array.isArray(order.items) ? (order.items as unknown[]) : []), [order.items]);
  const marketplace = (order.order_source as { marketplace?: string } | null)?.marketplace ?? null;

  /*
   * Cand NU se umbla la marfa — si de ce. Cele doua sunt separate anume, fiindca
   * si serverul le trateaza separat: fiecare mesaj de aici e chiar motivul pentru
   * care actiunea ar refuza, nu o aproximare a lui.
   *
   * Scoaterea are conditii mai stranse decat adaugarea, si nu din exces de zel: la
   * o adaugare coletul pleaca fara marfa in plus, ceea ce se vede si se repara; la
   * o scoatere coletul e deja la curier CU marfa in el, declarat cu greutatea si
   * rambursul de atunci, iar comanda ar spune ca marfa aia n-a plecat niciodata.
   */
  const liniiBlocate: string | null = hasInvoice
    ? `Comanda are factura ${numarFactura}. Documentul fiscal a plecat deja cu totalul lui, deci marfa nu se mai schimba din panou: emite storno la furnizorul de facturare, apoi fa o comanda noua pentru diferenta. Datele clientului si adresa se pot corecta si acum.`
    : activeAwbs.length > 0
      ? "Comanda are AWB emis, iar coletul e declarat la curier cu marfa si rambursul de atunci. Anuleaza AWB-ul mai sus, schimba liniile, apoi genereaza unul nou."
      : marketplace
        ? `Comanda vine din ${marketplace}, iar liniile ei se schimba din contul de acolo — altfel urmatoarea sincronizare le-ar scrie la loc. Datele clientului si adresa se pot corecta si de aici.`
        : null;
  /*
   * Adaugarea ramane exact cu conditia dinainte: doar factura o opreste.
   *
   * Cand o opreste, motivul e ACELASI cu cel al liniilor si e deja scris mai sus,
   * asa ca sectiunea de adaugare dispare cu totul in loc sa repete acelasi paragraf
   * la doua degete distanta. Cand liniile sunt blocate din alt motiv (AWB emis,
   * comanda de marketplace), adaugarea merge mai departe si sectiunea ramane.
   */
  const adaugareBlocata = hasInvoice;

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

  /** Catalogul viu: si produsele de pe comanda, si cele tocmai adaugate. */
  const catalog = useMemo(() => {
    const m = new Map<string, CatalogEdit>();
    for (const p of ctx?.catalogLinii ?? []) {
      m.set(p.id, { name: p.name, price: p.price, is_bundle: p.is_bundle, activ: p.activ, variante: p.variante, trepte: p.trepte });
    }
    for (const l of added) {
      m.set(l.id, { name: l.name, price: l.price, is_bundle: l.is_bundle, activ: l.activ, variante: l.variante, trepte: l.trepte });
    }
    return m;
  }, [ctx, added]);

  /*
   * Ce se poate face cu fiecare linie — calculat AICI, peste liniile pe care le
   * arata chiar fereastra.
   *
   * Serverul cheama exact aceeasi functie, dar peste randul lui de comanda. Luate
   * gata calculate de la el, indicii ar fi venit dintr-o A DOUA citire a liniilor,
   * iar intre cele doua incape o schimbare: indicele 2 de pe ecran n-ar mai fi fost
   * indicele 2 al raspunsului, si s-ar fi scos alt produs. Asa, indicii, amprenta
   * si cifrele ies toate din acelasi vector.
   *
   * Cat timp catalogul nu s-a incarcat, lista iese goala si sectiunea arata un
   * cerc de asteptare — nu niste randuri cu butoane care ar minti.
   */
  const capacitati = useMemo<CapacitateLinie[]>(
    () => (ctx ? capacitatiLinii(prevItems, catalog) : []),
    [ctx, prevItems, catalog],
  );

  /** Doar liniile chiar schimbate — restul n-au ce cauta in cerere. */
  const modificariCerute = useMemo<ModificareLinie[]>(() => (
    Object.entries(modificari)
      .map(([k, v]) => ({ index: Number(k), quantity: v }))
      .filter((m) => capacitati[m.index] && m.quantity !== capacitati[m.index].quantity)
  ), [modificari, capacitati]);

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
    const plan = planificaEditarea(
      prevItems,
      modificariCerute,
      added.map((l) => ({ product_id: l.id, variant_title: l.variantTitle, quantity: l.quantity })),
      catalog,
    );
    if ("error" in plan) return { stare: "eroare", error: plan.error };
    if (!ctx) return { stare: "indisponibil", plan };

    const subtotal = round2(Number(order.subtotal) + plan.deltaSubtotal);
    // Extraoptiunile de DUPA editare: una scoasa trebuie sa iasa si din total.
    const extras = plan.extras;
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
    const bazaVeche = round2(Number(order.subtotal) + sumaExtraoptiunilor(prevItems) - (Number(order.discount_amount) || 0));
    const bazaNoua = round2(subtotal + extras - (Number(order.discount_amount) || 0));
    // Poarta e „BAZA s-a schimbat", ca pe server: extraoptiunile intra in baza
    // taxei, dar niciodata in subtotal, deci scoaterea ambalarii cadou trebuie sa
    // miste taxa chiar daca marfa a ramas neatinsa.
    const codFee = cfgTaxa.type === "percent" && bazaNoua !== bazaVeche && taxaVeche > 0 && bazaVeche > 0
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
  }, [added, modificariCerute, prevItems, catalog, ctx, order, quote, cotatieAplicata]);

  const areEroarePlan = previzualizare.stare === "eroare";
  const eroarePlan = previzualizare.stare === "eroare" ? previzualizare.error : null;
  const diferenta = previzualizare.stare === "gata" ? previzualizare.diferenta : 0;
  const areSchimbariMarfa = modificariCerute.length > 0 || added.length > 0;

  /*
   * Reducerea inghetata poate ajunge peste marfa ramasa, iar `recalculeazaTotal`
   * plafoneaza totalul la zero — corect ca aritmetica, dar pe ecran s-ar fi citit
   * doar „Total nou 0,00", fara nicio explicatie. Serverul refuza cu acelasi motiv.
   */
  const reducereaDepaseste = previzualizare.stare === "gata" && reducerileDepasescMarfa({
    subtotal: previzualizare.subtotal,
    extras: previzualizare.extras,
    discount: Number(order.discount_amount) || 0,
    cardDiscount: Number(order.card_discount_amount) || 0,
    codDiscount: Number(order.cod_discount_amount) || 0,
  });

  /** Randurile finale ale liniilor existente, pe index — pentru cifrele de pe ecran. */
  const randuri = useMemo(() => {
    const m = new Map<number, { quantity: number; price: number; subtotal: number }>();
    if (previzualizare.stare === "eroare") return m;
    for (const r of previzualizare.plan.randuri) m.set(r.index, { quantity: r.quantity, price: r.price, subtotal: r.subtotal });
    return m;
  }, [previzualizare]);

  /** Liniile scazute al caror stoc nu se poate da inapoi automat. */
  const faraStoc = previzualizare.stare === "eroare" ? [] : previzualizare.plan.faraStoc;

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
        return prev.map((l) => (cheieLinie(l.id, l.variantTitle) === cheie
          ? { ...l, quantity: Math.min(MAX_CANTITATE_LINIE, l.quantity + 1) } : l));
      }
      return [...prev, { ...p, quantity: 1, variantTitle, unitPrice }];
    });
  }

  function setQty(cheie: string, qty: number) {
    setAdded((prev) => prev
      .map((l) => (cheieLinie(l.id, l.variantTitle) === cheie
        ? { ...l, quantity: Math.min(MAX_CANTITATE_LINIE, qty) } : l))
      .filter((l) => l.quantity > 0));
  }

  /** Cantitatea unei linii existente, clemata in browser (pe server se REFUZA). */
  const setLinie = useCallback((index: number, qty: number) => {
    setModificari((prev) => ({ ...prev, [index]: Math.max(0, Math.min(MAX_CANTITATE_LINIE, qty)) }));
  }, []);

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
      else if (key === "ecolet") res = await deleteEcoletAwbAction(businessId, order.id);
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
        linii_modificate: modificariCerute,
        // Amprenta liniilor pe care le-a VAZUT fereastra. Fara ea, indexul cerut
        // ar putea arata spre alt produs decat cel apasat.
        ...(modificariCerute.length > 0 ? { amprenta_items: amprentaLinii(prevItems) } : {}),
        // Eticheta pleaca odata cu pretul si cu tokenul: e semnata, deci fara ea
        // verificarea de pe server nu are cum sa bata.
        ...(cotatieAplicata && quote
          ? { shipping_cost: quote.price, shipping_token: quote.token, courier_label: quote.label }
          : {}),
      });
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Comanda a fost actualizata.");
      if (res.faraStoc > 0) {
        toast.warning(`${res.faraStoc === 1 ? "O linie scoasa nu si-a putut" : `${res.faraStoc} linii scoase nu si-au putut`} da stocul inapoi automat. Corecteaza stocul din pagina produsului.`);
      }
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
    /*
     * Invelisul e tiparul deja folosit de patru ori in panou (CustomerImportModal,
     * CustomersClient, DomainSection, AdminDomainOrdersClient): UN SINGUR `div`
     * care e si fundal si centrare, deci clicul in gol chiar inchide — inainte
     * erau doi frati la acelasi `z-50`, iar al doilea inghitea clicurile pe primul.
     *
     * `p-0 sm:p-4` + `items-end sm:items-center` = foaie lipita de jos pe telefon,
     * fereastra centrata pe ecran mare. `dvh`, nu `vh`: pe iOS `vh` se raporteaza
     * la viewportul cu bara URL ascunsa, deci subsolul cadea sub marginea de jos si
     * la butonul „Salveaza" nu se mai putea ajunge. Si `flex flex-col` + corp
     * `overflow-y-auto flex-1`, ca antetul si subsolul sa ramana pe loc.
     */
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      /*
       * Inchiderea se leaga de „am APASAT si am RIDICAT pe fundal", nu doar de
       * `click`. Un `click` se emite pe cel mai apropiat stramos comun, deci o
       * selectie de text pornita intr-un camp si terminata in afara ferestrei ar fi
       * inchis-o — cu tot cu ce era nesalvat in ea.
       */
      onMouseDown={(e) => { apasatPeFundal.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && apasatPeFundal.current) inchideCuGrija(); }}>
      <div className="w-full sm:max-w-2xl bg-background border border-border sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] h-[100dvh] sm:h-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Pencil className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Editeaza comanda</p>
              <p className="text-xs text-muted-foreground truncate">{order.order_number} — {order.customer_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -mr-1 rounded-lg hover:bg-muted transition-colors shrink-0" aria-label="Inchide">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-5 overflow-y-auto flex-1">
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
                <div key={a.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-sm text-foreground min-w-0 break-all">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Nume complet</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Telefon</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Email (optional)</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" className={inputCls} />
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <input value={postal} onChange={(e) => setPostal(e.target.value)} inputMode="numeric" className={inputCls} />
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

          {/* ── Produsele DEJA pe comanda: cantitate si scoatere ── */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Produsele din comanda</p>

            {liniiBlocate && (
              <div className="flex items-start gap-2 p-3 bg-muted/40 border border-border rounded-lg">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">{liniiBlocate}</p>
              </div>
            )}

            {/*
              Motivul pentru care „Salveaza" e stins sta LANGA liniile pe care le-a
              apasat omul, nu doar in caseta de totaluri de la coada corpului
              derulabil — pe telefon, aceea e cu un ecran mai jos.
            */}
            {eroarePlan && (
              <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-xs text-destructive leading-relaxed">{eroarePlan}</p>
              </div>
            )}
            {!eroarePlan && reducereaDepaseste && (
              <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-xs text-destructive leading-relaxed">
                  Marfa ramasa e mai mica decat reducerile de pe comanda, deci totalul ar iesi negativ.
                  Lasa mai multe produse pe comanda, sau anuleaz-o si fa una noua fara cupon.
                </p>
              </div>
            )}

            {!ctx ? (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : capacitati.length === 0 ? (
              <p className="text-xs text-muted-foreground">Comanda nu are linii de citit.</p>
            ) : (
              <div className="space-y-2">
                {capacitati.map((cap) => {
                  const rand = randuri.get(cap.index);
                  /*
                   * Cantitatea de pe ecran vine din CE A CERUT OMUL, nu din plan.
                   *
                   * Cand planul iese cu eroare — de pilda „comanda ar ramane fara
                   * niciun produs", la o comanda cu o singura linie — `randuri` e
                   * goala. Citita de acolo, linia se redesena ca si cum nimeni n-ar
                   * fi apasat „Scoate", iar a doua apasare o ducea la 2 in loc sa o
                   * scoata. Planul ramane sursa doar pentru pret si subtotal.
                   */
                  const cantitate = modificari[cap.index] ?? cap.quantity;
                  // Pretul UNITAR de dupa repretuire, nu cel de pe comanda: la un
                  // pachet de trei dus la doua bucati, unitatea urca de la 83,33 la
                  // 100, iar randul ar fi aratat vechiul pret langa suma cea noua.
                  const unitar = rand && rand.quantity > 0 ? rand.price : cap.price;
                  const suma = rand ? rand.subtotal : round2(unitar * cantitate);
                  const sters = cantitate === 0;
                  const nuSeMisca = faraStoc.includes(cap.index);
                  return (
                    <div key={cap.index}>
                      {/*
                        Doar de citit in doua cazuri: fie marfa e blocata (factura,
                        AWB, marketplace), fie linia n-a putut fi citita deloc —
                        acolo nici numele, nici pretul nu se stiu, deci un rand cu
                        butoane ar promite ceva ce nu se poate face.
                      */}
                      {liniiBlocate || !cap.poateScadea ? (
                        <div className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                          <p className="text-sm text-foreground break-words min-w-0 flex-1">
                            {cap.name || <span className="text-muted-foreground italic">Linie pe care nu o pot citi</span>}
                            {cap.name && <span className="ml-1.5 whitespace-nowrap text-muted-foreground">x{cap.quantity}</span>}
                          </p>
                          <span className="text-sm font-semibold text-foreground shrink-0 tabular-nums">
                            {formatPrice(round2(cap.price * cap.quantity))}
                          </span>
                        </div>
                      ) : (
                        <RandProdus
                          nume={cap.name}
                          detaliu={`${formatPrice(unitar)} / buc${cap.esteExtra ? " · optiune extra" : ""}${!cap.repretuire && !cap.esteExtra ? " · pret fix" : ""}`}
                          suma={suma}
                          cantitate={cantitate}
                          poateCreste={cap.poateCreste}
                          motiv={cap.motivCrestere}
                          sters={sters}
                          onMinus={() => setLinie(cap.index, Math.max(0, cantitate - 1))}
                          onPlus={() => setLinie(cap.index, cantitate + 1)}
                          onScoate={() => setLinie(cap.index, sters ? cap.quantity : 0)}
                        />
                      )}
                      {nuSeMisca && (
                        <p className="mt-1 px-1 text-[11px] leading-relaxed text-warning">
                          Stocul acestei linii nu se poate da inapoi automat — corecteaza-l din pagina produsului.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Add products */}
          {!adaugareBlocata && (
            <section className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Adauga produse in comanda</p>
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
                        <RandProdus key={cheie}
                          nume={`${l.name}${l.variantTitle ? ` (${l.variantTitle})` : ""}`}
                          detaliu={`${formatPrice(l.unitPrice)} / buc${altPret ? " · pret de pachet" : ""}`}
                          suma={contributie ?? l.unitPrice * l.quantity}
                          cantitate={l.quantity}
                          poateCreste={l.quantity < MAX_CANTITATE_LINIE}
                          motiv={`Cel mult ${MAX_CANTITATE_LINIE} bucati pe o linie.`}
                          onMinus={() => setQty(cheie, l.quantity - 1)}
                          onPlus={() => setQty(cheie, l.quantity + 1)}
                          onScoate={() => setQty(cheie, 0)}
                        />
                      );
                  })}
                </div>
              )}

                {/* Panoul de variante: un produs variabil nu se poate adauga fara marime. */}
                {picking && pickVariants && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground break-words min-w-0">{picking.name}</p>
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
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
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
                {/*
                  `overscroll-contain`: fara el, derularea listei ajunsa la capat
                  „scapa" in modal si apoi in pagina de dedesubt. Si mai inalta pe
                  telefon, unde fereastra e oricum ecran plin.
                */}
                <div className="max-h-[40dvh] sm:max-h-44 overflow-y-auto overscroll-contain rounded-lg border border-border divide-y divide-border">
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
                          className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                          {/*
                            Poza produsului, ca in lista de produse din panou: cu
                            zece nume care incep la fel, ea e singurul lucru dupa
                            care se deosebesc dintr-o privire. Cand lipseste, ramane
                            patratul cu iconita — nu un gol care strica alinierea.
                          */}
                          {p.imagine ? (
                            <Image src={p.imagine} alt="" width={40} height={40}
                              className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          {/*
                            Numele are toata latimea si se rupe, ca la detaliile
                            comenzii. Etichetele stau SUB el, nu langa: pe acelasi
                            rand, „FARA VARIANTE ACTIVE" plus pretul plus iconita
                            insumau mai mult decat toata latimea unui telefon mic,
                            si randul iesea din chenar.
                          */}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground break-words">{p.name}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-sm font-medium text-foreground">{formatPrice(p.price)}</span>
                              {faraCombinatii && <span className="text-[10px] font-bold text-destructive">FARA VARIANTE ACTIVE</span>}
                              {out && !faraCombinatii && <span className="text-[10px] font-bold text-destructive">STOC 0</span>}
                              {!out && areVariante && <span className="text-[10px] text-primary font-medium">ALEGE OPTIUNILE</span>}
                              {!out && !areVariante && p.track_inventory && (
                                <span className="text-[10px] text-muted-foreground">stoc {p.stock_quantity}</span>
                              )}
                            </div>
                          </div>
                          <Plus className="h-4 w-4 text-primary shrink-0 mt-3" />
                        </button>
                      );
                    })
                  )}
              </div>
            </section>
          )}

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
          {areSchimbariMarfa && (
            <div className="flex items-start gap-2 p-3 bg-muted/40 border border-border rounded-lg">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Clientul <strong>nu este anuntat automat</strong> de schimbare: emailul de confirmare a plecat cu
                liniile de atunci. Daca s-a schimbat ce primeste sau cat plateste, spune-i tu.
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
              (areSchimbariMarfa || cotatieAplicata) && (
                <p className="text-xs text-muted-foreground pt-1">Totalul se recalculeaza la salvare.</p>
              )
            ) : (areSchimbariMarfa || cotatieAplicata) && (
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
        </div>

        {/*
          Subsolul e LIPIT (`flex-shrink-0` in afara corpului derulabil), nu ultimul
          element al unei derulari lungi. Inainte, dupa bannerul de AWB, sapte campuri
          si cautarea de produse, butonul principal era si de negasit, si taiat: la
          320px cele doua butoane insumau mai mult decat latimea disponibila, iar
          `justify-end` impingea „Renunta" sub marginea din stanga.

          `pb-[calc(...)+env(safe-area-inset-bottom)]`: pe iPhone bara de gesturi ar
          fi stat exact peste ele. Aceeasi forma ca bara de pe telefon din ProductForm.
        */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5 border-t border-border flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1 sm:flex-none">Renunta</Button>
          <Button onClick={handleSave} className="flex-1 sm:flex-none sm:ml-auto"
            disabled={saving || areEroarePlan || reducereaDepaseste || !name.trim() || !phone.trim() || !address.trim() || !city.trim() || !county.trim()}>
            {saving ? <><Loader2 className="animate-spin" /> Se salveaza...</> : "Salveaza modificarile"}
          </Button>
        </div>
      </div>
    </div>
  );
}
