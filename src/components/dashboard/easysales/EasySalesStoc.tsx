"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Eye, Loader2, Pause, Play, ShieldCheck } from "lucide-react";
import {
  confirmaStoculEasySales, consumaComenzileDinUmbraEasySales, opresteBuclaEasySales, pornesteBuclaEasySales,
  stareaBucleiEasySales,
} from "@/lib/actions/easysales.actions";
import type { StareBuclaPanou } from "@/lib/easysales/bucla";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";

/**
 * Stocul cu easySales (planul, §7.4): bucla de stoc, in umbra, pe canar sau cu efect.
 *
 * ⚠ Oprita in cod pana dupa proba pe contul de test (E0) si alegerea formulei (M-STOC-1): panoul spune
 * asta, iar butoanele raman stinse. Ordinea recomandata e umbra, apoi canarul, apoi tot catalogul.
 */

const NUME_MOD = { umbra: "în umbră (fără efect)", canar: "pe canar", efect: "pe tot catalogul" } as const;
const NUME_STARE: Record<string, string> = {
  externa: "neînregistrată", consumata: "consumată", neconsumata: "fără consum",
};

function data(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
}

export function EasySalesStoc({ businessId }: { businessId: string }) {
  const [s, setS] = useState<StareBuclaPanou | null>(null);
  const [lucru, setLucru] = useState<string | null>(null);
  const [canar, setCanar] = useState("");

  async function incarca() {
    const r = await stareaBucleiEasySales(businessId);
    if ("error" in r) { toast.error(r.error); return; }
    setS(r);
  }

  useEffect(() => {
    let viu = true;
    stareaBucleiEasySales(businessId).then((r) => {
      if (!viu) return;
      if ("error" in r) { toast.error(r.error); return; }
      setS(r);
      setCanar(r.canar.join(", "));
    }).catch(() => { if (viu) toast.error("Starea stocului nu s-a putut citi."); });
    return () => { viu = false; };
  }, [businessId]);

  async function faCu(eticheta: string, fn: () => Promise<{ ok: true; mesaj?: string } | { error: string }>) {
    setLucru(eticheta);
    try {
      const r = await fn();
      if ("error" in r) toast.error(r.error);
      else { toast.success(r.mesaj ?? "Gata."); await incarca(); }
    } catch {
      toast.error("A apărut o eroare. Încearcă din nou.");
    } finally {
      setLucru(null);
    }
  }

  if (!s) return null;
  const skuuri = canar.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const faraFormula = s.formula === null;

  return (
    <Panel title="Stocul cu easySales">
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>Stocul din Edinio pleacă în easySales, iar vânzările din celelalte canale (marketplace-uri, comenzi manuale) scad stocul din Edinio. Edinio rămâne sursa stocului.</p>
        <p>Ordinea: întâi <b>în umbră</b> (comenzile se clasifică, fără să schimbe nimic), apoi un <b>canar</b> de câteva SKU-uri, apoi tot catalogul.</p>
      </div>
      {!s.pornitaInCod && (
        <Callout variant="neutral" icon={ShieldCheck} title="Sincronizarea stocului pornește după proba pe contul de test easySales">
          Măsurăm întâi cum își ține easySales stocul (rezervare sau scădere), ca aceeași bucată să nu se scadă de două ori.
        </Callout>
      )}
      {s.pornitaInCod && faraFormula && (
        <Callout variant="neutral" icon={ShieldCheck}>Umbra se poate porni. Canarul și efectul așteaptă alegerea formulei de stoc, după măsurătoare.</Callout>
      )}
      {s.valAsteapta && (
        <Callout variant="warning" icon={AlertTriangle} title={`Stocul ar trece pe 0 la ${s.valAsteapta.la_zero} de articole deodată`}>
          <p>Confirmă că schimbarea e voită înainte să plece în easySales.</p>
          <Button size="sm" className="mt-2" onClick={() => faCu("confirma", () => confirmaStoculEasySales(businessId))} disabled={lucru !== null}>
            {lucru === "confirma" ? <Loader2 className="animate-spin" /> : <CheckCircle />} Confirmă stocul
          </Button>
        </Callout>
      )}

      {s.activa ? (
        <div className="space-y-3 text-sm">
          <p>Bucla rulează <b>{s.mod ? NUME_MOD[s.mod] : ""}</b> din {data(s.pornitaLa)}.{s.mod === "canar" ? ` SKU-uri: ${s.canar.join(", ")}.` : ""}</p>
          <div className="flex flex-wrap gap-2">
            {s.mod === "umbra" && (
              <Button size="sm" variant="outline" onClick={() => faCu("canar", () => pornesteBuclaEasySales(businessId, "canar", skuuri))} disabled={lucru !== null || faraFormula || skuuri.length === 0}>
                <Play /> Treci pe canar
              </Button>
            )}
            {s.mod !== "efect" && (
              <Button size="sm" variant="outline" onClick={() => faCu("efect", () => pornesteBuclaEasySales(businessId, "efect", []))} disabled={lucru !== null || faraFormula}>
                <Play /> Pornește pe tot catalogul
              </Button>
            )}
            {s.mod !== "umbra" && (s.comenzi.umbra ?? 0) > 0 && (
              <Button size="sm" variant="outline" onClick={() => faCu("umbra", () => consumaComenzileDinUmbraEasySales(businessId))} disabled={lucru !== null}>
                Consumă cele {s.comenzi.umbra} comenzi deschise din umbră
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => faCu("opreste", () => opresteBuclaEasySales(businessId))} disabled={lucru !== null}>
              {lucru === "opreste" ? <Loader2 className="animate-spin" /> : <Pause />} Oprește (stocul trece întâi pe 0 în easySales)
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => faCu("umbra", () => pornesteBuclaEasySales(businessId, "umbra", []))} disabled={lucru !== null || !s.pornitaInCod}>
            {lucru === "umbra" ? <Loader2 className="animate-spin" /> : <Eye />} Pornește în umbră
          </Button>
        </div>
      )}

      {s.pornitaInCod && (!s.activa || s.mod === "umbra") && (
        <Field label="SKU-urile canarului (5-20)" hint="Despărțite prin virgulă. Pe ele stocul și consumul sunt reale.">
          <Input value={canar} onChange={(e) => setCanar(e.target.value)} placeholder="SKU-1, SKU-2" />
        </Field>
      )}

      {s.pornitaInCod && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            {Object.entries(s.comenzi).filter(([, v]) => v > 0).map(([k, v]) => (
              <span key={k} className="rounded-md bg-muted px-2 py-1">{k === "umbra" ? "în umbră" : NUME_STARE[k] ?? k}: <b>{v}</b></span>
            ))}
          </div>
          {s.ultimele.length > 0 && (
            <ul className="divide-y rounded-md border">
              {s.ultimele.map((c) => (
                <li key={c.internalId} className="p-2">
                  <span className="font-medium">#{c.numar ?? c.internalId}</span>{c.canal ? ` (${c.canal})` : ""}:{" "}
                  {c.efect === "umbra" ? "în umbră" : NUME_STARE[c.stare] ?? c.stare}
                  {c.linii.length > 0 && <span className="text-muted-foreground"> · {c.linii.map((l) => `${l.sku} x${l.cantitate}`).join(", ")}</span>}
                  {c.motiv && <span className="block text-muted-foreground">{c.motiv}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
