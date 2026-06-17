"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Pencil, Copy, Trash2, X, Loader2, ClipboardList, Mail, ArrowLeft } from "lucide-react";
import { createForm, deleteForm, duplicateForm } from "@/lib/actions/form.actions";

interface FormRow { id: string; name: string; fieldCount: number; emailEnabled: boolean }

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

export function FormsListClient({ businessId, forms }: { businessId: string; forms: FormRow[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (name.trim().length < 2) { toast.error("Numele formularului e prea scurt."); return; }
    startTransition(async () => {
      const res = await createForm(businessId, name.trim());
      if ("error" in res) { toast.error(res.error); return; }
      router.push(`/dashboard/pages/forms/${res.formId}`);
    });
  }

  function handleDelete(f: FormRow) {
    if (!confirm(`Stergi formularul "${f.name}"? Paginile care il folosesc vor reveni la contactul simplu.`)) return;
    startTransition(async () => {
      const res = await deleteForm(f.id);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Formular sters.");
      router.refresh();
    });
  }

  function handleDuplicate(f: FormRow) {
    startTransition(async () => {
      const res = await duplicateForm(f.id);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Formular duplicat.");
      router.refresh();
    });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/pages" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Formulare</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Creeaza formulare cu campurile dorite si foloseste-le in pagini.</p>
        </div>
        <button type="button" onClick={() => { setName(""); setCreateOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shrink-0">
          <Plus className="h-4 w-4" /> Formular nou
        </button>
      </div>

      {forms.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Niciun formular inca</p>
          <p className="text-xs text-muted-foreground">Apasa „Formular nou” pentru a crea primul formular.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {forms.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-3 sm:p-4 bg-surface border border-border rounded-xl">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground truncate">{f.name}</span>
                  {f.emailEnabled && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                      <Mail className="h-3 w-3" /> Email
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{f.fieldCount} {f.fieldCount === 1 ? "camp" : "campuri"}</p>
              </div>
              <button type="button" onClick={() => handleDuplicate(f)} title="Duplica" disabled={isPending}
                className="w-9 h-9 rounded-lg border border-border hidden sm:flex items-center justify-center hover:bg-muted transition-colors shrink-0">
                <Copy className="h-4 w-4 text-muted-foreground" />
              </button>
              <button type="button" onClick={() => handleDelete(f)} title="Sterge" disabled={isPending}
                className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors shrink-0">
                <Trash2 className="h-4 w-4 text-red-500" />
              </button>
              <Link href={`/dashboard/pages/forms/${f.id}`}
                className="flex items-center gap-1.5 px-3 h-9 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shrink-0">
                <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Editeaza</span>
              </Link>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setCreateOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-background rounded-2xl border border-border shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">Formular nou</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Numele formularului</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Cerere oferta" className={inputCls}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Anuleaza</button>
              <button type="button" onClick={handleCreate} disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-60">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Creeaza
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
