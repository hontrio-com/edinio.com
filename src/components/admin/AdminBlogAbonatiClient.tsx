"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Trash2, Check, Clock, Download, Loader2 } from "lucide-react";
import {
  stergeAbonat,
  exportaAbonati,
  type Abonat,
  type PaginaAbonati,
} from "@/lib/actions/blog-abonati.actions";
import { BlogSubmeniu } from "./BlogSubmeniu";

/**
 * Abonații la noutățile blogului.
 *
 * ⚠ NEONFIRMAȚII NU SUNT ABONAȚI. Se arată, ca să se vadă câți s-au înscris și
 * n-au apăsat legătura, dar nu li se trimite nimic. Un rând fără `confirmed_at`
 * nu e dovada consimțământului nimănui — poate fi adresa cuiva scrisă de altul.
 *
 * ⚠ NUMERELE VIN DE LA SERVER, NU DIN LISTA DE PE ECRAN. Ecranul arăta un total
 * socotit din rândurile pe care le avea în mână, iar acelea erau tăiate la o
 * mie. Deci la al 1001-lea abonat ar fi scris mai departe „1000 de abonați" —
 * cu deplină siguranță, și greșit. La fel exportul: se făcea din ce era în
 * browser, deci fișierul ar fi cuprins tot o mie și n-ar fi spus nimic despre
 * ce lipsește.
 */
export function AdminBlogAbonatiClient({ pagina }: { pagina: PaginaAbonati }) {
  const router = useRouter();
  const { abonati, total, confirmati, pagini } = pagina;
  const neconfirmati = total - confirmati;
  const [seDescarca, incepeDescarcarea] = useTransition();
  const [seSterge, setSeSterge] = useState<string | null>(null);

  async function sterge(a: Abonat) {
    if (!window.confirm(`Ștergi abonatul ${a.email}?`)) return;
    setSeSterge(a.id);
    const res = await stergeAbonat(a.id);
    setSeSterge(null);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Abonat șters.");
    router.refresh();
  }

  function descarca() {
    incepeDescarcarea(async () => {
      /*
        ⚠ FIȘIERUL SE FACE PE SERVER, din toată baza, în felii.

        Înainte se construia aici, din `abonati` — adică din pagina curentă.
        Cine descarcă o listă de abonați n-o mai deschide ca să numere: o dă unei
        unelte de trimis emailuri. Un fișier tăcut incomplet ar fi însemnat că
        jumătate dintre oameni nu mai primesc ce au cerut, fără ca nimeni să afle.
      */
      const res = await exportaAbonati();
      if ("error" in res) { toast.error(res.error); return; }

      const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "abonati-blog-confirmati.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${res.randuri} ${res.randuri === 1 ? "abonat" : "abonați"} în fișier.`);
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <BlogSubmeniu activ="abonati" rol="admin" />

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-zinc-900" />
          <h1 className="text-xl font-semibold text-zinc-900">Abonați</h1>
        </div>
        {confirmati > 0 && (
          <button type="button" onClick={descarca} disabled={seDescarca}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-lg text-zinc-600 hover:bg-zinc-50 disabled:opacity-60">
            {seDescarca ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Descarcă cei confirmați
          </button>
        )}
      </div>
      <p className="mb-6 text-xs text-zinc-500 max-w-2xl">
        {confirmati} {confirmati === 1 ? "abonat confirmat" : "abonați confirmați"}
        {neconfirmati > 0 ? `, ${neconfirmati} încă neconfirmați` : ""}
        . Cei neconfirmați nu primesc nimic: fără apăsarea legăturii din email nu există dovada
        că adresa e a lor.
      </p>

      {total === 0 ? (
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
              <button type="button" onClick={() => sterge(a)} disabled={seSterge === a.id}
                className="p-2 rounded-lg text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" title="Șterge">
                {seSterge === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {pagini > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {Array.from({ length: pagini }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={n === 1 ? "/admin/blog/abonati" : `/admin/blog/abonati?p=${n}`}
              className={`min-w-9 rounded-lg border px-3 py-1.5 text-center text-xs font-medium ${
                n === pagina.pagina
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {n}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
