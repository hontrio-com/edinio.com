"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RotateCcw, Undo2, XCircle } from "lucide-react";
import {
  anuleazaInEasySales, preiaInEdinioEasySales, reiaTrimitereaEasySales, stareaEasySalesAComenzii,
} from "@/lib/actions/easysales.actions";
import type { StareComandaEasySales } from "@/lib/easysales/panou";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * Comanda in easySales, pe pagina ei (planul, §5.3): unde e, ce AWB si ce factura are la ei, si cele
 * trei miscari care se pot face DE AICI: „Preia in Edinio", „Anuleaza in easySales", „Reia".
 *
 * ⚠ Starea, factura si AWB-ul nu se schimba din Edinio cat comanda e a lor: serverul refuza
 * (`easysales/paza.ts`), iar panoul spune unde se face.
 */

const STARE: Record<string, string> = {
  asteapta_plata: "Așteaptă plata; pleacă în easySales după încasare.",
  de_trimis: "Pleacă în easySales în câteva momente.",
  trimisa: "E în easySales: factura și AWB-ul se fac acolo.",
  necunoscuta: "Se verifică dacă a ajuns în easySales.",
  refuzata: "easySales a refuzat comanda.",
  respinsa_local: "Oprită înainte de trimitere.",
  blocata_plafon: "Plafonul de comenzi al abonamentului easySales e atins.",
  conflict: "De verificat în easySales.",
  abandonata: "N-a putut pleca în 48 de ore.",
  anulata_inainte: "Anulată înainte să plece în easySales.",
  preluata_edinio: "Se procesează din Edinio.",
};

const CURIER: Record<string, string> = {
  dpd: "DPD", cargus: "Cargus", fancourier: "FAN Courier", sameday: "Sameday", gls: "GLS", dhl: "DHL", packeta: "Packeta", ups: "UPS",
};

function Confirmare({ deschis, setDeschis, titlu, text, eticheta, onConfirma }: {
  deschis: boolean; setDeschis: (v: boolean) => void; titlu: string; text: string; eticheta: string; onConfirma: () => void;
}) {
  return (
    <Dialog open={deschis} onOpenChange={setDeschis}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titlu}</DialogTitle>
          <DialogDescription>{text}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Renunță</DialogClose>
          <Button type="button" variant="destructive" onClick={() => { setDeschis(false); onConfirma(); }}>{eticheta}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EasySalesComandaPanel({ businessId, orderId }: { businessId: string; orderId: string }) {
  const router = useRouter();
  const [s, setS] = useState<StareComandaEasySales | null | undefined>(undefined);
  const [lucru, setLucru] = useState<string | null>(null);
  const [confirmPreia, setConfirmPreia] = useState(false);
  const [confirmAnuleaza, setConfirmAnuleaza] = useState(false);

  useEffect(() => {
    let viu = true;
    stareaEasySalesAComenzii(businessId, orderId).then((r) => {
      if (viu) setS(r && !("error" in r) ? r : null);
    }).catch(() => { if (viu) setS(null); });
    return () => { viu = false; };
  }, [businessId, orderId]);

  if (s === undefined || s === null) return null;

  async function faCu(eticheta: string, fn: () => Promise<{ ok: true } | { error: string }>, reusit: string) {
    setLucru(eticheta);
    try {
      const r = await fn();
      if ("error" in r) toast.error(r.error);
      else { toast.success(reusit); router.refresh(); setS(await stareaEasySalesAComenzii(businessId, orderId).then((x) => (x && !("error" in x) ? x : null))); }
    } catch {
      toast.error("A apărut o eroare. Încearcă din nou.");
    } finally {
      setLucru(null);
    }
  }

  const trimisa = s.stare === "trimisa" || s.stare === "conflict";
  return (
    <Panel title="easySales">
      <p className="text-sm">{STARE[s.stare] ?? s.stare}{s.statusLor ? ` Status la ei: ${s.statusLor}.` : ""}</p>
      {s.motiv && s.stare !== "trimisa" && <p className="text-sm text-muted-foreground">{s.motiv}</p>}
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <dt className="text-muted-foreground">Id în easySales</dt><dd>{s.esOrderId}</dd>
        {s.awb && (<><dt className="text-muted-foreground">AWB</dt><dd>{s.awb}{s.curier ? ` (${CURIER[s.curier] ?? s.curier})` : ""}</dd></>)}
        {s.facturi.length > 0 && (<><dt className="text-muted-foreground">Factură</dt><dd>{s.facturi.map((f) => `${f.series ?? ""} ${f.number ?? ""}`.trim()).join(", ")}{s.stornari ? ` (${s.stornari} stornări)` : ""}</dd></>)}
      </dl>
      {s.cerereAnulare && <Callout variant="warning" icon={AlertTriangle} title="Clientul a cerut anularea">Anuleaz-o din easySales sau cu butonul de mai jos.</Callout>}
      {s.erori.length > 0 && <Callout variant="danger" icon={AlertTriangle} title="Eroare în easySales">{s.erori.join("; ")}</Callout>}
      {s.stapan === "easysales" && (
        <div className="flex flex-wrap gap-2">
          {s.poate.anuleaza && (
            <Button variant="outline" size="sm" disabled={lucru !== null} onClick={() => setConfirmAnuleaza(true)}>
              {lucru === "anuleaza" ? <Loader2 className="animate-spin" /> : <XCircle />} Anulează în easySales
            </Button>
          )}
          {s.poate.preia && (
            <Button variant="outline" size="sm" disabled={lucru !== null}
              onClick={() => (trimisa ? setConfirmPreia(true) : faCu("preia", () => preiaInEdinioEasySales(businessId, orderId, false), "Comanda se procesează acum din Edinio."))}>
              {lucru === "preia" ? <Loader2 className="animate-spin" /> : <Undo2 />} Preia în Edinio
            </Button>
          )}
          {s.poate.reia && (
            <Button variant="outline" size="sm" disabled={lucru !== null} onClick={() => faCu("reia", () => reiaTrimitereaEasySales(businessId, orderId), "Comanda pleacă din nou în easySales.")}>
              {lucru === "reia" ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reia trimiterea
            </Button>
          )}
        </div>
      )}
      <Confirmare
        deschis={confirmAnuleaza} setDeschis={setConfirmAnuleaza}
        titlu="Anulezi comanda în easySales?"
        text="Se anulează întâi în easySales (numai dacă nu e încă procesată și n-are AWB), apoi și în Edinio, cu stocul pus înapoi."
        eticheta="Anulează comanda"
        onConfirma={() => faCu("anuleaza", () => anuleazaInEasySales(businessId, orderId), "Comanda s-a anulat.")}
      />
      <Confirmare
        deschis={confirmPreia} setDeschis={setConfirmPreia}
        titlu="Preiei comanda în Edinio?"
        text="Comanda e deja în easySales. Se anulează acolo (numai dacă nu e procesată și n-are AWB), apoi factura și AWB-ul se fac din Edinio."
        eticheta="Anulează acolo și preia"
        onConfirma={() => faCu("preia", () => preiaInEdinioEasySales(businessId, orderId, true), "Comanda se procesează acum din Edinio.")}
      />
    </Panel>
  );
}
