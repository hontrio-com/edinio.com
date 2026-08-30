"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getAboutYouCarriers, saveAboutYouCarrierMap, saveAboutYouReturBidirectional,
} from "@/lib/actions/aboutyou.actions";
import { CURIERI_ABOUTYOU } from "@/lib/aboutyou/curieri";
import type { AboutYouCarrier } from "@/lib/aboutyou/types";

/*
 * Lista vine din `lib/aboutyou/curieri`, aceeasi pe care o citeste `shipOrderNow`.
 *
 * Scrisa de mana aici, rămânea in urma: sase curieri (Packeta, SmartShip, Shipo,
 * FedEx, UPS, DHL) lipseau, iar lipsa nu da nicio eroare — expedierea cade pe
 * „Mapează curierul la un carrier About You în setări", un mesaj care trimite omul
 * catre un control care nu exista pe ecran. S-a intamplat de sase ori, in ciuda
 * comentariului de avertizare.
 */
const COURIERS = CURIERI_ABOUTYOU.map((c) => ({ code: c.cod, label: c.eticheta }));

export function AboutYouCarrierMapping({
  businessId, carrierMap, returBidirectional,
}: {
  businessId: string;
  carrierMap: Record<string, string>;
  /** Curierii la care comerciantul a declarat ca AWB-ul de tur e valabil si la retur. */
  returBidirectional: Record<string, boolean>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [carriers, setCarriers] = useState<AboutYouCarrier[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getAboutYouCarriers(businessId);
      if (!alive) return;
      if (!("error" in res)) setCarriers(res.carriers);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [businessId]);

  // Dedupe carriers by key (the same key repeats across country_code rows).
  const byKey = new Map<string, AboutYouCarrier>();
  for (const c of carriers) if (!byKey.has(c.key)) byKey.set(c.key, c);
  const options = [...byKey.values()];
  /*
   * Carrierele romanesti se scot in fata, si se numara.
   *
   * Lista lor e pe TARA, iar pentru Romania — probat pe API-ul real — exista UN
   * SINGUR carrier: `FAN_RO`. Ecranul insira 17 curieri Edinio, deci comerciantul
   * care expediaza cu Cargus sau Sameday cauta zadarnic si sfarseste prin a alege
   * ceva strain, adica prin a raporta la About You un curier cu care coletul nu
   * pleaca. E o limitare a lor, dar taciuta de noi devine defectul nostru.
   */
  const romanesti = options.filter((o) => o.country_code === "RO");
  const optiuniSortate = [...romanesti, ...options.filter((o) => o.country_code !== "RO")];

  const setRetur = (courierCode: string, valoare: boolean) => {
    startTransition(async () => {
      const res = await saveAboutYouReturBidirectional(businessId, courierCode, valoare);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(valoare
        ? "Am notat: la acest curier AWB-ul e valabil și la retur."
        : "Am notat: la acest curier e nevoie de un AWB de retur separat.");
      router.refresh();
    });
  };

  const setMapping = (courierCode: string, carrierKey: string) => {
    startTransition(async () => {
      const res = await saveAboutYouCarrierMap(businessId, courierCode, carrierKey || null);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Curier mapat.");
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-foreground mb-1">Mapare curieri</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Leagă fiecare curier Edinio de un carrier About You. Când generezi AWB-ul pentru o comandă About You, tracking-ul se trimite automat cu carrier-ul mapat.
      </p>

      {loaded && options.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 mb-4">
          {romanesti.length === 0 ? (
            <>About You nu are niciun carrier pentru România în contul tău. Fără unul, expedierile nu pot fi
            raportate corect: întreabă-ți persoana de contact de la About You.</>
          ) : (
            <>About You acceptă pentru România {romanesti.length === 1 ? "un singur carrier" : `${romanesti.length} carriere`}:{" "}
            <span className="font-semibold">{romanesti.map((o) => o.carrier_name || o.key).join(", ")}</span>.
            Dacă expediezi cu alt curier, nu există corespondent — alege-l totuși pe cel românesc, ca About You
            să primească un AWB pe care îl poate urmări, sau cere-le să adauge curierul tău.</>
          )}
        </div>
      )}

      {!loaded ? (
        <p className="text-sm text-muted-foreground">Se încarcă curierii...</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nu am putut încărca lista de carriere About You. Reîncearcă.</p>
      ) : (
        <div className="divide-y divide-border">
          {COURIERS.map((c) => (
            <div key={c.code} className="py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{c.label}</p>
                {/*
                  * ⚠ Bifa e o DECLARATIE, nu o comoditate. About You cere un `return_tracking_key`
                  * separat de cel de tur, deci le tine drept doua documente. Daca la curierul asta
                  * sunt acelasi, stie contractul comerciantului cu el — nu stim noi, si nu ghicim.
                  * Nebifat, expedierea se opreste cu un mesaj care trimite exact aici.
                  */}
                <label className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={returBidirectional[c.code] === true}
                    onChange={(e) => setRetur(c.code, e.target.checked)}
                    disabled={pending}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  Același AWB e valabil și pentru retur
                </label>
              </div>
              <select
                value={carrierMap[c.code] ?? ""}
                onChange={(e) => setMapping(c.code, e.target.value)}
                disabled={pending}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm max-w-[60%]"
              >
                <option value="">Nemapat</option>
                {optiuniSortate.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.display_label || o.carrier_name || o.key}{o.country_code === "RO" ? " · România" : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
