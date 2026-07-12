"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Undo2, Trash2, MailOpen, Mail, User, Phone, Mail as MailIcon } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { updateReturnStatus, toggleReturnRead, deleteReturnRequest } from "@/lib/actions/return.actions";

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

const STATUS_META: Record<string, { label: string; cls: string }> = {
  nou:       { label: "Nou",       cls: "bg-amber-50 text-amber-700 border-amber-200" },
  aprobat:   { label: "Aprobat",   cls: "bg-blue-50 text-blue-700 border-blue-200" },
  respins:   { label: "Respins",   cls: "bg-red-50 text-red-700 border-red-200" },
  rambursat: { label: "Rambursat", cls: "bg-green-50 text-green-700 border-green-200" },
};
const STATUS_ORDER = ["nou", "aprobat", "respins", "rambursat"];
const REFUND_LABELS: Record<string, string> = {
  iban: "Transfer bancar (IBAN)",
  original: "Aceeasi metoda de plata",
  card: "Pe card",
};

export function ReturnsClient({ returns }: { returns: ReturnRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function changeStatus(r: ReturnRow, status: string) {
    startTransition(async () => {
      const res = await updateReturnStatus(r.id, status);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Status actualizat.");
      router.refresh();
    });
  }

  function toggleRead(r: ReturnRow) {
    startTransition(async () => {
      const res = await toggleReturnRead(r.id, !r.isRead);
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  function handleDelete(r: ReturnRow) {
    if (!confirm("Stergi aceasta cerere de retur definitiv?")) return;
    startTransition(async () => {
      const res = await deleteReturnRequest(r.id);
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

      {returns.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <Undo2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nicio cerere de retur inca</p>
          <p className="text-xs text-muted-foreground">Cererile de retragere din contract vor aparea aici.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {returns.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.nou;
            return (
              <div key={r.id} className={`p-4 border rounded-xl ${r.isRead ? "bg-surface border-border" : "bg-primary/[0.03] border-primary/30"}`}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {!r.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                    <span className="text-sm font-semibold text-foreground truncate">Comanda {r.orderNumber}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
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
        </div>
      )}
    </div>
  );
}
