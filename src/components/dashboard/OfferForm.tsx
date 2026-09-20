"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { ChevronLeft, Layers, Loader2, Package, Plus, Save, Search, ShoppingCart, Sparkles, Tag, Trash2, X } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { createOffer, updateOffer, type OfferFormData, type OfferRow } from "@/lib/actions/offer.actions";
import {
  OFFER_DEFAULT_MAX_PRODUCTS, type OfferType, type OfferScope, type OfferDiscountMode,
} from "@/lib/offers/offer.types";

interface PickerProduct { id: string; name: string; price: number; image_url: string | null; }

const inputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

// The three offer types available in Faza 1. Each drives which sections show.
const PHASE1 = [
  {
    type: "frequently_bought" as const, icon: Layers,
    label: "Cumparate impreuna",
    desc: "Produsul de pe pagina + altele care merg cu el, la un pret combinat (stil Amazon).",
    offersLabel: "Produse in set (pe langa cel de pe pagina)",
    defaultDiscount: "percent" as OfferDiscountMode, hasDiscount: true,
  },
  {
    type: "cross_sell" as const, icon: Package,
    label: "Recomandari",
    desc: "Sugereaza produse pe pagina produsului si in cos. Recomandare, fara reducere.",
    offersLabel: "Produse recomandate",
    defaultDiscount: "none" as OfferDiscountMode, hasDiscount: false, allowAuto: true,
  },
  {
    type: "order_bump" as const, icon: ShoppingCart,
    label: "Oferta la checkout",
    desc: "Un produs la pret special, adaugat cu o bifa in formularul de comanda.",
    offersLabel: "Produsul oferit",
    defaultDiscount: "percent" as OfferDiscountMode, hasDiscount: true, single: true,
  },
  {
    /*
      ⚠ TIPUL ASTA NU OFERA PRODUSE, ci ieftineste ce e deja in cos. De-aia are
      `praguri: true`: formularul ii ascunde sectiunea de produse oferite si de
      reducere, si arata in loc lista de praguri.
    */
    type: "volume" as const, icon: Layers,
    label: "Reducere cantitate",
    desc: "De la o cantitate in sus, pretul scade cu un procent. Se vede ca tabel pe pagina produsului.",
    offersLabel: "",
    defaultDiscount: "none" as OfferDiscountMode, hasDiscount: false, praguri: true,
  },
];
type Phase1Meta = (typeof PHASE1)[number];

function metaFor(type: OfferType): Phase1Meta {
  return PHASE1.find((p) => p.type === type) ?? PHASE1[1];
}

export function OfferForm({ businessId, products, categories, offer }: {
  businessId: string;
  products: PickerProduct[];
  categories: { id: string; name: string }[];
  offer?: OfferRow;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const isEdit = !!offer;

  const [type, setType] = useState<OfferType>(offer?.type ?? "frequently_bought");
  const meta = metaFor(type);

  const [name, setName] = useState(offer?.name ?? "");
  const [scope, setScope] = useState<OfferScope>(offer?.trigger.scope ?? "products");
  const [triggerIds, setTriggerIds] = useState<string[]>(offer?.trigger.productIds ?? []);
  const [triggerCats, setTriggerCats] = useState<string[]>(offer?.trigger.categories ?? []);

  const [offeredIds, setOfferedIds] = useState<string[]>(offer?.config.productIds ?? []);
  const [autoByCategory, setAutoByCategory] = useState(offer?.config.autoByCategory ?? false);

  const [discountMode, setDiscountMode] = useState<OfferDiscountMode>(
    offer?.config.discountMode ?? (offer ? "none" : "percent"),
  );
  const [discountPercent, setDiscountPercent] = useState(offer?.config.discountPercent != null ? String(offer.config.discountPercent) : "10");
  const [discountAmount, setDiscountAmount] = useState(offer?.config.discountAmount != null ? String(offer.config.discountAmount) : "");
  const [fixedPrice, setFixedPrice] = useState(offer?.config.fixedPrice != null ? String(offer.config.fixedPrice) : "");

  /* Pragurile de cantitate. Se tin ca text cat timp omul scrie: un `number`
     ar fi facut campul sa sara la 0 la prima stergere a cifrei. */
  const [praguri, setPraguri] = useState<{ min_qty: string; percent: string }[]>(
    offer?.config.praguri?.map((x) => ({ min_qty: String(x.min_qty), percent: String(x.percent) }))
      ?? [{ min_qty: "5", percent: "3" }, { min_qty: "10", percent: "10" }],
  );

  const [title, setTitle] = useState(offer?.config.title ?? "");
  const [isActive, setIsActive] = useState(offer?.is_active ?? true);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  /*
    ⚠ Configuratia stricata se ARATA, nu se corecteaza in tacere. Aceeasi
    doctrina ca la upsell-ul de pe produs: serverul refuza oricum salvarea, dar
    comerciantul trebuie sa vada DE CE, nu doar ca „n-a mers".
  */
  const problemaPraguri = useMemo(() => {
    if (!metaFor(type).praguri) return null;
    const curate = praguri
      .map((x) => ({ q: Math.floor(Number(x.min_qty) || 0), p: Number(x.percent) || 0 }))
      .filter((x) => x.q > 0 || x.p > 0);
    if (curate.length === 0) return "Adauga cel putin un prag.";
    for (const x of curate) {
      if (x.q < 2) return "Pragul porneste de la cel putin 2 bucati: la una nu e o reducere de cantitate.";
      if (x.p <= 0 || x.p >= 100) return "Reducerea trebuie sa fie intre 0 si 100 la suta.";
    }
    const dupaCantitate = [...curate].sort((a, b) => a.q - b.q);
    if (new Set(dupaCantitate.map((x) => x.q)).size !== dupaCantitate.length) {
      return "Doua praguri pornesc de la aceeasi cantitate. Sterge-l pe unul.";
    }
    for (let i = 1; i < dupaCantitate.length; i++) {
      if (dupaCantitate[i].p < dupaCantitate[i - 1].p) {
        return `Pragul de la ${dupaCantitate[i].q} bucati da ${dupaCantitate[i].p}%, mai putin decat `
          + `cel de la ${dupaCantitate[i - 1].q} (${dupaCantitate[i - 1].p}%). Cine cumpara mai mult ar `
          + "plati mai mult pe bucata.";
      }
    }
    return null;
  }, [type, praguri]);

  // Switch type (create mode only): reset the discount to the new type's default.
  function chooseType(t: OfferType) {
    setType(t);
    setDiscountMode(metaFor(t).defaultDiscount);
    if (metaFor(t).single) setOfferedIds((prev) => prev.slice(0, 1));
    if (!metaFor(t).allowAuto) setAutoByCategory(false);
  }

  function addOffered(id: string) {
    setOfferedIds((prev) => (meta.single ? [id] : prev.includes(id) ? prev : [...prev, id]));
  }

  // Order-bump preview: exact special price for the single offered product.
  const bumpPreview = useMemo(() => {
    if (!meta.single) return null;
    const p = offeredIds[0] ? byId.get(offeredIds[0]) : null;
    if (!p) return null;
    let price = p.price;
    if (discountMode === "percent") price = p.price * (1 - (Number(discountPercent) || 0) / 100);
    else if (discountMode === "amount") price = p.price - (Number(discountAmount) || 0);
    else if (discountMode === "fixed_price") price = Number(fixedPrice) || 0;
    return { was: p.price, now: Math.max(0, Math.round(price * 100) / 100) };
  }, [meta.single, offeredIds, byId, discountMode, discountPercent, discountAmount, fixedPrice]);

  function save() {
    if (!name.trim()) { toast.error("Oferta are nevoie de un nume."); return; }
    if (scope === "products" && triggerIds.length === 0) { toast.error("Alege cel putin un produs pe care sa apara oferta."); return; }
    if (scope === "categories" && triggerCats.length === 0) { toast.error("Alege cel putin o categorie."); return; }
    /* ⚠ Oferta de cantitate nu OFERA produse: sare peste verificarea de mai
       jos, altfel n-ar putea fi salvata niciodata. In schimb ii cere praguri. */
    if (meta.praguri) {
      if (problemaPraguri) { toast.error(problemaPraguri); return; }
    } else {
      const usesAuto = meta.allowAuto && autoByCategory;
      if (!usesAuto && offeredIds.length === 0) { toast.error("Alege cel putin un produs de oferit."); return; }
    }
    if (meta.hasDiscount && discountMode === "fixed_price" && !(Number(fixedPrice) > 0)) { toast.error("Seteaza un pret fix valid."); return; }

    const payload: OfferFormData = {
      type,
      name,
      is_active: isActive,
      priority: offer?.priority ?? 0,
      trigger: {
        scope,
        productIds: scope === "products" ? triggerIds : [],
        categories: scope === "categories" ? triggerCats : [],
      },
      config: {
        productIds: meta.allowAuto && autoByCategory ? [] : offeredIds,
        autoByCategory: meta.allowAuto && autoByCategory,
        maxProducts: OFFER_DEFAULT_MAX_PRODUCTS,
        discountMode: meta.hasDiscount ? discountMode : "none",
        discountPercent: meta.hasDiscount && discountMode === "percent" ? Number(discountPercent) || 0 : undefined,
        discountAmount: meta.hasDiscount && discountMode === "amount" ? Number(discountAmount) || 0 : undefined,
        fixedPrice: meta.hasDiscount && discountMode === "fixed_price" ? Number(fixedPrice) || 0 : undefined,
        title: title.trim() || undefined,
        praguri: meta.praguri
          ? praguri
              .map((x) => ({ min_qty: Math.floor(Number(x.min_qty) || 0), percent: Number(x.percent) || 0 }))
              .filter((x) => x.min_qty >= 2 && x.percent > 0 && x.percent < 100)
          : undefined,
      },
      display: {},
      starts_at: null,
      ends_at: null,
    };

    startSave(async () => {
      let res: Awaited<ReturnType<typeof updateOffer>> | Awaited<ReturnType<typeof createOffer>>;
      try {
        res = offer ? await updateOffer(offer.id, businessId, payload) : await createOffer(businessId, payload);
      } catch {
        /* ⚠ Acelasi ternar, dar scris pe un singur rand. Mesajul se desparte la fel. */
        toast.error(
          offer
            ? "Nu am primit raspuns de la server, deci nu stim daca modificarile ofertei s-au salvat. Apasa din nou pe "
              + "salvare: trimitem toata oferta, deci a doua apasare nu strica nimic."
            : "Nu am primit raspuns de la server, deci nu stim daca oferta s-a creat. Uita-te intai in lista de oferte, "
              + "ca sa nu iasa doua.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(offer ? "Oferta actualizata." : "Oferta creata.");
      router.push("/dashboard/offers");
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/dashboard/offers")}
          className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-bold text-foreground">{isEdit ? "Editeaza oferta" : "Oferta noua"}</h1>
        {isEdit && <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">{meta.label}</span>}
      </div>

      {/* Type picker (create only) */}
      {!isEdit && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PHASE1.map((t) => {
            const Icon = t.icon;
            const active = type === t.type;
            return (
              <button key={t.type} type="button" onClick={() => chooseType(t.type)}
                className={`text-left rounded-2xl border p-4 transition-all ${active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card hover:border-primary/40"}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${active ? "bg-primary text-white" : "bg-primary/10 text-primary"}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-foreground">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t.desc}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Name */}
      <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Nume ofertă (intern)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Accesorii recomandate" className={inputCls} />
          <p className="text-xs text-muted-foreground mt-1">Numele îl vezi doar tu, în listă. Clienții văd titlul de mai jos.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Titlu afișat clienților (opțional)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={meta.label} className={inputCls} />
        </div>
      </div>

      {/* CÂND APARE — trigger */}
      <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Tag className="h-4 w-4 text-primary" /> Când apare</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {meta.single ? "Oferta apare la checkout când coșul conține:" : "Oferta apare pe pagina produsului pentru:"}
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          {([
            { v: "products", label: "Anumite produse" },
            { v: "categories", label: "O categorie" },
            { v: "all", label: "Toate produsele" },
          ] as const).map((s) => (
            <button key={s.v} type="button" onClick={() => setScope(s.v)}
              className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors ${scope === s.v ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
              {s.label}
            </button>
          ))}
        </div>

        {scope === "products" && (
          <ProductPicker products={products} selectedIds={triggerIds} byId={byId}
            onAdd={(id) => setTriggerIds((p) => p.includes(id) ? p : [...p, id])}
            onRemove={(id) => setTriggerIds((p) => p.filter((x) => x !== id))}
            placeholder="Caută produsul pe pagina căruia apare oferta..." />
        )}
        {scope === "categories" && (
          categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nu ai categorii încă.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = triggerCats.includes(c.name);
                return (
                  <button key={c.id} type="button"
                    onClick={() => setTriggerCats((p) => on ? p.filter((x) => x !== c.name) : [...p, c.name])}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${on ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* PRAGURILE — doar la „Reducere cantitate" */}
      {meta.praguri && (
        <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" /> Pragurile de cantitate
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              De la cate bucati in sus scade pretul, si cu cat la suta. Reducerea se aplica pe
              TOATA cantitatea, nu doar pe bucatile peste prag.
            </p>
          </div>

          <div className="space-y-2">
            {praguri.map((pr, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs text-muted-foreground">De la</span>
                <input
                  value={pr.min_qty} inputMode="numeric"
                  onChange={(e) => setPraguri((v) => v.map((x, k) => (k === i ? { ...x, min_qty: e.target.value } : x)))}
                  className={inputCls + " max-w-[90px]"} placeholder="5"
                />
                <span className="shrink-0 text-xs text-muted-foreground">buc &rarr;</span>
                <input
                  value={pr.percent} inputMode="decimal"
                  onChange={(e) => setPraguri((v) => v.map((x, k) => (k === i ? { ...x, percent: e.target.value } : x)))}
                  className={inputCls + " max-w-[90px]"} placeholder="3"
                />
                <span className="shrink-0 text-xs text-muted-foreground">% reducere</span>
                <button
                  type="button" aria-label="Sterge pragul"
                  onClick={() => setPraguri((v) => v.filter((_, k) => k !== i))}
                  className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setPraguri((v) => [...v, { min_qty: "", percent: "" }])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Mai adauga un prag
            </button>
          </div>

          {problemaPraguri && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-xs text-foreground">{problemaPraguri}</p>
            </div>
          )}

          {/*
            ⚠ Se spune pe fata ca pragurile se SCRIU pe produse. Altfel,
            comerciantul care schimba un prag si nu vede nimic pe produsele
            unde oferta nu mai ajunge ar crede ca ecranul minte.
          */}
          <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
            La salvare, pragurile se scriu pe produsele alese mai sus si apar ca tabel pe pagina
            fiecaruia. Produsele care au deja un upsell pus de tine pe fisa lor NU se ating.
          </p>
        </div>
      )}

      {/* CE OFER — products */}
      {!meta.praguri && (
      <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Package className="h-4 w-4 text-primary" /> Ce ofer</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.offersLabel}</p>
        </div>

        {meta.allowAuto && (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span className="text-sm text-foreground">Alege automat produse din aceeași categorie</span>
            <Switch checked={autoByCategory} onCheckedChange={setAutoByCategory} />
          </label>
        )}

        {!(meta.allowAuto && autoByCategory) && (
          <ProductPicker products={products} selectedIds={offeredIds} byId={byId} single={meta.single}
            onAdd={addOffered}
            onRemove={(id) => setOfferedIds((p) => p.filter((x) => x !== id))}
            placeholder={meta.single ? "Caută produsul oferit..." : "Caută produse de oferit..."} />
        )}
      </div>
      )}

      {/* CÂT REDUC — discount (hidden for cross_sell) */}
      {meta.hasDiscount && (
        <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Cât reduc</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {meta.single ? "Reducerea aplicată produsului oferit." : "Reducerea aplicată setului cumpărat împreună."}
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            {([
              { mode: "percent", label: "Reducere %" },
              { mode: "amount", label: "Reducere sumă" },
              { mode: "fixed_price", label: meta.single ? "Preț fix" : "Preț fix set" },
            ] as const).map((o) => (
              <button key={o.mode} type="button" onClick={() => setDiscountMode(o.mode)}
                className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors ${discountMode === o.mode ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {discountMode === "percent" && (
              <><input type="number" min="0" max="100" step="1" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="ex: 10" className={`${inputCls} w-40`} /><span className="text-sm text-muted-foreground">% reducere</span></>
            )}
            {discountMode === "amount" && (
              <><input type="number" min="0" step="1" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="ex: 50" className={`${inputCls} w-40`} /><span className="text-sm text-muted-foreground">lei reducere</span></>
            )}
            {discountMode === "fixed_price" && (
              <><input type="number" min="0" step="0.01" value={fixedPrice} onChange={(e) => setFixedPrice(e.target.value)} placeholder="ex: 99" className={`${inputCls} w-40`} /><span className="text-sm text-muted-foreground">lei</span></>
            )}
          </div>
          {bumpPreview && (
            <div className="rounded-xl bg-primary/5 border border-primary/15 p-4 flex items-center gap-2 text-sm text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Preț special: <span className="text-lg font-bold text-primary">{formatPrice(bumpPreview.now)}</span>
              {bumpPreview.was > bumpPreview.now && <span className="text-xs text-muted-foreground line-through">{formatPrice(bumpPreview.was)}</span>}
            </div>
          )}
        </div>
      )}

      {/* Active */}
      <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">Activă (vizibilă în magazin)</span>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="lg" onClick={() => router.push("/dashboard/offers")}>Anulează</Button>
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <><Loader2 className="animate-spin" /> Se salvează...</> : <><Save /> {isEdit ? "Salvează" : "Creează oferta"}</>}
        </Button>
      </div>
    </div>
  );
}

/* ─── Reusable product search + selected chips ────────────────────────────── */

function ProductPicker({ products, selectedIds, byId, onAdd, onRemove, single, placeholder }: {
  products: PickerProduct[];
  selectedIds: string[];
  byId: Map<string, PickerProduct>;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  single?: boolean;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    return products
      .filter((p) => !selectedIds.includes(p.id))
      .filter((p) => !query || p.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [products, selectedIds, q]);
  const selected = selectedIds.map((id) => byId.get(id)).filter((p): p is PickerProduct => !!p);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={`${inputCls} pl-9`} />
        {q.trim() && (
          <div className="absolute z-10 mt-1 w-full rounded-xl ring-1 ring-foreground/10 bg-card shadow-lg max-h-64 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Niciun produs găsit.</p>
            ) : results.map((p) => (
              <button key={p.id} type="button" onClick={() => { onAdd(p.id); setQ(""); }}
                className="flex items-center gap-3 w-full px-3 py-2 hover:bg-muted transition-colors text-left">
                <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
                  {p.image_url ? <Image src={p.image_url} alt={p.name} fill sizes="36px" className="object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>}
                </div>
                <span className="text-sm text-foreground flex-1 truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground">{formatPrice(p.price)}</span>
                <Plus className="h-4 w-4 text-primary" />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-xl">
          {single ? "Niciun produs ales." : "Niciun produs adăugat."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selected.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg border border-border bg-muted/40">
              <span className="relative w-7 h-7 rounded-md overflow-hidden bg-muted border border-border shrink-0">
                {p.image_url ? <Image src={p.image_url} alt={p.name} fill sizes="28px" className="object-cover" /> : <span className="w-full h-full flex items-center justify-center"><Package className="h-3.5 w-3.5 text-muted-foreground" /></span>}
              </span>
              <span className="text-xs font-medium text-foreground max-w-[160px] truncate">{p.name}</span>
              <button type="button" onClick={() => onRemove(p.id)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
