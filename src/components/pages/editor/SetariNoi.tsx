"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type {
  BlockStyle, BundlesBlock, ContactBlock, CouriersBlock, NewsletterBlock, PaymentsBlock, TrustBlock, TrustItem,
} from "@/lib/pages/blocks.types";
import { ANIMATII } from "@/lib/pages/animatii";
import { cn } from "@/lib/utils/cn";
import { CampCuloare } from "./CampCuloare";
import { CampImagine } from "./CampImagine";
import { CampLink } from "./CampLink";
import { ControaleAspect } from "./ControaleAspect";
import { Field, Grup, IconPicker, Segmentat, Select, Text, Toggle, inputCls } from "./campuri";
import { ProductPicker } from "../ProductPicker";
import type { PachetPagina } from "@/lib/pages/resolve-bundles";
import { PageIcon } from "../icon-registry";

type Patch<T> = (p: Partial<T>) => void;

/* ─── Beneficii ────────────────────────────────────────────────────────────── */

export function SetariBeneficii({ block: b, patch, setStyle }: { block: TrustBlock; patch: Patch<TrustBlock>; setStyle: (s: BlockStyle) => void }) {
  const items = b.items ?? [];
  const setItem = (i: number, p: Partial<TrustItem>) => patch({ items: items.map((it, k) => (k === i ? { ...it, ...p } : it)) });
  const muta = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const n = [...items];
    [n[i], n[j]] = [n[j], n[i]];
    patch({ items: n });
  };
  const layout = b.layout ?? "stack";
  return (
    <div className="space-y-4">
      <Text label="Titlu (opțional)" value={b.title} onChange={(v) => patch({ title: v })} placeholder="De ce să cumperi de la noi" />
      <Text label="Subtitlu (opțional)" value={b.subtitle} onChange={(v) => patch({ subtitle: v })} />

      <div>
        <p className="mb-1.5 text-xs font-semibold text-foreground">Așezare</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { v: "stack", n: "Iconița sus" },
            { v: "row", n: "Iconița în stânga" },
            { v: "strip", n: "Bandă pe un rând" },
          ] as const).map((o) => (
            <button key={o.v} type="button" onClick={() => patch({ layout: o.v })} aria-pressed={layout === o.v}
              className={cn("flex min-h-[64px] flex-col items-center justify-between gap-1.5 rounded-lg border p-2 transition-colors",
                layout === o.v ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
              <span className={cn("flex w-full gap-1", o.v === "stack" ? "justify-center" : "")}>
                {o.v === "stack" && <span className="flex flex-col items-center gap-0.5"><span className="h-3 w-3 rounded-full bg-current opacity-40" /><span className="h-1 w-6 rounded bg-current opacity-25" /></span>}
                {o.v === "row" && <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-current opacity-40" /><span className="h-1 w-8 rounded bg-current opacity-25" /></span>}
                {o.v === "strip" && <span className="flex w-full divide-x divide-current/20 rounded border border-current/20">{[0, 1, 2].map((k) => <span key={k} className="flex flex-1 justify-center py-1"><span className="h-2 w-2 rounded-full bg-current opacity-40" /></span>)}</span>}
              </span>
              <span className="text-center text-[10px] text-muted-foreground">{o.n}</span>
            </button>
          ))}
        </div>
      </div>

      {layout !== "strip" && (
        <>
          <Select label="Coloane pe desktop" value={String(b.columns ?? 3) as "3"} onChange={(v) => patch({ columns: Number(v) as 3 })}
            options={["1", "2", "3", "4", "5", "6"].map((n) => ({ value: n as "3", label: n }))} />
          <Segmentat label="Pe telefon" value={String(b.mobileColumns ?? 2) as "1" | "2"} onChange={(v) => patch({ mobileColumns: Number(v) as 1 | 2 })}
            options={[{ value: "1", label: "Una sub alta" }, { value: "2", label: "Câte două" }]} />
        </>
      )}
      {layout === "stack" && (
        <Segmentat label="Aliniere" value={b.align ?? "center"} onChange={(v) => patch({ align: v })} options={[{ value: "center", label: "Centru" }, { value: "left", label: "Stânga" }]} />
      )}

      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                {it.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={it.image} alt="" className="h-4 w-4 object-contain" />
                  : <PageIcon name={it.icon} className="h-3.5 w-3.5" />}
                Beneficiul {i + 1}
              </p>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => muta(i, -1)} disabled={i === 0} aria-label="Mută sus" className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => muta(i, 1)} disabled={i === items.length - 1} aria-label="Mută jos" className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => patch({ items: items.filter((_, k) => k !== i) })} aria-label="Șterge" className="rounded p-1"><X className="h-3.5 w-3.5 text-red-500" /></button>
              </div>
            </div>
            {/* `image` sir (chiar gol) = „imaginea mea”; lipsa sau null = iconita din lista. */}
            <Segmentat label="Iconița" value={typeof it.image === "string" ? "proprie" : "lista"}
              onChange={(v) => setItem(i, { image: v === "lista" ? null : it.image ?? "" })}
              options={[{ value: "lista", label: "Din listă" }, { value: "proprie", label: "Imaginea mea" }]} />
            {typeof it.image === "string"
              ? <CampImagine eticheta="Iconița ta" valoare={it.image || null} onChange={(v) => setItem(i, { image: v ?? "" })} ajutor="PNG sau SVG cu fundal transparent arată cel mai bine." />
              : <IconPicker value={it.icon} onChange={(v) => setItem(i, { icon: v ?? "Star" })} />}
            <input value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="Titlu" className={inputCls} />
            <input value={it.desc} onChange={(e) => setItem(i, { desc: e.target.value })} placeholder="Descriere" className={inputCls} />
            <CampLink eticheta="Link (opțional)" valoare={it.href} onChange={(v) => setItem(i, { href: v })} />
          </div>
        ))}
        <button type="button" onClick={() => patch({ items: [...items, { icon: "Star", title: "", desc: "" }] })} className="flex items-center gap-1.5 text-xs font-medium text-primary"><Plus className="h-3.5 w-3.5" /> Adaugă beneficiu</button>
      </div>

      <Grup titlu="Iconițe">
        <Segmentat label="Formă" value={b.iconStyle ?? "circle"} onChange={(v) => patch({ iconStyle: v })}
          options={[{ value: "circle", label: "Cerc" }, { value: "square", label: "Pătrat" }, { value: "outline", label: "Contur" }, { value: "plain", label: "Simplă" }]} />
        <Segmentat label="Mărime" value={b.iconSize ?? "md"} onChange={(v) => patch({ iconSize: v })}
          options={[{ value: "sm", label: "Mică" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }]} />
        <CampCuloare eticheta="Culoarea iconițelor" valoare={b.iconColor} onChange={(v) => patch({ iconColor: v })} poateFiGol />
        {b.iconStyle !== "plain" && b.iconStyle !== "outline" && <CampCuloare eticheta="Fundalul iconițelor" valoare={b.iconBg} onChange={(v) => patch({ iconBg: v })} poateFiGol />}
      </Grup>

      <Grup titlu="Carduri și text">
        <Toggle label="Fiecare beneficiu ca un card" checked={b.card !== false} onChange={(v) => patch({ card: v })} />
        {b.card !== false && (
          <>
            <CampCuloare eticheta="Fundalul cardurilor" valoare={b.cardBg} onChange={(v) => patch({ cardBg: v })} poateFiGol />
            {layout !== "strip" && (
              <>
                <Segmentat label="Colțuri" value={b.cardRadius ?? "md"} onChange={(v) => patch({ cardRadius: v })}
                  options={[{ value: "none", label: "Drepte" }, { value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "xl", label: "XL" }]} />
                <Segmentat label="Umbră" value={b.cardShadow ?? "none"} onChange={(v) => patch({ cardShadow: v })}
                  options={[{ value: "none", label: "Fără" }, { value: "sm", label: "Fină" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }]} />
              </>
            )}
          </>
        )}
        <CampCuloare eticheta="Culoarea titlurilor" valoare={b.titleColor} onChange={(v) => patch({ titleColor: v })} poateFiGol />
        <CampCuloare eticheta="Culoarea descrierilor" valoare={b.descColor} onChange={(v) => patch({ descColor: v })} poateFiGol />
      </Grup>

      <Grup titlu="Efecte">
        {layout !== "strip" && (
          <Select label="La trecerea cursorului" value={b.hover ?? "none"} onChange={(v) => patch({ hover: v })}
            options={[{ value: "none", label: "Fără" }, { value: "lift", label: "Se ridică" }, { value: "scale", label: "Se mărește ușor" }, { value: "glow", label: "Strălucire" }]} />
        )}
        <Select label="Apar pe rând, unul după altul" value={b.itemAnim ?? "none"} onChange={(v) => patch({ itemAnim: v })}
          options={ANIMATII.map((a) => ({ value: a.cheie, label: a.nume }))}
          ajutor="Fiecare beneficiu pornește la 120 ms după cel dinainte." />
      </Grup>

      <ControaleAspect style={b.style} onChange={setStyle} hide={["align"]} />
    </div>
  );
}

/* ─── Pachete ──────────────────────────────────────────────────────────────── */

export function SetariPachete({ block: b, patch, setStyle, businessId, pachete }: {
  block: BundlesBlock; patch: Patch<BundlesBlock>; setStyle: (s: BlockStyle) => void; businessId: string;
  /** Pachetele magazinului, pentru descrieri si „scoase in fata”. */
  pachete: PachetPagina[];
}) {
  const afisate = b.mode === "selected" && b.productIds?.length
    ? b.productIds.map((id) => pachete.find((p) => p.id === id)).filter((p): p is PachetPagina => !!p)
    : pachete.slice(0, b.limit ?? 6);
  const evidentiate = new Set(b.evidentiate ?? []);
  return (
    <div className="space-y-4">
      <Text label="Titlu" value={b.title} onChange={(v) => patch({ title: v })} />
      <Text label="Subtitlu (opțional)" value={b.subtitle} onChange={(v) => patch({ subtitle: v })} />
      <Segmentat label="Afișează" value={b.mode ?? "all"} onChange={(v) => patch({ mode: v })}
        options={[{ value: "all", label: "Toate pachetele" }, { value: "selected", label: "Alese de mine" }]} />
      {b.mode === "selected" && (
        <Field label="Pachetele alese" ajutor="Caută după nume. Apar doar produsele marcate ca pachet.">
          <ProductPicker businessId={businessId} selectedIds={b.productIds ?? []} onChange={(ids) => patch({ productIds: ids })} doarPachete />
        </Field>
      )}
      <Segmentat label="Așezare" value={b.layout ?? "cards"} onChange={(v) => patch({ layout: v })}
        options={[{ value: "cards", label: "Carduri" }, { value: "wide", label: "Câte unul pe rând" }]} />
      {b.layout !== "wide" && (
        <Segmentat label="Coloane" value={String(b.columns ?? 3) as "2" | "3"} onChange={(v) => patch({ columns: Number(v) as 2 | 3 })}
          options={[{ value: "2", label: "2" }, { value: "3", label: "3" }]} />
      )}
      <Field label="Număr maxim de pachete">
        <input type="number" min={1} max={12} value={b.limit ?? 6} onChange={(e) => patch({ limit: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })} className={inputCls} />
      </Field>
      <Toggle label="Arată ce conține fiecare pachet" checked={b.showItems !== false} onChange={(v) => patch({ showItems: v })} />
      <Toggle label="Arată cât economisește clientul" checked={b.showSavings !== false} onChange={(v) => patch({ showSavings: v })} />
      <Toggle label="Buton „Adaugă în coș”" checked={b.showAddToCart !== false} onChange={(v) => patch({ showAddToCart: v })} />
      <CampCuloare eticheta="Culoare accent" valoare={b.accent} onChange={(v) => patch({ accent: v })} poateFiGol />

      <Grup titlu="Descriere">
        <Toggle label="Arată o scurtă descriere" checked={!!b.showDescription} onChange={(v) => patch({ showDescription: v })}
          ajutor="Implicit, descrierea scurtă a pachetului din Produse. O poți scrie și aici, altfel, pe fiecare pachet." />
        {b.showDescription && afisate.map((p) => (
          <Field key={p.id} label={p.name}>
            <textarea value={b.descrieri?.[p.id] ?? ""} maxLength={300} rows={2}
              onChange={(e) => patch({ descrieri: { ...(b.descrieri ?? {}), [p.id]: e.target.value } })}
              placeholder={p.descriere ?? "Pachetul n-are descriere scurtă în Produse. Scrie una aici."}
              className={`${inputCls} resize-y`} />
          </Field>
        ))}
      </Grup>

      <Grup titlu="Elemente FOMO" insigna={b.badgeText || b.countdownEnd || b.showLowStock || b.showRecentSales || evidentiate.size ? "active" : undefined}>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Toate sunt adevărate: stocul și vânzările vin din magazin, termenul îl alegi tu. Cifrele inventate sunt practică înșelătoare și le sancționează ANPC.
        </p>
        <Text label="Etichetă pe pachete (opțional)" value={b.badgeText} onChange={(v) => patch({ badgeText: v })} placeholder="Ex: Ofertă limitată" />
        {b.badgeText && <CampCuloare eticheta="Culoarea etichetei" valoare={b.badgeColor} onChange={(v) => patch({ badgeColor: v })} poateFiGol />}

        <Field label="Scoate în față" ajutor="Pachetele bifate primesc un chenar și eticheta de mai jos.">
          <div className="space-y-1.5">
            {afisate.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input type="checkbox" checked={evidentiate.has(p.id)} className="h-4 w-4 rounded accent-green-600"
                  onChange={(e) => {
                    const n = new Set(evidentiate);
                    if (e.target.checked) n.add(p.id); else n.delete(p.id);
                    patch({ evidentiate: [...n] });
                  }} />
                <span className="truncate">{p.name}</span>
              </label>
            ))}
            {afisate.length === 0 && <p className="text-[11px] text-muted-foreground">Niciun pachet de afișat.</p>}
          </div>
        </Field>
        {evidentiate.size > 0 && <Text label="Eticheta lor" value={b.evidentiatText} onChange={(v) => patch({ evidentiatText: v })} placeholder="Cel mai popular" />}

        <Field label="Numărătoare până la" ajutor="Ora României. După termen, numărătoarea dispare singură (pachetele rămân).">
          <div className="flex gap-2">
            <input type="datetime-local" value={b.countdownEnd ?? ""} onChange={(e) => patch({ countdownEnd: e.target.value || null })} className={inputCls} />
            {b.countdownEnd && <button type="button" onClick={() => patch({ countdownEnd: null })} aria-label="Scoate numărătoarea" className="shrink-0 rounded-lg border border-border px-2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
        </Field>
        {b.countdownEnd && <Text label="Textul de lângă" value={b.countdownText} onChange={(v) => patch({ countdownText: v })} placeholder="Oferta se încheie în" />}

        <Toggle label="„Doar N pachete rămase” (din stocul real)" checked={!!b.showLowStock} onChange={(v) => patch({ showLowStock: v })}
          ajutor="Apare numai când componentele au stoc urmărit și rămân puține pachete." />
        {b.showLowStock && (
          <Field label="Arată sub">
            <input type="number" min={1} max={50} value={b.lowStockThreshold ?? 5} onChange={(e) => patch({ lowStockThreshold: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })} className={inputCls} />
          </Field>
        )}
        <Toggle label="„Cumpărat de N ori în ultimele 7 zile” (din comenzi)" checked={!!b.showRecentSales} onChange={(v) => patch({ showRecentSales: v })}
          ajutor="Numără comenzile reale, fără cele anulate sau rambursate." />
        {b.showRecentSales && (
          <Field label="Arată de la (comenzi)">
            <input type="number" min={1} max={100} value={b.recentSalesMin ?? 3} onChange={(e) => patch({ recentSalesMin: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })} className={inputCls} />
          </Field>
        )}
      </Grup>
      <ControaleAspect style={b.style} onChange={setStyle} hide={["align"]} />
    </div>
  );
}

/* ─── Newsletter ───────────────────────────────────────────────────────────── */

export function SetariNewsletter({ block: b, patch, setStyle, furnizori }: { block: NewsletterBlock; patch: Patch<NewsletterBlock>; setStyle: (s: BlockStyle) => void; furnizori: string[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
        {furnizori.length
          ? <>Abonații ajung în <span className="font-semibold text-foreground">{furnizori.join(", ")}</span> și apar și în „Mesaje”.</>
          : <>Nicio integrare de email conectată. Abonările apar doar în „Mesaje” până conectezi Mailchimp, Brevo sau Klaviyo.</>}
      </div>
      <Text label="Titlu" value={b.title} onChange={(v) => patch({ title: v })} />
      <Text label="Subtitlu" value={b.subtitle} onChange={(v) => patch({ subtitle: v })} />
      <div>
        <p className="mb-1.5 text-xs font-semibold text-foreground">Așezare</p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { v: "card", n: "Card centrat" }, { v: "stacked", n: "Simplu, centrat" },
            { v: "inline", n: "Text și câmp alăturate" }, { v: "split", n: "Cu imagine" },
          ] as const).map((o) => (
            <button key={o.v} type="button" onClick={() => patch({ layout: o.v })} aria-pressed={(b.layout ?? "card") === o.v}
              className={cn("rounded-lg border px-2 py-2.5 text-[11px] font-medium transition-colors", (b.layout ?? "card") === o.v ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
              {o.n}
            </button>
          ))}
        </div>
      </div>
      {b.layout === "split" && <CampImagine eticheta="Imaginea" valoare={b.image} onChange={(v) => patch({ image: v })} />}
      <Text label="Text buton" value={b.buttonLabel} onChange={(v) => patch({ buttonLabel: v })} />
      <CampCuloare eticheta="Culoare buton" valoare={b.buttonColor} onChange={(v) => patch({ buttonColor: v })} poateFiGol />
      <Toggle label="Cere și numele" checked={!!b.askName} onChange={(v) => patch({ askName: v })} />
      <Toggle label="Cere și telefonul" checked={!!b.askPhone} onChange={(v) => patch({ askPhone: v })} />
      <Text label="Textul bifei de acord" value={b.consentText} onChange={(v) => patch({ consentText: v })} ajutor="Bifa e mereu obligatorie: fără ea nu se trimite nimic (GDPR)." />
      <Text label="Mesaj după abonare" value={b.successMessage} onChange={(v) => patch({ successMessage: v })} />
      <Text label="Etichetă în lista de abonați (Mailchimp)" value={b.tag} onChange={(v) => patch({ tag: v })} placeholder="Newsletter" />
      <ControaleAspect style={b.style} onChange={setStyle} hide={["align"]} />
    </div>
  );
}

/* ─── Plati si curieri ─────────────────────────────────────────────────────── */

export function SetariPlatiCurieri({ block: b, patch, setStyle, fel, active }: {
  block: PaymentsBlock | CouriersBlock; patch: (p: Partial<Omit<CouriersBlock, "type" | "id">>) => void; setStyle: (s: BlockStyle) => void;
  fel: "plati" | "curieri"; active: string[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
        Se afișează singure {fel === "plati" ? "metodele de plată active" : "firmele de curierat pornite"} în setările magazinului
        {active.length ? <>: <span className="font-semibold text-foreground">{active.join(", ")}</span>.</> : ". Acum nu e niciuna, deci blocul nu apare pe pagină."}
      </div>
      <Text label="Titlu" value={b.title} onChange={(v) => patch({ title: v })} />
      {fel === "curieri" && <Text label="Subtitlu (opțional)" value={(b as CouriersBlock).subtitle} onChange={(v) => patch({ subtitle: v })} placeholder="Livrare în 1-3 zile lucrătoare" />}
      <Segmentat label="Aspect" value={b.layout ?? "logos"} onChange={(v) => patch({ layout: v })}
        options={[{ value: "logos", label: "Doar sigle" }, { value: "cards", label: "Sigle cu nume" }]} />
      <Toggle label="Sigle alb-negru (colorate la atingere)" checked={!!b.grayscale} onChange={(v) => patch({ grayscale: v })} />
      <ControaleAspect style={b.style} onChange={setStyle} />
    </div>
  );
}

/* ─── Formularul de pe pagina: stil si optiuni ────────────────────────────── */

export function StilFormular({ block: b, patch }: { block: ContactBlock; patch: Patch<ContactBlock> }) {
  const varianta = b.variant ?? "classic";
  return (
    <>
      <Grup titlu="Stil formular" deschisImplicit>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-foreground">Câmpurile</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { v: "classic", n: "Clasic", c: "rounded border border-foreground/25 bg-background" },
              { v: "filled", n: "Plin", c: "rounded bg-foreground/10" },
              { v: "underline", n: "Linie", c: "border-b-2 border-foreground/30" },
              { v: "rounded", n: "Rotunjit", c: "rounded-full border border-foreground/25" },
              { v: "minimal", n: "Minimal", c: "rounded border border-foreground/10 bg-foreground/5" },
            ] as const).map((o) => (
              <button key={o.v} type="button" onClick={() => patch({ variant: o.v })} aria-pressed={varianta === o.v}
                className={cn("flex min-h-[58px] flex-col items-stretch justify-between gap-1.5 rounded-lg border p-2", varianta === o.v ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
                <span className={cn("h-3 w-full", o.c)} />
                <span className={cn("h-3 w-full", o.c)} />
                <span className="text-center text-[10px] text-muted-foreground">{o.n}</span>
              </button>
            ))}
          </div>
        </div>
        <Segmentat label="Etichete" value={b.labels ?? "above"} onChange={(v) => patch({ labels: v })}
          options={[{ value: "above", label: "Deasupra" }, { value: "inside", label: "În câmp" }]} />
        <Segmentat label="Mărime" value={b.size ?? "md"} onChange={(v) => patch({ size: v })}
          options={[{ value: "sm", label: "Mică" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }]} />
        <Toggle label="Două coloane pe ecrane late" checked={!!b.twoColumns} onChange={(v) => patch({ twoColumns: v })} ajutor="Câmpurile marcate „jumătate de rând” stau alăturate (la formularul simplu: numele și emailul)." />
        <Toggle label="Formularul într-un card" checked={!!b.card} onChange={(v) => patch({ card: v })} />
        {b.card && <CampCuloare eticheta="Fundalul cardului" valoare={b.cardBg} onChange={(v) => patch({ cardBg: v })} poateFiGol />}
        <CampCuloare eticheta="Accent (bife, butoane de alegere)" valoare={b.accent} onChange={(v) => patch({ accent: v })} poateFiGol />
      </Grup>
      <Grup titlu="Butonul">
        <CampCuloare eticheta="Culoare" valoare={b.buttonColor} onChange={(v) => patch({ buttonColor: v })} poateFiGol />
        <CampCuloare eticheta="Culoarea textului" valoare={b.buttonTextColor} onChange={(v) => patch({ buttonTextColor: v })} poateFiGol />
        <Segmentat label="Colțuri" value={b.buttonRadius ?? (varianta === "rounded" ? "full" : "lg")} onChange={(v) => patch({ buttonRadius: v })}
          options={[{ value: "sm", label: "Puțin" }, { value: "md", label: "Mediu" }, { value: "lg", label: "Mult" }, { value: "full", label: "Pastilă" }]} />
        <Toggle label="Pe toată lățimea" checked={b.buttonFull !== false} onChange={(v) => patch({ buttonFull: v })} />
        {b.buttonFull === false && (
          <Segmentat label="Aliniere" value={b.buttonAlign ?? "center"} onChange={(v) => patch({ buttonAlign: v })}
            options={[{ value: "left", label: "Stânga" }, { value: "center", label: "Centru" }, { value: "right", label: "Dreapta" }]} />
        )}
      </Grup>
      <Grup titlu="După trimitere">
        <Segmentat label="Ce vede clientul" value={b.afterSubmit ?? "message"} onChange={(v) => patch({ afterSubmit: v })}
          options={[{ value: "message", label: "Mesajul de mulțumire" }, { value: "redirect", label: "Altă pagină" }]} />
        {b.afterSubmit === "redirect" && <CampLink eticheta="Pagina" valoare={b.redirectHref} onChange={(v) => patch({ redirectHref: v })} />}
      </Grup>
    </>
  );
}
