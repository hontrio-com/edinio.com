"use client";

import { useState } from "react";

import Link from "next/link";
import type { RolBlog } from "@/lib/admin-guard";
import type { PaginaEtichete } from "@/lib/actions/blog.actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tags, Trash2, ExternalLink } from "lucide-react";
import { stergeEticheta } from "@/lib/actions/blog.actions";
import { BlogSubmeniu } from "./BlogSubmeniu";

export type EticheteRand = { id: string; slug: string; name: string; cate: number };

/**
 * Ecranul de etichete.
 *
 * ⚠ NU SE FAC DE AICI, DOAR SE STERG. Etichetele se nasc scriindu-le în editor,
 * lângă articolul care le trebuie. Un buton „Etichetă nouă" aici ar fi produs
 * etichete fără articole, adică pagini goale care dau 404 — muncă degeaba.
 *
 * Ecranul ăsta există pentru curățenie: să se vadă câte s-au adunat, care au
 * rămas fără articole, și care sunt scrise de două ori altfel.
 */
export function AdminBlogTagsClient({
  rezultat,
  rol,
  cautat,
}: {
  rezultat: PaginaEtichete;
  rol: RolBlog;
  cautat: string;
}) {
  const { etichete, total, pagina, pagini } = rezultat;
  const [cauta, setCauta] = useState(cautat);

  function cere(schimbari: { q?: string; p?: string }) {
    const u = new URLSearchParams();
    const q = schimbari.q ?? cautat;
    if (q.trim()) u.set("q", q.trim());
    if (schimbari.p) u.set("p", schimbari.p);
    const x = u.toString();
    router.push(x ? `/admin/blog/etichete?${x}` : "/admin/blog/etichete");
  }
/**
 * ⚠ ASCUNDEREA NU E PAZĂ. Acțiunile cer `requireAdminApi()`, și acolo se
 * hotărăște cu adevărat. Rândul de mai jos e ca redactorul să nu apese un buton
 * care oricum îl refuză: o unealtă care te lasă să încerci și apoi spune
 * „Neautorizat" te învață că e stricată, nu că n-ai voie.
 */
  const poateSchimba = rol === "admin";

  const router = useRouter();

  async function sterge(e: EticheteRand) {
    const avertisment =
      e.cate > 0
        ? `„${e.name}" e pusă pe ${e.cate} ${e.cate === 1 ? "articol" : "articole"}. Ștergerea o scoate de pe ${e.cate === 1 ? "el" : "ele"} și pagina /blog/eticheta/${e.slug} va da 404. Articolele rămân neatinse. Continui?`
        : `Ștergi eticheta „${e.name}"? Nu e pusă pe niciun articol.`;
    if (!window.confirm(avertisment)) return;

    const res = await stergeEticheta(e.id);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Etichetă ștearsă.");
    router.refresh();
  }

  const orfane = etichete.filter((e) => e.cate === 0).length;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <BlogSubmeniu activ="etichete" rol={rol} />

      {(total > 0 || cautat) && (
        <div className="mb-4">
          {/* Trimite la Enter: căutarea se face în bază. */}
          <input type="search" value={cauta}
            onChange={(e) => setCauta(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") cere({ q: cauta }); }}
            placeholder="Caută o etichetă, apoi Enter"
            className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none" />
        </div>
      )}

      {/* ⚠ Se SPUNE de ce lipsesc butoanele. Un ecran din care ele pur si
          simplu lipsesc il face pe om sa creada ca s-a stricat ceva sau ca n-a
          gasit el unde sa apese. */}
      {!poateSchimba && (
        <p className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Etichetele se nasc singure din ce scrii in articole. Stergerea lor o face un administrator.
        </p>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Tags className="h-5 w-5 text-zinc-900" />
          <h1 className="text-xl font-semibold text-zinc-900">Etichete</h1>
        </div>
        <span className="text-xs text-zinc-500">
          {total} {total === 1 ? "etichetă" : "etichete"}
          {orfane > 0 ? `, ${orfane} fără articole` : ""}
        </span>
      </div>
      <p className="mb-6 text-xs text-zinc-500 max-w-2xl">
        Etichetele se scriu în editor, lângă articol. Aici se văd toate, ca să se poată
        curăța cele scrise de două ori altfel sau rămase fără articole.
      </p>

      {etichete.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-300 rounded-xl">
          <p className="text-sm text-zinc-600">Nicio etichetă încă.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Se fac singure când scrii una în caseta de etichete a unui articol.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {etichete.map((e) => (
            <div key={e.id} className="flex items-center gap-3 p-3 bg-white border border-zinc-200 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 truncate">{e.name}</p>
                <p className="text-xs text-zinc-500 truncate font-mono">/blog/eticheta/{e.slug}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  e.cate === 0
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {e.cate === 0 ? "fără articole" : `${e.cate} ${e.cate === 1 ? "articol" : "articole"}`}
              </span>
              {/* Legătura se arată doar când duce undeva: pagina unei etichete
                  fără articole publicate dă 404 dinadins. */}
              {e.cate > 0 && (
                <Link href={`/blog/eticheta/${e.slug}`} target="_blank"
                  className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100" title="Vezi pe site">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              )}
              {poateSchimba && (
                <button type="button" onClick={() => sterge(e)}
                  className="p-2 rounded-lg text-zinc-500 hover:bg-red-50 hover:text-red-600" title="Șterge">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
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

    </div>
  );
}
