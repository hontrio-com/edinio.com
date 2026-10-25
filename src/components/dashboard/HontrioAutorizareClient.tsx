"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Lock, X } from "lucide-react";
import { aprobaHontrio, refuzaHontrio } from "@/lib/actions/hontrio.actions";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";

/**
 * Ecranul de aprobare: ce cere Hontrio, ce NU primeste, si cele doua butoane.
 *
 * ⚠ LISTA DE AICI E O PROMISIUNE FACUTA COMERCIANTULUI, nu o descriere de marketing. Ce scrie ca nu
 * pleaca (datele cumparatorilor, orice scriere) e exact ce rutele `/api/hontrio/v1/*` nu dau. Cine
 * adauga un camp acolo, il adauga si aici.
 */

const CE_CITESTE: { titlu: string; detaliu: string }[] = [
  { titlu: "Datele magazinului", detaliu: "numele, adresa site-ului, moneda și conturile Google legate deja (Merchant Center, Google Ads, Analytics)" },
  { titlu: "Catalogul", detaliu: "produsele, variantele, prețurile, stocul și imaginile, exact cum pleacă la Google" },
  { titlu: "Comenzile", detaliu: "produsele vândute, sumele, starea comenzii și de unde a venit cumpărătorul (campanie, clic din reclamă)" },
];

const CE_NU_PRIMESTE = [
  "numele, telefonul, emailul sau adresa cumpărătorilor",
  "parolele și cheile integrărilor tale",
  "dreptul de a modifica ceva în magazin",
];

export function HontrioAutorizareClient({
  numeMagazin, dejaConectat, gazdaHontrio,
}: {
  numeMagazin: string;
  dejaConectat: boolean;
  /** Unde se intoarce omul dupa raspuns (`hontrio.com`). Se arata, ca sa nu fie o surpriza. */
  gazdaHontrio: string;
}) {
  const [inLucru, setInLucru] = useState<"aproba" | "refuza" | null>(null);

  async function aproba() {
    setInLucru("aproba");
    const rez = await aprobaHontrio();
    if ("error" in rez) {
      toast.error(rez.error);
      setInLucru(null);
      return;
    }
    /* ⚠ Butoanele raman oprite pana pleaca documentul: un al doilea clic ar fi cerut un al doilea cod. */
    window.location.assign(rez.catre);
  }

  async function refuza() {
    setInLucru("refuza");
    const rez = await refuzaHontrio();
    window.location.assign(rez.catre);
  }

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <h2 className="text-base font-semibold text-foreground">
          Hontrio cere acces la magazinul <span className="whitespace-nowrap">„{numeMagazin}”</span>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hontrio conduce campaniile tale Google Ads. Ca să știe ce produse să promoveze și ce vânzări au adus reclamele,
          are nevoie să citească:
        </p>

        <ul className="mt-4 space-y-3">
          {CE_CITESTE.map((c) => (
            <li key={c.titlu} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success/10">
                <Check className="h-3.5 w-3.5 text-success" />
              </span>
              <span className="text-sm text-foreground">
                <span className="font-medium">{c.titlu}</span>
                <span className="text-muted-foreground">: {c.detaliu}.</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-lg bg-muted/40 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Hontrio nu primește
          </p>
          <ul className="mt-2 space-y-1.5">
            {CE_NU_PRIMESTE.map((t) => (
              <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                <X className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      {dejaConectat && (
        <Callout variant="warning">
          Magazinul este deja conectat la Hontrio. Dacă permiți accesul acum, legătura veche se oprește și o înlocuiește
          aceasta.
        </Callout>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          După răspuns te întorci la {gazdaHontrio}. Poți opri accesul oricând din Integrări → Hontrio.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refuza} disabled={inLucru !== null}>
            {inLucru === "refuza" && <Loader2 className="animate-spin" />}
            Anulează
          </Button>
          <Button onClick={aproba} disabled={inLucru !== null}>
            {inLucru === "aproba" && <Loader2 className="animate-spin" />}
            Permite accesul
          </Button>
        </div>
      </div>
    </div>
  );
}
