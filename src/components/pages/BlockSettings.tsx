"use client";

import { useState } from "react";
import Link from "next/link";
import { X, Plus, AlertTriangle, ImagePlus } from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { MediaPicker } from "@/components/media/MediaPicker";
import { MAX_VIDEO_MB } from "@/lib/pages/video-config";
import { isFlexibleColumns, classicItemToBlocks, columnsPerRow, gridTemplateFor } from "@/lib/pages/block-tree";
import { EFECTE_BUTON, EFECTE_IMAGINE } from "@/lib/pages/animatii";
import type {
  Block, BlockStyle, HeroBlock, HeadingBlock, TextBlock, ImageBlock, GalleryBlock,
  ButtonBlock, ColumnsBlock, SpacerBlock, DividerBlock, VideoBlock, MapBlock, FaqBlock,
  TrustBlock, ProductsBlock, SocialBlock, ContactBlock, HtmlBlock, ColumnItem, GalleryItem, GreutateFont,
  BundlesBlock, NewsletterBlock, PaymentsBlock, CouriersBlock,
} from "@/lib/pages/blocks.types";
import { ProductPicker } from "./ProductPicker";
import type { FormDef } from "@/lib/pages/forms.types";
import { CampCuloare } from "./editor/CampCuloare";
import { CampImagine } from "./editor/CampImagine";
import { CampLink } from "./editor/CampLink";
import { ControaleAnimatie, ControaleAspect } from "./editor/ControaleAspect";
import { SetariHarta } from "./editor/SetariHarta";
import { SetariFaq } from "./editor/SetariFaq";
import { SetariBeneficii, SetariNewsletter, SetariPachete, SetariPlatiCurieri, StilFormular } from "./editor/SetariNoi";
import { cereIzolare } from "@/lib/pages/cod-personalizat";
import type { PachetPagina } from "@/lib/pages/resolve-bundles";
import {
  AlegeFont, Area, Field, Grup, IconPicker, Range, Segmentat, Select, Text, Toggle, inputCls,
} from "./editor/campuri";

const GREUTATI: { value: GreutateFont; label: string }[] = [
  { value: "400", label: "Normal" }, { value: "500", label: "Mediu" }, { value: "600", label: "Semi-gros" },
  { value: "700", label: "Gros" }, { value: "800", label: "Foarte gros" }, { value: "900", label: "Maxim" },
];

/* ─── Columns layout picker ────────────────────────────────────────────────── */

interface ColumnLayout { key: string; label: string; count: number; perRow: number; template?: string }

/** Preset arrangements. Single-row ratios + wrapping grids (e.g. 6 = 3 sus / 3 jos). */
const COLUMN_LAYOUTS: ColumnLayout[] = [
  { key: "1-1",   label: "2 egale",        count: 2, perRow: 2, template: "1-1" },
  { key: "1-2",   label: "Stânga mică",    count: 2, perRow: 2, template: "1-2" },
  { key: "2-1",   label: "Dreapta mică",   count: 2, perRow: 2, template: "2-1" },
  { key: "1-3",   label: "Stânga îngustă", count: 2, perRow: 2, template: "1-3" },
  { key: "3-1",   label: "Dreapta îngustă", count: 2, perRow: 2, template: "3-1" },
  { key: "1-1-1", label: "3 egale",        count: 3, perRow: 3, template: "1-1-1" },
  { key: "2-1-1", label: "3: prima lată",  count: 3, perRow: 3, template: "2-1-1" },
  { key: "1-2-1", label: "3: mijloc lat",  count: 3, perRow: 3, template: "1-2-1" },
  { key: "1-1-2", label: "3: ultima lată", count: 3, perRow: 3, template: "1-1-2" },
  { key: "4",     label: "4 egale",        count: 4, perRow: 4 },
  { key: "5",     label: "5 egale",        count: 5, perRow: 5 },
  { key: "6",     label: "6 egale",        count: 6, perRow: 6 },
  { key: "2x2",   label: "2 × 2",          count: 4, perRow: 2 },
  { key: "3x2",   label: "3 × 2 (6)",      count: 6, perRow: 3 },
  { key: "2x3",   label: "2 × 3 (6)",      count: 6, perRow: 2 },
  { key: "4x2",   label: "4 × 2 (8)",      count: 8, perRow: 4 },
  { key: "3x3",   label: "3 × 3 (9)",      count: 9, perRow: 3 },
];

function LayoutPreview({ count, perRow, template }: { count: number; perRow: number; template?: string }) {
  return (
    <div className="grid w-full gap-0.5" style={{ gridTemplateColumns: gridTemplateFor(perRow, template) }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-2.5 rounded-[2px] bg-current opacity-30" />
      ))}
    </div>
  );
}

function LayoutPicker({ current, onPick }: { current: string; onPick: (l: ColumnLayout) => void }) {
  return (
    <Field label="Așezarea coloanelor">
      <div className="grid grid-cols-3 gap-2">
        {COLUMN_LAYOUTS.map((l) => {
          const active = l.key === current;
          return (
            <button key={l.key} type="button" onClick={() => onPick(l)} title={l.label}
              className={`flex min-h-[54px] flex-col items-center justify-between gap-1.5 rounded-lg border p-2 transition-colors ${active ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:border-primary/50"}`}>
              <LayoutPreview count={l.count} perRow={l.perRow} template={l.template} />
              <span className="text-center text-[10px] leading-tight text-muted-foreground">{l.label}</span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function GalerieImagini({ items, onChange }: { items: GalleryItem[]; onChange: (items: GalleryItem[]) => void }) {
  const [deschis, setDeschis] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setDeschis(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-4 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/5">
        <ImagePlus className="h-4 w-4 text-muted-foreground" /> Adaugă imagini din Biblioteca Media
      </button>
      <MediaPicker open={deschis} onClose={() => setDeschis(false)} accept="image" bucket="gallery" multiple
        excludeUrls={items.map((i) => i.src)}
        onSelect={(urls) => onChange([...items, ...urls.map((src) => ({ src }))])} />
    </>
  );
}

/* ─── Main ─────────────────────────────────────────────────────────────────── */

/** Ce stie editorul despre integrarile magazinului (doar nume, pentru explicatii). */
export interface IntegrariEditor { furnizori: string[]; plati: string[]; curieri: string[] }

export function BlockSettings({ block, onChange, categories, forms, businessId, isAdmin, integrari, pachete }: {
  block: Block; onChange: (patch: Partial<Block>) => void; categories: string[]; forms: FormDef[]; businessId: string; isAdmin: boolean;
  integrari: IntegrariEditor;
  pachete: PachetPagina[];
}) {
  const patch = onChange as (p: Record<string, unknown>) => void;
  const setStyle = (style: BlockStyle) => patch({ style });

  switch (block.type) {
    case "hero": {
      const b = block as HeroBlock;
      const split = b.layout === "split-left" || b.layout === "split-right";
      return (
        <div className="space-y-4">
          <Text label="Titlu" value={b.title} onChange={(v) => patch({ title: v })} />
          <Area label="Subtitlu" value={b.subtitle} onChange={(v) => patch({ subtitle: v })} rows={3} />
          <CampImagine eticheta={split ? "Imagine" : "Imagine de fundal"} valoare={b.bgImage} onChange={(v) => patch({ bgImage: v })}
            ajutor="Recomandat: lată, 1600 × 900 px, sub 500 KB." />
          <Segmentat label="Așezare" value={b.layout ?? "overlay"} onChange={(v) => patch({ layout: v })}
            options={[{ value: "overlay", label: "Text peste" }, { value: "split-left", label: "Imagine stânga" }, { value: "split-right", label: "Imagine dreapta" }]} />

          <Grup titlu="Butoane" deschisImplicit>
            <Text label="Text buton" value={b.buttonLabel} onChange={(v) => patch({ buttonLabel: v })} placeholder="Ex: Vezi produsele" />
            <CampLink eticheta="Link buton" valoare={b.buttonHref} onChange={(v) => patch({ buttonHref: v })} />
            <CampCuloare eticheta="Culoare buton" valoare={b.buttonColor} onChange={(v) => patch({ buttonColor: v })} poateFiGol />
            <CampCuloare eticheta="Culoare text buton" valoare={b.buttonTextColor} onChange={(v) => patch({ buttonTextColor: v })} poateFiGol />
            <Text label="Al doilea buton (opțional)" value={b.secondLabel} onChange={(v) => patch({ secondLabel: v })} placeholder="Ex: Despre noi" />
            {b.secondLabel && <CampLink eticheta="Link al doilea buton" valoare={b.secondHref} onChange={(v) => patch({ secondHref: v })} />}
          </Grup>

          <Grup titlu="Tipografie">
            <AlegeFont label="Fontul titlului" value={b.titleFont ?? null} onChange={(v) => patch({ titleFont: v })} />
            <AlegeFont label="Fontul subtitlului" value={b.subtitleFont ?? null} onChange={(v) => patch({ subtitleFont: v })} />
            <Select label="Grosime" value={b.titleWeight ?? "900"} onChange={(v) => patch({ titleWeight: v })} options={GREUTATI} />
            <Toggle label="Titlu cu majuscule" checked={b.titleTransform === "uppercase"} onChange={(v) => patch({ titleTransform: v ? "uppercase" : "none" })} />
          </Grup>

          <Grup titlu="Aspect">
            <CampCuloare eticheta="Culoare fundal" valoare={b.bgColor} onChange={(v) => patch({ bgColor: v })} poateFiGol />
            <CampCuloare eticheta="Culoare text" valoare={b.textColor} onChange={(v) => patch({ textColor: v })} poateFiGol />
            <Select label="Înălțime" value={b.height ?? "md"} onChange={(v) => patch({ height: v })} options={[{ value: "sm", label: "Mică" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }, { value: "custom", label: "Personalizată" }]} />
            {b.height === "custom" && <Range label="Înălțime" value={b.heightCustom ?? 360} min={120} max={900} onChange={(v) => patch({ heightCustom: v })} />}
            {!split && <Segmentat label="Aliniere" value={b.align ?? "center"} onChange={(v) => patch({ align: v })} options={[{ value: "left", label: "Stânga" }, { value: "center", label: "Centru" }]} />}
            {b.bgImage && !split && <Toggle label="Strat întunecat peste imagine" checked={b.overlay !== false} onChange={(v) => patch({ overlay: v })} />}
            {b.bgImage && !split && b.overlay !== false && (
              <Range label="Cât de întunecat" unit="%" value={b.overlayOpacity ?? 45} min={0} max={80} step={5} onChange={(v) => patch({ overlayOpacity: v })} />
            )}
            {b.bgImage && <Toggle label="Imaginea se apropie lent (Ken Burns)" checked={!!b.kenBurns} onChange={(v) => patch({ kenBurns: v })} />}
            <Segmentat label="Se vede pe" value={b.style?.hideOn ?? "toate"}
              onChange={(v) => setStyle({ ...b.style, hideOn: v === "toate" ? null : (v as "mobile" | "desktop") })}
              options={[{ value: "toate", label: "Toate" }, { value: "mobile", label: "Doar desktop" }, { value: "desktop", label: "Doar telefon" }]} />
          </Grup>
          <ControaleAnimatie style={b.style} onChange={setStyle} />
        </div>
      );
    }
    case "heading": {
      const b = block as HeadingBlock;
      const cuDegrade = !!b.gradient;
      return (
        <div className="space-y-4">
          <Text label="Text" value={b.text} onChange={(v) => patch({ text: v })} />
          <Text label="Rând mic deasupra (opțional)" value={b.eyebrow} onChange={(v) => patch({ eyebrow: v })} placeholder="Ex: DESPRE NOI" />
          <Text label="Subtitlu (opțional)" value={b.subtitle} onChange={(v) => patch({ subtitle: v })} />
          <Select label="Mărime" value={b.size ?? "lg"} onChange={(v) => patch({ size: v })}
            options={[{ value: "sm", label: "Mică" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }, { value: "xl", label: "Foarte mare" }, { value: "2xl", label: "Imensă" }, { value: "3xl", label: "Gigant" }, { value: "custom", label: "Personalizată" }]} />
          {b.size === "custom" && <Range label="Mărime text" value={b.sizeCustom ?? 32} min={12} max={120} onChange={(v) => patch({ sizeCustom: v })} />}
          <Select label="Tip titlu (pentru Google)" value={String(b.level ?? 2) as "1" | "2" | "3"} onChange={(v) => patch({ level: Number(v) as 1 | 2 | 3 })}
            options={[{ value: "1", label: "H1 (titlul principal al paginii)" }, { value: "2", label: "H2 (secțiune)" }, { value: "3", label: "H3 (subsecțiune)" }]}
            ajutor="Dacă pagina n-are niciun H1, primul titlu de pe ea devine automat H1." />

          <Grup titlu="Tipografie" deschisImplicit>
            <AlegeFont label="Font" value={b.font ?? null} onChange={(v) => patch({ font: v })} />
            <Select label="Grosime" value={b.weight ?? "900"} onChange={(v) => patch({ weight: v })} options={GREUTATI} />
            <Segmentat label="Spațiere între litere" value={b.spacing ?? "normal"} onChange={(v) => patch({ spacing: v })}
              options={[{ value: "tight", label: "Strânsă" }, { value: "normal", label: "Normală" }, { value: "wide", label: "Largă" }, { value: "wider", label: "Foarte largă" }]} />
            <Segmentat label="Litere" value={b.transform ?? "none"} onChange={(v) => patch({ transform: v })}
              options={[{ value: "none", label: "Normale" }, { value: "uppercase", label: "MAJUSCULE" }, { value: "capitalize", label: "Fiecare Cuvânt" }]} />
            <Toggle label="Cursiv (italic)" checked={!!b.italic} onChange={(v) => patch({ italic: v })} />
          </Grup>

          <Grup titlu="Culoare">
            <Segmentat label="Culoare" value={cuDegrade ? "degrade" : "simpla"}
              onChange={(v) => patch({ gradient: v === "degrade" ? { from: "#6D28D9", to: "#E11D48" } : null })}
              options={[{ value: "simpla", label: "Simplă" }, { value: "degrade", label: "Degradé" }]} />
            {cuDegrade ? (
              <>
                <CampCuloare eticheta="De la" valoare={b.gradient!.from} onChange={(v) => v && patch({ gradient: { ...b.gradient!, from: v } })} />
                <CampCuloare eticheta="Până la" valoare={b.gradient!.to} onChange={(v) => v && patch({ gradient: { ...b.gradient!, to: v } })} />
              </>
            ) : (
              <CampCuloare eticheta="Culoare text" valoare={b.color} onChange={(v) => patch({ color: v })} poateFiGol />
            )}
          </Grup>
          <ControaleAspect style={b.style} onChange={setStyle} hide={["width"]} />
        </div>
      );
    }
    case "text": {
      const b = block as TextBlock;
      return (
        <div className="space-y-4">
          <Field label="Conținut"><RichTextEditor content={b.html ?? ""} onChange={(html) => patch({ html })} /></Field>
          <Grup titlu="Tipografie" deschisImplicit insigna={b.font ? "font propriu" : undefined}>
            <AlegeFont label="Font" value={b.font ?? null} onChange={(v) => patch({ font: v })} gol="Fontul magazinului" />
            <Range label="Mărime" value={b.fontSize ?? 16} min={12} max={32} onChange={(v) => patch({ fontSize: v })} />
            <Select label="Grosime" value={b.weight ?? "400"} onChange={(v) => patch({ weight: v })} options={GREUTATI} />
            <Segmentat label="Spațiu între rânduri" value={b.lineHeight ?? "relaxed"} onChange={(v) => patch({ lineHeight: v })}
              options={[{ value: "tight", label: "Strâns" }, { value: "normal", label: "Normal" }, { value: "relaxed", label: "Aerisit" }, { value: "loose", label: "Larg" }]} />
            <Segmentat label="Spațiere între litere" value={b.spacing ?? "normal"} onChange={(v) => patch({ spacing: v })}
              options={[{ value: "tight", label: "Strânsă" }, { value: "normal", label: "Normală" }, { value: "wide", label: "Largă" }, { value: "wider", label: "F. largă" }]} />
          </Grup>
          <ControaleAspect style={b.style} onChange={setStyle} showTextColor />
        </div>
      );
    }
    case "image": {
      const b = block as ImageBlock;
      return (
        <div className="space-y-4">
          <CampImagine eticheta="Imagine" valoare={b.src} onChange={(v) => patch({ src: v })} />
          <Text label="Text alternativ (alt)" value={b.alt} onChange={(v) => patch({ alt: v })} ajutor="Ce se vede în imagine. Îl citesc Google și cititoarele de ecran." />
          <CampLink eticheta="Link (opțional)" valoare={b.href} onChange={(v) => patch({ href: v })} />
          {b.href && <Toggle label="Deschide în tab nou" checked={!!b.newTab} onChange={(v) => patch({ newTab: v })} />}
          <Text label="Descriere sub imagine" value={b.caption} onChange={(v) => patch({ caption: v })} />
          <Grup titlu="Imaginea" deschisImplicit>
            <Select label="Formă" value={b.aspect ?? "original"} onChange={(v) => patch({ aspect: v })}
              options={[{ value: "original", label: "Originală" }, { value: "1:1", label: "Pătrat (1:1)" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "Portret (3:4)" }, { value: "16:9", label: "Lată (16:9)" }, { value: "21:9", label: "Panoramă (21:9)" }]} />
            <Range label="Lățime imagine" value={b.widthPct ?? 100} min={10} max={100} step={5} unit="%" onChange={(v) => patch({ widthPct: v })} />
            <Segmentat label="Aliniere" value={b.align ?? "center"} onChange={(v) => patch({ align: v })} options={[{ value: "left", label: "Stânga" }, { value: "center", label: "Centru" }, { value: "right", label: "Dreapta" }]} />
            <Toggle label="Colțuri rotunjite" checked={b.rounded !== false} onChange={(v) => patch({ rounded: v })} />
            <Segmentat label="Umbră" value={b.shadow ?? "none"} onChange={(v) => patch({ shadow: v })}
              options={[{ value: "none", label: "Fără" }, { value: "sm", label: "Fină" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }]} />
            <Select label="La trecerea cursorului" value={b.hover ?? "none"} onChange={(v) => patch({ hover: v })} options={EFECTE_IMAGINE.map((e) => ({ value: e.cheie, label: e.nume }))} />
          </Grup>
          <ControaleAspect style={b.style} onChange={setStyle} hide={["align"]} />
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
          <GalerieImagini items={items} onChange={(n) => patch({ items: n })} />
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-2">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.src} alt="" className="h-10 w-10 shrink-0 rounded border border-border object-cover" />
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{it.src.split("/").pop()}</span>
                  <button type="button" onClick={() => patch({ items: items.filter((_, k) => k !== i) })} aria-label="Scoate imaginea" className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border"><X className="h-3.5 w-3.5 text-red-500" /></button>
                </div>
                {(mode === "title" || mode === "both") && <input value={it.title ?? ""} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="Titlu poză" className={inputCls} />}
                {(mode === "desc" || mode === "both") && <input value={it.desc ?? ""} onChange={(e) => setItem(i, { desc: e.target.value })} placeholder="Descriere poză" className={inputCls} />}
              </div>
            ))}
          </div>
          <Grup titlu="Așezare" deschisImplicit>
            <Segmentat label="Mod" value={b.layout ?? "grid"} onChange={(v) => patch({ layout: v })}
              options={[{ value: "grid", label: "Grilă" }, { value: "masonry", label: "Zid (masonry)" }]} />
            <Select label="Coloane pe desktop" value={String(b.columns ?? 3) as "2"} onChange={(v) => patch({ columns: Number(v) as 2 | 3 | 4 | 5 | 6 })}
              options={["2", "3", "4", "5", "6"].map((n) => ({ value: n as "2", label: n }))} />
            <Segmentat label="Pe telefon" value={String(b.mobileColumns ?? 2) as "1" | "2"} onChange={(v) => patch({ mobileColumns: Number(v) as 1 | 2 })}
              options={[{ value: "1", label: "O coloană" }, { value: "2", label: "Două" }]} />
            {b.layout !== "masonry" && (
              <Select label="Forma pozelor" value={b.aspect ?? "1:1"} onChange={(v) => patch({ aspect: v })}
                options={[{ value: "1:1", label: "Pătrat" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "Portret" }, { value: "16:9", label: "Lată" }]} />
            )}
            <Select label="Distanța între poze" value={b.gap ?? "md"} onChange={(v) => patch({ gap: v })} options={[{ value: "sm", label: "Mică" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }]} />
            <Segmentat label="Colțuri" value={b.rounded ?? "md"} onChange={(v) => patch({ rounded: v })}
              options={[{ value: "none", label: "Drepte" }, { value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }]} />
            <Select label="La trecerea cursorului" value={b.hover ?? "none"} onChange={(v) => patch({ hover: v })} options={EFECTE_IMAGINE.map((e) => ({ value: e.cheie, label: e.nume }))} />
            <Select label="Sub fiecare poză" value={mode} onChange={(v) => patch({ captionMode: v })} options={[{ value: "none", label: "Nimic" }, { value: "title", label: "Doar titlu" }, { value: "desc", label: "Doar descriere" }, { value: "both", label: "Titlu + descriere" }]} />
          </Grup>
          <ControaleAspect style={b.style} onChange={setStyle} hide={["align"]} />
        </div>
      );
    }
    case "button": {
      const b = block as ButtonBlock;
      return (
        <div className="space-y-4">
          <Text label="Text buton" value={b.label} onChange={(v) => patch({ label: v })} />
          <CampLink eticheta="Link" valoare={b.href} onChange={(v) => patch({ href: v })} />
          <Toggle label="Deschide în tab nou" checked={!!b.newTab} onChange={(v) => patch({ newTab: v })} />
          <Grup titlu="Stil" deschisImplicit>
            <Select label="Stil" value={b.variant ?? "solid"} onChange={(v) => patch({ variant: v })} options={[{ value: "solid", label: "Plin" }, { value: "outline", label: "Contur" }, { value: "soft", label: "Subtil" }, { value: "ghost", label: "Transparent" }]} />
            <CampCuloare eticheta="Culoare buton" valoare={b.color} onChange={(v) => patch({ color: v })} poateFiGol />
            <CampCuloare eticheta="Culoare text" valoare={b.textColor} onChange={(v) => patch({ textColor: v })} poateFiGol />
            <Segmentat label="Mărime" value={b.size ?? "md"} onChange={(v) => patch({ size: v })} options={[{ value: "sm", label: "Mic" }, { value: "md", label: "Mediu" }, { value: "lg", label: "Mare" }]} />
            <Select label="Colțuri" value={b.rounded ?? "lg"} onChange={(v) => patch({ rounded: v })} options={[{ value: "sm", label: "Puțin rotunjite" }, { value: "md", label: "Mediu" }, { value: "lg", label: "Mult" }, { value: "full", label: "Rotund (pastilă)" }]} />
            <IconPicker value={b.icon} onChange={(v) => patch({ icon: v })} poateFiGol />
            {b.icon && <Segmentat label="Pictograma stă" value={b.iconPos ?? "left"} onChange={(v) => patch({ iconPos: v })} options={[{ value: "left", label: "Înainte" }, { value: "right", label: "După text" }]} />}
            <Select label="Efect" value={b.effect ?? "none"} onChange={(v) => patch({ effect: v })} options={EFECTE_BUTON.map((e) => ({ value: e.cheie, label: e.nume }))} />
            <Toggle label="Lățime completă" checked={!!b.fullWidth} onChange={(v) => patch({ fullWidth: v })} />
          </Grup>
          <Grup titlu="Tipografie">
            <AlegeFont label="Font" value={b.font ?? null} onChange={(v) => patch({ font: v })} gol="Fontul magazinului" />
            <Select label="Grosime" value={b.weight ?? "700"} onChange={(v) => patch({ weight: v })} options={GREUTATI} />
            <Toggle label="Text cu majuscule" checked={b.transform === "uppercase"} onChange={(v) => patch({ transform: v ? "uppercase" : "none" })} />
          </Grup>
          <Grup titlu="Al doilea buton">
            <Text label="Text" value={b.secondLabel} onChange={(v) => patch({ secondLabel: v })} placeholder="Lasă gol ca să nu apară" />
            {b.secondLabel && (
              <>
                <CampLink eticheta="Link" valoare={b.secondHref} onChange={(v) => patch({ secondHref: v })} />
                <Select label="Stil" value={b.secondVariant ?? "outline"} onChange={(v) => patch({ secondVariant: v })} options={[{ value: "solid", label: "Plin" }, { value: "outline", label: "Contur" }, { value: "soft", label: "Subtil" }, { value: "ghost", label: "Transparent" }]} />
              </>
            )}
          </Grup>
          <ControaleAspect style={b.style} onChange={setStyle} hide={["width"]} />
        </div>
      );
    }
    case "columns": {
      const b = block as ColumnsBlock;
      const items = b.items ?? [];
      const setItem = (i: number, p: Partial<ColumnItem>) => patch({ items: items.map((it, k) => (k === i ? { ...it, ...p } : it)) });
      const count = b.count ?? 2;
      const flex = isFlexibleColumns(b);
      const currentLayout = COLUMN_LAYOUTS.find(
        (l) => l.count === count && l.perRow === columnsPerRow(b) && (l.template ?? "") === (b.template ?? ""),
      )?.key ?? "";
      const applyLayout = (l: ColumnLayout) => {
        const next = [...items];
        // Grow to the new cell count (keep existing content; never truncate so a
        // cell's blocks survive a smaller layout and reappear if it grows again).
        while (next.length < l.count) next.push(flex ? { blocks: [] } : { heading: "Coloana", html: "<p></p>" });
        patch({ count: l.count, perRow: l.perRow, template: l.template, items: next });
      };
      const convertToFlexible = () => {
        const next: ColumnItem[] = [];
        for (let i = 0; i < count; i++) next.push({ blocks: classicItemToBlocks(items[i] ?? {}) });
        patch({ items: next });
      };
      return (
        <div className="space-y-4">
          <LayoutPicker current={currentLayout} onPick={applyLayout} />
          <Grup titlu="Așezare" deschisImplicit>
            <Select label="Distanța între coloane" value={b.gap ?? "md"} onChange={(v) => patch({ gap: v })} options={[{ value: "none", label: "Fără" }, { value: "sm", label: "Mică" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }, { value: "xl", label: "Foarte mare" }]} />
            <Segmentat label="Aliniere verticală" value={b.verticalAlign ?? "top"} onChange={(v) => patch({ verticalAlign: v })}
              options={[{ value: "top", label: "Sus" }, { value: "center", label: "Centru" }, { value: "bottom", label: "Jos" }, { value: "stretch", label: "Egale" }]} />
            <Segmentat label="Pe telefon" value={String(b.mobileColumns ?? 1) as "1" | "2"} onChange={(v) => patch({ mobileColumns: Number(v) as 1 | 2 })}
              options={[{ value: "1", label: "Una sub alta" }, { value: "2", label: "Câte două" }]} />
            <Toggle label="Pe telefon, ordinea inversă" checked={!!b.reverseMobile} onChange={(v) => patch({ reverseMobile: v })} ajutor="Ex: la „imagine stânga, text dreapta”, pe telefon textul vine primul." />
            <Toggle label="Fiecare coloană ca un card" checked={!!b.cellCard} onChange={(v) => patch({ cellCard: v })} />
            {b.cellCard && <CampCuloare eticheta="Fundalul cardurilor" valoare={b.cellBg} onChange={(v) => patch({ cellBg: v })} poateFiGol />}
            <Toggle label="Contur coloane" checked={!!b.bordered} onChange={(v) => patch({ bordered: v })} />
          </Grup>
          {flex ? (
            <div className="rounded-lg border border-border bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
              Adaugă conținut direct în coloane: apasă <span className="font-semibold text-foreground">+ Adaugă</span> în fiecare coloană, pe pagină. Poți pune text, imagine, buton, formular, produse și orice alt bloc.
            </div>
          ) : (
            <>
              {items.slice(0, count).map((it, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">Coloana {i + 1}</p>
                  <input value={it.heading ?? ""} onChange={(e) => setItem(i, { heading: e.target.value })} placeholder="Titlu" className={inputCls} />
                  <RichTextEditor content={it.html ?? ""} onChange={(html) => setItem(i, { html })} />
                  <CampImagine eticheta="Imagine" valoare={it.image} onChange={(v) => setItem(i, { image: v })} />
                  <input value={it.buttonLabel ?? ""} onChange={(e) => setItem(i, { buttonLabel: e.target.value })} placeholder="Text buton (opțional)" className={inputCls} />
                  {it.buttonLabel && <CampLink eticheta="Link buton" valoare={it.buttonHref} onChange={(v) => setItem(i, { buttonHref: v })} />}
                </div>
              ))}
              <button type="button" onClick={convertToFlexible}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/40 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5">
                <Plus className="h-3.5 w-3.5" /> Folosește coloane flexibile
              </button>
              <p className="text-[11px] text-muted-foreground">Îți păstrează conținutul actual și îți permite să adaugi formulare, produse, butoane și orice alt bloc direct în fiecare coloană.</p>
            </>
          )}
          <ControaleAspect style={b.style} onChange={setStyle} />
        </div>
      );
    }
    case "spacer": {
      const b = block as SpacerBlock;
      return (
        <div className="space-y-4">
          <Select label="Înălțime spațiu" value={b.size ?? "md"} onChange={(v) => patch({ size: v })} options={[{ value: "sm", label: "Mic" }, { value: "md", label: "Mediu" }, { value: "lg", label: "Mare" }, { value: "xl", label: "Foarte mare" }, { value: "custom", label: "Personalizat" }]} />
          {b.size === "custom" && <Range label="Înălțime" value={b.sizeCustom ?? 40} min={4} max={400} onChange={(v) => patch({ sizeCustom: v })} />}
        </div>
      );
    }
    case "divider": {
      const b = block as DividerBlock;
      return (
        <div className="space-y-4">
          <Segmentat label="Stil linie" value={b.lineStyle ?? "solid"} onChange={(v) => patch({ lineStyle: v })} options={[{ value: "solid", label: "Continuă" }, { value: "dashed", label: "Întreruptă" }, { value: "dotted", label: "Punctată" }]} />
          <Range label="Grosime" value={b.thickness ?? 1} min={1} max={12} onChange={(v) => patch({ thickness: v })} />
          <Range label="Lățime" value={b.widthPct ?? 100} min={10} max={100} step={5} unit="%" onChange={(v) => patch({ widthPct: v })} />
          <CampCuloare eticheta="Culoare" valoare={b.color} onChange={(v) => patch({ color: v })} poateFiGol />
          <ControaleAnimatie style={b.style} onChange={setStyle} />
        </div>
      );
    }
    case "video": {
      const b = block as VideoBlock;
      return <VideoSettings block={b} patch={patch} setStyle={setStyle} />;
    }
    case "map": {
      const b = block as MapBlock;
      return <SetariHarta block={b} patch={patch} setStyle={setStyle} />;
    }
    case "faq": {
      const b = block as FaqBlock;
      return <SetariFaq block={b} patch={patch} setStyle={setStyle} />;
    }
    case "trust": {
      const b = block as TrustBlock;
      return <SetariBeneficii block={b} patch={patch} setStyle={setStyle} />;
    }
    case "bundles":
      return <SetariPachete block={block as BundlesBlock} patch={patch} setStyle={setStyle} businessId={businessId} pachete={pachete} />;
    case "newsletter":
      return <SetariNewsletter block={block as NewsletterBlock} patch={patch} setStyle={setStyle} furnizori={integrari.furnizori} />;
    case "payments":
      return <SetariPlatiCurieri block={block as PaymentsBlock} patch={patch} setStyle={setStyle} fel="plati" active={integrari.plati} />;
    case "couriers":
      return <SetariPlatiCurieri block={block as CouriersBlock} patch={patch} setStyle={setStyle} fel="curieri" active={integrari.curieri} />;
    case "products": {
      const b = block as ProductsBlock;
      return (
        <div className="space-y-4">
          <Text label="Titlu secțiune" value={b.title} onChange={(v) => patch({ title: v })} />
          <Select label="Afișează" value={b.mode ?? "featured"} onChange={(v) => patch({ mode: v })} options={[{ value: "featured", label: "Produse populare" }, { value: "all", label: "Toate" }, { value: "category", label: "Dintr-o categorie" }, { value: "selected", label: "Selectate manual" }]} />
          {b.mode === "category" && (
            <Select label="Categorie" value={b.category ?? ""} onChange={(v) => patch({ category: v })} options={[{ value: "", label: "Alege…" }, ...categories.map((c) => ({ value: c, label: c }))]} />
          )}
          {b.mode === "selected" && (
            <Field label="Produse selectate">
              <ProductPicker businessId={businessId} selectedIds={b.productIds ?? []} onChange={(ids) => patch({ productIds: ids })} />
            </Field>
          )}
          <Segmentat label="Coloane" value={String(b.columns ?? 4) as "2" | "3" | "4"} onChange={(v) => patch({ columns: Number(v) as 2 | 3 | 4 })} options={[{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }]} />
          <Segmentat label="Așezare" value={b.layout ?? "grid"} onChange={(v) => patch({ layout: v })} options={[{ value: "grid", label: "Grilă" }, { value: "carousel", label: "Carusel" }]} />
          <Toggle label="Buton „Adaugă în coș” pe produse" checked={!!b.showAddToCart} onChange={(v) => patch({ showAddToCart: v })} />
          <Field label="Număr maxim de produse"><input type="number" min={1} max={24} value={b.limit ?? 8} onChange={(e) => patch({ limit: Math.min(24, Math.max(1, Number(e.target.value) || 1)) })} className={inputCls} /></Field>
          <ControaleAspect style={b.style} onChange={setStyle} hide={["align"]} />
        </div>
      );
    }
    case "social": {
      const b = block as SocialBlock;
      return (
        <div className="space-y-4">
          <Text label="Titlu" value={b.title} onChange={(v) => patch({ title: v })} />
          <p className="text-xs text-muted-foreground">Linkurile rețelelor se preiau din setările magazinului.</p>
          <ControaleAspect style={b.style} onChange={setStyle} hide={["width"]} />
        </div>
      );
    }
    case "contact": {
      const b = block as ContactBlock;
      const usingForm = !!b.formId && forms.some((f) => f.id === b.formId);
      return (
        <div className="space-y-4">
          <Text label="Titlu (deasupra formularului)" value={b.title} onChange={(v) => patch({ title: v })} />
          <Text label="Subtitlu (opțional)" value={b.subtitle} onChange={(v) => patch({ subtitle: v })} />
          <Select label="Formular" value={b.formId ?? ""} onChange={(v) => patch({ formId: v || null })}
            options={[{ value: "", label: "Contact simplu (implicit)" }, ...forms.map((f) => ({ value: f.id, label: f.name }))]} />
          {usingForm ? (
            <div className="rounded-lg border border-border bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
              Câmpurile, mesajul de confirmare și trimiterea pe email pentru acest formular se configurează în{" "}
              <Link href="/dashboard/pages/forms" target="_blank" rel="noopener noreferrer" className="font-medium text-primary">secțiunea Formulare</Link>.
            </div>
          ) : (
            <>
              <Text label="Text buton" value={b.buttonLabel} onChange={(v) => patch({ buttonLabel: v })} />
              <Text label="Mesaj de confirmare" value={b.successMessage} onChange={(v) => patch({ successMessage: v })} />
              <Toggle label="Câmp telefon" checked={b.showPhone !== false} onChange={(v) => patch({ showPhone: v })} />
              <Toggle label="Câmp mesaj" checked={b.showMessage !== false} onChange={(v) => patch({ showMessage: v })} />
              <Toggle label="Bifă de acord cu prelucrarea datelor" checked={!!b.consent} onChange={(v) => patch({ consent: v })} />
              {b.consent && <Text label="Textul bifei" value={b.consentText} onChange={(v) => patch({ consentText: v })} placeholder="Sunt de acord cu prelucrarea datelor mele pentru a primi un răspuns." />}
              <div className="border-t border-border pt-3">
                <Toggle label="Trimite-mi completările pe email" checked={!!b.emailEnabled} onChange={(v) => patch({ emailEnabled: v })} />
                <p className="mt-1 text-[11px] text-muted-foreground">Emailul ajunge la adresa magazinului. Completările apar mereu și în „Mesaje”.</p>
              </div>
            </>
          )}
          {forms.length === 0 && (
            <p className="text-[11px] text-muted-foreground">Vrei alte câmpuri? Creează-ți propriile formulare în secțiunea Formulare.</p>
          )}
          <StilFormular block={b} patch={patch} />
          <ControaleAspect style={b.style} onChange={setStyle} />
        </div>
      );
    }
    case "html": {
      const b = block as HtmlBlock;
      const izolat = cereIzolare(b.html, b.js);
      return (
        <div className="space-y-4">
          {/*
            ⚠ Regimul se spune pe fata, dupa aceeasi regula ca randarea
            (`cereIzolare`). Pana acum un cod de widget lipit in HTML era
            curatat tacut, iar omul nu afla de ce nu merge.
          */}
          <div className={`rounded-lg border p-2.5 text-[11px] leading-relaxed ${izolat ? "border-blue-200 bg-blue-50 text-blue-800" : "border-border bg-muted/50 text-muted-foreground"}`}>
            {izolat
              ? <><span className="font-semibold">Rulează izolat.</span> Codul are JavaScript, formulare sau acțiuni, deci merge într-un cadru separat: funcționează, dar nu poate atinge coșul, contul clientului sau restul paginii.</>
              : <><span className="font-semibold">Se pune direct în pagină.</span> Doar HTML și CSS: HTML-ul se curăță de orice cod, iar CSS-ul se aplică numai în interiorul acestui bloc.</>}
          </div>
          <Area label="HTML" value={b.html} onChange={(v) => patch({ html: v })} mono placeholder="<div>...</div>" />
          <Area label="CSS" value={b.css} onChange={(v) => patch({ css: v })} mono placeholder=".clasa { ... }" />
          <Area label="JavaScript" value={b.js} onChange={(v) => patch({ js: v })} mono placeholder="// codul tău" />
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            În editor, codul rulează mereu izolat, ca să nu poată atinge panoul. Pe magazin arată ca în previzualizare.
          </p>
          {/* Comutatorul „Mod raw (admin)" a fost ELIMINAT: randarea nu mai
              injecteaza cod nefiltrat in pagina publica, deci un comutator care
              promitea asta ar induce in eroare. Vezi HtmlBlockView.tsx. */}
          {!isAdmin && (
            <p className="text-[11px] text-muted-foreground">HTML/CSS simplu este curățat automat pentru siguranță.</p>
          )}
          <ControaleAnimatie style={b.style} onChange={setStyle} />
        </div>
      );
    }
    default:
      return <p className="text-xs text-muted-foreground">Acest bloc nu are setări.</p>;
  }
}

function VideoSettings({ block, patch, setStyle }: { block: VideoBlock; patch: (p: Record<string, unknown>) => void; setStyle: (s: BlockStyle) => void }) {
  const [mode, setMode] = useState<"upload" | "url">(block.url && !block.src ? "url" : "upload");
  const tab = (m: "upload" | "url", label: string) => (
    <button type="button" onClick={() => {
      setMode(m);
      if (m === "upload") patch({ url: "" });
      else patch({ src: null, poster: null });
    }} className={`rounded-md py-1.5 text-xs font-medium transition-colors ${mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"}`}>{label}</button>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {tab("upload", "Din Biblioteca Media")}
        {tab("url", "Link YouTube / Vimeo")}
      </div>
      {mode === "upload" ? (
        <>
          <CampImagine fel="video" eticheta="Videoclip" valoare={block.src} onChange={(v) => patch({ src: v })}
            ajutor={`MP4, WebM sau MOV, cel mult ${MAX_VIDEO_MB} MB. Pentru clipuri lungi, folosește un link YouTube sau Vimeo.`} />
          {block.src && <CampImagine eticheta="Imagine de copertă (opțional)" valoare={block.poster} onChange={(v) => patch({ poster: v })} />}
        </>
      ) : (
        <Text label="Link YouTube / Vimeo" value={block.url} onChange={(v) => patch({ url: v })} placeholder="https://youtube.com/watch?v=..." />
      )}
      <Grup titlu="Redare" deschisImplicit>
        <Toggle label="Pornire automată" checked={!!block.autoplay} onChange={(v) => patch({ autoplay: v, muted: v ? true : block.muted })}
          ajutor={block.autoplay ? "Pornirea automată merge doar fără sunet (așa cer browserele)." : undefined} />
        <Toggle label="Redare în buclă" checked={!!block.loop} onChange={(v) => patch({ loop: v })} />
        {!block.autoplay && <Toggle label="Fără sunet" checked={!!block.muted} onChange={(v) => patch({ muted: v })} />}
        <Toggle label="Afișează controalele de redare" checked={block.controls !== false} onChange={(v) => patch({ controls: v })} />
      </Grup>
      <Segmentat label="Raport de aspect" value={block.aspect ?? "16:9"} onChange={(v) => patch({ aspect: v })} options={[{ value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16 (reels)" }, { value: "1:1", label: "1:1" }]} />
      {block.aspect === "9:16" && <p className="-mt-2 text-[11px] text-muted-foreground">Pentru video vertical, micșorează lățimea (ex: 40-60%) ca să nu ocupe tot ecranul.</p>}
      <Range label="Lățime video" value={block.widthPct ?? 100} min={10} max={100} step={5} unit="%" onChange={(v) => patch({ widthPct: v })} />
      <Segmentat label="Aliniere" value={block.align ?? "center"} onChange={(v) => patch({ align: v })} options={[{ value: "left", label: "Stânga" }, { value: "center", label: "Centru" }, { value: "right", label: "Dreapta" }]} />
      <ControaleAspect style={block.style} onChange={setStyle} hide={["align"]} />
    </div>
  );
}
