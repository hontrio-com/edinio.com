"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus, Pencil, Copy, Trash2, X, Loader2, ClipboardList, Mail, ArrowLeft,
  FileText, MessageSquare, Tag, CalendarClock, RotateCcw, Smile, Users, Building2, Check,
} from "lucide-react";
import { createForm, deleteForm, duplicateForm } from "@/lib/actions/form.actions";
import { MAX_FORMULARE, SABLOANE_FORMULAR, type SablonFormular } from "@/lib/pages/forms.types";
import { BareZile } from "./StatisticaFormular";
import { useDialogAccesibil } from "@/components/dashboard/useDialogAccesibil";
import { cn } from "@/lib/utils/cn";

interface FormRow {
  id: string; name: string; fieldCount: number; emailEnabled: boolean;
  /* 26.09.2026: statisticile, adunate pe server (`statisticiFormulare`) */
  total: number; ultimele30: number; peZile: number[]; ultima: string | null; pagini: number;
}

const ICONITA_SABLON: Record<SablonFormular, React.ElementType> = {
  gol: FileText, contact: MessageSquare, oferta: Tag, programare: CalendarClock,
  retur: RotateCcw, feedback: Smile, eveniment: Users, b2b: Building2,
};

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

export function FormsListClient({ businessId, forms }: { businessId: string; forms: FormRow[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [sablon, setSablon] = useState<SablonFormular>("contact");
  const [numeAtins, setNumeAtins] = useState(false);
  // Dialog adevarat: Escape il inchide, focusul ramane in el si se intoarce la buton.
  const cutieNou = useDialogAccesibil(createOpen, () => setCreateOpen(false));
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (name.trim().length < 2) { toast.error("Numele formularului e prea scurt."); return; }
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof createForm>>;
      try {
        res = await createForm(businessId, name.trim(), sablon);
      } catch {
        /* ⚠ Se poate sa fi fost creat si totusi sa nu stim. A doua apasare ar face al doilea. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca formularul s-a creat. Lista se reincarca: daca apare acolo, s-a facut. "
          + "Uita-te intai, ca sa nu iasa doua.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      router.push(`/dashboard/pages/forms/${res.formId}`);
    });
  }

  function handleDelete(f: FormRow) {
    if (!confirm(`Stergi formularul "${f.name}"? Paginile care il folosesc vor reveni la contactul simplu.`)) return;
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof deleteForm>>;
      try {
        res = await deleteForm(f.id);
      } catch {
        /* ⚠ Stergere: nestiuta e doar scrierea la noi. */
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă formularul s-a șters. Lista se reîncarcă: dacă mai apare, nu s-a șters.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Formular șters.");
      router.refresh();
    });
  }

  function handleDuplicate(f: FormRow) {
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof duplicateForm>>;
      try {
        res = await duplicateForm(f.id);
      } catch {
        /* ⚠ Se poate sa fi fost duplicat si totusi sa nu stim. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca duplicatul s-a facut. Lista se reincarca: uita-te acolo inainte sa apesi "
          + "din nou, ca sa nu iasa doua copii.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
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
          <p className="text-sm text-muted-foreground mt-0.5">Creează formulare cu câmpurile dorite și folosește-le în pagini.</p>
        </div>
        <button type="button" onClick={() => { setName("Contact"); setSablon("contact"); setNumeAtins(false); setCreateOpen(true); }} disabled={forms.length >= MAX_FORMULARE}
          title={forms.length >= MAX_FORMULARE ? `Cel mult ${MAX_FORMULARE} de formulare` : undefined}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shrink-0">
          <Plus className="h-4 w-4" /> Formular nou
        </button>
      </div>

      {forms.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Niciun formular încă</p>
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  {f.fieldCount} {f.fieldCount === 1 ? "câmp" : "câmpuri"}
                  {" · "}{f.pagini ? `pe ${f.pagini} ${f.pagini === 1 ? "pagină" : "pagini"}` : "nefolosit pe pagini"}
                  {" · "}{f.ultima ? `ultima completare ${f.ultima}` : "nicio completare"}
                </p>
              </div>
              {/* Completarile: in total, in 30 de zile, si barele zilelor. */}
              <div className="hidden w-40 shrink-0 md:block" title={`${f.ultimele30} completări în ultimele 30 de zile`}>
                <div className="mb-1 flex items-baseline justify-between text-[11px] text-muted-foreground">
                  <span><span className="text-sm font-semibold tabular-nums text-foreground">{f.total}</span> total</span>
                  <span className="tabular-nums">{f.ultimele30} în 30 z</span>
                </div>
                <BareZile peZile={f.peZile} inalt={22} />
              </div>
              <button type="button" onClick={() => handleDuplicate(f)} title="Duplică" aria-label="Duplică formularul" disabled={isPending}
                className="w-9 h-9 rounded-lg border border-border hidden sm:flex items-center justify-center hover:bg-muted transition-colors shrink-0">
                <Copy className="h-4 w-4 text-muted-foreground" />
              </button>
              <button type="button" onClick={() => handleDelete(f)} title="Șterge" aria-label="Șterge formularul" disabled={isPending}
                className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors shrink-0">
                <Trash2 className="h-4 w-4 text-red-500" />
              </button>
              <Link href={`/dashboard/pages/forms/${f.id}`}
                className="flex items-center gap-1.5 px-3 h-9 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shrink-0">
                <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Editează</span>
              </Link>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setCreateOpen(false)} />
          <div ref={cutieNou} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Formular nou"
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">Formular nou</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">Pornește de la un șablon; câmpurile se schimbă apoi cum vrei.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} aria-label="Închide" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SABLOANE_FORMULAR.map((t) => {
                  const Icon = ICONITA_SABLON[t.cheie];
                  const ales = sablon === t.cheie;
                  return (
                    <button key={t.cheie} type="button" aria-pressed={ales}
                      onClick={() => { setSablon(t.cheie); if (!numeAtins) setName(t.cheie === "gol" ? "" : t.nume); }}
                      className={cn("relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all",
                        ales ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/20 hover:bg-muted/40")}>
                      {ales && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />}
                      <span className={cn("grid h-8 w-8 place-items-center rounded-lg", ales ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <span>
                        <span className="block text-[13px] font-medium leading-tight text-foreground">{t.nume}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{t.descriere}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">Numele formularului</label>
                <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setNumeAtins(true); }} placeholder="Ex: Cerere ofertă" maxLength={120} className={inputCls}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
                <p className="mt-1 text-[11px] text-muted-foreground">Îl vezi doar tu, în „Mesaje” și în lista de formulare.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-5 py-4">
              <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Renunță</button>
              <button type="button" onClick={handleCreate} disabled={isPending}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Creează
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
