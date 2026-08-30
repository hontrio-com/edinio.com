"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Trash2, Check, Clock, Download } from "lucide-react";
import { stergeAbonat, type Abonat } from "@/lib/actions/blog-abonati.actions";
import { BlogSubmeniu } from "./BlogSubmeniu";

/**
 * Abonații la noutățile blogului.
 *
 * ⚠ NEONFIRMAȚII NU SUNT ABONAȚI. Se arată, ca să se vadă câți s-au înscris și
 * n-au apăsat legătura, dar nu li se trimite nimic. Un rând fără `confirmed_at`
 * nu e dovada consimțământului nimănui — poate fi adresa cuiva scrisă de altul.
 */
export function AdminBlogAbonatiClient({ abonati }: { abonati: Abonat[] }) {
  const router = useRouter();
  const confirmati = abonati.filter((a) => a.confirmed_at);

  async function sterge(a: Abonat) {
    if (!window.confirm(`Ștergi abonatul ${a.email}?`)) return;
    const res = await stergeAbonat(a.id);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Abonat șters.");
    router.refresh();
  }

  function descarca() {
    /*
      ⚠ DOAR CEI CONFIRMAȚI. Un fișier care i-ar cuprinde și pe ceilalți ar fi
      exact felul în care adrese neconsimțite ajung într-o unealtă de trimis
      emailuri: cine descarcă lista nu mai vede coloana cu starea.
    */
    const randuri = [
      "email,inscris_la,confirmat_la",
      ...confirmati.map((a) => `${a.email},${a.created_at},${a.confirmed_at}`),
    ];
    const url = URL.createObjectURL(new Blob([randuri.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "abonati-blog-confirmati.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <BlogSubmeniu activ="abonati" />

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-zinc-900" />
          <h1 className="text-xl font-semibold text-zinc-900">Abonați</h1>
        </div>
        {confirmati.length > 0 && (
          <button type="button" onClick={descarca}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-lg text-zinc-600 hover:bg-zinc-50">
            <Download className="h-3.5 w-3.5" /> Descarcă cei confirmați
          </button>
        )}
      </div>
      <p className="mb-6 text-xs text-zinc-500 max-w-2xl">
        {confirmati.length} {confirmati.length === 1 ? "abonat confirmat" : "abonați confirmați"}
        {abonati.length - confirmati.length > 0
          ? `, ${abonati.length - confirmati.length} încă neconfirmați`
          : ""}
        . Cei neconfirmați nu primesc nimic: fără apăsarea legăturii din email nu există dovada
        că adresa e a lor.
      </p>

      {abonati.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-300 rounded-xl">
          <p className="text-sm text-zinc-600">Niciun abonat încă.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Caseta de abonare apare pe pagina blogului și sub fiecare articol.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {abonati.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3 bg-white border border-zinc-200 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 truncate">{a.email}</p>
                <p className="text-xs text-zinc-500">
                  Înscris {new Date(a.created_at).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              {a.confirmed_at ? (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[11px] font-medium text-green-700">
                  <Check className="h-3 w-3" /> confirmat
                </span>
              ) : (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  <Clock className="h-3 w-3" /> neconfirmat
                </span>
              )}
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
