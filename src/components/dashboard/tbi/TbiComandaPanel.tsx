"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, XCircle } from "lucide-react";
import { anuleazaCerereaTbiDinPanou, cererileTbiAleComenzii, type CerereTbiPanou } from "@/lib/actions/tbi.actions";
import { ETICHETA_STARE_TBI, type StareTbi } from "@/lib/tbi/stari";
import { formatPrice } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { EtichetaStare, type TonEticheta } from "@/components/ui/eticheta-stare";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * Plata in rate tbi, pe pagina comenzii: cererile de finantare, ce a spus banca la fiecare, si
 * anularea unei cereri inca deschise.
 *
 * ⚠ Anularea are buton PROPRIU, nu e legata de selectorul de stare al comenzii: o schimbare de stare
 * n-are voie sa porneasca singura un apel catre banca. Pentru comenzile anulate cronul `tbi-reconciliere`
 * o face oricum; butonul e pentru cand comerciantul vrea s-o faca pe loc, sau cand cronul n-a reusit.
 */

const TON: Record<StareTbi, TonEticheta> = {
  creata: "lucru",
  trimisa: "asteptare",
  in_analiza: "lucru",
  aprobata: "bun",
  respinsa: "rau",
  anulata: "neutru",
  eroare: "rau",
};

function data(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
}

export function TbiComandaPanel({
  businessId,
  orderId,
  comandaAnulata,
}: {
  businessId: string;
  orderId: string;
  comandaAnulata: boolean;
}) {
  const router = useRouter();
  const [cereri, setCereri] = useState<CerereTbiPanou[] | null | undefined>(undefined);
  const [deAnulat, setDeAnulat] = useState<CerereTbiPanou | null>(null);
  const [lucru, setLucru] = useState<number | null>(null);

  useEffect(() => {
    let viu = true;
    cererileTbiAleComenzii(businessId, orderId)
      .then((r) => { if (viu) setCereri("error" in r ? null : r.cereri); })
      .catch(() => { if (viu) setCereri(null); });
    return () => { viu = false; };
  }, [businessId, orderId]);

  if (cereri === undefined) return null;
  if (cereri === null) {
    return (
      <Panel title="Plată în rate (tbi bank)">
        <p className="text-sm text-muted-foreground">Nu am putut citi cererile de finanțare. Reîmprospătează pagina.</p>
      </Panel>
    );
  }

  async function anuleaza(c: CerereTbiPanou) {
    setLucru(c.id);
    try {
      const r = await anuleazaCerereaTbiDinPanou(businessId, orderId, c.id);
      if (!r.success) {
        toast.error(r.error, { duration: 12000 });
      } else {
        toast.success(r.mesaj);
        router.refresh();
      }
      const proaspete = await cererileTbiAleComenzii(businessId, orderId);
      setCereri("error" in proaspete ? null : proaspete.cereri);
    } catch {
      toast.error("Nu am primit răspuns, deci nu știm dacă anularea a ajuns la tbi bank. Reîmprospătează pagina.", { duration: 12000 });
    } finally {
      setLucru(null);
    }
  }

  const deschisa = cereri.find((c) => c.poateAnula);

  return (
    <Panel title="Plată în rate (tbi bank)">
      {cereri.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Clientul a ales plata în rate, dar cererea de finanțare nu a plecat încă la tbi bank (de exemplu a închis pagina înainte de redirecționare).
        </p>
      ) : (
        <div className="space-y-4">
          {comandaAnulata && deschisa && (
            <Callout variant="warning" icon={AlertTriangle} title="Comanda e anulată, dar cererea de finanțare e încă deschisă">
              Se anulează automat la tbi bank în câteva minute. O poți anula și acum, cu butonul de mai jos.
            </Callout>
          )}
          {cereri.map((c, i) => (
            <div key={c.id} className={i > 0 ? "border-t border-border pt-4" : undefined}>
              <div className="flex flex-wrap items-center gap-2">
                <EtichetaStare ton={TON[c.stare] ?? "neutru"} marime="mic">{ETICHETA_STARE_TBI[c.stare] ?? c.stare}</EtichetaStare>
                {c.mediu === "test" && <EtichetaStare ton="asteptare" marime="mic">Mod test</EtichetaStare>}
                <span className="text-xs text-muted-foreground">Cererea nr. {c.id} · {formatPrice(c.suma)} · {data(c.creata)}</span>
              </div>
              {c.motiv && <p className="mt-1.5 text-xs font-medium text-foreground">{c.motiv}</p>}
              {c.istoric.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {c.istoric.slice(0, 8).map((e, j) => (
                    <li key={`${e.la}-${j}`}>{data(e.la)}: {e.text}</li>
                  ))}
                </ul>
              )}
              {c.poateAnula && (
                <Button type="button" variant="outline" size="sm" className="mt-3" disabled={lucru !== null} onClick={() => setDeAnulat(c)}>
                  {lucru === c.id ? <Loader2 className="animate-spin" /> : <XCircle />} Anulează cererea de finanțare
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!deAnulat} onOpenChange={(v) => { if (!v) setDeAnulat(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anulezi cererea de finanțare la tbi bank?</DialogTitle>
            <DialogDescription>
              Cererea clientului se închide la tbi bank și nu mai poate fi aprobată. Comanda nu se modifică: dacă vrei s-o anulezi și pe ea, schimbă-i starea separat.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Renunță</DialogClose>
            <Button type="button" variant="destructive" onClick={() => { const c = deAnulat; setDeAnulat(null); if (c) void anuleaza(c); }}>
              Anulează cererea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
