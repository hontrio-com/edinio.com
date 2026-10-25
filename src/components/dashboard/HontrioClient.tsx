"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { deconecteazaHontrio } from "@/lib/actions/hontrio.actions";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { Panel } from "@/components/ui/panel";

/**
 * Starea legaturii cu Hontrio si deconectarea.
 *
 * ⚠ CONECTAREA NU PORNESTE DE AICI, ci din Hontrio: acolo isi alege omul contul in care intra
 * magazinul, iar Hontrio trebuie sa fie cel care cere (cu `state` si PKCE). Un buton „Conecteaza"
 * aici ar fi trebuit sa ghiceasca in ce cont Hontrio sa ajunga.
 */
export function HontrioClient({
  businessId, conectat, conectatLa, ultimaCitire, siteHontrio,
}: {
  businessId: string;
  conectat: boolean;
  /** Deja formatate pe server, in ora Romaniei. */
  conectatLa: string | null;
  ultimaCitire: string | null;
  siteHontrio: string;
}) {
  const router = useRouter();
  const [inLucru, setInLucru] = useState(false);

  async function deconecteaza() {
    setInLucru(true);
    const rez = await deconecteazaHontrio(businessId);
    setInLucru(false);
    if ("error" in rez) {
      toast.error(rez.error);
      return;
    }
    toast.success("Legătura cu Hontrio a fost oprită.");
    router.refresh();
  }

  if (!conectat) {
    return (
      <Panel className="p-5">
        <EtichetaStare ton="neutru" marime="mic">Neconectat</EtichetaStare>
        <p className="mt-3 text-sm text-foreground">
          Hontrio conduce campaniile tale Google Ads pe baza catalogului și a vânzărilor din Edinio.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Conectarea pornește din contul tău Hontrio: alege Edinio la integrări, iar Hontrio te aduce aici să aprobi
          accesul.
        </p>
        <a
          href={siteHontrio}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Află mai multe despre Hontrio <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Panel>
    );
  }

  return (
    <Panel className="p-5">
      <EtichetaStare ton="bun" marime="mic">Conectat</EtichetaStare>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Conectat din</dt>
          <dd className="font-medium text-foreground">{conectatLa ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ultima citire a lui Hontrio</dt>
          <dd className="font-medium text-foreground">{ultimaCitire ?? "Încă n-a citit nimic"}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">
        Hontrio citește datele magazinului, catalogul și comenzile, fără datele personale ale cumpărătorilor. Nu poate
        modifica nimic în magazin.
      </p>

      <div className="mt-5 border-t border-border pt-4">
        <ButonDeconectare
          nume="Hontrio"
          cePierzi="Hontrio nu mai poate citi nimic din magazin: catalogul și vânzările noi nu mai ajung la campaniile tale Google Ads. Campaniile deja pornite rămân în contul tău Google Ads. Ca să refaci legătura, pornești din nou conectarea din contul Hontrio."
          pending={inLucru}
          marime="default"
          onConfirma={deconecteaza}
        />
      </div>
    </Panel>
  );
}
