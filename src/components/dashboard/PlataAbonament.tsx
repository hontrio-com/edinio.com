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
import type { FirmaFacturare, FirmaManuala } from "@/lib/billing/firma-abonament";
import { JUDETE } from "@/lib/ro/judete";

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
  /**
   * Firma data deja o data (onboarding, dupa „Anuleaza" pe Stripe), ca omul sa nu
   * o mai scrie. Serverul o verifica din nou, exact ca pe cea din fereastra.
   */
  cui?: string;
  manual?: FirmaManuala;
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

type RaspunsPlata = { url?: string; firma?: FirmaFacturare; error?: string; cereCui?: boolean; manual?: boolean };

/**
 * `manual` il foloseste serverul DOAR cand ANAF nu-i da firma (n-o gaseste sau nu
 * raspunde); altfel ia datele din ANAF. Asa ANAF nu poate opri o plata.
 */
async function trimite(
  cerere: CererePlata,
  firma?: { cui: string; manual?: FirmaManuala },
): Promise<{ ok: boolean; date: RaspunsPlata }> {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(firma ? { ...cerere, ...firma } : cerere),
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

const GOL: Required<FirmaManuala> = { nume: "", regCom: "", adresa: "", oras: "", judet: "" };

/** Aceleasi praguri ca `firmaFaraAnaf` pe server, ca butonul sa nu promita ce serverul refuza. */
function manualaCompleta(m: Required<FirmaManuala>): boolean {
  return m.nume.trim().length >= 2 && m.adresa.trim().length >= 3 && m.oras.trim().length >= 2 && m.judet.trim().length >= 2;
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
  // ANAF nu da firma (n-o gaseste sau nu raspunde): omul o completeaza de mana.
  const [manual, setManual] = useState(false);
  const [date, setDate] = useState<Required<FirmaManuala>>(GOL);
  const cronometru = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cuiCurent = useRef("");

  function peMana(mesaj: string) {
    setManual(true);
    setEroare(mesaj);
  }

  // Firma se cauta singura in ANAF cand CUI-ul trece cifra de control: un clic mai putin.
  function schimbaCui(valoare: string) {
    setCui(valoare);
    setFirma(null);
    setEroare(null);
    setManual(false);
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
        const raspuns = (await res.json().catch(() => ({}))) as FirmaGasita & { error?: string };
        // Omul a scris intre timp alt CUI: raspunsul asta nu mai e al lui.
        if (cuiCurent.current !== cifre) return;
        if (res.ok && raspuns.business_name) setFirma(raspuns);
        else if (res.status === 429) setEroare(raspuns.error ?? "Prea multe cautari. Asteapta un minut.");
        else if (res.status === 404) peMana("ANAF nu gaseste firma cu acest CUI. Verifica cifrele; daca firma e noua, completeaza datele de mana.");
        else peMana("ANAF nu raspunde acum. Completeaza datele firmei de mana.");
      } catch {
        if (cuiCurent.current === cifre) peMana("ANAF nu raspunde acum. Completeaza datele firmei de mana.");
      } finally {
        if (cuiCurent.current === cifre) setCauta(false);
      }
    }, 400);
  }

  const cuiGresit = normalizeCui(cui).length >= 2 && !isValidCui(cui);
  const gata = isValidCui(cui) && (!!firma || (manual && manualaCompleta(date)));

  async function continua() {
    if (!gata) return;
    setTrimite(true); setEroare(null);
    // Si cand ANAF a dat firma, ea pleaca si ca rezerva: daca serverului nu-i mai
    // raspunde ANAF, foloseste datele pe care omul tocmai le-a vazut.
    const deTrimis: Required<FirmaManuala> = firma
      ? { nume: firma.business_name, regCom: firma.reg_com ?? "", adresa: firma.address ?? "", oras: firma.city ?? "", judet: firma.county ?? "" }
      : date;
    try {
      const { ok, date: raspuns } = await trimite(asteptare.cerere, { cui: normalizeCui(cui), manual: deTrimis });
      if (!ok) {
        if (raspuns.manual) {
          // Serverul n-a primit firma: se deschid campurile, completate cu ce stim.
          setDate(deTrimis);
          setFirma(null);
          setManual(true);
        }
        setEroare(raspuns.error ?? "Eroare la initializarea platii.");
        setTrimite(false);
        return;
      }
      onInchide(true);
      asteptare.laSucces({ url: raspuns.url!, firma: raspuns.firma });
    } catch {
      setEroare("Eroare de retea. Incearca din nou.");
      setTrimite(false);
    }
  }

  const camp = (
    cheie: keyof FirmaManuala,
    eticheta: string,
    extra: { placeholder?: string; autoComplete?: string; optional?: boolean } = {},
  ) => (
    <div>
      <label htmlFor={`factura-${cheie}`} className="block text-sm font-medium text-foreground mb-1.5">
        {eticheta}{extra.optional && <span className="text-muted-foreground font-normal"> (optional)</span>}
      </label>
      <Input
        id={`factura-${cheie}`}
        value={date[cheie]}
        onChange={(e) => setDate((d) => ({ ...d, [cheie]: e.target.value }))}
        placeholder={extra.placeholder}
        autoComplete={extra.autoComplete ?? "off"}
        disabled={trimite_}
      />
    </div>
  );

  return (
    <Dialog open onOpenChange={(deschis) => { if (!deschis && !trimite_) onInchide(false); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
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

          {manual && (
            <div className="space-y-3">
              {camp("nume", "Denumirea firmei", { placeholder: "ex: Firma Mea SRL", autoComplete: "organization" })}
              {camp("regCom", "Nr. Registrul Comertului", { placeholder: "ex: J40/1234/2024", optional: true })}
              {camp("adresa", "Adresa sediului", { placeholder: "ex: Str. Exemplu nr. 1", autoComplete: "street-address" })}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {camp("oras", "Localitatea", { autoComplete: "address-level2" })}
                <div>
                  <label htmlFor="factura-judet" className="block text-sm font-medium text-foreground mb-1.5">Judetul</label>
                  <select
                    id="factura-judet"
                    value={date.judet}
                    onChange={(e) => setDate((d) => ({ ...d, judet: e.target.value }))}
                    disabled={trimite_}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="">Alege judetul</option>
                    {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={trimite_} />}>Anuleaza</DialogClose>
          <Button onClick={continua} disabled={!gata || cauta || trimite_}>
            {trimite_ && <Loader2 className="animate-spin" />}
            Continua la plata
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
