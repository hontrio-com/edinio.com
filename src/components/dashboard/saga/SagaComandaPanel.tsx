"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, BookCheck, Info, Loader2, Send } from "lucide-react";
import { exportaComandaInSaga } from "@/lib/actions/saga.actions";
import {
  ETICHETA_STARE, STARI_INTRATE, mesajStornariLipsa, type DocumentPanouSaga, type StarePanouSaga,
} from "@/lib/saga/config";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { formatDateTime } from "@/lib/utils/format";

/**
 * Starea exportului in SAGA pentru documentele vii ale comenzii, si butonul „Trimite în SAGA".
 *
 * Primeste starea CALCULATA PE SERVER (`stareaPanouluiSaga` din `src/lib/saga/server.ts`), in pagina
 * comenzii, dupa garda de proprietar. Nu citeste nimic singur: e componenta de client, iar jurnalul
 * si registrul se citesc cu cheia de serviciu.
 *
 * ⚠ Butonul apare numai cand un document CHIAR poate pleca: fara blocaj si neintrat inca in SAGA.
 * Un document intrat nu se mai trimite de aici (l-ar dubla in contabilitate); registrul l-ar opri
 * oricum, dar butonul nu are de ce sa sugereze altceva.
 */
export function SagaComandaPanel({
  businessId,
  orderId,
  stare,
}: {
  businessId: string;
  orderId: string;
  stare: StarePanouSaga;
}) {
  const router = useRouter();
  const [trimite, setTrimite] = useState(false);

  const dePlecat = stare.documente.filter(
    (d) => !d.blocaj && (!d.ultimul || !STARI_INTRATE.includes(d.ultimul.stare)),
  );

  async function handleTrimite() {
    setTrimite(true);
    let r: Awaited<ReturnType<typeof exportaComandaInSaga>>;
    try {
      r = await exportaComandaInSaga(businessId, orderId);
    } catch {
      toast.error("Nu am primit răspuns de la server, deci nu știm dacă documentul a plecat. Reîncarcă pagina și verifică starea înainte să trimiți din nou.", { duration: 12000 });
      return;
    } finally {
      setTrimite(false);
    }
    if ("error" in r) {
      toast.error(r.error, { duration: 12000 });
      router.refresh();
      return;
    }
    if (r.trimise > 0) {
      const text = r.trimise === 1 ? "Documentul a plecat în SAGA." : `${r.trimise} documente au plecat în SAGA.`;
      if (r.avertisment) toast.warning(`${text} ${r.avertisment}`, { duration: 14000 });
      else toast.success(text);
    } else if (r.avertisment) {
      toast.info(r.avertisment, { duration: 10000 });
    }
    router.refresh();
  }

  return (
    <Panel title="Contabilitate (SAGA)" className="text-sm">
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
        {stare.importAutomat
          ? "SAGA importă documentele pe loc și răspunde cu raportul."
          : "Documentele ajung în SAGA Web la Diverse, Import date, unde le verifică și le importă contabilul."}
      </p>

      {stare.nimic && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
          {stare.nimic}
        </p>
      )}

      {stare.jurnalNecitit && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-warning">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Istoricul trimiterilor nu s-a putut citi acum; starea de mai jos poate fi veche.
        </p>
      )}

      {/* Facturi plecate in SAGA si inlocuite pe comanda, fara stornare intrata acolo: venitul poate fi dublat. */}
      {stare.stornariLipsa.length > 0 && (
        <p role="alert" className="flex items-start gap-2 text-xs leading-relaxed text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{mesajStornariLipsa(stare.stornariLipsa)}</span>
        </p>
      )}

      {stare.documente.length > 0 && (
        <ul className="space-y-3">
          {stare.documente.map((d) => <RandDocument key={d.cheie} d={d} />)}
        </ul>
      )}

      {dePlecat.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleTrimite} disabled={trimite}>
            {trimite ? <Loader2 className="animate-spin" /> : <Send />}
            {trimite ? "Se trimite..." : "Trimite în SAGA"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {dePlecat.length === 1 ? "Pleacă un document." : `Pleacă ${dePlecat.length} documente.`} Un document trimis nu mai pleacă a doua oară.
          </span>
        </div>
      )}
    </Panel>
  );
}

const SURSA: Record<string, string> = { manual: "din pagina comenzii", lot: "din lista de comenzi", automat: "automat" };

function RandDocument({ d }: { d: DocumentPanouSaga }) {
  const u = d.ultimul;
  const eticheta = u ? ETICHETA_STARE[u.stare] : null;
  return (
    <li className="space-y-1.5 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
          <BookCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="break-words">{d.eticheta}</span>
        </span>
        {eticheta
          ? <EtichetaStare ton={eticheta.ton} marime="mic">{eticheta.text}</EtichetaStare>
          : <EtichetaStare ton="neutru" marime="mic">{d.blocaj ? "Nu pleacă" : "Netrimis"}</EtichetaStare>}
      </div>

      {u && (
        <p className="text-xs text-muted-foreground">
          {formatDateTime(u.creatLa)}, {SURSA[u.sursa] ?? u.sursa}
          {u.codHttp ? ` (răspuns ${u.codHttp})` : ""}
        </p>
      )}
      {u?.mesaj && <p className="text-xs leading-relaxed text-foreground">{u.mesaj}</p>}
      {u?.stare === "necunoscut" && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {u.importAutomat
            ? "Verifică în SAGA, la Ieșiri, dacă documentul a intrat. Dacă nu a intrat, deblochează operația din această pagină, apoi trimite din nou."
            : "Verifică în SAGA Web, la Diverse, Import date, dacă fișierul a ajuns. Dacă nu a ajuns, deblochează operația din această pagină, apoi trimite din nou."}
        </p>
      )}
      {u?.raport && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raportul SAGA</summary>
          <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed text-foreground">
            {u.raport}
          </pre>
        </details>
      )}
      {d.blocaj && <p className="text-xs leading-relaxed text-muted-foreground">{d.blocaj}</p>}
      {d.nota && <p className="text-xs leading-relaxed text-muted-foreground">{d.nota}</p>}
    </li>
  );
}
