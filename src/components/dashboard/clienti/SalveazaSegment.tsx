"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { NUME_MAXIM, descrieCriteriile, type CriteriiSegment } from "@/lib/customers/segmente";
import { salveazaSegment } from "@/lib/actions/customer-segments.actions";

/**
 * „Salvează segmentul”, langa filtrele listei.
 *
 * ⚠ SE SALVEAZA DE AICI, DIN LISTA, nu din fila „Segmente”: aici stau filtrele,
 * si aici se vede deja pe cine cad. Un formular in cealalta fila ar fi cerut sa
 * alegi filtrele din nou, pe orb, fara sa vezi niciun client.
 *
 * ⚠ SE ARATA CE SE SALVEAZA, inainte de apasare. Numele il alege omul si peste o
 * luna nu mai spune nimic; randul de sub camp spune exact pe ce cade segmentul.
 */
export function SalveazaSegment({
  businessId,
  criterii,
}: {
  businessId: string;
  criterii: CriteriiSegment;
}) {
  const router = useRouter();
  const [deschis, setDeschis] = useState(false);
  const [nume, setNume] = useState("");
  const [salveaza, startSalvare] = useTransition();

  function trimite(e: React.FormEvent) {
    e.preventDefault();
    startSalvare(async () => {
      let r: Awaited<ReturnType<typeof salveazaSegment>>;
      try {
        r = await salveazaSegment(businessId, nume, criterii);
      } catch (err) {
        /* ⚠ O scriere mica si idempotenta prin numele unic: se poate reincerca. */
        toast.error("Nu am primit răspuns: " + (err as Error).message);
        return;
      }
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(`Segmentul „${r.segment.nume}” a fost salvat.`);
      setNume("");
      setDeschis(false);
      router.refresh();
    });
  }

  if (!deschis) {
    return (
      <button
        type="button"
        onClick={() => setDeschis(true)}
        className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted"
      >
        <BookmarkPlus className="h-3.5 w-3.5" /> Salvează segmentul
      </button>
    );
  }

  return (
    <form onSubmit={trimite} className="flex w-full flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <input
          autoFocus
          value={nume}
          onChange={(e) => setNume(e.target.value)}
          maxLength={NUME_MAXIM}
          placeholder="Numele segmentului"
          aria-label="Numele segmentului"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        />
        <p className="mt-1 truncate text-xs text-muted-foreground">
          Salvează filtrul: {descrieCriteriile(criterii)}
        </p>
      </div>
      <button
        type="submit"
        disabled={salveaza || nume.trim() === ""}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {salveaza && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvează
      </button>
      <button
        type="button"
        onClick={() => { setDeschis(false); setNume(""); }}
        className="rounded-xl px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Renunță
      </button>
    </form>
  );
}
