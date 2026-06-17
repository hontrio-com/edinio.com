"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Inbox, Trash2, MailOpen, Mail } from "lucide-react";
import { deleteSubmission, toggleSubmissionRead } from "@/lib/actions/form.actions";

interface SubField { label: string; value: string }
interface Submission { id: string; createdAt: string; isRead: boolean; fields: SubField[] }

export function MessagesClient({ submissions }: { submissions: Submission[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
    </div>
  );
}
