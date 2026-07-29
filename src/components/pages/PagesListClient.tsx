"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus, ExternalLink, Copy, Trash2, Pencil, ArrowUp, ArrowDown, X, Loader2,
  FileText, Menu as MenuIcon, Link2, Store, Home, } from "lucide-react";
import { slugify } from "@/lib/utils/slugify";
import { createPage, deletePage, duplicatePage, updateStoreMenu } from "@/lib/actions/page.actions";
import { meniuCuAcasa, newMenuItemId, type MenuItem } from "@/lib/pages/menu";
import { SEGMENT_MAGAZIN } from "@/lib/pages/reserved-slugs";

interface PageRow { id: string; slug: string; title: string; is_published: boolean; updated_at: string }
interface Business { id: string; slug: string; custom_domain: string | null; store_name: string | null; business_name: string }

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

function publicBase(b: Business): string {
  return b.custom_domain ? `https://${b.custom_domain}` : `https://edinio.com/${b.slug}`;
}

/** Adresa unei pagini de sistem. Slug gol = prima pagina, si atunci fara slash final. */
function adresa(b: Business, slug: string): string {
  return slug ? `${publicBase(b)}/${slug}` : publicBase(b);
}

export function PagesListClient({ business, pages, initialMenu, faraAcasaInitial, catalogPePagina, cosPePagina, comandaPePagina }: {
  business: Business;
  pages: PageRow[];
  initialMenu: MenuItem[];
  /** Comerciantul a scos intrarea implicita „Acasa"; vezi `meniuCuAcasa`. */
  faraAcasaInitial: boolean;
  /** Magazinul si-a ales cosul, respectiv finalizarea comenzii, ca pagini proprii. */
  catalogPePagina: boolean;
  cosPePagina: boolean;
  comandaPePagina: boolean;
}) {
  const router = useRouter();
  const [menuSalvat, setMenu] = useState<MenuItem[]>(initialMenu);
  const [faraAcasa, setFaraAcasa] = useState(faraAcasaInitial);
  /*
   * Lista pe care o vede comerciantul e cea pe care o vede si clientul.
   *
   * „Acasa" e implicita, deci nu se afla in datele salvate pana cand cineva
   * atinge meniul. Editorul lucreaza pe lista COMPLETA si salveaza tot ce e in
   * ea, asa ca intrarea se materializeaza singura la prima modificare; pana
   * atunci nu ocupa niciun rand in baza.
   */
  const menu = meniuCuAcasa(menuSalvat, faraAcasa);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [isPending, startTransition] = useTransition();

  const isInMenu = (s: string) => menu.some((m) => m.type === "page" && m.target === s);

  function persistMenu(next: MenuItem[], faraAcasaNou = faraAcasa) {
    setMenu(next);
    setFaraAcasa(faraAcasaNou);
    startTransition(async () => {
      const res = await updateStoreMenu(business.id, next, faraAcasaNou);
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
  function removeMenu(i: number) {
    // Stearsa, „Acasa" ramane stearsa: fara steag, `meniuCuAcasa` ar fi pus-o la
    // loc la urmatoarea incarcare si butonul de stergere n-ar fi facut nimic.
    const scoasa = menu[i]?.type === "acasa";
    persistMenu(menu.filter((_, k) => k !== i), scoasa ? true : faraAcasa);
  }
  function addAcasa() {
    persistMenu([{ id: newMenuItemId(), type: "acasa", label: "Acasa" }, ...menu], false);
  }
  /*
   * Intrarea „Magazin" duce la produse, oriunde ar sta ele.
   *
   * Tipul ramane `home`, dar adresa lui se rezolva la randare prin
   * `menuItemHref`: prima pagina cat timp acolo e catalogul, pagina de Magazin
   * de indata ce magazinul si-a activat-o. Un al doilea tip de intrare, doar
   * pentru catalog, ar fi lasat comerciantii care apucasera sa adauge „Magazin"
   * cu un link catre prima pagina si fara niciun semn ca acum exista altul mai
   * bun.
   */
  function addHome() {
    if (areLinkCatreMagazin) return;
    persistMenu([{ id: newMenuItemId(), type: "home", label: "Magazin" }, ...menu]);
  }
  // Si intrarea veche de tip `page` catre `/magazin`, adaugata cat timp catalogul
  // avea buton propriu: duce in acelasi loc, deci butonul nu trebuie sa ofere
  // inca unul peste ea.
  const areLinkCatreMagazin = menu.some(
    (m) => m.type === "home" || (m.type === "page" && m.target === SEGMENT_MAGAZIN),
  );
  function addLink() {
    persistMenu([...menu, { id: newMenuItemId(), type: "link", label: "Link nou", target: "https://" }]);
  }
  function editMenuItem(i: number, patch: Partial<MenuItem>) {
    setMenu(menu.map((m, k) => (k === i ? { ...m, ...patch } : m)));
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

      {/* Quick links (reachable on mobile where the sidebar submenu is hidden) */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <Link href="/dashboard/pages/forms" className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors">Formulare</Link>
        <Link href="/dashboard/pages/messages" className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors">Mesaje</Link>
      </div>

      <PaginiDeSistem business={business} catalogPePagina={catalogPePagina} cosPePagina={cosPePagina} comandaPePagina={comandaPePagina} />

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
        <p className="text-xs text-muted-foreground mb-4">Ordinea de aici se vede in header-ul magazinului (inline pe desktop, hamburger pe mobil). „Acasa” vine din start la orice magazin si duce la prima pagina; o poti sterge daca nu o vrei. „Magazin” = link catre produsele magazinului (pagina de Magazin daca e activata, altfel prima pagina); „link” = adresa externa.</p>

        <div className="space-y-2">
          {menu.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button type="button" onClick={() => moveMenu(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => moveMenu(i, 1)} disabled={i === menu.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
              <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                {m.type === "acasa" ? <Home className="h-3.5 w-3.5 text-muted-foreground" /> : m.type === "home" ? <Store className="h-3.5 w-3.5 text-muted-foreground" /> : m.type === "link" ? <Link2 className="h-3.5 w-3.5 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
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
          {!menu.some((m) => m.type === "acasa") && (
            <button type="button" onClick={addAcasa} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors" title="Adauga in meniu un link catre prima pagina a magazinului">
              <Home className="h-3.5 w-3.5" /> Adauga link catre Acasa
            </button>
          )}
          {!areLinkCatreMagazin && (
            <button type="button" onClick={addHome} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors" title={catalogPePagina ? "Adauga in meniu un link catre pagina cu toate produsele" : "Adauga in meniu un link catre pagina principala a magazinului"}>
              <Store className="h-3.5 w-3.5" /> Adauga link catre magazin
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

/**
 * Paginile de sistem: prima pagina, catalogul, cosul si finalizarea comenzii.
 *
 * Nu sunt randuri in tabelul de pagini si nu se pot sterge, duplica sau
 * redenumi — sunt pasi ai cumpararii, nu continut. Apar totusi aici pentru ca
 * asta cauta comerciantul cand se intreaba „unde e pagina mea de cos": in
 * Pagini, nu intr-un catalog de design-uri.
 *
 * Cat timp magazinul le are ca panouri (sertar si fereastra), randurile spun
 * raspicat ca paginile nu exista si trimit acolo unde se schimba.
 */
function PaginiDeSistem({
  business,
  catalogPePagina,
  cosPePagina,
  comandaPePagina,
}: {
  business: Business;
  catalogPePagina: boolean;
  cosPePagina: boolean;
  comandaPePagina: boolean;
}) {
  const randuri = [
    {
      /*
       * Prima pagina e singura care exista la orice magazin, mereu.
       *
       * N-are ce sa o stinga si nu are alternativa de tip panou, deci nu are nici
       * insigna de „inactiv". Apare aici din acelasi motiv ca celelalte: e locul
       * unde comerciantul cauta paginile magazinului, iar lipsa ei de aici o
       * facea sa para ceva ce nu se poate atinge.
       */
      titlu: "Acasa",
      slug: "",
      activa: true,
      inactivInsigna: "",
      inactivExplicatie: "",
    },
    {
      titlu: "Magazin",
      slug: "magazin",
      activa: catalogPePagina,
      inactivInsigna: "PE ACASA",
      inactivExplicatie: "Acum produsele stau pe pagina principala, sub celelalte sectiuni.",
    },
    {
      titlu: "Cos",
      slug: "cos",
      activa: cosPePagina,
      inactivInsigna: "IN FEREASTRA",
      inactivExplicatie: "Acum cosul se deschide ca sertar peste magazin.",
    },
    {
      titlu: "Finalizare comanda",
      slug: "checkout",
      activa: comandaPePagina,
      inactivInsigna: "IN FEREASTRA",
      inactivExplicatie: "Acum comanda se completeaza intr-o fereastra peste magazin.",
    },
  ];

  return (
    <div className="mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Pagini de sistem</h2>
      <div className="space-y-2">
        {randuri.map((r) => (
          <div key={r.slug} className="flex items-center gap-3 p-3 sm:p-4 bg-surface border border-border rounded-xl">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground truncate">{r.titlu}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.activa ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {r.activa ? "PAGINA" : r.inactivInsigna}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {r.activa ? adresa(business, r.slug) : r.inactivExplicatie}
              </p>
            </div>

            {r.activa && (
              <a href={adresa(business, r.slug)} target="_blank" rel="noopener noreferrer" title="Vezi pagina"
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <Link href="/dashboard/editor/sectiuni"
              className="shrink-0 px-3 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors">
              Alege designul
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
