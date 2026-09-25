"use client";

import { useRef, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogClose, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { isValidCui, normalizeCui } from "@/lib/anaf/cui";
import type { FirmaFacturare } from "@/lib/billing/firma-abonament";

/*
 * Plata unui abonament Edinio, cu fereastra „Date pentru factura".
 *
 * Toate cele trei locuri de unde se cumpara un plan (onboarding, Setari,
 * reactivare) trec pe aici, ca regula sa nu poata fi uitata intr-unul. Ruta de
 * plata raspunde `cereCui` cand magazinul n-are CUI; atunci se deschide
 * fereastra, omul scrie CUI-ul, vede firma gasita in ANAF si merge mai departe.
 * Cine are deja CUI nu vede nimic nou. Hotararea o ia serverul, care verifica
 * din nou in ANAF: fereastra doar arata.
 */

export interface CererePlata {
  plan: string;
  interval: string;
  return_to?: string;
}

export interface PlataPornita {
  url: string;
  /** Doar cand CUI-ul s-a dat acum; onboardingul il duce la `createBusiness`. */
  firma?: FirmaFacturare;
}

interface Asteptare {
  cerere: CererePlata;
  laSucces: (p: PlataPornita) => void;
  laRenuntare: () => void;
}

type RaspunsPlata = { url?: string; firma?: FirmaFacturare; error?: string; cereCui?: boolean };

async function trimite(cerere: CererePlata, cui?: string): Promise<{ ok: boolean; date: RaspunsPlata }> {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cui ? { ...cerere, cui } : cerere),
  });
  const date = (await res.json().catch(() => ({}))) as RaspunsPlata;
  return { ok: res.ok && !!date.url, date };
}

type FirmaGasita = { business_name: string; address?: string; city?: string; county?: string; reg_com?: string };

export function usePlataAbonament() {
  const [asteptare, setAsteptare] = useState<Asteptare | null>(null);

  /**
   * Porneste plata. `laSucces` primeste adresa Stripe; `laEsec` un mesaj de aratat;
   * `laRenuntare` se cheama cand omul inchide fereastra de CUI fara sa plateasca.
   */
  async function porneste(
    cerere: CererePlata,
    { laSucces, laEsec, laRenuntare }: {
      laSucces: (p: PlataPornita) => void;
      laEsec: (mesaj: string) => void;
      laRenuntare: () => void;
    },
  ) {
    try {
      const { ok, date } = await trimite(cerere);
      if (ok) { laSucces({ url: date.url!, firma: date.firma }); return; }
      if (date.cereCui) { setAsteptare({ cerere, laSucces, laRenuntare }); return; }
      laEsec(date.error ?? "Eroare la initializarea platii.");
    } catch {
      laEsec("Eroare de retea. Incearca din nou.");
    }
  }

  /**
   * Aceeasi plata, ca promisiune: adresa Stripe, sau `null` daca n-a pornit
   * (eroarea s-a aratat deja) ori omul a inchis fereastra.
   */
  function asteapta(cerere: CererePlata): Promise<PlataPornita | null> {
    return new Promise((gata) => {
      void porneste(cerere, {
        laSucces: gata,
        laEsec: (mesaj) => { toast.error(mesaj); gata(null); },
        laRenuntare: () => gata(null),
      });
    });
  }

  // Montata doar cat asteapta o plata, deci fiecare deschidere porneste cu campurile goale.
  const fereastra = asteptare ? (
    <FereastraDateFactura
      asteptare={asteptare}
      onInchide={(platit) => {
        if (!platit) asteptare.laRenuntare();
        setAsteptare(null);
      }}
    />
  ) : null;

  return { porneste, asteapta, fereastra };
}

function FereastraDateFactura({
  asteptare,
  onInchide,
}: {
  asteptare: Asteptare;
  onInchide: (platit: boolean) => void;
}) {
  const [cui, setCui] = useState("");
  const [firma, setFirma] = useState<FirmaGasita | null>(null);
  const [cauta, setCauta] = useState(false);
  const [trimite_, setTrimite] = useState(false);
  const [eroare, setEroare] = useState<string | null>(null);
  const cronometru = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cuiCurent = useRef("");

  // Firma se cauta singura in ANAF cand CUI-ul trece cifra de control: un clic mai putin.
  function schimbaCui(valoare: string) {
    setCui(valoare);
    setFirma(null);
    setEroare(null);
    if (cronometru.current) clearTimeout(cronometru.current);
    const cifre = normalizeCui(valoare);
    cuiCurent.current = cifre;
    if (!isValidCui(cifre)) { setCauta(false); return; }
    setCauta(true);
    cronometru.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/anaf/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cui: cifre }),
        });
        const date = (await res.json().catch(() => ({}))) as FirmaGasita & { error?: string };
        // Omul a scris intre timp alt CUI: raspunsul asta nu mai e al lui.
        if (cuiCurent.current !== cifre) return;
        if (!res.ok || date.error || !date.business_name) setEroare(date.error ?? "CUI negasit in ANAF.");
        else setFirma(date);
      } catch {
        if (cuiCurent.current === cifre) setEroare("Nu am putut interoga ANAF. Incearca din nou.");
      } finally {
        if (cuiCurent.current === cifre) setCauta(false);
      }
    }, 400);
  }

  const cuiGresit = normalizeCui(cui).length >= 2 && !isValidCui(cui);

  async function continua() {
    if (!firma) return;
    setTrimite(true); setEroare(null);
    try {
      const { ok, date } = await trimite(asteptare.cerere, normalizeCui(cui));
      if (!ok) {
        setEroare(date.error ?? "Eroare la initializarea platii.");
        setTrimite(false);
        return;
      }
      onInchide(true);
      asteptare.laSucces({ url: date.url!, firma: date.firma });
    } catch {
      setEroare("Eroare de retea. Incearca din nou.");
      setTrimite(false);
    }
  }

  return (
    <Dialog open onOpenChange={(deschis) => { if (!deschis && !trimite_) onInchide(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Date pentru factura</DialogTitle>
          <DialogDescription>
            Factura abonamentului se emite pe firma ta. Scrie CUI-ul, iar restul datelor le completam din ANAF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label htmlFor="cui-factura" className="block text-sm font-medium text-foreground mb-1.5">CUI / CIF</label>
            <div className="relative">
              <Input
                id="cui-factura"
                value={cui}
                onChange={(e) => schimbaCui(e.target.value)}
                placeholder="ex: RO12345678"
                inputMode="text"
                autoComplete="off"
                autoFocus
                disabled={trimite_}
                aria-invalid={cuiGresit || undefined}
              />
              {cauta && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {cuiGresit && <p className="mt-1 text-xs text-destructive">CUI-ul nu pare corect. Verifica cifrele.</p>}
          </div>

          {firma && (
            <div className="flex gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <Building2 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 text-xs text-muted-foreground space-y-0.5">
                <p className="text-sm font-semibold text-foreground">{firma.business_name}</p>
                {firma.reg_com && <p>{firma.reg_com}</p>}
                {(firma.address || firma.city) && (
                  <p>{[firma.address, firma.city, firma.county].filter(Boolean).join(", ")}</p>
                )}
              </div>
            </div>
          )}

          {eroare && <p className="text-xs text-destructive">{eroare}</p>}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={trimite_} />}>Anuleaza</DialogClose>
          <Button onClick={continua} disabled={!firma || cauta || trimite_}>
            {trimite_ && <Loader2 className="animate-spin" />}
            Continua la plata
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
