"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Undo2, Trash2, MailOpen, Mail, User, Phone, Mail as MailIcon } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { updateReturnStatus, toggleReturnRead, deleteReturnRequest } from "@/lib/actions/return.actions";
import { EtichetaStare, type TonEticheta } from "@/components/ui/eticheta-stare";
import { Paginatie } from "@/components/dashboard/Paginatie";

interface ReturnItem { product_id: string; name: string; quantity: number; price: number }
interface ReturnRow {
  id: string;
  orderNumber: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  items: ReturnItem[];
  reason: string | null;
  refundMethod: string | null;
  refundIban: string | null;
  status: string;
  isRead: boolean;
  createdAt: string;
}

/*
  ⚠ TONURI, NU CLASE. Pana acum, fiecare ecran isi scria propriile culori de
  eticheta, asa ca aceeasi stare arata altfel de la o pagina la alta, iar patru
  pastile pline de culoare faceau lista sa arate ca un semafor. Cum se deseneaza
  hotaraste `EtichetaStare`, intr-un singur loc.
*/
const STATUS_META: Record<string, { label: string; ton: TonEticheta }> = {
  nou:       { label: "Nou",       ton: "asteptare" },
  aprobat:   { label: "Aprobat",   ton: "info" },
  respins:   { label: "Respins",   ton: "rau" },
  rambursat: { label: "Rambursat", ton: "bun" },
};
const STATUS_ORDER = ["nou", "aprobat", "respins", "rambursat"];
const REFUND_LABELS: Record<string, string> = {
  iban: "Transfer bancar (IBAN)",
  original: "Aceeasi metoda de plata",
  card: "Pe card",
};

/** Cele trei schimbari al caror rezultat il stim dinainte, fara sa intrebam serverul. */
type ActiuneOptimista =
  | { tip: "status"; id: string; status: string }
  | { tip: "citit"; id: string; isRead: boolean }
  | { tip: "sterge"; id: string };

export function ReturnsClient({ returns, pagina, pagini, rezumat }: {
  /** DOAR pagina cerută, gata feliată în bază. Vezi nota din `returns/page.tsx`. */
  returns: ReturnRow[];
  pagina: number;
  pagini: number;
  /** „1–25 din 137 de cereri”, socotit pe TOT, nu pe pagina adusă. */
  rezumat: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  /*
   * ⚠ A DOUA TRANZIȚIE, nu cea de deasupra. `isPending` de sus stinge butoanele
   * unui rând cât se scrie în bază; răsfoirea n-are nicio treabă cu el, iar
   * împărțită, o ștergere în curs ar fi stins și bara de pagini.
   */
  const [seRasfoieste, startRasfoire] = useTransition();

  function duLaPagina(p: number) {
    startRasfoire(() => {
      /* Pagina stă în adresă, ca la Comenzi: „înapoi” din browser merge, și o
         pagină anume se poate trimite prin legătură. */
      router.push(p > 1 ? `/dashboard/returns?page=${p}` : "/dashboard/returns", { scroll: true });
    });
  }

  // Statusul, marcajul citit/necitit si stergerea au rezultat previzibil: se vad
  // pe loc, iar daca serverul refuza React readuce singur starea de la el.
  const [randuri, aplicaOptimist] = useOptimistic(
    returns,
    (stare: ReturnRow[], a: ActiuneOptimista) => {
      if (a.tip === "sterge") return stare.filter((r) => r.id !== a.id);
      return stare.map((r) => {
        if (r.id !== a.id) return r;
        return a.tip === "status" ? { ...r, status: a.status } : { ...r, isRead: a.isRead };
      });
    },
  );

  function changeStatus(r: ReturnRow, status: string) {
    startTransition(async () => {
      aplicaOptimist({ tip: "status", id: r.id, status });
      let res: Awaited<ReturnType<typeof updateReturnStatus>>;
      try {
        res = await updateReturnStatus(r.id, status);
      } catch {
        /* ⚠ Randul s-a schimbat deja pe ecran. `useOptimistic` il duce inapoi cand tranzitia se
           incheie, dar daca serverul apucase sa scrie, atunci el minte in cealalta directie. De
           aceea cerem si starea adevarata de la server. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca statusul cererii s-a schimbat. "
          + "Pagina se reincarca si arata starea adevarata.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Status actualizat.");
      router.refresh();
    });
  }

  function toggleRead(r: ReturnRow) {
    startTransition(async () => {
      aplicaOptimist({ tip: "citit", id: r.id, isRead: !r.isRead });
      let res: Awaited<ReturnType<typeof toggleReturnRead>>;
      try {
        res = await toggleReturnRead(r.id, !r.isRead);
      } catch {
        /* ⚠ Randul s-a schimbat deja pe ecran. `useOptimistic` il duce inapoi cand tranzitia se
           incheie, dar daca serverul apucase sa scrie, atunci el minte in cealalta directie. De
           aceea cerem si starea adevarata de la server. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca semnul de citit s-a schimbat. "
          + "Pagina se reincarca si arata starea adevarata.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  function handleDelete(r: ReturnRow) {
    if (!confirm("Stergi aceasta cerere de retur definitiv?")) return;
    startTransition(async () => {
      aplicaOptimist({ tip: "sterge", id: r.id });
      let res: Awaited<ReturnType<typeof deleteReturnRequest>>;
      try {
        res = await deleteReturnRequest(r.id);
      } catch {
        /* ⚠ Randul s-a schimbat deja pe ecran. `useOptimistic` il duce inapoi cand tranzitia se
           incheie, dar daca serverul apucase sa scrie, atunci el minte in cealalta directie. De
           aceea cerem si starea adevarata de la server. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca cererea de retur s-a sters. "
          + "Pagina se reincarca si arata starea adevarata.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cerere stearsa.");
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Retururi</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cererile de retragere din contract trimise de clienti (OUG 18/2026).</p>
        </div>
      </div>

      {randuri.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <Undo2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nicio cerere de retur inca</p>
          <p className="text-xs text-muted-foreground">Cererile de retragere din contract vor aparea aici.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {randuri.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.nou;
            return (
              <div key={r.id} className={`p-4 border rounded-xl ${r.isRead ? "bg-surface border-border" : "bg-primary/[0.03] border-primary/30"}`}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {!r.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                    <span className="text-sm font-semibold text-foreground truncate">Comanda {r.orderNumber}</span>
                    <EtichetaStare ton={meta.ton} marime="mic">{meta.label}</EtichetaStare>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => toggleRead(r)} disabled={isPending} title={r.isRead ? "Marcheaza necitit" : "Marcheaza citit"}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted">
                      {r.isRead ? <Mail className="h-3.5 w-3.5 text-muted-foreground" /> : <MailOpen className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    <button type="button" onClick={() => handleDelete(r)} disabled={isPending} title="Sterge"
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-red-50 hover:border-red-200">
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground mb-3">{new Date(r.createdAt).toLocaleString("ro-RO")}</p>

                {/* Customer */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-muted-foreground">
                  {r.customerName && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{r.customerName}</span>}
                  {r.customerPhone && <a href={`tel:${r.customerPhone}`} className="inline-flex items-center gap-1 hover:text-foreground"><Phone className="h-3.5 w-3.5" />{r.customerPhone}</a>}
                  {r.customerEmail && <a href={`mailto:${r.customerEmail}`} className="inline-flex items-center gap-1 hover:text-foreground"><MailIcon className="h-3.5 w-3.5" />{r.customerEmail}</a>}
                </div>

                {/* Items */}
                <div className="rounded-lg border border-border divide-y divide-border mb-3">
                  {r.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-foreground">{it.name} <span className="text-muted-foreground">x{it.quantity}</span></span>
                      <span className="text-muted-foreground">{formatPrice(it.price * it.quantity)}</span>
                    </div>
                  ))}
                </div>

                {r.reason && (
                  <p className="text-sm text-foreground mb-3"><span className="text-xs font-semibold text-muted-foreground">Motiv: </span>{r.reason}</p>
                )}
                {(r.refundMethod || r.refundIban) && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Rambursare: <span className="text-foreground">{r.refundMethod ? (REFUND_LABELS[r.refundMethod] ?? r.refundMethod) : "-"}</span>
                    {r.refundIban ? <> · IBAN: <span className="text-foreground font-mono">{r.refundIban}</span></> : null}
                  </p>
                )}

                {/* Status control */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <select value={r.status} onChange={(e) => changeStatus(r, e.target.value)} disabled={isPending}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                    {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                </div>
              </div>
            );
          })}

          {/* ⚠ Numere, nu două săgeți: vezi nota din `Paginatie`. Sub două pagini
              se ascunde singură, deci magazinul cu opt cereri nu vede nimic. */}
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
