"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Inbox, Trash2, MailOpen, Mail } from "lucide-react";
import { deleteSubmission, toggleSubmissionRead } from "@/lib/actions/form.actions";
import { Paginatie } from "@/components/dashboard/Paginatie";

interface SubField { label: string; value: string }
interface Submission {
  id: string; isRead: boolean; fields: SubField[];
  /** Data, scrisa pe server la ora Romaniei. */
  cand: string;
  /** Formularul, pagina sau newsletterul de unde a venit. */
  sursa: string;
}

export function MessagesClient({ submissions, pagina, pagini, rezumat, doarNecitite, necitite }: {
  doarNecitite: boolean;
  necitite: number;
  /** DOAR pagina cerută, gata feliată în bază. Vezi nota din `pages/messages/page.tsx`. */
  submissions: Submission[];
  pagina: number;
  pagini: number;
  /** „1–25 din 412 de mesaje”, socotit pe TOT, nu pe pagina adusă. */
  rezumat: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  /*
   * ⚠ A DOUA TRANZIȚIE, nu cea de deasupra: `isPending` stinge butoanele unui
   * rând cât se scrie în bază. Împărțită cu răsfoirea, o ștergere în curs ar fi
   * stins și bara de pagini.
   */
  const [seRasfoieste, startRasfoire] = useTransition();

  function duLaPagina(p: number) {
    startRasfoire(() => {
      /* Pagina stă în adresă: „înapoi” din browser merge, și o pagină anume se
         poate trimite prin legătură. */
      const q = new URLSearchParams();
      if (doarNecitite) q.set("doar", "necitite");
      if (p > 1) q.set("page", String(p));
      router.push(`/dashboard/pages/messages${q.size ? `?${q}` : ""}`, { scroll: true });
    });
  }

  function handleDelete(s: Submission) {
    if (!confirm("Ștergi acest mesaj definitiv?")) return;
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof deleteSubmission>>;
      try {
        res = await deleteSubmission(s.id);
      } catch {
        /* ⚠ Stergere: nestiuta e doar scrierea la noi. */
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă mesajul s-a șters. Lista se reîncarcă: dacă mai apare, nu s-a șters.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Mesaj șters.");
      router.refresh();
    });
  }

  function toggleRead(s: Submission) {
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof toggleSubmissionRead>>;
      try {
        res = await toggleSubmissionRead(s.id, !s.isRead);
      } catch {
        /* ⚠ Schimba doar semnul de citit. */
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă semnul de citit s-a schimbat. Lista se reîncarcă și arată starea adevărată.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/pages" aria-label="Înapoi la pagini" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Mesaje</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Completările trimise prin formularele din paginile tale.</p>
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-lg bg-muted p-0.5 text-sm" role="tablist" aria-label="Ce mesaje arăți">
        <Link href="/dashboard/pages/messages" role="tab" aria-selected={!doarNecitite}
          className={`rounded-md px-3 py-1.5 font-medium ${doarNecitite ? "text-muted-foreground" : "bg-background shadow-sm text-foreground"}`}>Toate</Link>
        <Link href="/dashboard/pages/messages?doar=necitite" role="tab" aria-selected={doarNecitite}
          className={`rounded-md px-3 py-1.5 font-medium ${doarNecitite ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
          Necitite{necitite > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground tabular-nums">{necitite}</span>}
        </Link>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">{doarNecitite ? "Niciun mesaj necitit" : "Niciun mesaj încă"}</p>
          <p className="text-xs text-muted-foreground">{doarNecitite ? "Le-ai citit pe toate." : "Completările din formulare vor apărea aici."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <div key={s.id} className={`p-4 border rounded-xl ${s.isRead ? "bg-surface border-border" : "bg-primary/[0.03] border-primary/30"}`}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex min-w-0 items-center gap-2">
                  {!s.isRead && <span className="w-2 h-2 shrink-0 rounded-full bg-primary" aria-label="Necitit" />}
                  <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                    {s.cand}<span className="text-muted-foreground/60"> · </span><span className="font-medium text-foreground/70">{s.sursa}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => toggleRead(s)} disabled={isPending} title={s.isRead ? "Marchează necitit" : "Marchează citit"} aria-label={s.isRead ? "Marchează necitit" : "Marchează citit"}
                    className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted">
                    {s.isRead ? <Mail className="h-3.5 w-3.5 text-muted-foreground" /> : <MailOpen className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  <button type="button" onClick={() => handleDelete(s)} disabled={isPending} title="Șterge" aria-label="Șterge mesajul"
                    className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-red-50 hover:border-red-200">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {s.fields.map((f, i) => (
                  <div key={i} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[140px_1fr] sm:gap-3">
                    <span className="text-xs font-semibold text-muted-foreground">{f.label}</span>
                    <span className="text-sm text-foreground whitespace-pre-wrap break-words">{f.value || "-"}</span>
                  </div>
                ))}
                {s.fields.length === 0 && <p className="text-xs text-muted-foreground">(gol)</p>}
              </div>
            </div>
          ))}

          {/* ⚠ Numere, nu două săgeți: vezi nota din `Paginatie`. Sub două pagini
              se ascunde singură, deci cutia cu șapte mesaje rămâne cum era. */}
          <Paginatie
            pagina={pagina}
            pagini={pagini}
            laSchimbare={duLaPagina}
            seIncarca={seRasfoieste}
            rezumat={rezumat}
          />
        </div>
      )}
    </div>
  );
}
