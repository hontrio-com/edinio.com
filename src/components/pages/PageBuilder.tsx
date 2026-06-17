"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, Monitor, Smartphone, Save, Loader2, Plus, X, Settings2,
  ArrowUp, ArrowDown, Copy, Trash2, Eye,
  Sparkles, Heading, Type, Image as ImageIcon, Images, MousePointerClick,
  Columns3, MoveVertical, Minus, Video, MapPin, MessageCircleQuestion,
  ShieldCheck, Package, Share2, Mail, Code, Square,
} from "lucide-react";
import { BlockRenderer, type BlockRendererCtx } from "./BlockRenderer";
import { BlockSettings } from "./BlockSettings";
import { updatePage } from "@/lib/actions/page.actions";
import {
  createBlock, BLOCK_META, BLOCK_PALETTE_ORDER,
  type Block, type BlockType, type PageSeo,
} from "@/lib/pages/blocks.types";
import type { PageProduct } from "./blocks/ProductsBlock";

const ICONS: Record<string, React.ElementType> = {
  Sparkles, Heading, Type, Image: ImageIcon, Images, MousePointerClick, Columns3,
  MoveVertical, Minus, Video, MapPin, MessageCircleQuestion, ShieldCheck, Package,
  Share2, Mail, Code,
};

interface BuilderBusiness {
  id: string; slug: string; custom_domain: string | null;
  store_name: string | null; business_name: string; logo_url: string | null;
  primary_color: string; phone: string | null; social: Record<string, string>;
}

const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

export function PageBuilder({
  pageId, initialTitle, initialSlug, initialPublished, initialBlocks, initialCss, initialSeo,
  business, products, categories, isAdmin,
}: {
  pageId: string; initialTitle: string; initialSlug: string; initialPublished: boolean;
  initialBlocks: Block[]; initialCss: string; initialSeo: PageSeo;
  business: BuilderBusiness; products: PageProduct[]; categories: string[]; isAdmin: boolean;
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [title, setTitle] = useState(initialTitle);
  const [slug, setSlug] = useState(initialSlug);
  const [published, setPublished] = useState(initialPublished);
  const [css, setCss] = useState(initialCss);
  const [seo, setSeo] = useState<PageSeo>(initialSeo);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [tab, setTab] = useState<"block" | "page">("page");
  const [paletteAt, setPaletteAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [isSaving, startSave] = useTransition();

  const color = business.primary_color ?? "#1AB554";
  const publicBase = business.custom_domain ? `https://${business.custom_domain}` : `https://edinio.com/${business.slug}`;

  const ctx: BlockRendererCtx = {
    color, basePath: "", social: business.social, products,
    businessId: business.id, pageId, preview: true,
  };

  const mark = useCallback(() => setDirty(true), []);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Render through a portal to <body> so the full-screen editor is never trapped
  // inside an ancestor stacking context (which was letting the dashboard topbar /
  // trial banner bleed through behind the canvas).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function selectBlock(id: string | null) {
    setSelectedId(id);
    setTab(id ? "block" : "page");
  }

  function patchBlock(id: string, patch: Partial<Block>) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
    mark();
  }
  function addBlock(type: BlockType, index: number) {
    const nb = createBlock(type);
    setBlocks((bs) => { const next = [...bs]; next.splice(index, 0, nb); return next; });
    setPaletteAt(null);
    selectBlock(nb.id);
    mark();
  }
  function removeBlock(id: string) {
    setBlocks((bs) => bs.filter((b) => b.id !== id));
    if (selectedId === id) selectBlock(null);
    mark();
  }
  function duplicateBlock(id: string) {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      if (i < 0) return bs;
      const copy = { ...bs[i], id: `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` } as Block;
      const next = [...bs]; next.splice(i + 1, 0, copy); return next;
    });
    mark();
  }
  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const next = [...bs]; [next[i], next[j]] = [next[j], next[i]]; return next;
    });
    mark();
  }

  function save() {
    startSave(async () => {
      const res = await updatePage(pageId, { title, slug, blocks, page_css: css, seo, is_published: published });
      if ("error" in res) { toast.error(res.error); return; }
      setSlug(res.slug);
      setDirty(false);
      toast.success("Pagina a fost salvata.");
      router.refresh();
    });
  }

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 lg:left-[var(--sidebar-width)] flex flex-col bg-muted/30 z-[60]">
      {/* Top bar */}
      <div className="h-14 bg-background border-b border-border flex items-center gap-2 px-3 shrink-0">
        <Link href="/dashboard/pages" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input value={title} onChange={(e) => { setTitle(e.target.value); mark(); }}
          className="font-semibold text-sm text-foreground bg-transparent focus:outline-none focus:bg-muted rounded px-2 py-1 min-w-0 flex-1 max-w-[240px]" />

        <div className="hidden sm:flex items-center gap-1 bg-muted rounded-lg p-0.5 ml-auto">
          <button type="button" onClick={() => setDevice("desktop")} className={`w-8 h-7 rounded-md flex items-center justify-center ${device === "desktop" ? "bg-background shadow-sm" : ""}`}><Monitor className="h-4 w-4" /></button>
          <button type="button" onClick={() => setDevice("mobile")} className={`w-8 h-7 rounded-md flex items-center justify-center ${device === "mobile" ? "bg-background shadow-sm" : ""}`}><Smartphone className="h-4 w-4" /></button>
        </div>

        <a href={`${publicBase}/${slug}`} target="_blank" rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm font-medium hover:bg-muted sm:ml-0 ml-auto">
          <Eye className="h-4 w-4" /> Vezi
        </a>

        <label className="flex items-center gap-2 text-xs font-medium text-foreground select-none px-2">
          <input type="checkbox" checked={published} onChange={(e) => { setPublished(e.target.checked); mark(); }} className="w-4 h-4 rounded accent-green-600" />
          Publicat
        </label>

        <button type="button" onClick={save} disabled={isSaving || !dirty}
          className="flex items-center gap-1.5 h-9 px-4 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {dirty ? "Salveaza" : "Salvat"}
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Canvas */}
        <div className="flex-1 overflow-y-auto" onClick={() => selectBlock(null)}>
          <div className={`mx-auto bg-background min-h-full transition-all ${device === "mobile" ? "max-w-[390px] my-4 rounded-2xl border border-border shadow-sm overflow-hidden" : "max-w-full"}`}>
            <InsertButton onClick={(e) => { e.stopPropagation(); setPaletteAt(0); }} />
            {blocks.map((block, i) => (
              <div key={block.id}>
                <div
                  onClick={(e) => { e.stopPropagation(); selectBlock(block.id); }}
                  className={`relative group cursor-pointer ${selectedId === block.id ? "ring-2 ring-primary ring-inset" : "hover:ring-1 hover:ring-primary/40 ring-inset"}`}
                >
                  <div className="pointer-events-none">
                    <BlockRenderer blocks={[block]} ctx={ctx} />
                  </div>
                  {blocks.length === 0 ? null : null}
                  {/* hover toolbar */}
                  <div className={`absolute top-2 right-2 z-10 flex items-center gap-1 bg-background border border-border rounded-lg shadow-sm p-0.5 ${selectedId === block.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
                    <span className="px-2 text-[11px] font-medium text-muted-foreground">{BLOCK_META[block.type]?.label ?? block.type}</span>
                    <ToolBtn title="Sus" onClick={(e) => { e.stopPropagation(); moveBlock(block.id, -1); }} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></ToolBtn>
                    <ToolBtn title="Jos" onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 1); }} disabled={i === blocks.length - 1}><ArrowDown className="h-3.5 w-3.5" /></ToolBtn>
                    <ToolBtn title="Duplica" onClick={(e) => { e.stopPropagation(); duplicateBlock(block.id); }}><Copy className="h-3.5 w-3.5" /></ToolBtn>
                    <ToolBtn title="Setari" onClick={(e) => { e.stopPropagation(); selectBlock(block.id); }}><Settings2 className="h-3.5 w-3.5" /></ToolBtn>
                    <ToolBtn title="Sterge" onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}><Trash2 className="h-3.5 w-3.5 text-red-500" /></ToolBtn>
                  </div>
                </div>
                <InsertButton onClick={(e) => { e.stopPropagation(); setPaletteAt(i + 1); }} />
              </div>
            ))}
            {blocks.length > 0 && (
              <div className="p-5 flex justify-center border-t border-dashed border-border">
                <button type="button" onClick={(e) => { e.stopPropagation(); setPaletteAt(blocks.length); }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                  <Plus className="h-4 w-4" /> Adauga bloc
                </button>
              </div>
            )}
            {blocks.length === 0 && (
              <div className="text-center py-24 px-4">
                <Square className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">Pagina e goala</p>
                <p className="text-xs text-muted-foreground mb-4">Adauga primul bloc ca sa incepi.</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); setPaletteAt(0); }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> Adauga bloc
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="hidden lg:flex w-80 shrink-0 flex-col bg-background border-l border-border">
          <div className="flex items-center border-b border-border shrink-0">
            <button type="button" onClick={() => setTab("page")} className={`flex-1 h-11 text-sm font-medium ${tab === "page" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>Pagina</button>
            <button type="button" onClick={() => selected && setTab("block")} disabled={!selected} className={`flex-1 h-11 text-sm font-medium disabled:opacity-40 ${tab === "block" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>Bloc</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "block" && selected ? (
              <BlockSettings block={selected} onChange={(patch) => patchBlock(selected.id, patch)} categories={categories} products={products} isAdmin={isAdmin} />
            ) : (
              <PageSettings
                title={title} slug={slug} seo={seo} css={css} publicBase={publicBase}
                onTitle={(v) => { setTitle(v); mark(); }} onSlug={(v) => { setSlug(v); mark(); }}
                onSeo={(v) => { setSeo(v); mark(); }} onCss={(v) => { setCss(v); mark(); }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile settings drawer */}
      {selected && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto bg-background border-t border-border rounded-t-2xl shadow-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">{BLOCK_META[selected.type]?.label ?? selected.type}</span>
            <button type="button" onClick={() => selectBlock(null)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
          </div>
          <BlockSettings block={selected} onChange={(patch) => patchBlock(selected.id, patch)} categories={categories} products={products} isAdmin={isAdmin} />
        </div>
      )}

      {/* Block palette */}
      {paletteAt !== null && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setPaletteAt(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-full max-w-lg max-h-[80vh] overflow-y-auto bg-background rounded-2xl border border-border shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">Adauga un bloc</h3>
              <button type="button" onClick={() => setPaletteAt(null)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {BLOCK_PALETTE_ORDER.map((type) => {
                const meta = BLOCK_META[type];
                const Icon = ICONS[meta.icon] ?? Square;
                return (
                  <button key={type} type="button" onClick={() => addBlock(type, paletteAt)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors">
                    <Icon className="h-5 w-5 text-foreground" />
                    <span className="text-xs font-medium text-foreground text-center">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

function ToolBtn({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void; title: string; disabled?: boolean }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors">
      {children}
    </button>
  );
}

function InsertButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <div className="relative h-0 group/insert">
      <button type="button" onClick={onClick}
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shadow opacity-0 group-hover/insert:opacity-100 hover:scale-110 transition-all">
        <Plus className="h-4 w-4" />
      </button>
      <div className="h-3" />
    </div>
  );
}

function PageSettings({ title, slug, seo, css, publicBase, onTitle, onSlug, onSeo, onCss }: {
  title: string; slug: string; seo: PageSeo; css: string; publicBase: string;
  onTitle: (v: string) => void; onSlug: (v: string) => void; onSeo: (v: PageSeo) => void; onCss: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-foreground mb-1.5">Titlu pagina</label>
        <input value={title} onChange={(e) => onTitle(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-foreground mb-1.5">Link (slug)</label>
        <input value={slug} onChange={(e) => onSlug(e.target.value)} className={inputCls} />
        <p className="text-[11px] text-muted-foreground mt-1 break-all">{publicBase}/{slug}</p>
      </div>
      <div className="pt-2 border-t border-border">
        <p className="text-xs font-semibold text-foreground mb-2">SEO</p>
        <input value={seo.title ?? ""} onChange={(e) => onSeo({ ...seo, title: e.target.value })} placeholder="Titlu SEO (optional)" className={`${inputCls} mb-2`} />
        <textarea value={seo.description ?? ""} onChange={(e) => onSeo({ ...seo, description: e.target.value })} placeholder="Descriere SEO (optional)" rows={2} className={`${inputCls} resize-none`} />
        <label className="flex items-center gap-2 mt-2 text-xs text-foreground cursor-pointer select-none">
          <input type="checkbox" checked={!!seo.noindex} onChange={(e) => onSeo({ ...seo, noindex: e.target.checked })} className="w-4 h-4 rounded accent-green-600" />
          Ascunde din motoarele de cautare (noindex)
        </label>
      </div>
      <div className="pt-2 border-t border-border">
        <label className="block text-xs font-semibold text-foreground mb-1.5">CSS personalizat (pagina)</label>
        <textarea value={css} onChange={(e) => onCss(e.target.value)} placeholder=".clasa { color: red; }" rows={5} className={`${inputCls} font-mono text-xs resize-none`} />
        <p className="text-[11px] text-muted-foreground mt-1">Se aplica doar pe aceasta pagina.</p>
      </div>
    </div>
  );
}
