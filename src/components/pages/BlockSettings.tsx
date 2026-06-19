"use client";

import { useState } from "react";
import Link from "next/link";
import { Upload, X, Loader2, Plus, AlertTriangle, Search } from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { uploadImage, uploadVideo } from "@/lib/upload";
import { MAX_VIDEO_MB } from "@/lib/pages/video-config";
import { PageIcon, PAGE_ICON_NAMES } from "./icon-registry";
import type {
  Block, BlockStyle, HeroBlock, HeadingBlock, TextBlock, ImageBlock, GalleryBlock,
  ButtonBlock, ColumnsBlock, SpacerBlock, DividerBlock, VideoBlock, MapBlock, FaqBlock,
  TrustBlock, ProductsBlock, SocialBlock, ContactBlock, HtmlBlock, ColumnItem, GalleryItem,
} from "@/lib/pages/blocks.types";
import { ProductPicker } from "./ProductPicker";
import type { FormDef } from "@/lib/pages/forms.types";

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

function Range({ label, value, onChange, min, max, step = 1, unit = "px" }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string }) {
  return (
    <Field label={`${label}: ${value}${unit}`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-green-600 cursor-pointer" />
    </Field>
  );
}

function IconPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = q ? PAGE_ICON_NAMES.filter((n) => n.toLowerCase().includes(q.toLowerCase())) : PAGE_ICON_NAMES;
  return (
    <Field label="Pictograma">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${inputCls} flex items-center gap-2 text-left`}>
        <PageIcon name={value} className="h-4 w-4 text-foreground" />
        <span className="text-muted-foreground truncate">{value || "Alege o pictograma"}</span>
      </button>
      {open && (
        <div className="mt-2 border border-border rounded-lg p-2">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cauta..." className={`${inputCls} pl-7 py-1.5 text-xs`} />
          </div>
          <div className="grid grid-cols-6 gap-1.5 max-h-44 overflow-y-auto">
            {list.map((n) => (
              <button key={n} type="button" onClick={() => { onChange(n); setOpen(false); }} title={n}
                className={`w-9 h-9 rounded-md flex items-center justify-center border ${value === n ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"}`}>
                <PageIcon name={n} className="h-4 w-4 text-foreground" />
              </button>
            ))}
            {list.length === 0 && <p className="col-span-6 text-xs text-muted-foreground p-2">Nimic gasit.</p>}
          </div>
        </div>
      )}
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

function VideoUploadField({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  async function onFile(file: File) {
    setErr(null);
    setBusy(true);
    setPct(0);
    const res = await uploadVideo(file, setPct);
    setBusy(false);
    if ("url" in res) onChange(res.url);
    else setErr(res.error);
  }
  return (
    <Field label="Videoclip">
      {value ? (
        <div className="relative rounded-lg overflow-hidden border border-border bg-black">
          <video src={value} controls preload="metadata" className="w-full max-h-48" />
          <button type="button" onClick={() => onChange(null)} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-border flex items-center justify-center z-10"><X className="h-3 w-3" /></button>
        </div>
      ) : (
        <label className={`border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 py-6 transition-colors ${busy ? "opacity-70" : "cursor-pointer hover:border-primary hover:bg-primary/5"}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">{busy ? `Se incarca... ${pct}%` : "Incarca videoclip"}</span>
          {busy && <div className="w-3/4 h-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>}
          <input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={busy} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </label>
      )}
      <p className="text-[11px] text-muted-foreground mt-1.5">MP4, WebM sau MOV. Maxim {MAX_VIDEO_MB}MB. Pentru clipuri lungi, foloseste un link YouTube/Vimeo.</p>
      {err && <p className="text-[11px] text-red-500 mt-1">{err}</p>}
    </Field>
  );
}

function VideoSettings({ block, patch, setStyle }: { block: VideoBlock; patch: (p: Record<string, unknown>) => void; setStyle: (s: BlockStyle) => void }) {
  const [mode, setMode] = useState<"upload" | "url">(block.url && !block.src ? "url" : "upload");
  const tab = (m: "upload" | "url", label: string) => (
    <button type="button" onClick={() => {
      setMode(m);
      if (m === "upload") patch({ url: "" });
      else patch({ src: null, poster: null });
    }} className={`py-1.5 text-xs font-medium rounded-md transition-colors ${mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"}`}>{label}</button>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted">
        {tab("upload", "Incarca video")}
        {tab("url", "Link YouTube / Vimeo")}
      </div>
      {mode === "upload" ? (
        <>
          <VideoUploadField value={block.src} onChange={(v) => patch({ src: v })} />
          {block.src && <ImageField label="Imagine de coperta (optional)" value={block.poster} onChange={(v) => patch({ poster: v })} />}
        </>
      ) : (
        <Text label="Link YouTube / Vimeo" value={block.url} onChange={(v) => patch({ url: v })} placeholder="https://youtube.com/watch?v=..." />
      )}
      <div className="space-y-2.5 pt-3 border-t border-border">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Redare</p>
        <Toggle label="Pornire automata" checked={!!block.autoplay} onChange={(v) => patch({ autoplay: v, muted: v ? true : block.muted })} />
        {block.autoplay && <p className="text-[11px] text-muted-foreground -mt-1">Pornirea automata merge doar fara sunet (asa cer browserele).</p>}
        <Toggle label="Redare in bucla" checked={!!block.loop} onChange={(v) => patch({ loop: v })} />
        {!block.autoplay && <Toggle label="Fara sunet" checked={!!block.muted} onChange={(v) => patch({ muted: v })} />}
        <Toggle label="Afiseaza controalele de redare" checked={block.controls !== false} onChange={(v) => patch({ controls: v })} />
      </div>
      <Select label="Raport de aspect" value={block.aspect ?? "16:9"} onChange={(v) => patch({ aspect: v })} options={[{ value: "16:9", label: "16:9 (orizontal)" }, { value: "9:16", label: "9:16 (vertical / reels)" }, { value: "1:1", label: "1:1 (patrat)" }]} />
      {block.aspect === "9:16" && <p className="text-[11px] text-muted-foreground -mt-1">Pentru video vertical, micsoreaza latimea (ex: 40-60%) ca sa nu ocupe tot ecranul.</p>}
      <Range label="Latime video" value={block.widthPct ?? 100} min={10} max={100} step={5} unit="%" onChange={(v) => patch({ widthPct: v })} />
      <Select label="Aliniere" value={block.align ?? "center"} onChange={(v) => patch({ align: v })} options={[{ value: "left", label: "Stanga" }, { value: "center", label: "Centru" }, { value: "right", label: "Dreapta" }]} />
      <StyleControls style={block.style} onChange={setStyle} hide={["align"]} />
    </div>
  );
}

function StyleControls({ style, onChange, hide, showTextColor }: { style?: BlockStyle; onChange: (s: BlockStyle) => void; hide?: ("width" | "align" | "bg" | "padding")[]; showTextColor?: boolean }) {
  const h = (k: string) => hide?.includes(k as never);
  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Aspect</p>
      {!h("padding") && (
        <>
          <Select label="Spatiere" value={style?.padding ?? "md"} onChange={(v) => onChange({ ...style, padding: v })}
            options={[{ value: "none", label: "Fara" }, { value: "sm", label: "Mica" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }, { value: "xl", label: "Foarte mare" }, { value: "custom", label: "Personalizata" }]} />
          {style?.padding === "custom" && (
            <Range label="Spatiere sus/jos" value={style?.paddingCustom ?? 32} min={0} max={240} onChange={(v) => onChange({ ...style, paddingCustom: v })} />
          )}
        </>
      )}
      {!h("width") && (
        <Select label="Latime" value={style?.width ?? "container"} onChange={(v) => onChange({ ...style, width: v })}
          options={[{ value: "narrow", label: "Ingusta" }, { value: "container", label: "Standard" }, { value: "full", label: "Completa" }]} />
      )}
      {!h("align") && (
        <Select label="Aliniere" value={style?.align ?? "left"} onChange={(v) => onChange({ ...style, align: v })}
          options={[{ value: "left", label: "Stanga" }, { value: "center", label: "Centru" }, { value: "right", label: "Dreapta" }]} />
      )}
      {showTextColor && <ColorField label="Culoare text" value={style?.textColor} onChange={(v) => onChange({ ...style, textColor: v })} allowEmpty />}
      {!h("bg") && <ColorField label="Fundal" value={style?.bg} onChange={(v) => onChange({ ...style, bg: v })} allowEmpty />}
    </div>
  );
}

/* ─── Main ─────────────────────────────────────────────────────────────────── */

export function BlockSettings({ block, onChange, categories, forms, businessId, isAdmin }: {
  block: Block; onChange: (patch: Partial<Block>) => void; categories: string[]; forms: FormDef[]; businessId: string; isAdmin: boolean;
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
          <ColorField label="Culoare buton" value={b.buttonColor} onChange={(v) => patch({ buttonColor: v })} allowEmpty />
          <ColorField label="Culoare text buton" value={b.buttonTextColor} onChange={(v) => patch({ buttonTextColor: v })} allowEmpty />
          <ImageField label="Imagine fundal" value={b.bgImage} onChange={(v) => patch({ bgImage: v })} />
          <p className="text-[11px] text-muted-foreground -mt-2">Recomandat: imagine lata, 1600×900px (raport 16:9), sub 500KB.</p>
          <ColorField label="Culoare fundal" value={b.bgColor} onChange={(v) => patch({ bgColor: v })} allowEmpty />
          <ColorField label="Culoare text" value={b.textColor} onChange={(v) => patch({ textColor: v })} allowEmpty />
          <Select label="Inaltime" value={b.height ?? "md"} onChange={(v) => patch({ height: v })} options={[{ value: "sm", label: "Mica" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }, { value: "custom", label: "Personalizata" }]} />
          {b.height === "custom" && <Range label="Inaltime" value={b.heightCustom ?? 360} min={120} max={900} onChange={(v) => patch({ heightCustom: v })} />}
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
          <Select label="Marime" value={b.size ?? "lg"} onChange={(v) => patch({ size: v })}
            options={[{ value: "sm", label: "Mica" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }, { value: "xl", label: "Foarte mare" }, { value: "2xl", label: "Imensa" }, { value: "3xl", label: "Gigant" }, { value: "custom", label: "Personalizata" }]} />
          {b.size === "custom" && <Range label="Marime text" value={b.sizeCustom ?? 32} min={12} max={120} onChange={(v) => patch({ sizeCustom: v })} />}
          <ColorField label="Culoare text" value={b.color} onChange={(v) => patch({ color: v })} allowEmpty />
          <Select label="Tip titlu (pentru SEO)" value={String(b.level ?? 2) as "1" | "2" | "3"} onChange={(v) => patch({ level: Number(v) as 1 | 2 | 3 })} options={[{ value: "1", label: "H1 (principal)" }, { value: "2", label: "H2" }, { value: "3", label: "H3" }]} />
          <StyleControls style={b.style} onChange={setStyle} hide={["width"]} />
        </div>
      );
    }
    case "text": {
      const b = block as TextBlock;
      return (
        <div className="space-y-4">
          <Field label="Continut"><RichTextEditor content={b.html ?? ""} onChange={(html) => patch({ html })} /></Field>
          <StyleControls style={b.style} onChange={setStyle} showTextColor />
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
          <Range label="Latime imagine" value={b.widthPct ?? 100} min={10} max={100} step={5} unit="%" onChange={(v) => patch({ widthPct: v })} />
          <Select label="Aliniere" value={b.align ?? "center"} onChange={(v) => patch({ align: v })} options={[{ value: "left", label: "Stanga" }, { value: "center", label: "Centru" }, { value: "right", label: "Dreapta" }]} />
          <Toggle label="Colturi rotunjite" checked={b.rounded !== false} onChange={(v) => patch({ rounded: v })} />
          <StyleControls style={b.style} onChange={setStyle} hide={["align"]} />
        </div>
      );
    }
    case "gallery": {
      const b = block as GalleryBlock;
      const items: GalleryItem[] = b.items ?? (b.images ?? []).map((src) => ({ src }));
      const setItem = (i: number, p: Partial<{ title: string; desc: string }>) => patch({ items: items.map((it, k) => (k === i ? { ...it, ...p } : it)) });
      const mode = b.captionMode ?? "none";
      return (
        <div className="space-y-4">
          <Select label="Coloane" value={String(b.columns ?? 3) as "2" | "3" | "4"} onChange={(v) => patch({ columns: Number(v) as 2 | 3 | 4 })} options={[{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }]} />
          <Select label="Distanta intre poze" value={b.gap ?? "md"} onChange={(v) => patch({ gap: v })} options={[{ value: "sm", label: "Mica" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }]} />
          <Select label="Sub fiecare poza" value={mode} onChange={(v) => patch({ captionMode: v })} options={[{ value: "none", label: "Nimic" }, { value: "title", label: "Doar titlu" }, { value: "desc", label: "Doar descriere" }, { value: "both", label: "Titlu + descriere" }]} />
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="p-2 border border-border rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.src} alt="" className="w-10 h-10 rounded object-cover border border-border shrink-0" />
                  <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{it.src}</span>
                  <button type="button" onClick={() => patch({ items: items.filter((_, k) => k !== i) })} className="w-7 h-7 rounded border border-border flex items-center justify-center shrink-0"><X className="h-3.5 w-3.5 text-red-500" /></button>
                </div>
                {(mode === "title" || mode === "both") && <input value={it.title ?? ""} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="Titlu poza" className={inputCls} />}
                {(mode === "desc" || mode === "both") && <input value={it.desc ?? ""} onChange={(e) => setItem(i, { desc: e.target.value })} placeholder="Descriere poza" className={inputCls} />}
              </div>
            ))}
          </div>
          <ImageField label="Adauga imagine" value={null} onChange={(v) => { if (v) patch({ items: [...items, { src: v }] }); }} />
          <StyleControls style={b.style} onChange={setStyle} hide={["align"]} />
        </div>
      );
    }
    case "button": {
      const b = block as ButtonBlock;
      return (
        <div className="space-y-4">
          <Text label="Text buton" value={b.label} onChange={(v) => patch({ label: v })} />
          <Text label="Link" value={b.href} onChange={(v) => patch({ href: v })} placeholder="/produs sau https://" />
          <Select label="Stil" value={b.variant ?? "solid"} onChange={(v) => patch({ variant: v })} options={[{ value: "solid", label: "Plin" }, { value: "outline", label: "Contur" }, { value: "soft", label: "Subtil" }, { value: "ghost", label: "Transparent" }]} />
          <ColorField label="Culoare buton" value={b.color} onChange={(v) => patch({ color: v })} allowEmpty />
          <ColorField label="Culoare text" value={b.textColor} onChange={(v) => patch({ textColor: v })} allowEmpty />
          <Select label="Marime" value={b.size ?? "md"} onChange={(v) => patch({ size: v })} options={[{ value: "sm", label: "Mic" }, { value: "md", label: "Mediu" }, { value: "lg", label: "Mare" }]} />
          <Select label="Colturi" value={b.rounded ?? "lg"} onChange={(v) => patch({ rounded: v })} options={[{ value: "sm", label: "Putin rotunjite" }, { value: "md", label: "Mediu" }, { value: "lg", label: "Mult" }, { value: "full", label: "Rotund (pastila)" }]} />
          <Select label="Efect" value={b.effect ?? "none"} onChange={(v) => patch({ effect: v })} options={[{ value: "none", label: "Fara" }, { value: "pulse", label: "Puls" }, { value: "bounce", label: "Saltaret" }, { value: "shake", label: "Tremurat" }, { value: "glow", label: "Stralucire" }, { value: "heartbeat", label: "Batai de inima" }]} />
          <Toggle label="Latime completa" checked={!!b.fullWidth} onChange={(v) => patch({ fullWidth: v })} />
          <Toggle label="Deschide in tab nou" checked={!!b.newTab} onChange={(v) => patch({ newTab: v })} />
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
            patch({ count: n, template: n === 3 ? "1-1-1" : "1-1", items: next.slice(0, n) });
          }} options={[{ value: "2", label: "2" }, { value: "3", label: "3" }]} />
          <Select label="Structura (latimi)" value={b.template ?? (count === 3 ? "1-1-1" : "1-1")} onChange={(v) => patch({ template: v })}
            options={count === 3
              ? [{ value: "1-1-1", label: "Egale" }, { value: "2-1-1", label: "Prima mai lata" }, { value: "1-2-1", label: "Mijloc mai lat" }, { value: "1-1-2", label: "Ultima mai lata" }]
              : [{ value: "1-1", label: "Egale (50/50)" }, { value: "1-2", label: "Stanga mica (33/66)" }, { value: "2-1", label: "Dreapta mica (66/33)" }]} />
          <Select label="Distanta" value={b.gap ?? "md"} onChange={(v) => patch({ gap: v })} options={[{ value: "sm", label: "Mica" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }]} />
          <Select label="Aliniere verticala" value={b.verticalAlign ?? "top"} onChange={(v) => patch({ verticalAlign: v })} options={[{ value: "top", label: "Sus" }, { value: "center", label: "Centru" }]} />
          <Toggle label="Contur coloane" checked={!!b.bordered} onChange={(v) => patch({ bordered: v })} />
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
      return (
        <div className="space-y-4">
          <Select label="Inaltime spatiu" value={b.size ?? "md"} onChange={(v) => patch({ size: v })} options={[{ value: "sm", label: "Mic" }, { value: "md", label: "Mediu" }, { value: "lg", label: "Mare" }, { value: "xl", label: "Foarte mare" }, { value: "custom", label: "Personalizat" }]} />
          {b.size === "custom" && <Range label="Inaltime" value={b.sizeCustom ?? 40} min={4} max={400} onChange={(v) => patch({ sizeCustom: v })} />}
        </div>
      );
    }
    case "divider": {
      const b = block as DividerBlock;
      return (
        <div className="space-y-4">
          <Select label="Stil linie" value={b.lineStyle ?? "solid"} onChange={(v) => patch({ lineStyle: v })} options={[{ value: "solid", label: "Continua" }, { value: "dashed", label: "Intrerupta" }, { value: "dotted", label: "Punctata" }]} />
          <Range label="Grosime" value={b.thickness ?? 1} min={1} max={12} onChange={(v) => patch({ thickness: v })} />
          <Range label="Latime" value={b.widthPct ?? 100} min={10} max={100} step={5} unit="%" onChange={(v) => patch({ widthPct: v })} />
          <ColorField label="Culoare" value={b.color} onChange={(v) => patch({ color: v })} allowEmpty />
        </div>
      );
    }
    case "video": {
      const b = block as VideoBlock;
      return <VideoSettings block={b} patch={patch} setStyle={setStyle} />;
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
          <Select label="Coloane" value={String(b.columns ?? 3) as "2" | "3" | "4"} onChange={(v) => patch({ columns: Number(v) as 2 | 3 | 4 })} options={[{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }]} />
          <Select label="Aliniere continut" value={b.align ?? "center"} onChange={(v) => patch({ align: v })} options={[{ value: "center", label: "Centru" }, { value: "left", label: "Stanga" }]} />
          <Toggle label="Afiseaza fiecare ca un card" checked={b.card !== false} onChange={(v) => patch({ card: v })} />
          {items.map((it, i) => (
            <div key={i} className="p-3 rounded-lg border border-border space-y-2">
              <div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-muted-foreground">Beneficiu {i + 1}</p>
                <button type="button" onClick={() => patch({ items: items.filter((_, k) => k !== i) })}><X className="h-3.5 w-3.5 text-red-500" /></button></div>
              <IconPicker value={it.icon} onChange={(v) => setItem(i, { icon: v })} />
              <input value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="Titlu" className={inputCls} />
              <input value={it.desc} onChange={(e) => setItem(i, { desc: e.target.value })} placeholder="Descriere" className={inputCls} />
            </div>
          ))}
          <button type="button" onClick={() => patch({ items: [...items, { icon: "Star", title: "", desc: "" }] })} className="flex items-center gap-1.5 text-xs font-medium text-primary"><Plus className="h-3.5 w-3.5" /> Adauga beneficiu</button>
          <StyleControls style={b.style} onChange={setStyle} hide={["align"]} />
        </div>
      );
    }
    case "products": {
      const b = block as ProductsBlock;
      return (
        <div className="space-y-4">
          <Text label="Titlu sectiune" value={b.title} onChange={(v) => patch({ title: v })} />
          <Select label="Afiseaza" value={b.mode ?? "featured"} onChange={(v) => patch({ mode: v })} options={[{ value: "featured", label: "Produse populare" }, { value: "all", label: "Toate" }, { value: "category", label: "Dintr-o categorie" }, { value: "selected", label: "Selectate manual" }]} />
          {b.mode === "category" && (
            <Select label="Categorie" value={b.category ?? ""} onChange={(v) => patch({ category: v })} options={[{ value: "", label: "Alege..." }, ...categories.map((c) => ({ value: c, label: c }))]} />
          )}
          {b.mode === "selected" && (
            <Field label="Produse selectate">
              <ProductPicker businessId={businessId} selectedIds={b.productIds ?? []} onChange={(ids) => patch({ productIds: ids })} />
            </Field>
          )}
          <Select label="Coloane" value={String(b.columns ?? 4) as "2" | "3" | "4"} onChange={(v) => patch({ columns: Number(v) as 2 | 3 | 4 })} options={[{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }]} />
          <Select label="Aspect" value={b.layout ?? "grid"} onChange={(v) => patch({ layout: v })} options={[{ value: "grid", label: "Grila" }, { value: "carousel", label: "Carusel" }]} />
          <Toggle label="Buton „Adauga in cos” pe produse" checked={!!b.showAddToCart} onChange={(v) => patch({ showAddToCart: v })} />
          <Field label="Numar maxim de produse"><input type="number" min={1} max={24} value={b.limit ?? 8} onChange={(e) => patch({ limit: Math.min(24, Math.max(1, Number(e.target.value))) })} className={inputCls} /></Field>
          <StyleControls style={b.style} onChange={setStyle} hide={["align"]} />
        </div>
      );
    }
    case "social": {
      const b = block as SocialBlock;
      return <div className="space-y-4"><Text label="Titlu" value={b.title} onChange={(v) => patch({ title: v })} /><p className="text-xs text-muted-foreground">Linkurile retelelor se preiau din setarile magazinului.</p><StyleControls style={b.style} onChange={setStyle} hide={["width"]} /></div>;
    }
    case "contact": {
      const b = block as ContactBlock;
      const usingForm = !!b.formId && forms.some((f) => f.id === b.formId);
      return (
        <div className="space-y-4">
          <Text label="Titlu (deasupra formularului)" value={b.title} onChange={(v) => patch({ title: v })} />
          <Select label="Formular" value={b.formId ?? ""} onChange={(v) => patch({ formId: v || null })}
            options={[{ value: "", label: "Contact simplu (implicit)" }, ...forms.map((f) => ({ value: f.id, label: f.name }))]} />
          {usingForm ? (
            <div className="p-2.5 rounded-lg bg-muted/50 border border-border text-[11px] text-muted-foreground">
              Campurile, mesajul de confirmare si trimiterea pe email pentru acest formular se configureaza in{" "}
              <Link href="/dashboard/pages/forms" target="_blank" rel="noopener noreferrer" className="text-primary font-medium">sectiunea Formulare</Link>.
            </div>
          ) : (
            <>
              <Text label="Text buton" value={b.buttonLabel} onChange={(v) => patch({ buttonLabel: v })} />
              <Text label="Mesaj de confirmare" value={b.successMessage} onChange={(v) => patch({ successMessage: v })} />
              <Toggle label="Camp telefon" checked={b.showPhone !== false} onChange={(v) => patch({ showPhone: v })} />
              <Toggle label="Camp mesaj" checked={b.showMessage !== false} onChange={(v) => patch({ showMessage: v })} />
              <div className="pt-3 border-t border-border">
                <Toggle label="Trimite-mi completarile pe email" checked={!!b.emailEnabled} onChange={(v) => patch({ emailEnabled: v })} />
                <p className="text-[11px] text-muted-foreground mt-1">Emailul ajunge la adresa magazinului. Completarile apar mereu si in „Mesaje”.</p>
              </div>
            </>
          )}
          {forms.length === 0 && (
            <p className="text-[11px] text-muted-foreground">Vrei alte campuri? Creeaza-ti propriile formulare in sectiunea Formulare.</p>
          )}
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
