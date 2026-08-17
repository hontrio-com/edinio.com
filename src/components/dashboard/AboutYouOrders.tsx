"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Truck } from "lucide-react";
import {
  getAboutYouOrderDocument, reincearcaExpediereaAboutYou, type RandComandaAboutYou,
} from "@/lib/actions/aboutyou.actions";
import { formatDate } from "@/lib/utils/format";

/*
 * Comenzile About You, in panoul integrarii.
 *
 * Nu erau afisate nicaieri. Statusurile de eșec se scriau intr-o coloana pe care
 * n-o citea nicio pagina, deci o expediere respinsa de About You rămânea nevazuta
 * si fara cale de reluare. Iar facturile lor — About You detine checkout-ul si
 * emite factura catre cumparator — se puteau lua doar din Seller Center.
 */
const ETICHETE: Record<string, { text: string; cls: string }> = {
  open: { text: "Deschisă", cls: "bg-amber-100 text-amber-700" },
  ship_pending: { text: "Expediere în curs", cls: "bg-amber-100 text-amber-700" },
  shipped: { text: "Expediată", cls: "bg-green-100 text-green-700" },
  ship_failed: { text: "Expediere respinsă", cls: "bg-red-100 text-red-700" },
  cancel_pending: { text: "Anulare în curs", cls: "bg-amber-100 text-amber-700" },
  cancelled: { text: "Anulată", cls: "bg-muted text-muted-foreground" },
  cancel_failed: { text: "Anulare respinsă", cls: "bg-red-100 text-red-700" },
  return_pending: { text: "Retur în curs", cls: "bg-amber-100 text-amber-700" },
  returned: { text: "Returnată", cls: "bg-muted text-muted-foreground" },
  return_failed: { text: "Retur respins", cls: "bg-red-100 text-red-700" },
  mixed: { text: "Mixtă", cls: "bg-muted text-muted-foreground" },
};

const DE_RELUAT = new Set(["ship_failed"]);

export function AboutYouOrders({ businessId, comenzi }: { businessId: string; comenzi: RandComandaAboutYou[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [doarProbleme, setDoarProbleme] = useState(false);

  const vizibile = doarProbleme
    ? comenzi.filter((c) => c.status.endsWith("_failed"))
    : comenzi;
  const cuProbleme = comenzi.filter((c) => c.status.endsWith("_failed")).length;

  const descarca = (orderId: string, fel: "invoices" | "delivery-document") => startTransition(async () => {
    const res = await getAboutYouOrderDocument(businessId, orderId, fel);
    if ("error" in res) { toast.error(res.error); return; }
    /*
     * PDF-ul vine base64 (o actiune de server nu poate trece un `ArrayBuffer` peste
     * granita de serializare), deci se reface aici si se descarca fara drum inapoi
     * la server.
     */
    const octeti = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([octeti], { type: res.tip }));
    const a = document.createElement("a");
    a.href = url;
    a.download = res.numeFisier;
    a.click();
    URL.revokeObjectURL(url);
  });

  const reia = (orderId: string) => startTransition(async () => {
    const res = await reincearcaExpediereaAboutYou(businessId, orderId);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Expedierea a fost repusă la coadă.");
    router.refresh();
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-base font-semibold text-foreground">Comenzi About You</h2>
        {cuProbleme > 0 && (
          <button
            onClick={() => setDoarProbleme((v) => !v)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {doarProbleme ? "Arată toate" : `Arată doar problemele (${cuProbleme})`}
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Comenzile intră automat în lista ta de comenzi. Aici vezi starea lor la About You și poți lua
        documentele emise de ei.
      </p>

      {vizibile.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {comenzi.length === 0 ? "Nicio comandă About You încă." : "Nicio comandă cu probleme."}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {vizibile.map((c) => {
            const et = ETICHETE[c.status] ?? { text: c.status, cls: "bg-muted text-muted-foreground" };
            return (
              <div key={c.numarAy} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {c.numarAy}
                    {c.numarEdinio && <span className="text-muted-foreground font-normal"> · {c.numarEdinio}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(c.creata)}
                    {c.tara ? ` · ${c.tara}` : ""}
                    {c.fulfillment === "fulfillment_by_marketplace" ? " · expediată de About You" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${et.cls}`}>{et.text}</span>
                  {c.orderId && (
                    <>
                      <button onClick={() => descarca(c.orderId!, "invoices")} disabled={pending}
                        title="Factura emisă de About You"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60">
                        <FileText className="h-3.5 w-3.5" /> Factură
                      </button>
                      <button onClick={() => descarca(c.orderId!, "delivery-document")} disabled={pending}
                        title="Documentul de livrare"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60">
                        <FileText className="h-3.5 w-3.5" /> Livrare
                      </button>
                      {DE_RELUAT.has(c.status) && (
                        <button onClick={() => reia(c.orderId!)} disabled={pending}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60">
                          <Truck className="h-3.5 w-3.5" /> Reia expedierea
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
