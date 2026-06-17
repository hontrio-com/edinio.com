"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus, ExternalLink, Copy, Trash2, Pencil, ArrowUp, ArrowDown, X, Loader2,
  FileText, Menu as MenuIcon, Link2, Home,
} from "lucide-react";
import { slugify } from "@/lib/utils/slugify";
import { createPage, deletePage, duplicatePage, updateStoreMenu } from "@/lib/actions/page.actions";
import { newMenuItemId, type MenuItem } from "@/lib/pages/menu";

interface PageRow { id: string; slug: string; title: string; is_published: boolean; updated_at: string }
interface Business { id: string; slug: string; custom_domain: string | null; store_name: string | null; business_name: string }

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

function publicBase(b: Business): string {
  return b.custom_domain ? `https://${b.custom_domain}` : `https://edinio.com/${b.slug}`;
}

export function PagesListClient({ business, pages, initialMenu }: {
  business: Business; pages: PageRow[]; initialMenu: MenuItem[];
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<MenuItem[]>(initialMenu);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [isPending, startTransition] = useTransition();

  const isInMenu = (s: string) => menu.some((m) => m.type === "page" && m.target === s);

  function persistMenu(next: MenuItem[]) {
    setMenu(next);
    startTransition(async () => {
      const res = await updateStoreMenu(business.id, next);
      if ("error" in res) toast.error(res.error);
    });
  }

  function toggleInMenu(p: PageRow) {
    const next = isInMenu(p.slug)
      ? menu.filter((m) => !(m.type === "page" && m.target === p.slug))
      : [...menu, { id: newMenuItemId(), type: "page" as const, label: p.title, target: p.slug }];
    persistMenu(next);
  }

  function handleCreate() {
    if (title.trim().length < 2) { toast.error("Titlul paginii e prea scurt."); return; }
    startTransition(async () => {
      const res = await createPage({ businessId: business.id, title: title.trim(), slug: slug.trim() || undefined });
      if ("error" in res) { toast.error(res.error); return; }
      router.push(`/dashboard/pages/${res.pageId}/edit`);
    });
  }

  function handleDelete(p: PageRow) {
    if (!confirm(`Stergi pagina "${p.title}"? Aceasta actiune nu poate fi anulata.`)) return;
    startTransition(async () => {
      const res = await deletePage(p.id);
      if ("error" in res) { toast.error(res.error); return; }
      if (isInMenu(p.slug)) persistMenu(menu.filter((m) => !(m.type === "page" && m.target === p.slug)));
      toast.success("Pagina a fost stearsa.");
      router.refresh();
    });
  }

  function handleDuplicate(p: PageRow) {
    startTransition(async () => {
      const res = await duplicatePage(p.id);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Pagina a fost duplicata.");
      router.refresh();
    });
  }

  /* menu editing */
  function moveMenu(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= menu.length) return;
    const next = [...menu];
    [next[i], next[j]] = [next[j], next[i]];
    persistMenu(next);
  }
  function removeMenu(i: number) { persistMenu(menu.filter((_, k) => k !== i)); }
  function addHome() {
    if (menu.some((m) => m.type === "home")) return;
    persistMenu([{ id: newMenuItemId(), type: "home", label: "Magazin" }, ...menu]);
  }
  function addLink() {
    persistMenu([...menu, { id: newMenuItemId(), type: "link", label: "Link nou", target: "https://" }]);
  }
  function editMenuItem(i: number, patch: Partial<MenuItem>) {
    const next = menu.map((m, k) => (k === i ? { ...m, ...patch } : m));
    setMenu(next);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Pagini</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Creeaza pagini personalizate (Contact, Despre noi, FAQ) cu blocuri.</p>
        </div>
        <button type="button" onClick={() => { setTitle(""); setSlug(""); setCreateOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shrink-0">
          <Plus className="h-4 w-4" /> Pagina noua
        </button>
      </div>

      {/* Pages list */}
      {pages.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nicio pagina inca</p>
          <p className="text-xs text-muted-foreground">Apasa „Pagina noua” pentru a incepe.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3 sm:p-4 bg-surface border border-border rounded-xl">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground truncate">{p.title}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.is_published ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {p.is_published ? "Publicat" : "Ciorna"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{publicBase(business)}/{p.slug}</p>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none shrink-0" title="Afiseaza in meniu">
                <input type="checkbox" checked={isInMenu(p.slug)} onChange={() => toggleInMenu(p)} className="w-4 h-4 rounded accent-green-600" />
                <span className="hidden sm:inline">In meniu</span>
              </label>
              <a href={`${publicBase(business)}/${p.slug}`} target="_blank" rel="noopener noreferrer" title="Vezi pagina"
                className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0">
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
              <button type="button" onClick={() => handleDuplicate(p)} title="Duplica" disabled={isPending}
                className="w-9 h-9 rounded-lg border border-border hidden sm:flex items-center justify-center hover:bg-muted transition-colors shrink-0">
                <Copy className="h-4 w-4 text-muted-foreground" />
              </button>
              <button type="button" onClick={() => handleDelete(p)} title="Sterge" disabled={isPending}
                className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors">
                <Trash2 className="h-4 w-4 text-red-500" />
              </button>
              <Link href={`/dashboard/pages/${p.id}/edit`}
                className="flex items-center gap-1.5 px-3 h-9 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors">
                <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Editeaza</span>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Menu editor */}
      <div className="mt-10 bg-surface border border-border rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <MenuIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Meniu de navigare</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Ordinea de aici se vede in header-ul magazinului (inline pe desktop, hamburger pe mobil). Daca e gol, nu apare niciun meniu.</p>

        <div className="space-y-2">
          {menu.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button type="button" onClick={() => moveMenu(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => moveMenu(i, 1)} disabled={i === menu.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
              <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                {m.type === "home" ? <Home className="h-3.5 w-3.5 text-muted-foreground" /> : m.type === "link" ? <Link2 className="h-3.5 w-3.5 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
              </span>
              <input value={m.label} onChange={(e) => editMenuItem(i, { label: e.target.value })} onBlur={() => persistMenu(menu)}
                className={`${inputCls} flex-1`} placeholder="Eticheta" />
              {m.type === "link" && (
                <input value={m.target ?? ""} onChange={(e) => editMenuItem(i, { target: e.target.value })} onBlur={() => persistMenu(menu)}
                  className={`${inputCls} flex-1`} placeholder="https://..." />
              )}
              {m.type === "page" && <span className="text-xs text-muted-foreground truncate max-w-[120px]">/{m.target}</span>}
              <button type="button" onClick={() => removeMenu(i)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-red-50 hover:border-red-200 shrink-0">
                <X className="h-4 w-4 text-red-500" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4">
          {!menu.some((m) => m.type === "home") && (
            <button type="button" onClick={addHome} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors">
              <Home className="h-3.5 w-3.5" /> Adauga „Magazin”
            </button>
          )}
          <button type="button" onClick={addLink} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors">
            <Link2 className="h-3.5 w-3.5" /> Adauga link
          </button>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Create modal */}
      {createOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setCreateOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-background rounded-2xl border border-border shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">Pagina noua</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Titlu pagina</label>
                <input autoFocus value={title} onChange={(e) => { setTitle(e.target.value); setSlug(slugify(e.target.value)); }} placeholder="Ex: Contact" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Link (slug)</label>
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-muted-foreground text-xs">{publicBase(business)}/</span>
                  <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="contact" className={inputCls} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Anuleaza</button>
              <button type="button" onClick={handleCreate} disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-60">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Creeaza si editeaza
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
