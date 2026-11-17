"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileCheck, FileText, FlaskConical, Loader2, XCircle } from "lucide-react";
import { descarcaPdfDeLaCasa } from "./descarcaPdf";
import { numarDocument, type DocumentPeComanda, type RezultatCasa } from "./FilaCaseiCuCheie";

/**
 * Celula unei case de facturare „cu cheie” (Facturis, Factureaza.ro, easybill) in lista comenzilor.
 *
 * ⚠ STORNAREA NU SE FACE DIN LISTA, dinadins (de aceea componenta nici nu primeste o actiune de
 * stornare): e un act fiscal ireversibil, iar in pagina comenzii cere o a doua apasare, cu ce se
 * intampla scris pe fata. Aici raman emiterea (pazita de registru si de slot) si PDF-ul.
 *
 * ⚠ Raspunsul pierdut nu invita la reincercare oarba: un document emis si nelegat de comanda se
 * lamureste din contul casei.
 */
export function CelulaCaseiCuCheie({
  casa,
  ruta,
  orderId,
  factura,
  storno,
  deTest = false,
  emite,
}: {
  casa: string;
  ruta: string;
  orderId: string;
  factura: DocumentPeComanda;
  storno: DocumentPeComanda;
  /** Documentele de pe comanda sunt din modul de test al casei. */
  deTest?: boolean;
  emite: () => Promise<RezultatCasa>;
}) {
  const router = useRouter();
  const [ocupat, porneste] = useTransition();

  function emiteFactura(e: React.MouseEvent) {
    e.stopPropagation();
    porneste(async () => {
      let rezultat: RezultatCasa;
      try {
        rezultat = await emite();
      } catch {
        toast.error(
          `Nu am primit răspuns de la server, deci nu știm dacă factura s-a emis în ${casa}. Verifică în contul ${casa} înainte să încerci din nou.`,
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in rezultat) {
        toast.error(rezultat.error, { duration: 10000 });
        return;
      }
      const nr = numarDocument({ cheie: null, serie: rezultat.series, numar: rezultat.number });
      toast.success(nr ? `Factura ${casa} ${nr} a fost emisă.` : `Factura ${casa} a fost emisă.`);
      if (rezultat.avertisment) toast.warning(rezultat.avertisment, { duration: 15000 });
      router.refresh();
    });
  }

  const test = deTest ? (
    <span title="Document de test, nu e fiscal" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning/10 text-warning">
      <FlaskConical className="h-3 w-3" />
      Test
    </span>
  ) : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {storno.cheie ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive">
          <XCircle className="h-3 w-3" />
          Storno {numarDocument(storno)}
        </span>
      ) : factura.cheie ? (
        <>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success">
            <FileCheck className="h-3 w-3" />
            {numarDocument(factura) || "Factura"}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void descarcaPdfDeLaCasa(ruta, casa, orderId, "invoice"); }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
          >
            <FileText className="h-3 w-3" />
            PDF
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={emiteFactura}
          disabled={ocupat}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
        >
          {ocupat ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
          Factura
        </button>
      )}
      {(storno.cheie || factura.cheie) && test}
    </div>
  );
}
