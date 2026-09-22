"use client";

import { useCallback, useState, useTransition } from "react";
import { EtichetaStare, type TonEticheta } from "@/components/ui/eticheta-stare";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, RotateCcw, Truck, XCircle } from "lucide-react";
import {
  anuleazaComandaAboutYou, getAboutYouOrderDocument, getAboutYouOrders,
  reincearcaExpediereaAboutYou, returneazaComandaAboutYou, type PaginaComenziAboutYou,
} from "@/lib/actions/aboutyou.actions";
import { Paginatie } from "@/components/dashboard/Paginatie";
import { formatDate } from "@/lib/utils/format";

/*
 * Comenzile About You, in panoul integrarii.
 *
 * Nu erau afisate nicaieri. Statusurile de eșec se scriau intr-o coloana pe care
 * n-o citea nicio pagina, deci o expediere respinsa de About You rămânea nevazuta
 * si fara cale de reluare. Iar facturile lor — About You detine checkout-ul si
 * emite factura catre cumparator — se puteau lua doar din Seller Center.
 */
/* ⚠ TONURI, NU CLASE: cum se deseneaza eticheta hotaraste `EtichetaStare`. */
const ETICHETE: Record<string, { text: string; ton: TonEticheta }> = {
  open: { text: "Deschisă", ton: "asteptare" },
  ship_pending: { text: "Expediere în curs", ton: "asteptare" },
  shipped: { text: "Expediată", ton: "bun" },
  ship_failed: { text: "Expediere respinsă", ton: "rau" },
  cancel_pending: { text: "Anulare în curs", ton: "asteptare" },
  cancelled: { text: "Anulată", ton: "neutru" },
  cancel_failed: { text: "Anulare respinsă", ton: "rau" },
  return_pending: { text: "Retur în curs", ton: "asteptare" },
  returned: { text: "Returnată", ton: "neutru" },
  return_failed: { text: "Retur respins", ton: "rau" },
  mixed: { text: "Mixtă", ton: "neutru" },
  /*
   * ⚠ „NU STIM" NU E „A ESUAT", si de-aia are eticheta lui.
   *
   * Ajunge aici cand am trimis cererea la About You si, dupa sapte zile, tot nu stim ce a iesit.
   * Scrisa `ship_failed`, ar fi primit butonul „Reia expedierea" — iar o reluare peste ceva ce
   * poate a fost primit inseamna doua expedieri raportate pe aceleasi linii. Deci: se arata, se
   * explica, si NU se ofera butonul.
   */
  ship_necunoscut: { text: "Expediere neconfirmată", ton: "asteptare" },
  cancel_necunoscut: { text: "Anulare neconfirmată", ton: "asteptare" },
  return_necunoscut: { text: "Retur neconfirmat", ton: "asteptare" },
};

/** Starile in care nu stim ce s-a intamplat la ei: se cere un om, nu un buton. */
const NECONFIRMATE = new Set(["ship_necunoscut", "cancel_necunoscut", "return_necunoscut"]);

const DE_RELUAT = new Set(["ship_failed"]);

export function AboutYouOrders({ businessId, pagina }: { businessId: string; pagina: PaginaComenziAboutYou }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [doarProbleme, setDoarProbleme] = useState(false);
  /* Ce rand si-a deschis confirmarea, si pentru ce. `null` = niciunul. */
  const [deschis, setDeschis] = useState<{ orderId: string; fel: "anulare" | "retur" } | null>(null);
  const [awb, setAwb] = useState("");

  /*
   * ⚠ PAGINAREA SI CERNEREA SE FAC PE SERVER (22.09.2026).
   *
   * Pana azi toate comenzile veneau deodata (taiate tacut la 100), iar „Arata doar problemele"
   * le cernea in browser. Asta insemna ca o expediere respinsa de la comanda a 130-a nu se vedea
   * NICIODATA, nici cu filtrul pornit — tocmai butonul pus ca sa gaseasca problemele le ascundea.
   *
   * Prima pagina vine de pe server; de aici incolo componenta isi tine singura starea si si-o
   * reimprospateaza dupa fiecare actiune. O sincronizare din prop ar arunca pagina curenta si
   * filtrul la fiecare `router.refresh()`.
   */
  const [stare, setStare] = useState<PaginaComenziAboutYou>(pagina);
  const [seIncarca, setSeIncarca] = useState(false);

  const incarca = useCallback(async (p: number, doar: boolean) => {
    setSeIncarca(true);
    try {
      setStare(await getAboutYouOrders(businessId, p, doar));
      setDeschis(null);
    } catch {
      /* O actiune de server poate cadea si din retea. Fara asta, indicatorul de incarcare
         ramanea aprins pentru totdeauna. */
      toast.error("Nu am putut încărca lista de comenzi.");
    } finally {
      setSeIncarca(false);
    }
  }, [businessId]);

  /* Dupa o fapta dusa la capat: se aduce din nou CHIAR pagina pe care sta omul. */
  const reimprospateaza = () => { void incarca(stare.pagina, doarProbleme); };

  const vizibile = stare.randuri;
  const cuProbleme = stare.cuProbleme;

  const descarca = (orderId: string, fel: "invoices" | "delivery-document") => startTransition(async () => {
    let res: Awaited<ReturnType<typeof getAboutYouOrderDocument>>;
    try {
      res = await getAboutYouOrderDocument(businessId, orderId, fel);
    } catch {
      /* ⚠ Cere documentul comenzii. */
      toast.error(
        "Nu am primit raspuns de la server, deci nu stim daca s-a putut aduce documentul. "
        + "Incearca din nou peste putin timp.",
        { duration: 12000 },
      );
      return;
    }
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
    let res: Awaited<ReturnType<typeof reincearcaExpediereaAboutYou>>;
    try {
      res = await reincearcaExpediereaAboutYou(businessId, orderId);
    } catch {
      /* ⚠ Reia expedierea LA About You. */
      toast.error(
        "Nu am primit raspuns de la server, deci nu stim daca expedierea s-a reluat. "
        + "Uita-te la comanda in contul About You inainte sa incerci din nou.",
        { duration: 12000 },
      );
      return;
    }
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Expedierea a fost repusă la coadă.");
    reimprospateaza();
    router.refresh();
  });

  /*
   * ═══ ⚠ ANULAREA SI RETURUL N-AVEAU NICIUN BUTON (27.08.2026) ═══
   *
   * `cancelOrderNow` si `returnOrderNow` erau scrise de mult, cu garzile lor pe stari, si nu le
   * chema NIMENI. Comerciantul trebuia sa intre in Seller Center, iar la noi comanda ramanea cum
   * era — deci cele doua liste se despartaeu tacut.
   *
   * ⚠ SE CERE O CONFIRMARE, si nu de politete: amandoua sunt cereri catre About You care nu se
   * pot lua inapoi. Se deschide un rand sub comanda, cu ce se intampla scris pe fata.
   */
  const anuleaza = (orderId: string) => startTransition(async () => {
    let res: Awaited<ReturnType<typeof anuleazaComandaAboutYou>>;
    try {
      res = await anuleazaComandaAboutYou(businessId, orderId);
    } catch {
      /* ⚠ Anuleaza comanda LA About You. */
      toast.error(
        "Nu am primit raspuns de la server, deci nu stim daca anularea a ajuns la About You. "
        + "Uita-te la comanda in contul lor inainte sa incerci din nou.",
        { duration: 12000 },
      );
      return;
    }
    if ("error" in res) { toast.error(res.error); return; }
    setDeschis(null);
    toast.success("Anularea a plecat la About You. Se confirmă în câteva minute.");
    reimprospateaza();
    router.refresh();
  });

  const returneaza = (orderId: string) => startTransition(async () => {
    let res: Awaited<ReturnType<typeof returneazaComandaAboutYou>>;
    try {
      res = await returneazaComandaAboutYou(businessId, orderId, awb);
    } catch {
      /* ⚠ Inregistreaza returul LA About You. */
      toast.error(
        "Nu am primit raspuns de la server, deci nu stim daca returul a ajuns la About You. "
        + "Uita-te la comanda in contul lor inainte sa incerci din nou.",
        { duration: 12000 },
      );
      return;
    }
    if ("error" in res) { toast.error(res.error); return; }
    setDeschis(null);
    setAwb("");
    toast.success("Returul a plecat la About You. Se confirmă în câteva minute.");
    reimprospateaza();
    router.refresh();
  });

  return (
    <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-base font-semibold text-foreground">Comenzi About You</h2>
        {cuProbleme > 0 && (
          /* ⚠ Cernerea pleaca la server, si de la PRIMA pagina: pastrata pagina veche, omul ar fi
             cazut in gol cand multimea filtrata are mai putine pagini decat cea intreaga. */
          <button
            onClick={() => { const v = !doarProbleme; setDoarProbleme(v); void incarca(1, v); }}
            disabled={seIncarca}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
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
          {doarProbleme ? "Nicio comandă cu probleme." : "Nicio comandă About You încă."}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {vizibile.map((c) => {
            const et = ETICHETE[c.status] ?? { text: c.status, ton: "neutru" };
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
                  <EtichetaStare
                    ton={et.ton}
                    marime="mic"
                    title={NECONFIRMATE.has(c.status)
                      ? "Am trimis cererea la About You, dar nu am aflat ce a ieșit. Verifică în Seller Center înainte de a încerca din nou."
                      : undefined}
                  >
                    {et.text}
                  </EtichetaStare>
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
                      {c.sePoateAnula && (
                        <button
                          onClick={() => { setDeschis({ orderId: c.orderId!, fel: "anulare" }); setAwb(""); }}
                          disabled={pending}
                          title="Anulează la About You liniile care nu au plecat încă"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60">
                          <XCircle className="h-3.5 w-3.5" /> Anulează
                        </button>
                      )}
                      {c.sePoateReturna && (
                        <button
                          onClick={() => { setDeschis({ orderId: c.orderId!, fel: "retur" }); setAwb(""); }}
                          disabled={pending}
                          title="Marchează la About You liniile expediate ca returnate"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60">
                          <RotateCcw className="h-3.5 w-3.5" /> Retur
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/*
                  * ⚠ CONFIRMARE PE LOC, nu direct la apasare: amandoua sunt cereri catre About You
                  * care NU se pot lua inapoi. Textul spune exact ce pleaca si pe ce linii, ca omul
                  * sa nu afle dupa.
                  */}
                {deschis?.orderId === c.orderId && (
                  <div className="w-full mt-2 rounded-lg border border-border bg-muted/40 p-3">
                    {deschis.fel === "anulare" ? (
                      <>
                        <p className="text-xs text-foreground">
                          Se anulează la About You <strong>doar liniile care nu au plecat încă</strong>.
                          Cele expediate rămân neatinse. Stocul lor se întoarce în Edinio.
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Cererea nu poate fi anulată după ce pleacă.
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => anuleaza(c.orderId!)} disabled={pending}
                            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
                            {pending ? "Se trimite…" : "Anulează la About You"}
                          </button>
                          <button onClick={() => setDeschis(null)} disabled={pending}
                            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-60">
                            Renunță
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-foreground">
                          Se marchează ca returnate <strong>doar liniile expediate</strong>. Marfa NU se pune
                          singură înapoi în stoc: o repui tu, după ce te uiți la ce ai primit.
                        </p>
                        <label className="block text-xs text-muted-foreground mt-2 mb-1" htmlFor={`awb-${c.numarAy}`}>
                          Numărul AWB de retur
                        </label>
                        <input
                          id={`awb-${c.numarAy}`}
                          value={awb}
                          onChange={(e) => setAwb(e.target.value)}
                          placeholder="ex. 2400012345678"
                          className="w-full max-w-xs rounded-md ring-1 ring-foreground/10 bg-card px-2 py-1 text-xs text-foreground"
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => returneaza(c.orderId!)} disabled={pending || !awb.trim()}
                            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60">
                            {pending ? "Se trimite…" : "Trimite returul"}
                          </button>
                          <button onClick={() => setDeschis(null)} disabled={pending}
                            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-60">
                            Renunță
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/*
        ⚠ NUMERE, NU DOUA SAGETI. Comenzile cresc cu magazinul si nu se opresc niciodata din
        crescut: la eMAG un singur comerciant are 4.678 de oferte si 131 de comenzi doar in
        tabelul de marketplace. O lista de comenzi e chiar felul de lista care ajunge la zeci
        de pagini, iar acolo „Înainte" nu e o cale, e o plimbare.
      */}
      {stare.pagini > 1 && (
        <div className="pt-1 mt-3 border-t border-border">
          <Paginatie
            pagina={stare.pagina}
            pagini={stare.pagini}
            laSchimbare={(p) => void incarca(p, doarProbleme)}
            seIncarca={seIncarca}
            rezumat={`${(stare.pagina - 1) * stare.pePagina + 1}–${Math.min(stare.pagina * stare.pePagina, stare.total)} din ${stare.total} comenzi`}
          />
        </div>
      )}
    </div>
  );
}
