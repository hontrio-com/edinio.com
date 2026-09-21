"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Download, Loader2, UserX, X } from "lucide-react";
import { toast } from "sonner";

import type { Customer } from "@/lib/customers";
import { formatPrice } from "@/lib/utils/format";
import {
  csvulClientilor, cumSeSterge, numePropusPentruSegment, numeleFisieruluiDeClienti,
  rezumatSelectiei,
} from "@/lib/customers/selectie";
import { CATI_DEODATA, aAtinsCeva, intrebareaAnonimizariiInMasa, rezumatulAnonimizarii } from "@/lib/customers/anonimizare";
import { NUME_MAXIM } from "@/lib/customers/segmente";
import { anonimizeazaClienti } from "@/lib/actions/customer-manage.actions";
import { salveazaListaDeClienti } from "@/lib/actions/customer-segments.actions";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CE SE POATE FACE CU CLIENȚII BIFAȚI                           (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Trei acțiuni, alese de proprietar: șterge/anonimizează, adaugă într-un
 * segment, descarcă cei bifați.
 *
 * ⚠⚠ BARA SPUNE CE AMESTECI ÎNAINTE SĂ APEȘI. Butonul de ștergere face două
 * lucruri deosebite după cum e omul: un contact fără comenzi se șterge de tot,
 * un cumpărător se anonimizează și rămâne în rapoarte. „Ștergi 12 clienți" ar fi
 * fost fals pentru zece dintre ei.
 *
 * ⚠ SE BIFEAZĂ NUMAI DE PE PAGINA DE ACUM, și scrie asta pe bară. Pagina aduce
 * cincizeci odată; un „bifează tot" care ar pretinde că a luat toți cei 358 ar
 * fi o minciună cu urmări — omul apasă „șterge" și crede că a curățat magazinul.
 */

export function BaraSelectie({
  businessId,
  alesi,
  segment,
  onGata,
  onAnuleaza,
}: {
  businessId: string;
  alesi: Customer[];
  /** Segmentul filtrat acum, doar ca să propună un nume pentru listă. */
  segment: string;
  /** S-a făcut ceva: golește bifele și reîncarcă. */
  onGata: () => void;
  onAnuleaza: () => void;
}) {
  const router = useRouter();
  const [lucreaza, start] = useTransition();
  const [numeLista, setNumeLista] = useState<string | null>(null);

  const r = rezumatSelectiei(alesi);
  const chei = alesi.map((c) => c.key);
  const preaMulti = r.cati > CATI_DEODATA;

  function sterge() {
    if (preaMulti) {
      toast.error(`Maximum ${CATI_DEODATA} de clienți deodată. Ai bifat ${r.cati}.`);
      return;
    }
    if (!window.confirm(intrebareaAnonimizariiInMasa(r.cati))) return;

    start(async () => {
      let res: Awaited<ReturnType<typeof anonimizeazaClienti>>;
      try {
        res = await anonimizeazaClienti(businessId, chei);
      } catch (e) {
        /*
          ⚠ NU se spune „a eșuat". E o tranzacție: ori s-a făcut tot, ori nimic —
          dar dacă legătura a căzut DUPĂ commit, n-avem de unde ști.
        */
        toast.error(
          "N-am primit răspuns până la capăt. Reîncarcă pagina și uită-te la listă "
          + "înainte să reiei: se poate să fi mers. " + (e as Error).message,
          { duration: 14000 },
        );
        onGata();
        return;
      }
      if ("error" in res) { toast.error(res.error, { duration: 12000 }); return; }
      if (!aAtinsCeva(res.urma)) { toast.error(rezumatulAnonimizarii(res.urma)); return; }

      toast.success(rezumatulAnonimizarii(res.urma), { duration: 9000 });
      onGata();
      router.refresh();
    });
  }

  function salveaza(e: React.FormEvent) {
    e.preventDefault();
    const nume = (numeLista ?? "").trim();
    if (!nume) return;

    start(async () => {
      let res: Awaited<ReturnType<typeof salveazaListaDeClienti>>;
      try {
        res = await salveazaListaDeClienti(businessId, nume, chei);
      } catch (err) {
        toast.error("Nu am primit răspuns: " + (err as Error).message);
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(
        `Lista „${res.segment.nume}” are ${res.segment.cati} ${res.segment.cati === 1 ? "client" : "clienți"}. `
        + "Nu se mai schimbă singură.",
        { duration: 9000 },
      );
      setNumeLista(null);
      onGata();
      router.refresh();
    });
  }

  function descarca() {
    /*
      ⚠ SE FACE ÎN BROWSER, fără drum la server: datele sunt deja pe ecran.
      Un drum în plus ar fi însemnat o a doua citire care poate da altceva decât
      ce vede omul, dacă între timp s-a schimbat ceva.
    */
    const fisier = new Blob([csvulClientilor(alesi)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(fisier);
    a.download = numeleFisieruluiDeClienti();
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`${r.cati} ${r.cati === 1 ? "client descărcat" : "clienți descărcați"}.`);
  }

  return (
    <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-semibold text-foreground">
          {r.cati} {r.cati === 1 ? "selectat" : "selectați"}
        </span>

        {r.valoare > 0 && (
          <span className="text-xs text-muted-foreground">{formatPrice(r.valoare)} valoare comenzi</span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={descarca}
            disabled={lucreaza}
            className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Descarcă
          </button>

          <button
            type="button"
            onClick={() => setNumeLista(numePropusPentruSegment(segment, r.cati))}
            disabled={lucreaza}
            className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted disabled:opacity-50"
          >
            <BookmarkPlus className="h-3.5 w-3.5" /> Fă un segment
          </button>

          <button
            type="button"
            onClick={sterge}
            disabled={lucreaza}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-destructive ring-1 ring-destructive/30 transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {lucreaza ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
            Șterge datele
          </button>

          <button
            type="button"
            onClick={onAnuleaza}
            aria-label="Anulează selecția"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/*
        ⚠ CE SE ÎNTÂMPLĂ LA APĂSARE, scris sub butoane, nu doar în confirmare.
        Cele două drumuri se numesc pe nume: contactele dispar, cumpărătorii
        rămân în rapoarte fără datele lor.
      */}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Bifele sunt de pe pagina asta.
        {cumSeSterge(r) && <> La „Șterge datele”: {cumSeSterge(r)}.</>}
        {preaMulti && (
          <span className="text-destructive">
            {" "}Prea mulți pentru ștergere: maximum {CATI_DEODATA} deodată.
          </span>
        )}
      </p>

      {numeLista !== null && (
        <form onSubmit={salveaza} className="mt-3 flex flex-wrap items-center gap-2 border-t border-primary/20 pt-3">
          <input
            autoFocus
            value={numeLista}
            onChange={(e) => setNumeLista(e.target.value)}
            maxLength={NUME_MAXIM}
            placeholder="Numele segmentului"
            aria-label="Numele segmentului"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={lucreaza || numeLista.trim() === ""}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {lucreaza && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvează lista
          </button>
          <button
            type="button"
            onClick={() => setNumeLista(null)}
            className="rounded-xl px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Renunță
          </button>
          {/*
            ⚠⚠ SE SPUNE AICI, ÎNAINTE DE SALVARE, că lista e înghețată. E chiar
            capcana de care se feresc segmentele cu criterii, și singurul moment
            în care omul poate alege altceva.
          */}
          <p className="w-full text-[11px] text-muted-foreground">
            Salvează oamenii bifați acum, nu filtrul. Cine cumpără de mâine înainte nu intră în
            listă, iar cine se dezabonează rămâne. Pentru unul care se ține la zi singur,
            pune un filtru și folosește „Salvează segmentul”.
          </p>
        </form>
      )}
    </div>
  );
}
