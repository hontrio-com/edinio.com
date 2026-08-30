"use client";

import { useState } from "react";
import type { RolBlog } from "@/lib/admin-guard";
import type { PaginaArticole } from "@/lib/actions/blog.actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Newspaper, Plus, Pencil, Trash2, Star, Clock, ExternalLink, Pin, Search } from "lucide-react";
import { asteaptaCeasul, seVede, STARI, type StareArticol } from "@/lib/blog/types";
import { stergeArticol, type ArticolInLista } from "@/lib/actions/blog.actions";
import { BlogSubmeniu } from "./BlogSubmeniu";

/**
 * Culoarea stării. Verde DOAR pentru ce se vede chiar acum pe site.
 *
 * ⚠ „Publicat" cu data în viitor NU e verde. E starea cel mai ușor de citit
 * greșit: omul a apăsat Publică, deci crede că e pe site. Chihlimbarul plus
 * ceasul din dreptul lui spun altceva, fără să fie nevoie să deschidă articolul.
 */
function culoareaStarii(a: ArticolInLista): string {
  if (seVede(a)) return "bg-green-50 text-green-700 border-green-200";
  if (asteaptaCeasul(a)) return "bg-amber-50 text-amber-700 border-amber-200";
  if (a.status === "review") return "bg-blue-50 text-blue-700 border-blue-200";
  if (a.status === "archived") return "bg-zinc-100 text-zinc-500 border-zinc-200";
  return "bg-zinc-50 text-zinc-600 border-zinc-200";
}

function dataScurta(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
}

/** Vezi nota din `AdminBlogAuthorsClient`: lista vine din props, nu din stare. */
export function AdminBlogPostsClient({
  rezultat,
  rol,
  cautat,
  stareaAleasa,
}: {
  rezultat: PaginaArticole;
  rol: RolBlog;
  cautat: string;
  stareaAleasa: "toate" | StareArticol;
}) {
  const { articole, total, pagina, pagini } = rezultat;
  const router = useRouter();

  /*
    ⚠ FILTRAREA S-A MUTAT PE SERVER, ȘI NU DIN GUST.

    Nota de aici spunea: „la zeci de articole e cea mai bună purtare… dacă
    vreodată lista trece de câteva sute, filtrarea se mută pe server". Numai că
    lista nu s-ar fi oprit la câteva sute cu un avertisment: PostgREST taie tăcut
    la 1000 de rânduri. Deci pragul n-ar fi fost observat de nimeni — articolele
    vechi ar fi început pur și simplu să lipsească din admin, iar filtrul ar fi
    căutat mai departe, liniștit, într-o listă ciuntită.

    Acum căutarea și starea stau în adresă și se fac în bază. Ce se pierde:
    răspunsul nu mai e instantaneu la fiecare tastă. De aceea caseta trimite la
    Enter, nu la fiecare literă.
  */
  const [cauta, setCauta] = useState(cautat);
  const aratate = articole;

  function cere(schimbari: { q?: string; stare?: string; p?: string }) {
    const u = new URLSearchParams();
    const q = schimbari.q ?? cautat;
    const st = schimbari.stare ?? stareaAleasa;
    if (q.trim()) u.set("q", q.trim());
    if (st && st !== "toate") u.set("stare", st);
    /* Orice schimbare de filtru duce înapoi la prima pagină: pagina 7 dintr-o
       căutare veche e aproape sigur goală în cea nouă. */
    if (schimbari.p) u.set("p", schimbari.p);
    const s = u.toString();
    router.push(s ? `/admin/blog?${s}` : "/admin/blog");
  }

  async function sterge(a: ArticolInLista) {
    const avertisment = seVede(a)
      ? `„${a.title}" este publicat și se vede pe site. Ștergerea lasă un 404 la adresa /blog/${a.slug}. Continui?`
      : `Ștergi „${a.title}"?`;
    if (!window.confirm(avertisment)) return;

    const res = await stergeArticol(a.id);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Articol șters.");
    router.refresh();
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <BlogSubmeniu activ="articole" rol={rol} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-zinc-900" />
          <h1 className="text-xl font-semibold text-zinc-900">Articole</h1>
        </div>
        <Link href="/admin/blog/nou"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800">
          <Plus className="h-4 w-4" /> Articol nou
        </Link>
      </div>

      {(total > 0 || cautat || stareaAleasa !== "toate") && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            {/* ⚠ Trimite la Enter, nu la fiecare literă: căutarea se face acum în
                bază, iar o cerere pe tastă ar însemna zeci pe minut. */}
            <input type="search" value={cauta}
              onChange={(e) => setCauta(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") cere({ q: cauta }); }}
              placeholder="Caută în titlu și în textul articolelor, apoi Enter"
              className="h-9 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none" />
          </div>
          <select value={stareaAleasa} onChange={(e) => cere({ stare: e.target.value })}
            className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none">
            <option value="toate">Toate stările</option>
            {(Object.keys(STARI) as StareArticol[]).map((s) => (
              <option key={s} value={s}>{STARI[s]}</option>
            ))}
          </select>
        </div>
      )}

      {total === 0 && (cautat || stareaAleasa !== "toate") ? (
        <div className="text-center py-16 border border-dashed border-zinc-300 rounded-xl">
          <p className="text-sm text-zinc-600">Niciun articol nu se potrivește.</p>
          <button type="button" onClick={() => cere({ q: "", stare: "toate" })}
            className="mt-2 text-xs font-medium text-zinc-900 underline underline-offset-4">
            Arată-le pe toate
          </button>
        </div>
      ) : articole.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-300 rounded-xl">
          <p className="text-sm text-zinc-600">Niciun articol încă.</p>
          <p className="mt-1 text-xs text-zinc-500 max-w-md mx-auto">
            Pagina /blog există deja și e legată din meniu și din subsol. Până apare
            primul articol, ea arată doar titlul și introducerea.
          </p>
        </div>
      ) : (
        <>
        {aratate.length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
            Niciun articol nu se potrivește filtrului.
          </p>
        )}
        <div className="space-y-2">
          {aratate.map((a) => {
            const programat = asteaptaCeasul(a);
            return (
              <div key={a.id} className="flex items-center gap-3 p-3 bg-white border border-zinc-200 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {a.is_featured && <Star className="h-3.5 w-3.5 shrink-0 text-amber-500 fill-amber-500" aria-label="scos în față" />}
                    {a.is_pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-label="fixat sus" />}
                    <p className="text-sm font-semibold text-zinc-900 truncate">{a.title}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${culoareaStarii(a)}`}>
                      {STARI[a.status as StareArticol]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500 truncate">
                    {[
                      a.categorie,
                      a.autor,
                      a.reading_minutes ? `${a.reading_minutes} min` : null,
                      a.published_at ? dataScurta(a.published_at) : null,
                      /* Citirile se arată doar când sunt: un „0 citiri” lângă un
                         articol publicat azi arată a eșec, când de fapt e devreme. */
                      a.views > 0 ? `${a.views} ${a.views === 1 ? "citire" : "citiri"}` : null,
                    ].filter(Boolean).join(" · ") || "fără categorie, fără autor"}
                  </p>
                  {programat && (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-amber-700">
                      <Clock className="h-3 w-3" />
                      Se publică singur la {dataScurta(a.published_at)}. Până atunci nu se vede.
                    </p>
                  )}
                </div>

                {seVede(a) && (
                  <a href={`/blog/${a.slug}`} target="_blank" rel="noreferrer"
                    className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100" title="Vezi pe site">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <Link href={`/admin/blog/${a.id}`}
                  className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100" title="Editează">
                  <Pencil className="h-4 w-4" />
                </Link>
                <button type="button" onClick={() => sterge(a)}
                  className="p-2 rounded-lg text-zinc-500 hover:bg-red-50 hover:text-red-600" title="Șterge">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
        </>
      )}
      {pagini > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {Array.from({ length: pagini }, (_, k) => k + 1).map((n) => (
            <button key={n} type="button" onClick={() => cere({ p: String(n) })}
              className={`min-w-9 rounded-lg border px-3 py-1.5 text-center text-xs font-medium ${
                n === pagina
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
              }`}>
              {n}
            </button>
          ))}
        </div>
      )}

      {total > 0 && (
        <p className="mt-4 text-center text-xs text-zinc-500">
          {total} {total === 1 ? "articol" : "articole"}
          {cautat ? " pentru: " + cautat : ""}
        </p>
      )}
    </div>
  );
}
