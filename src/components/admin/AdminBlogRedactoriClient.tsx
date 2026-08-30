"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Loader2, Shield, PenLine, X } from "lucide-react";
import { faRedactor, scoateRedactor, type Redactor } from "@/lib/actions/blog-redactori.actions";
import { BlogSubmeniu } from "./BlogSubmeniu";

/**
 * Cine are voie să scrie pe blog.
 *
 * ⚠ ECRANUL ĂSTA E DOAR PENTRU ADMINI, și paza e în acțiuni, nu în afișare. Un
 * redactor care și-ar putea face colegi ar putea la fel de bine să-și facă și un
 * al doilea cont: dreptul care dă puteri nu se împarte de cel care le are deja
 * pe cele mici.
 *
 * ⚠ ADMINII SE VĂD, DAR NU SE POT SCOATE DE AICI. Se arată fiindcă altfel lista
 * ar fi mințit despre cine poate publica. Butonul de scos lipsește fiindcă o
 * apăsare greșită ar fi lăsat platforma fără nimeni care să publice și fără
 * nimeni care să repare — iar acțiunea l-ar fi respins oricum.
 */
export function AdminBlogRedactoriClient({ redactori }: { redactori: Redactor[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [adauga, setAdauga] = useState(false);

  async function adaugaRedactor(e: React.FormEvent) {
    e.preventDefault();
    if (adauga) return;
    setAdauga(true);
    const res = await faRedactor(email);
    setAdauga(false);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Gata, poate scrie pe blog.");
    setEmail("");
    router.refresh();
  }

  async function scoate(r: Redactor) {
    if (!window.confirm(
      `Îi iei lui ${r.full_name || r.email} dreptul de a scrie pe blog?\n\nArticolele lui rămân neatinse.`,
    )) return;
    const res = await scoateRedactor(r.id);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Drept retras.");
    router.refresh();
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <BlogSubmeniu activ="redactori" rol="admin" />

      <div className="mb-2 flex items-center gap-2">
        <PenLine className="h-5 w-5 text-zinc-900" />
        <h1 className="text-xl font-semibold text-zinc-900">Cine scrie pe blog</h1>
      </div>
      <p className="mb-6 max-w-2xl text-xs text-zinc-500">
        Un redactor poate scrie articole și le poate trimite la verificare. Nu poate publica,
        nu poate arhiva și nu se poate atinge de un articol deja publicat. Restul panoului
        (utilizatori, facturi, setări) îi rămâne închis.
      </p>

      <form onSubmit={adaugaRedactor} className="mb-6 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="adresa de email a colegului"
          className="h-10 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none"
        />
        <button
          type="submit"
          disabled={adauga || !email.trim()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {adauga ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Fă-l redactor
        </button>
      </form>

      <div className="space-y-2">
        {redactori.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3">
            <span
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                r.role === "admin" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {r.role === "admin" ? <Shield className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900">
                {r.full_name || "(fără nume)"}
              </p>
              <p className="truncate text-xs text-zinc-500">{r.email}</p>
            </div>
            <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
              {r.role === "admin" ? "administrator" : "redactor"}
            </span>
            {r.role === "editor" && (
              <button
                type="button"
                onClick={() => scoate(r)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                title="Ia-i dreptul"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
