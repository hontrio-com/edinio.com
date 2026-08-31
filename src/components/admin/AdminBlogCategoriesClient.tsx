"use client";

import { useState } from "react";
import type { RolBlog } from "@/lib/admin-guard";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderTree, Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { slugDin, type CategorieBlog } from "@/lib/blog/types";
import { SEO_TITLE_MAX, SEO_DESCRIPTION_MAX } from "@/lib/seo";
import {
  creeazaCategorie, actualizeazaCategorie, stergeCategorie, articoleAleCategoriei,
} from "@/lib/actions/blog.actions";
import { BlogSubmeniu } from "./BlogSubmeniu";

const inputCls =
  "w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900/20";

type Editare = {
  id: string | null;
  name: string;
  slug: string;
  slugScrisDeMana: boolean;
  description: string;
  seo_title: string;
  seo_description: string;
  sort_order: number;
};

const GOL: Editare = {
  id: null, name: "", slug: "", slugScrisDeMana: false,
  description: "", seo_title: "", seo_description: "", sort_order: 0,
};

/** Numaratoarea de sub campurile de SEO: verde cat incape, rosu cand nu mai incape. */
function Masura({ text, max }: { text: string; max: number }) {
  const n = text.length;
  return (
    <span className={cnMasura(n, max)}>
      {n}/{max}
    </span>
  );
}

function cnMasura(n: number, max: number) {
  const baza = "text-[11px] tabular-nums ";
  if (n === 0) return baza + "text-zinc-400";
  if (n > max) return baza + "text-red-600 font-semibold";
  if (n > max - 10) return baza + "text-amber-600";
  return baza + "text-zinc-500";
}

/** Vezi nota din `AdminBlogAuthorsClient`: lista vine din props, nu din stare. */
export function AdminBlogCategoriesClient({ categorii, rol }: { categorii: CategorieBlog[]; rol: RolBlog }) {
/**
 * ⚠ ASCUNDEREA NU E PAZĂ. Acțiunile cer `requireAdminApi()`, și acolo se
 * hotărăște cu adevărat. Rândul de mai jos e ca redactorul să nu apese un buton
 * care oricum îl refuză: o unealtă care te lasă să încerci și apoi spune
 * „Neautorizat" te învață că e stricată, nu că n-ai voie.
 */
  const poateSchimba = rol === "admin";

  const router = useRouter();
  const [editare, setEditare] = useState<Editare | null>(null);
  const [salveaza, setSalveaza] = useState(false);

  function incepeEditarea(c: CategorieBlog) {
    setEditare({
      id: c.id,
      name: c.name,
      slug: c.slug,
      slugScrisDeMana: true,
      description: c.description ?? "",
      seo_title: c.seo_title ?? "",
      seo_description: c.seo_description ?? "",
      sort_order: c.sort_order,
    });
  }

  async function salveazaCategoria() {
    if (!editare) return;
    setSalveaza(true);
    const intrare = {
      name: editare.name,
      slug: editare.slug,
      description: editare.description,
      seo_title: editare.seo_title,
      seo_description: editare.seo_description,
      sort_order: editare.sort_order,
    };
    const res = editare.id
      ? await actualizeazaCategorie(editare.id, intrare)
      : await creeazaCategorie(intrare);
    setSalveaza(false);

    if ("error" in res) { toast.error(res.error); return; }
    toast.success(editare.id ? "Categorie actualizată." : "Categorie adăugată.");
    setEditare(null);
    router.refresh();
  }

  async function sterge(c: CategorieBlog) {
  /*
    ⚠ DACĂ NU ȘTIM CÂTE ARTICOLE ATÂRNĂ, NU ÎNTREBĂM — OPRIM.

    Numărătoarea întorcea `count ?? 0`, deci o cădere de o clipă a bazei arăta
    exact ca „nu atârnă nimic": ramura de avertisment se sărea, iar omul primea
    întrebarea blândă „Ștergi rubrica?" în loc de „rămân 30 de articole fără
    rubrica". Confirma, iar ștergerea de după putea foarte bine să reușească.

    O întrebare pusă pe un număr pe care nu-l avem e mai rea decât nicio
    întrebare: dă impresia că omul a cântărit ceva.
  */
    const numar = await articoleAleCategoriei(c.id);
    if (!numar.ok) { toast.error(`${numar.motiv} Reîncarcă pagina și încearcă din nou.`); return; }

    const cate = numar.cate;
    const avertisment = cate > 0
      ? `„${c.name}" are ${cate} ${cate === 1 ? "articol" : "articole"}. ${cate === 1 ? "Articolul rămâne" : "Articolele rămân"} publicat${cate === 1 ? "" : "e"}, dar fără categorie. Continui?`
      : `Ștergi categoria „${c.name}"?`;
    if (!window.confirm(avertisment)) return;

    const res = await stergeCategorie(c.id);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Categorie ștearsă.");
    router.refresh();
  }

  // ── Formularul ──
  if (editare) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-zinc-900">
            {editare.id ? "Editează categoria" : "Categorie nouă"}
          </h1>
          <button type="button" onClick={() => setEditare(null)}
            className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Nume</label>
            <input type="text" value={editare.name}
              onChange={(e) => setEditare({
                ...editare,
                name: e.target.value,
                slug: editare.slugScrisDeMana ? editare.slug : slugDin(e.target.value),
              })}
              placeholder="Curierat și livrare" className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Adresa web</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400 shrink-0">/blog/categorie/</span>
              <input type="text" value={editare.slug}
                onChange={(e) => setEditare({ ...editare, slug: e.target.value, slugScrisDeMana: true })}
                placeholder="curierat-si-livrare" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Descriere</label>
            <textarea value={editare.description} rows={2}
              onChange={(e) => setEditare({ ...editare, description: e.target.value })}
              placeholder="Se arată în capul paginii de categorie."
              className={inputCls + " resize-y"} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Ordine</label>
            <input type="number" value={editare.sort_order}
              onChange={(e) => setEditare({ ...editare, sort_order: Number(e.target.value) || 0 })}
              className={inputCls + " max-w-[120px]"} />
            <p className="mt-1.5 text-xs text-zinc-500">Numărul mai mic stă mai sus în listă.</p>
          </div>

          <div className="pt-4 border-t border-zinc-200">
            <h2 className="text-sm font-semibold text-zinc-900 mb-1">Cum apare în Google</h2>
            <p className="text-xs text-zinc-500 mb-3">
              Lăsate goale, se folosesc numele și descrierea de mai sus.
            </p>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-zinc-700">Titlu</label>
                  <Masura text={editare.seo_title} max={SEO_TITLE_MAX} />
                </div>
                <input type="text" value={editare.seo_title}
                  onChange={(e) => setEditare({ ...editare, seo_title: e.target.value })}
                  className={inputCls} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-zinc-700">Descriere</label>
                  <Masura text={editare.seo_description} max={SEO_DESCRIPTION_MAX} />
                </div>
                <textarea value={editare.seo_description} rows={2}
                  onChange={(e) => setEditare({ ...editare, seo_description: e.target.value })}
                  className={inputCls + " resize-y"} />
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-zinc-200">
            <button type="button" onClick={() => setEditare(null)}
              className="px-4 py-2 text-sm font-medium border border-zinc-300 rounded-lg hover:bg-zinc-50">
              Anulează
            </button>
            <button type="button" onClick={salveazaCategoria} disabled={salveaza}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-50">
              {salveaza && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvează
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Lista ──
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <BlogSubmeniu activ="categorii" rol={rol} />

      {/* ⚠ Se SPUNE de ce lipsesc butoanele. Un ecran din care ele pur si
          simplu lipsesc il face pe om sa creada ca s-a stricat ceva sau ca n-a
          gasit el unde sa apese. */}
      {!poateSchimba && (
        <p className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Rubricile le stabileste un administrator. Tu le poti vedea si alege pentru articolele tale.
        </p>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FolderTree className="h-5 w-5 text-zinc-900" />
          <h1 className="text-xl font-semibold text-zinc-900">Categorii</h1>
        </div>
        {poateSchimba && (
          <button type="button" onClick={() => setEditare({ ...GOL })}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800">
            <Plus className="h-4 w-4" /> Categorie nouă
          </button>
        )}
      </div>

      {categorii.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-300 rounded-xl">
          <p className="text-sm text-zinc-600">Nicio categorie încă.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Categoriile grupează articolele pe subiecte, iar Google le citește ca semn că
            acoperi un domeniu, nu doar articole răzlețe.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {categorii.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 bg-white border border-zinc-200 rounded-xl">
              <span className="w-8 text-xs tabular-nums text-zinc-400">{c.sort_order}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 truncate">{c.name}</p>
                <p className="text-xs text-zinc-500 truncate font-mono">/blog/categorie/{c.slug}</p>
              </div>
              {poateSchimba && (
                <>
                <button type="button" onClick={() => incepeEditarea(c)}
                  className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100" title="Editează">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => sterge(c)}
                  className="p-2 rounded-lg text-zinc-500 hover:bg-red-50 hover:text-red-600" title="Șterge">
                  <Trash2 className="h-4 w-4" />
                </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
