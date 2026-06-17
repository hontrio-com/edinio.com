"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Inbox, Pencil, Trash2, X, Loader2, Check, MailOpen, Mail } from "lucide-react";
import { updateSubmission, deleteSubmission, toggleSubmissionRead } from "@/lib/actions/form.actions";

interface SubField { label: string; value: string }
interface Submission { id: string; createdAt: string; isRead: boolean; fields: SubField[] }

const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

export function MessagesClient({ submissions }: { submissions: Submission[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Submission | null>(null);
  const [draft, setDraft] = useState<SubField[]>([]);
  const [isPending, startTransition] = useTransition();

  function openEdit(s: Submission) {
    setEditing(s);
    setDraft(s.fields.map((f) => ({ ...f })));
  }

  function saveEdit() {
    if (!editing) return;
    startTransition(async () => {
      const res = await updateSubmission(editing.id, draft);
      if ("error" in res) { toast.error(res.error); return; }
      setEditing(null);
      toast.success("Raspuns actualizat.");
      router.refresh();
    });
  }

  function handleDelete(s: Submission) {
    if (!confirm("Stergi acest mesaj definitiv?")) return;
    startTransition(async () => {
      const res = await deleteSubmission(s.id);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Mesaj sters.");
      router.refresh();
    });
  }

  function toggleRead(s: Submission) {
    startTransition(async () => {
      const res = await toggleSubmissionRead(s.id, !s.isRead);
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/pages" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Mesaje</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Completarile trimise prin formularele din paginile tale.</p>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Niciun mesaj inca</p>
          <p className="text-xs text-muted-foreground">Completarile din formulare vor aparea aici.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <div key={s.id} className={`p-4 border rounded-xl ${s.isRead ? "bg-surface border-border" : "bg-primary/[0.03] border-primary/30"}`}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  {!s.isRead && <span className="w-2 h-2 rounded-full bg-primary" />}
                  <p className="text-[11px] text-muted-foreground">{new Date(s.createdAt).toLocaleString("ro-RO")}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => toggleRead(s)} disabled={isPending} title={s.isRead ? "Marcheaza necitit" : "Marcheaza citit"}
                    className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted">
                    {s.isRead ? <Mail className="h-3.5 w-3.5 text-muted-foreground" /> : <MailOpen className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  <button type="button" onClick={() => openEdit(s)} disabled={isPending} title="Editeaza"
                    className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button type="button" onClick={() => handleDelete(s)} disabled={isPending} title="Sterge"
                    className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-red-50 hover:border-red-200">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {s.fields.map((f, i) => (
                  <div key={i} className="grid grid-cols-[110px_1fr] gap-3">
                    <span className="text-xs font-semibold text-muted-foreground">{f.label}</span>
                    <span className="text-sm text-foreground whitespace-pre-wrap break-words">{f.value || "-"}</span>
                  </div>
                ))}
                {s.fields.length === 0 && <p className="text-xs text-muted-foreground">(gol)</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setEditing(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md max-h-[85vh] overflow-y-auto bg-background rounded-2xl border border-border shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">Editeaza raspunsul</h3>
              <button type="button" onClick={() => setEditing(null)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              {draft.map((f, i) => (
                <div key={i}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{f.label}</label>
                  {f.value.length > 60 ? (
                    <textarea value={f.value} rows={3} className={`${inputCls} resize-none`}
                      onChange={(e) => setDraft((d) => d.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
                  ) : (
                    <input value={f.value} className={inputCls}
                      onChange={(e) => setDraft((d) => d.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Anuleaza</button>
              <button type="button" onClick={saveEdit} disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-60">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salveaza
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
