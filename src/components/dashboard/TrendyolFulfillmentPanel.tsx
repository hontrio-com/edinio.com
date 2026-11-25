"use client";

// Fulfillment panel for a Trendyol marketplace order, shown in the order detail in
// place of the courier-AWB panel. Self-contained: loads its own state.
//
// Doua cazuri, dupa curier: la cei platiti de Trendyol, vanzatorul doar avanseaza
// pachetul Picking -> Invoiced si primeste AWB-ul inapoi; la cei platiti de el,
// trebuie sa TRIMITA numarul AWB, altfel coletul ramane blocat in „Picking".

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, Truck, Loader2, CheckCircle2, Ban } from "lucide-react";
import {
  getTrendyolOrderFulfillment, markTrendyolPicking, markTrendyolInvoiced, sendTrendyolTracking,
  anuleazaComandaTrendyol,
} from "@/lib/actions/trendyol.actions";
import type { TrendyolFulfillmentState } from "@/lib/trendyol/fulfillment";
import { MOTIVE_ANULARE_TRENDYOL } from "@/lib/trendyol/types";
import { BUTON_CONTUR, BUTON_MIC, BUTON_PERICOL, BUTON_PLIN, SECTIUNE, TITLU } from "@/components/dashboard/atomi-panou";
import { cn } from "@/lib/utils/cn";

/** Campurile panoului: aceeasi inaltime ca butoanele, cu inel fin. */
const CAMP = "h-9 w-full rounded-lg bg-surface px-2.5 text-sm text-foreground outline-none ring-1 ring-black/10 focus-visible:ring-2 focus-visible:ring-ring max-lg:h-10";
const SHIPPED = ["shipped", "delivered", "atcollectionpoint"];
const TERMINAL = ["cancelled", "unsupplied", "returned"];

function statusLabel(status: string): string {
  const s = (status || "").toLowerCase();
  if (SHIPPED.includes(s)) return "Expediat de Trendyol";
  if (TERMINAL.includes(s)) return "Anulat / retur";
  if (s === "invoiced") return "Facturat, se predă curierului Trendyol";
  if (s === "picking") return "În pregătire (Picking)";
  return "Comandă nouă";
}

export default function TrendyolFulfillmentPanel({ businessId, orderId }: { businessId: string; orderId: string }) {
  const router = useRouter();
  const [state, setState] = useState<TrendyolFulfillmentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [awb, setAwb] = useState("");
  const [curier, setCurier] = useState("");
  const [motivAnulare, setMotivAnulare] = useState("");
  const [aratatAnularea, setAratatAnularea] = useState(false);

  useEffect(() => {
    let active = true;
    getTrendyolOrderFulfillment(businessId, orderId).then((res) => {
      if (!active) return;
      const st = res && "error" in res ? null : res;
      setState(st);
      if (st?.providerCode) setCurier(st.providerCode);
      setLoading(false);
    });
    return () => { active = false; };
  }, [businessId, orderId]);

  function refresh() {
    getTrendyolOrderFulfillment(businessId, orderId).then((res) => {
      if (res && !("error" in res)) setState(res);
    });
    router.refresh();
  }

  function advance(
    fn: () => Promise<{ success: true; status: string; avertisment?: string } | { error: string }>,
    okMsg: string,
  ) {
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof fn>>;
      try {
        res = await fn();
      } catch {
        /* ⚠ `fn` muta starea comenzii LA TRENDYOL. Tipul vine din semnatura lui `advance`.
           Actiunea insasi spune, pe calea cu avertisment, ca o reincercare ar fi respinsa de ei;
           deci aici nu se invita la reapasare, se cere o privire. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca pasul a ajuns la Trendyol. "
          + "Reimprospateaza si uita-te la starea comenzii acolo inainte sa apesi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      // Trendyol a preluat schimbarea, dar comanda din Edinio nu: nu e o eroare
      // (o reincercare ar fi respinsa de Trendyol), dar nici un succes curat.
      if (res.avertisment) toast.warning(res.avertisment);
      else toast.success(okMsg);
      refresh();
    });
  }

  if (loading) {
    return (
      <div className={cn(SECTIUNE, "flex items-center gap-2 p-5 text-sm text-muted-foreground")}>
        <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă starea Trendyol...
      </div>
    );
  }
  if (!state) return null;

  const s = state.status.toLowerCase();
  const shipped = SHIPPED.includes(s);
  const terminal = TERMINAL.includes(s);
  const canPicking = ["created", "awaiting", "unpacked", "verified", ""].includes(s);
  const canInvoiced = s === "picking";
  // AWB-ul propriu se trimite doar pentru curierii pe care ii plateste vanzatorul.
  const curieriProprii = state.curieri.filter((c) => c.platesteVanzatorul);
  const arataAwb = state.poateTrimiteAwb && !terminal && curieriProprii.length > 0;

  const trimiteAwb = () => {
    if (!curier) { toast.error("Alege curierul cu care ai făcut AWB-ul."); return; }
    if (!awb.trim()) { toast.error("Completează numărul AWB."); return; }
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof sendTrendyolTracking>>;
      try {
        res = await sendTrendyolTracking(businessId, orderId, { trackingNumber: awb.trim(), providerCode: curier });
      } catch {
        /* ⚠ AWB-ul pleaca LA TRENDYOL. O a doua trimitere pe aceeasi comanda nu e o simpla
           repetare: numarul poate fi deja inregistrat la ei. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca AWB-ul a ajuns la Trendyol. "
          + "Uita-te la comanda in contul Trendyol inainte sa trimiti din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      if (res.avertisment) toast.warning(res.avertisment);
      else toast.success("AWB trimis către Trendyol.");
      setAwb("");
      refresh();
    });
  };

  return (
    <section className={cn(SECTIUNE, "p-5")}>
      <h2 className={TITLU}>Expediere Trendyol</h2>
      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-surface ring-1 ring-black/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/integrations/trendyol.svg" alt="Trendyol" className="h-6 w-auto max-w-12 object-contain" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{statusLabel(state.status)}</p>
            <p className="text-xs text-muted-foreground">Pachet #{state.shipmentPackageId}</p>
          </div>
        </div>

        {state.cargoTrackingNumber && (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
            <p className="truncate font-mono text-sm font-medium text-foreground">Cargo: {state.cargoTrackingNumber}</p>
          </div>
        )}

        {!shipped && !terminal && (canPicking || canInvoiced) && (
          <div className="space-y-2">
            <button type="button" disabled={pending || !canPicking}
              onClick={() => advance(() => markTrendyolPicking(businessId, orderId), "Pachet marcat „În pregătire” pe Trendyol.")}
              className={cn(BUTON_CONTUR, "w-full")}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              1. Marchează „În pregătire”
            </button>
            <button type="button" disabled={pending || !canInvoiced}
              onClick={() => advance(() => markTrendyolInvoiced(businessId, orderId), "Pachet marcat „Facturat”. Trendyol preia expedierea.")}
              className={cn(BUTON_PLIN, "w-full")}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              2. Marchează „Facturat” (predă curierului)
            </button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Trendyol preia expedierea cu curierul contractat. După predarea coletului, statusul devine automat „Expediat” și primești numărul de tracking.
            </p>
          </div>
        )}

        {arataAwb && (
          <div className="space-y-2 border-t border-border/70 pt-3">
            <p className="text-sm font-medium text-foreground">Trimite AWB-ul tău</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Necesar dacă expediezi cu un curier plătit de tine. Fără numărul AWB, Trendyol nu poate marca coletul ca expediat.
            </p>
            <select value={curier} onChange={(e) => setCurier(e.target.value)}
              className={CAMP}>
              <option value="">Alege curierul</option>
              {curieriProprii.map((c) => (
                <option key={c.code} value={c.code}>{c.name}{c.nota ? ` · ${c.nota}` : ""}</option>
              ))}
            </select>
            <input value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="Număr AWB"
              className={cn(CAMP, "font-mono")} />
            <button type="button" disabled={pending} onClick={trimiteAwb}
              className={cn(BUTON_CONTUR, "w-full")}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Trimite AWB la Trendyol
            </button>
          </div>
        )}

        {/*
          ═══ ⚠ SINGURA CALE DE ANULARE, DE AZI (26.08.2026) ═══

          Pana azi comerciantul anula o comanda Trendyol din selectorul generic de status al
          comenzii. Aia schimba starea DOAR la noi: elibera stocul local, iar la Trendyol
          comanda ramanea activa si pleca la client. La prima recitire, reconcilierea o aducea
          inapoi si revendica marfa — iar daca intre timp se vanduse, stocul intra pe minus.

          Selectorul generic nu mai atinge comenzile Trendyol. Deci butonul asta TREBUIE sa
          existe, si trebuie sa fie aici: e ce ramane omului cand nu poate onora comanda.

          ⚠ Nu se afiseaza dupa expediere: coletul e la curier si ei refuza anularea. Ascuns
          acum, comerciantul afla din ecran, nu dintr-un refuz al lor pe care nu-l poate citi.
        */}
        {!shipped && !terminal && (
          <div className="border-t border-border/70 pt-3">
            {!aratatAnularea ? (
              <button
                type="button" onClick={() => setAratatAnularea(true)} disabled={pending}
                className={cn(BUTON_MIC, "w-full text-muted-foreground")}
              >
                <Ban className="h-3.5 w-3.5" /> Nu pot furniza comanda asta
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Comanda se anulează la Trendyol, iar marfa se întoarce în stocul tău. Nu se
                  poate desface după ce pleacă.
                </p>
                <select
                  value={motivAnulare} onChange={(e) => setMotivAnulare(e.target.value)}
                  className={CAMP}
                >
                  <option value="">Alege motivul</option>
                  {MOTIVE_ANULARE_TRENDYOL.map((m) => (
                    <option key={m.id} value={m.id}>{m.nume}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="button" onClick={() => { setAratatAnularea(false); setMotivAnulare(""); }}
                    disabled={pending}
                    className={cn(BUTON_CONTUR, "flex-1")}
                  >
                    Renunț
                  </button>
                  <button
                    type="button" disabled={pending || !motivAnulare}
                    onClick={() => advance(
                      () => anuleazaComandaTrendyol(businessId, orderId, Number(motivAnulare)),
                      "Comanda a fost anulată la Trendyol, iar marfa s-a întors în stoc.",
                    )}
                    className={cn(BUTON_PERICOL, "flex-1")}
                  >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                    Anulează la Trendyol
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!shipped && !terminal && !canPicking && !canInvoiced && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Pachet facturat. Trendyol preia expedierea cu curierul contractat; statusul devine automat „Expediat” după predare.
          </p>
        )}
      </div>
    </section>
  );
}
