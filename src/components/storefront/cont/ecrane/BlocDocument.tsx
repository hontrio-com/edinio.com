import Link from "next/link";
import { FileMinus2 } from "lucide-react";
import type { DocumentFiscal } from "@/lib/cont/documente";
import { numarulDocumentului, stareaDocumentului } from "@/lib/cont/documente";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { DescarcaDocument } from "../DescarcaDocument";
import { EtichetaStareCont, ListaDate, RandDate } from "../ui/piese";
import { LEGATURA } from "../ui/clase";

/**
 * Factura unei comenzi: numarul, starea, descarcarea, si stornarea cand exista.
 *
 * ⚠⚠ STORNAREA SE SPUNE PE FATA. Pe productie, 28 de comenzi de vitrina au
 * factura SI stornare; inainte, contul le arata ca facturi valabile, fara nicio
 * urma a notei de credit.
 * ⚠ Data emiterii apare NUMAI cand registrul o stie. Altfel se spune unde e,
 * nu se ghiceste: o data gresita pe un document fiscal e mai rea decat niciuna.
 * ⚠ Numele casei de facturare nu apare: emitentul e magazinul, nu SmartBill.
 */
export function BlocDocument({
  doc,
  orderId,
  emailMagazin,
  comanda,
}: {
  doc: DocumentFiscal;
  orderId: string;
  emailMagazin: string | null;
  /** Pe pagina „Facturi": legatura la comanda, totalul ei si firma. */
  comanda?: { numar: string; total: number; firma: { denumire: string; cui: string | null } | null };
}) {
  const st = stareaDocumentului(doc);
  const numar = numarulDocumentului(doc.serie, doc.numar);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold tabular-nums text-[var(--st-text)]">Factura {numar}</p>
          <p className="mt-0.5 text-sm text-[var(--st-muted)]">
            {doc.emisaLa ? `Emisa pe ${formatDate(doc.emisaLa)}` : "Data emiterii apare pe factura"}
          </p>
        </div>
        <EtichetaStareCont ton={st.ton}>{st.text}</EtichetaStareCont>
      </div>

      {comanda && (
        <ListaDate>
          <RandDate eticheta="Comanda">
            <Link href={`/cont/comenzi/${orderId}`} className={`${LEGATURA} tabular-nums`}>{comanda.numar}</Link>
          </RandDate>
          <RandDate eticheta="Total comanda">
            <span className="tabular-nums">{formatPrice(comanda.total)}</span>
          </RandDate>
          {comanda.firma && (
            <RandDate eticheta="Facturata pe firma">
              {comanda.firma.denumire}
              {comanda.firma.cui ? <span className="text-[var(--st-muted)]">, CUI {comanda.firma.cui}</span> : null}
            </RandDate>
          )}
        </ListaDate>
      )}

      <DescarcaDocument
        orderId={orderId}
        fel="factura"
        eticheta="Descarca factura (PDF)"
        emailMagazin={emailMagazin}
        varianta={doc.stornata ? "secundar" : "primar"}
      />

      {doc.stornata && (
        <div className="rounded-[min(var(--st-radius-sm),0.5rem)] border border-[var(--st-border)] p-4">
          <div className="flex items-start gap-3">
            <FileMinus2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--st-muted)]" strokeWidth={1.7} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--st-text)]">
                Factura de stornare{doc.stornoNumar ? ` ${numarulDocumentului(doc.stornoSerie, doc.stornoNumar)}` : ""}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-[var(--st-muted)]">
                Factura a fost stornata. Pastreaza ambele documente.
              </p>
              <div className="mt-3">
                {doc.stornoDescarcabil ? (
                  <DescarcaDocument orderId={orderId} fel="storno" eticheta="Descarca factura de stornare" emailMagazin={emailMagazin} />
                ) : (
                  <p className="text-sm text-[var(--st-text)]">
                    Factura de stornare nu poate fi descarcata din cont.
                    {emailMagazin ? <> O poti cere la <a href={`mailto:${emailMagazin}`} className={LEGATURA}>{emailMagazin}</a>.</> : " O poti cere magazinului."}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
