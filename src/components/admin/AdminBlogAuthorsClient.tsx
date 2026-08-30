"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PenLine, Plus, Pencil, Trash2, Loader2, Upload, X, Link2 } from "lucide-react";
import { uploadImage } from "@/lib/upload";
import { slugDin, type AutorBlog } from "@/lib/blog/types";
import {
  creeazaAutor, actualizeazaAutor, stergeAutor, articoleAleAutorului,
} from "@/lib/actions/blog.actions";
import { BlogSubmeniu } from "./BlogSubmeniu";

const inputCls =
  "w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900/20";

type Editare = {
  id: string | null;
  name: string;
  slug: string;
  /**
   * Adresa a fost scrisa de mana?
   *
   * ⚠ Cat timp e `false`, adresa se ia dupa nume la fiecare tasta. Din clipa in
   * care omul o atinge, nu se mai atinge de ea nimeni: altfel i-as sterge din
   * spate ce tocmai a scris, la urmatoarea litera din nume.
   */
  slugScrisDeMana: boolean;
  role_title: string;
  bio: string;
  avatar_url: string;
  sameas: string;
};

const GOL: Editare = {
  id: null, name: "", slug: "", slugScrisDeMana: false,
  role_title: "", bio: "", avatar_url: "", sameas: "",
};

/**
 * ⚠ LISTA VINE DIN PROPS, NU DIN `useState`.
 *
 * Cu o copie in stare, `router.refresh()` aduce date noi de la server si
 * componenta le ignora, fiindca `useState(initial)` citeste doar prima valoare.
 * Ecranul ar arata atunci ce era acolo la deschidere, iar omul ar crede ca
 * salvarea n-a mers. Singura stare de aici e formularul deschis.
 */
export function AdminBlogAuthorsClient({ autori }: { autori: AutorBlog[] }) {
  const router = useRouter();
  const [editare, setEditare] = useState<Editare | null>(null);
  const [salveaza, setSalveaza] = useState(false);
  const [incarca, setIncarca] = useState(false);

  function incepeNou() {
    setEditare({ ...GOL });
  }

  function incepeEditarea(a: AutorBlog) {
    setEditare({
      id: a.id,
      name: a.name,
      slug: a.slug,
      slugScrisDeMana: true, // un autor salvat are deja o adresa; nu i-o schimbam de sub picioare
      role_title: a.role_title ?? "",
      bio: a.bio ?? "",
      avatar_url: a.avatar_url ?? "",
      sameas: (a.sameas ?? []).join("\n"),
    });
  }

  function schimbaNumele(name: string) {
    if (!editare) return;
    setEditare({
      ...editare,
      name,
      slug: editare.slugScrisDeMana ? editare.slug : slugDin(name),
    });
  }

  async function incarcaPoza(file: File) {
    if (!editare) return;
    setIncarca(true);
    const res = await uploadImage(file, "gallery", "blog");
    setIncarca(false);
    if ("error" in res) { toast.error(res.error); return; }
    setEditare({ ...editare, avatar_url: res.url });
  }

  async function salveazaAutorul() {
    if (!editare) return;
    setSalveaza(true);
    const intrare = {
      name: editare.name,
      slug: editare.slug,
      role_title: editare.role_title,
      bio: editare.bio,
      avatar_url: editare.avatar_url,
      sameas: editare.sameas.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    const res = editare.id
      ? await actualizeazaAutor(editare.id, intrare)
      : await creeazaAutor(intrare);
    setSalveaza(false);

    if ("error" in res) { toast.error(res.error); return; }
    toast.success(editare.id ? "Autor actualizat." : "Autor adăugat.");
    setEditare(null);
    // `router.refresh()`, nu `window.location.reload()`: reia doar datele de la
    // server, fara sa arunce pagina de la zero.
    router.refresh();
  }

  async function sterge(a: AutorBlog) {
    const cate = await articoleAleAutorului(a.id);
    const avertisment = cate > 0
      ? `${a.name} are ${cate} ${cate === 1 ? "articol" : "articole"}. ${cate === 1 ? "Articolul rămâne" : "Articolele rămân"} publicat${cate === 1 ? "" : "e"}, dar fără autor. Continui?`
      : `Ștergi autorul ${a.name}?`;
    if (!window.confirm(avertisment)) return;

    const res = await stergeAutor(a.id);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Autor șters.");
    router.refresh();
  }

  // ── Formularul ──
  if (editare) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-zinc-900">
            {editare.id ? "Editează autorul" : "Autor nou"}
          </h1>
          <button type="button" onClick={() => setEditare(null)}
            className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Nume</label>
            <input type="text" value={editare.name} onChange={(e) => schimbaNumele(e.target.value)}
              placeholder="Andrei Popescu" className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Adresa web</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400 shrink-0">/blog/autor/</span>
              <input type="text" value={editare.slug}
                onChange={(e) => setEditare({ ...editare, slug: e.target.value, slugScrisDeMana: true })}
                placeholder="andrei-popescu" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Rol</label>
            <input type="text" value={editare.role_title}
              onChange={(e) => setEditare({ ...editare, role_title: e.target.value })}
              placeholder="Specialist eCommerce" className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Descriere</label>
            <textarea value={editare.bio} rows={3}
              onChange={(e) => setEditare({ ...editare, bio: e.target.value })}
              placeholder="Câteva rânduri despre experiența lui."
              className={inputCls + " resize-y"} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Poză</label>
            <div className="flex items-center gap-3">
              {editare.avatar_url ? (
                <Image src={editare.avatar_url} alt="" width={56} height={56}
                  className="h-14 w-14 rounded-full object-cover border border-zinc-200" unoptimized />
              ) : (
                <div className="h-14 w-14 rounded-full bg-zinc-100 border border-zinc-200" />
              )}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-lg text-zinc-600 hover:bg-zinc-50 cursor-pointer">
                {incarca ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Încarcă
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) incarcaPoza(f); }} />
              </label>
              {editare.avatar_url && (
                <button type="button" onClick={() => setEditare({ ...editare, avatar_url: "" })}
                  className="text-xs text-zinc-500 hover:text-red-600">Scoate</button>
              )}
            </div>
          </div>

          {/*
            ═══ ADRESELE PUBLICE NU SUNT UN DETALIU DE PROFIL ═══

            Ele pleaca in `Person.sameAs` din datele structurate, si acolo sunt
            singurul lucru care leaga numele de o persoana reala. Un motor care
            raspunde cu text nu are de unde sti daca „Andrei Popescu" e cineva
            care se pricepe la eCommerce; un profil de LinkedIn ii da de unde.
            De asta stau aici, cu explicatia langa ele, nu ascunse sub „optional".
          */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              <span className="inline-flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Profiluri publice</span>
            </label>
            <textarea value={editare.sameas} rows={3}
              onChange={(e) => setEditare({ ...editare, sameas: e.target.value })}
              placeholder={"https://www.linkedin.com/in/...\nhttps://x.com/..."}
              className={inputCls + " resize-y font-mono text-xs"} />
            <p className="mt-1.5 text-xs text-zinc-500">
              Câte o adresă pe rând. Acestea spun motoarelor de căutare cine e autorul,
              nu doar cum îl cheamă. Rândurile care nu sunt adrese valide se ignoră la salvare.
            </p>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-zinc-200">
            <button type="button" onClick={() => setEditare(null)}
              className="px-4 py-2 text-sm font-medium border border-zinc-300 rounded-lg hover:bg-zinc-50">
              Anulează
            </button>
            <button type="button" onClick={salveazaAutorul} disabled={salveaza}
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
      <BlogSubmeniu activ="autori" />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <PenLine className="h-5 w-5 text-zinc-900" />
          <h1 className="text-xl font-semibold text-zinc-900">Autori</h1>
        </div>
        <button type="button" onClick={incepeNou}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800">
          <Plus className="h-4 w-4" /> Autor nou
        </button>
      </div>

      {autori.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-300 rounded-xl">
          <p className="text-sm text-zinc-600">Niciun autor încă.</p>
          <p className="mt-1 text-xs text-zinc-500">Un articol fără autor nu poate arăta cine îl scrie, nici cititorilor, nici Google.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {autori.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3 bg-white border border-zinc-200 rounded-xl">
              {a.avatar_url ? (
                <Image src={a.avatar_url} alt="" width={40} height={40}
                  className="h-10 w-10 rounded-full object-cover" unoptimized />
              ) : (
                <div className="h-10 w-10 rounded-full bg-zinc-100 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 truncate">{a.name}</p>
                <p className="text-xs text-zinc-500 truncate">
                  {a.role_title || "fără rol"}
                  {a.sameas?.length ? ` · ${a.sameas.length} ${a.sameas.length === 1 ? "profil" : "profiluri"}` : " · fără profiluri publice"}
                </p>
              </div>
              <button type="button" onClick={() => incepeEditarea(a)}
                className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100" title="Editează">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => sterge(a)}
                className="p-2 rounded-lg text-zinc-500 hover:bg-red-50 hover:text-red-600" title="Șterge">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
