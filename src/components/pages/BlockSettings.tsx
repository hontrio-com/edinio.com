"use client";

import { useState } from "react";
import { Upload, X, Loader2, Plus, AlertTriangle } from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { uploadImage } from "@/lib/upload";
import type {
  Block, BlockStyle, HeroBlock, HeadingBlock, TextBlock, ImageBlock, GalleryBlock,
  ButtonBlock, ColumnsBlock, SpacerBlock, DividerBlock, VideoBlock, MapBlock, FaqBlock,
  TrustBlock, ProductsBlock, SocialBlock, ContactBlock, HtmlBlock, ColumnItem,
} from "@/lib/pages/blocks.types";
import type { PageProduct } from "./blocks/ProductsBlock";

const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";
const COLORS = ["#1AB554", "#1E3A5F", "#8B1A1A", "#374151", "#D97706", "#6D28D9", "#E11D48", "#0891B2", "#000000", "#ffffff"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Text({ label, value, onChange, placeholder }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Field label={label}><input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} /></Field>;
}

function Area({ label, value, onChange, placeholder, mono }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return <Field label={label}><textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} className={`${inputCls} resize-none ${mono ? "font-mono text-xs" : ""}`} /></Field>;
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value?: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={inputCls}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 rounded accent-green-600" />
      {label}
    </label>
  );
}

function ColorField({ label, value, onChange, allowEmpty }: { label: string; value?: string | null; onChange: (v: string | null) => void; allowEmpty?: boolean }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {allowEmpty && (
          <button type="button" onClick={() => onChange(null)} className={`w-7 h-7 rounded-md border flex items-center justify-center ${!value ? "border-primary" : "border-border"}`} title="Fara">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
        {COLORS.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)}
            className={`w-7 h-7 rounded-md border ${value === c ? "ring-2 ring-primary ring-offset-1" : "border-border"}`}
            style={{ backgroundColor: c }} title={c} />
        ))}
        <input type="color" value={value ?? "#000000"} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 rounded-md border border-border cursor-pointer p-0" />
      </div>
    </Field>
  );
}

function ImageField({ label, value, onChange }: { label: string; value?: string | null; onChange: (v: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  async function onFile(file: File) {
    setBusy(true);
    const res = await uploadImage(file, "gallery", "pages");
    setBusy(false);
    if ("url" in res) onChange(res.url);
  }
  return (
    <Field label={label}>
      {value ? (
        <div className="relative rounded-lg overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="w-full max-h-40 object-cover" />
          <button type="button" onClick={() => onChange(null)} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-border flex items-center justify-center"><X className="h-3 w-3" /></button>
        </div>
      ) : (
        <label className="border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 py-5 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">{busy ? "Se incarca..." : "Incarca imagine"}</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </label>
      )}
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} placeholder="sau lipeste un URL" className={`${inputCls} mt-2 text-xs`} />
    </Field>
  );
}

function StyleControls({ style, onChange, hide }: { style?: BlockStyle; onChange: (s: BlockStyle) => void; hide?: ("width" | "align" | "bg" | "padding")[] }) {
  const h = (k: string) => hide?.includes(k as never);
  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Aspect</p>
      {!h("padding") && (
        <Select label="Spatiere" value={style?.padding ?? "md"} onChange={(v) => onChange({ ...style, padding: v })}
          options={[{ value: "none", label: "Fara" }, { value: "sm", label: "Mica" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }, { value: "xl", label: "Foarte mare" }]} />
      )}
      {!h("width") && (
        <Select label="Latime" value={style?.width ?? "container"} onChange={(v) => onChange({ ...style, width: v })}
          options={[{ value: "narrow", label: "Ingusta" }, { value: "container", label: "Standard" }, { value: "full", label: "Completa" }]} />
      )}
      {!h("align") && (
        <Select label="Aliniere" value={style?.align ?? "left"} onChange={(v) => onChange({ ...style, align: v })}
          options={[{ value: "left", label: "Stanga" }, { value: "center", label: "Centru" }, { value: "right", label: "Dreapta" }]} />
      )}
      {!h("bg") && <ColorField label="Fundal" value={style?.bg} onChange={(v) => onChange({ ...style, bg: v })} allowEmpty />}
    </div>
  );
}

/* ─── Main ─────────────────────────────────────────────────────────────────── */

export function BlockSettings({ block, onChange, categories, products, isAdmin }: {
  block: Block; onChange: (patch: Partial<Block>) => void; categories: string[]; products: PageProduct[]; isAdmin: boolean;
}) {
  const patch = onChange as (p: Record<string, unknown>) => void;
  const setStyle = (style: BlockStyle) => patch({ style });

  switch (block.type) {
    case "hero": {
      const b = block as HeroBlock;
      return (
        <div className="space-y-4">
          <Text label="Titlu" value={b.title} onChange={(v) => patch({ title: v })} />
          <Area label="Subtitlu" value={b.subtitle} onChange={(v) => patch({ subtitle: v })} />
          <Text label="Text buton" value={b.buttonLabel} onChange={(v) => patch({ buttonLabel: v })} placeholder="Ex: Vezi produsele" />
          <Text label="Link buton" value={b.buttonHref} onChange={(v) => patch({ buttonHref: v })} placeholder="/produs sau https://" />
          <ImageField label="Imagine fundal" value={b.bgImage} onChange={(v) => patch({ bgImage: v })} />
          <ColorField label="Culoare fundal" value={b.bgColor} onChange={(v) => patch({ bgColor: v })} allowEmpty />
          <ColorField label="Culoare text" value={b.textColor} onChange={(v) => patch({ textColor: v })} allowEmpty />
          <Select label="Inaltime" value={b.height ?? "md"} onChange={(v) => patch({ height: v })} options={[{ value: "sm", label: "Mica" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }]} />
          <Select label="Aliniere" value={b.align ?? "center"} onChange={(v) => patch({ align: v })} options={[{ value: "left", label: "Stanga" }, { value: "center", label: "Centru" }]} />
          {b.bgImage && <Toggle label="Strat intunecat peste imagine" checked={b.overlay !== false} onChange={(v) => patch({ overlay: v })} />}
        </div>
      );
    }
    case "heading": {
      const b = block as HeadingBlock;
      return (
        <div className="space-y-4">
          <Text label="Text" value={b.text} onChange={(v) => patch({ text: v })} />
          <Select label="Marime" value={String(b.level ?? 2) as "1" | "2" | "3"} onChange={(v) => patch({ level: Number(v) as 1 | 2 | 3 })} options={[{ value: "1", label: "Foarte mare (H1)" }, { value: "2", label: "Mare (H2)" }, { value: "3", label: "Medie (H3)" }]} />
          <StyleControls style={b.style} onChange={setStyle} hide={["width"]} />
        </div>
      );
    }
    case "text": {
      const b = block as TextBlock;
      return (
        <div className="space-y-4">
          <Field label="Continut"><RichTextEditor content={b.html ?? ""} onChange={(html) => patch({ html })} /></Field>
          <StyleControls style={b.style} onChange={setStyle} />
        </div>
      );
    }
    case "image": {
      const b = block as ImageBlock;
      return (
        <div className="space-y-4">
          <ImageField label="Imagine" value={b.src} onChange={(v) => patch({ src: v })} />
          <Text label="Text alternativ (alt)" value={b.alt} onChange={(v) => patch({ alt: v })} />
          <Text label="Link (optional)" value={b.href} onChange={(v) => patch({ href: v })} />
          <Text label="Descriere sub imagine" value={b.caption} onChange={(v) => patch({ caption: v })} />
          <Toggle label="Colturi rotunjite" checked={b.rounded !== false} onChange={(v) => patch({ rounded: v })} />
          <StyleControls style={b.style} onChange={setStyle} hide={["align"]} />
        </div>
      );
    }
    case "gallery": {
      const b = block as GalleryBlock;
      const imgs = b.images ?? [];
      return (
        <div className="space-y-4">
          <Select label="Coloane" value={String(b.columns ?? 3) as "2" | "3" | "4"} onChange={(v) => patch({ columns: Number(v) as 2 | 3 | 4 })} options={[{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }]} />
          <div className="space-y-2">
            {imgs.map((src, i) => (
              <div key={i} className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="w-10 h-10 rounded object-cover border border-border" />
                <span className="text-xs text-muted-foreground truncate flex-1">{src}</span>
                <button type="button" onClick={() => patch({ images: imgs.filter((_, k) => k !== i) })} className="w-7 h-7 rounded border border-border flex items-center justify-center"><X className="h-3.5 w-3.5 text-red-500" /></button>
              </div>
            ))}
          </div>
          <ImageField label="Adauga imagine" value={null} onChange={(v) => { if (v) patch({ images: [...imgs, v] }); }} />
        </div>
      );
    }
    case "button": {
      const b = block as ButtonBlock;
      return (
        <div className="space-y-4">
          <Text label="Text buton" value={b.label} onChange={(v) => patch({ label: v })} />
          <Text label="Link" value={b.href} onChange={(v) => patch({ href: v })} placeholder="/produs sau https://" />
          <Select label="Stil" value={b.variant ?? "solid"} onChange={(v) => patch({ variant: v })} options={[{ value: "solid", label: "Plin" }, { value: "outline", label: "Contur" }]} />
          <StyleControls style={b.style} onChange={setStyle} hide={["width"]} />
        </div>
      );
    }
    case "columns": {
      const b = block as ColumnsBlock;
      const items = b.items ?? [];
      const setItem = (i: number, p: Partial<ColumnItem>) => patch({ items: items.map((it, k) => (k === i ? { ...it, ...p } : it)) });
      const count = b.count ?? 2;
      return (
        <div className="space-y-4">
          <Select label="Numar coloane" value={String(count) as "2" | "3"} onChange={(v) => {
            const n = Number(v) as 2 | 3;
            const next = [...items];
            while (next.length < n) next.push({ heading: "Coloana", html: "<p></p>" });
            patch({ count: n, items: next.slice(0, n) });
          }} options={[{ value: "2", label: "2" }, { value: "3", label: "3" }]} />
          {items.slice(0, count).map((it, i) => (
            <div key={i} className="p-3 rounded-lg border border-border space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground">Coloana {i + 1}</p>
              <input value={it.heading ?? ""} onChange={(e) => setItem(i, { heading: e.target.value })} placeholder="Titlu" className={inputCls} />
              <RichTextEditor content={it.html ?? ""} onChange={(html) => setItem(i, { html })} />
              <ImageField label="Imagine" value={it.image} onChange={(v) => setItem(i, { image: v })} />
            </div>
          ))}
          <StyleControls style={b.style} onChange={setStyle} />
        </div>
      );
    }
    case "spacer": {
      const b = block as SpacerBlock;
      return <Select label="Inaltime spatiu" value={b.size ?? "md"} onChange={(v) => patch({ size: v })} options={[{ value: "sm", label: "Mic" }, { value: "md", label: "Mediu" }, { value: "lg", label: "Mare" }, { value: "xl", label: "Foarte mare" }]} />;
    }
    case "divider": {
      const b = block as DividerBlock;
      return (
        <div className="space-y-4">
          <Select label="Stil linie" value={b.lineStyle ?? "solid"} onChange={(v) => patch({ lineStyle: v })} options={[{ value: "solid", label: "Continua" }, { value: "dashed", label: "Punctata" }]} />
          <ColorField label="Culoare" value={b.color} onChange={(v) => patch({ color: v })} allowEmpty />
        </div>
      );
    }
    case "video": {
      const b = block as VideoBlock;
      return <div className="space-y-4"><Text label="Link YouTube / Vimeo" value={b.url} onChange={(v) => patch({ url: v })} placeholder="https://youtube.com/watch?v=..." /><StyleControls style={b.style} onChange={setStyle} hide={["align"]} /></div>;
    }
    case "map": {
      const b = block as MapBlock;
      return (
        <div className="space-y-4">
          <Text label="Adresa sau coordonate" value={b.query} onChange={(v) => patch({ query: v })} placeholder="Strada, oras" />
          <Field label="Inaltime (px)"><input type="number" value={b.height ?? 320} onChange={(e) => patch({ height: Number(e.target.value) })} className={inputCls} /></Field>
          <StyleControls style={b.style} onChange={setStyle} hide={["align"]} />
        </div>
      );
    }
    case "faq": {
      const b = block as FaqBlock;
      const items = b.items ?? [];
      const setItem = (i: number, p: Partial<{ q: string; a: string }>) => patch({ items: items.map((it, k) => (k === i ? { ...it, ...p } : it)) });
      return (
        <div className="space-y-4">
          <Text label="Titlu sectiune" value={b.title} onChange={(v) => patch({ title: v })} />
          {items.map((it, i) => (
            <div key={i} className="p-3 rounded-lg border border-border space-y-2">
              <div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-muted-foreground">Intrebare {i + 1}</p>
                <button type="button" onClick={() => patch({ items: items.filter((_, k) => k !== i) })}><X className="h-3.5 w-3.5 text-red-500" /></button></div>
              <input value={it.q} onChange={(e) => setItem(i, { q: e.target.value })} placeholder="Intrebare" className={inputCls} />
              <textarea value={it.a} onChange={(e) => setItem(i, { a: e.target.value })} placeholder="Raspuns" rows={2} className={`${inputCls} resize-none`} />
            </div>
          ))}
          <button type="button" onClick={() => patch({ items: [...items, { q: "", a: "" }] })} className="flex items-center gap-1.5 text-xs font-medium text-primary"><Plus className="h-3.5 w-3.5" /> Adauga intrebare</button>
        </div>
      );
    }
    case "trust": {
      const b = block as TrustBlock;
      const items = b.items ?? [];
      const setItem = (i: number, p: Partial<{ icon: string; title: string; desc: string }>) => patch({ items: items.map((it, k) => (k === i ? { ...it, ...p } : it)) });
      return (
        <div className="space-y-4">
          {items.map((it, i) => (
            <div key={i} className="p-3 rounded-lg border border-border space-y-2">
              <div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-muted-foreground">Beneficiu {i + 1}</p>
                <button type="button" onClick={() => patch({ items: items.filter((_, k) => k !== i) })}><X className="h-3.5 w-3.5 text-red-500" /></button></div>
              <Select label="Pictograma" value={it.icon as "truck" | "shield" | "rotate-ccw" | "phone"} onChange={(v) => setItem(i, { icon: v })} options={[{ value: "truck", label: "Camion" }, { value: "shield", label: "Scut" }, { value: "rotate-ccw", label: "Retur" }, { value: "phone", label: "Telefon" }]} />
              <input value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="Titlu" className={inputCls} />
              <input value={it.desc} onChange={(e) => setItem(i, { desc: e.target.value })} placeholder="Descriere" className={inputCls} />
            </div>
          ))}
          <button type="button" onClick={() => patch({ items: [...items, { icon: "shield", title: "", desc: "" }] })} className="flex items-center gap-1.5 text-xs font-medium text-primary"><Plus className="h-3.5 w-3.5" /> Adauga beneficiu</button>
        </div>
      );
    }
    case "products": {
      const b = block as ProductsBlock;
      const ids = b.productIds ?? [];
      return (
        <div className="space-y-4">
          <Text label="Titlu sectiune" value={b.title} onChange={(v) => patch({ title: v })} />
          <Select label="Afiseaza" value={b.mode ?? "featured"} onChange={(v) => patch({ mode: v })} options={[{ value: "featured", label: "Produse populare" }, { value: "all", label: "Toate" }, { value: "category", label: "Dintr-o categorie" }, { value: "selected", label: "Selectate manual" }]} />
          {b.mode === "category" && (
            <Select label="Categorie" value={b.category ?? ""} onChange={(v) => patch({ category: v })} options={[{ value: "", label: "Alege..." }, ...categories.map((c) => ({ value: c, label: c }))]} />
          )}
          {b.mode === "selected" && (
            <Field label="Produse">
              <div className="max-h-52 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 p-2 text-xs cursor-pointer hover:bg-muted">
                    <input type="checkbox" checked={ids.includes(p.id)} onChange={(e) => patch({ productIds: e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id) })} className="w-4 h-4 rounded accent-green-600" />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))}
                {products.length === 0 && <p className="p-3 text-xs text-muted-foreground">Niciun produs.</p>}
              </div>
            </Field>
          )}
          <Field label="Numar maxim"><input type="number" min={1} value={b.limit ?? 8} onChange={(e) => patch({ limit: Number(e.target.value) })} className={inputCls} /></Field>
        </div>
      );
    }
    case "social": {
      const b = block as SocialBlock;
      return <div className="space-y-4"><Text label="Titlu" value={b.title} onChange={(v) => patch({ title: v })} /><p className="text-xs text-muted-foreground">Linkurile retelelor se preiau din setarile magazinului.</p><StyleControls style={b.style} onChange={setStyle} hide={["width"]} /></div>;
    }
    case "contact": {
      const b = block as ContactBlock;
      return (
        <div className="space-y-4">
          <Text label="Titlu" value={b.title} onChange={(v) => patch({ title: v })} />
          <Text label="Text buton" value={b.buttonLabel} onChange={(v) => patch({ buttonLabel: v })} />
          <Text label="Mesaj de confirmare" value={b.successMessage} onChange={(v) => patch({ successMessage: v })} />
          <Toggle label="Camp telefon" checked={b.showPhone !== false} onChange={(v) => patch({ showPhone: v })} />
          <Toggle label="Camp mesaj" checked={b.showMessage !== false} onChange={(v) => patch({ showMessage: v })} />
          <p className="text-[11px] text-muted-foreground">Mesajele ajung pe email si in sectiunea „Mesaje”.</p>
        </div>
      );
    }
    case "html": {
      const b = block as HtmlBlock;
      const hasJs = (b.js ?? "").trim().length > 0;
      return (
        <div className="space-y-4">
          <Area label="HTML" value={b.html} onChange={(v) => patch({ html: v })} mono placeholder="<div>...</div>" />
          <Area label="CSS" value={b.css} onChange={(v) => patch({ css: v })} mono placeholder=".clasa { ... }" />
          <Area label="JavaScript" value={b.js} onChange={(v) => patch({ js: v })} mono placeholder="// codul tau" />
          {hasJs && !b.raw && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              JavaScript-ul ruleaza izolat intr-un cadru securizat (nu poate accesa cosul sau datele magazinului).
            </div>
          )}
          {isAdmin ? (
            <div className="pt-3 border-t border-border">
              <Toggle label="Mod raw (admin): injecteaza codul direct in pagina" checked={!!b.raw} onChange={(v) => patch({ raw: v, rawApprovedBy: v ? b.rawApprovedBy : null })} />
              {b.raw && (
                <div className="flex items-start gap-2 p-2.5 mt-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Codul ruleaza cu acces complet la pagina. Foloseste doar cod de incredere.
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">HTML/CSS simplu este curatat automat pentru siguranta.</p>
          )}
        </div>
      );
    }
    default:
      return <p className="text-xs text-muted-foreground">Acest bloc nu are setari.</p>;
  }
}
