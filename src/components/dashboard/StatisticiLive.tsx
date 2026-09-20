"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor, Radio, ShoppingBag, ShoppingCart, Smartphone, Tablet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

/*
  ═══════════════════════════════════════════════════════════════════════════
  FILA LIVE
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ „VIZITATORI ACTIVI" NUMARA ACUM OAMENI, NU AFISARI. Pana azi, cifra era
  numarul de randuri din ultimele 5 minute: cine reincarca pagina de trei ori
  aparea ca trei vizitatori. Acum se numara vizitatori distincti (`visitor_id`).

  ⚠ Harta a plecat de aici: judetele n-au nicio legatura cu ce se intampla in
  clipa asta, iar acolo nu tinea seama de perioada aleasa. Sta in Prezentare,
  unde filtrul chiar o misca.

  ⚠ Se reimprospateaza la 20 de secunde, prin cerere, nu prin abonare in timp
  real: e mai previzibil, si o fila deschisa si uitata nu tine o legatura vie
  ore intregi.
*/

type Eveniment = {
  id: string;
  created_at: string;
  event_type: string;
  device: string | null;
  source: string | null;
  visitor_id: string | null;
};

const NUME_SURSA: Record<string, string> = {
  direct: "Direct", google: "Google", facebook: "Facebook",
  instagram: "Instagram", tiktok: "TikTok", other: "Alta sursa",
};

/** Ce s-a intamplat, scris pentru om. Totul anonim: nu exista nume, nu exista IP. */
function povesteaEvenimentului(e: Eveniment): string {
  const sursa = NUME_SURSA[e.source ?? ""] ?? e.source ?? "Direct";
  switch (e.event_type) {
    case "product_view": return `Un vizitator din ${sursa} s-a uitat la un produs`;
    case "add_to_cart": return "Un produs a fost adaugat in cos";
    case "begin_checkout": return "Cineva a inceput finalizarea comenzii";
    case "purchase": return "Comanda noua";
    default: return `Un vizitator din ${sursa} a deschis magazinul`;
  }
}

export function StatisticiLive({ businessId }: { businessId: string }) {
  const [evenimente, setEvenimente] = useState<Eveniment[]>([]);
  const [actualizatLa, setActualizatLa] = useState<Date | null>(null);

  const adu = useCallback(async () => {
    const supabase = createClient();
    const deAcum = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("site_analytics")
      .select("id, created_at, event_type, device, source, visitor_id")
      .eq("business_id", businessId)
      .gte("created_at", deAcum)
      .order("created_at", { ascending: false })
      .limit(50);
    setEvenimente((data ?? []) as Eveniment[]);
    setActualizatLa(new Date());
  }, [businessId]);

  useEffect(() => {
    void adu();
    const ceas = setInterval(() => void adu(), 20_000);
    return () => clearInterval(ceas);
  }, [adu]);

  const acum = Date.now();
  const inUltimele = (minute: number) => evenimente.filter(
    (e) => acum - new Date(e.created_at).getTime() <= minute * 60_000,
  );

  const deCinci = inUltimele(5);
  const vizitatoriActivi = new Set(deCinci.map((e) => e.visitor_id).filter(Boolean)).size;
  const cosuriActive = new Set(inUltimele(30).filter((e) => e.event_type === "add_to_cart").map((e) => e.visitor_id)).size;
  const checkouturi = new Set(inUltimele(30).filter((e) => e.event_type === "begin_checkout").map((e) => e.visitor_id)).size;
  const comenzi = inUltimele(30).filter((e) => e.event_type === "purchase").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-5 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10">
            <Radio className="h-7 w-7 text-success" />
          </div>
          {vizitatoriActivi > 0 && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
            </span>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-foreground">{vizitatoriActivi}</span>
            <span className="text-sm text-muted-foreground">
              {vizitatoriActivi === 1 ? "vizitator activ" : "vizitatori activi"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Oameni distincti in ultimele 5 minute
            {actualizatLa && ` · actualizat la ${actualizatLa.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
          </p>
        </div>
        {vizitatoriActivi > 0 && (
          <div className="rounded-full bg-success/10 px-3 py-1.5 text-xs font-bold text-success">LIVE</div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MicaCifra pictograma={ShoppingBag} eticheta="Cosuri incepute" valoare={cosuriActive} detaliu="ultimele 30 de minute" />
        <MicaCifra pictograma={ShoppingCart} eticheta="Checkout-uri incepute" valoare={checkouturi} detaliu="ultimele 30 de minute" />
        <MicaCifra pictograma={ShoppingCart} eticheta="Comenzi" valoare={comenzi} detaliu="ultimele 30 de minute" />
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">Activitate recenta</h3>
          <span className="text-xs text-muted-foreground">
            {evenimente.length} {evenimente.length === 1 ? "eveniment" : "evenimente"}
          </span>
        </div>

        {evenimente.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nimic in ultima jumatate de ora. Distribuie magazinul ca sa incepi sa vezi activitate aici.
          </p>
        ) : (
          <div className="max-h-80 divide-y divide-border overflow-y-auto">
            {evenimente.map((e) => {
              const Dispozitiv = e.device === "mobile" ? Smartphone : e.device === "tablet" ? Tablet : Monitor;
              const minute = Math.floor((acum - new Date(e.created_at).getTime()) / 60000);
              return (
                <div key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Dispozitiv className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className={cn("flex-1", e.event_type === "purchase" ? "font-semibold text-foreground" : "text-foreground")}>
                    {povesteaEvenimentului(e)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {minute === 0 ? "acum" : `acum ${minute} min`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MicaCifra({ pictograma: Pictograma, eticheta, valoare, detaliu }: {
  pictograma: typeof ShoppingBag;
  eticheta: string;
  valoare: number;
  detaliu: string;
}) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Pictograma className="h-4 w-4" />
        <span className="text-xs font-medium">{eticheta}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{valoare}</p>
      <p className="text-[11px] text-muted-foreground">{detaliu}</p>
    </div>
  );
}
