"use client";

import { useEffect, useState } from "react";
import { BarChart2, Eye, Receipt, ShoppingCart, Target, Users, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "@/lib/utils/format";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { GraficVanzari } from "@/components/dashboard/GraficVanzari";
import { HartaJudete } from "@/components/dashboard/HartaJudete";
import { StatisticiFiltre } from "@/components/dashboard/StatisticiFiltre";
import { StatisticiLive } from "@/components/dashboard/StatisticiLive";
import { StatisticiTrafic, type Palnie, type RandSursa } from "@/components/dashboard/StatisticiTrafic";
import {
  citesteDateVanzari, crestere, intervalScris, valoareTotal, type DateVanzari,
} from "@/lib/vanzari";
import {
  citesteDateTrafic, paginiPeSesiune, rataConversieSesiuni,
  type DateTrafic, type FelPerioadaStatistici, type RandJudet,
} from "@/lib/statistici";

/*
  ═══════════════════════════════════════════════════════════════════════════
  PAGINA STATISTICI
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ TOATE CIFRELE ASCULTA DE ACELEASI FILTRE. Pana acum, cele trei butoane de
  perioada miscau doar partea de sus: harta arata tot istoricul, iar randul de
  jos repeta cifrele de sus. Aici, perioada si canalul intra in fiecare cerere.

  ⚠ RATA DE CONVERSIE E ALTA CIFRA DECAT INAINTE, si asta trebuie spus:
  se imparte la SESIUNI, nu la afisari de pagina. Un om care vede patru pagini
  si cumpara o data facea rata sa arate de patru ori mai mica decat e.
*/

type Fila = "prezentare" | "trafic" | "live";

const FILE: { fila: Fila; eticheta: string }[] = [
  { fila: "prezentare", eticheta: "Prezentare" },
  { fila: "trafic", eticheta: "Trafic" },
  { fila: "live", eticheta: "Live" },
];

export function StatisticiClient({
  businessId, svgContent, primaryColor, canale,
}: {
  businessId: string;
  svgContent: string;
  primaryColor: string;
  canale: { canal: string; comenzi: number }[];
}) {
  const [fila, setFila] = useState<Fila>("prezentare");
  const [perioada, setPerioada] = useState<FelPerioadaStatistici>("30z");
  const [deLa, setDeLa] = useState("");
  const [panaLa, setPanaLa] = useState("");
  const [canal, setCanal] = useState("");
  const [comparatie, setComparatie] = useState(true);

  /*
    ⚠ DATELE ISI POARTA CU ELE FILTRELE PENTRU CARE AU FOST CERUTE.

    Asa, „se incarca" se DEDUCE („ce am nu e pentru ce vad acum"), in loc sa fie
    inca o stare pusa cu mana dintr-un efect - ceea ce inseamna randari in
    cascada si o regula de lint incalcata. Si mai are un castig: cifrele vechi
    nu clipesc, raman pe ecran pana sosesc cele noi.
  */
  const custom = perioada === "custom";
  const capeteGata = !custom || (deLa !== "" && panaLa !== "");
  const cheie = JSON.stringify({ perioada, deLa: custom ? deLa : "", panaLa: custom ? panaLa : "", canal });

  const [date, setDate] = useState<{
    cheie: string;
    vanzari: DateVanzari | null;
    trafic: DateTrafic | null;
    judete: RandJudet[];
    surse: RandSursa[];
    palnie: Palnie | null;
  } | null>(null);

  const seIncarca = capeteGata && date?.cheie !== cheie;
  const vanzari = date?.vanzari ?? null;
  const trafic = date?.trafic ?? null;
  const judete = date?.judete ?? [];
  const surse = date?.surse ?? [];
  const palnie = date?.palnie ?? null;

  useEffect(() => {
    if (!capeteGata) return;
    let valabil = true;

    void (async () => {
      const supabase = createClient();
      const argPerioada = {
        p_business: businessId,
        p_fel: perioada,
        p_de_la: custom ? deLa : null,
        p_pana_la: custom ? panaLa : null,
      };

      const [v, t, j, s, pl] = await Promise.all([
        supabase.rpc("vanzari_panou", { ...argPerioada, p_canal: canal || null }),
        supabase.rpc("trafic_panou", argPerioada),
        supabase.rpc("comenzi_pe_judet", { ...argPerioada, p_canal: canal || null }),
        supabase.rpc("trafic_pe_sursa", argPerioada),
        supabase.rpc("palnia_panou", argPerioada),
      ]);

      if (!valabil) return;
      setDate({
        cheie,
        vanzari: citesteDateVanzari(v.data),
        trafic: citesteDateTrafic(t.data),
        judete: (j.data ?? []) as RandJudet[],
        surse: (s.data ?? []) as RandSursa[],
        palnie: (pl.data?.[0] ?? null) as Palnie | null,
      });
    })();

    return () => { valabil = false; };
  }, [businessId, perioada, deLa, panaLa, canal, custom, capeteGata, cheie]);

  function setCapete(care: "deLa" | "panaLa", v: string) {
    if (care === "deLa") setDeLa(v); else setPanaLa(v);
  }

  /* ── Cifrele ────────────────────────────────────────────────────────────── */
  const totalV = vanzari?.total ?? { vanzari: 0, comenzi: 0 };
  const totalVant = vanzari?.total_anterior ?? { vanzari: 0, comenzi: 0 };
  const medie = valoareTotal(totalV, "medie");
  const medieAnt = valoareTotal(totalVant, "medie");
  const conversie = trafic ? rataConversieSesiuni(trafic.total) : null;
  const conversieAnt = trafic ? rataConversieSesiuni(trafic.total_anterior) : null;
  const pagini = trafic ? paginiPeSesiune(trafic.total) : null;
  const paginiAnt = trafic ? paginiPeSesiune(trafic.total_anterior) : null;

  const perioadaScrisa = vanzari ? intervalScris(vanzari.interval) : "";
  const anterioaraScrisa = vanzari ? intervalScris(vanzari.interval_anterior) : "";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Statistici</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Cum merge magazinul tau{perioadaScrisa && `, ${perioadaScrisa}`}
          </p>
        </div>
        <StatisticiFiltre
          perioada={perioada} setPerioada={setPerioada}
          deLa={deLa} panaLa={panaLa} setCapete={setCapete}
          canal={canal} setCanal={setCanal} canale={canale}
          comparatie={comparatie} setComparatie={setComparatie}
        />
      </header>

      <div className="flex gap-0.5 rounded-xl bg-muted p-1">
        {FILE.map((f) => (
          <button
            key={f.fila}
            type="button"
            onClick={() => setFila(f.fila)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              fila === f.fila ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.eticheta}
          </button>
        ))}
      </div>

      {fila === "live" ? (
        <StatisticiLive businessId={businessId} />
      ) : !capeteGata ? (
        <p className="rounded-xl bg-card px-5 py-10 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          Alege amandoua capetele perioadei.
        </p>
      ) : (
        <>
          {fila === "prezentare" && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <CardStatistica
                  label="Vanzari"
                  /* ⚠ Cifra si unitatea SEPARAT, ca pe panou: trecute impreuna,
                     „34.864,17 lei" nu incape pe un rand la 44 de pixeli si se
                     rupe, cu „lei" cazut pe randul urmator. */
                  value={new Intl.NumberFormat("ro-RO").format(totalV.vanzari)}
                  unit="lei"
                  icon={Wallet}
                  empty={totalV.vanzari === 0}
                  {...deltaProps(crestere(totalV.vanzari, totalVant.vanzari), comparatie, formatPrice(totalVant.vanzari))}
                  explicatie={`Cat au platit clientii pentru comenzile din perioada aleasa, cu TVA si transport incluse. Nu intra comenzile anulate sau rambursate.${comparatie ? ` Se compara cu ${anterioaraScrisa}.` : ""}`}
                />
                <CardStatistica
                  label="Comenzi"
                  value={new Intl.NumberFormat("ro-RO").format(totalV.comenzi)}
                  icon={ShoppingCart}
                  empty={totalV.comenzi === 0}
                  {...deltaProps(crestere(totalV.comenzi, totalVant.comenzi), comparatie, String(totalVant.comenzi))}
                  explicatie="Cate comenzi au intrat in perioada aleasa, fara cele anulate sau rambursate."
                />
                <CardStatistica
                  label="Valoare medie comanda"
                  value={totalV.comenzi === 0 ? "-" : new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(medie)}
                  unit={totalV.comenzi === 0 ? undefined : "lei"}
                  icon={Receipt}
                  empty={totalV.comenzi === 0}
                  {...deltaProps(crestere(medie, medieAnt), comparatie, formatPrice(medieAnt))}
                  explicatie="Vanzarile perioadei impartite la numarul de comenzi. Se imparte suma la numar, nu se face media mediilor pe zile."
                />
                <CardStatistica
                  label="Rata de conversie"
                  value={conversie === null ? "-" : `${conversie.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}`}
                  unit={conversie === null ? undefined : "%"}
                  icon={Target}
                  empty={conversie === null}
                  {...deltaProps(
                    conversie !== null && conversieAnt !== null ? crestere(conversie, conversieAnt) : null,
                    comparatie,
                    conversieAnt === null ? "-" : `${conversieAnt.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%`,
                  )}
                  explicatie={"Sesiuni cu cel putin o comanda / total sesiuni x 100. "
                    + "⚠ Pana acum se imparteau comenzile la AFISARI de pagina, iar un om care vedea patru pagini si cumpara o data facea rata sa para de patru ori mai mica. "
                    + "O sesiune inseamna o vizita, cu 30 de minute de inactivitate intre ele."}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <CardStatistica
                  label="Vizitatori"
                  value={new Intl.NumberFormat("ro-RO").format(trafic?.total.vizitatori ?? 0)}
                  icon={Users}
                  empty={(trafic?.total.vizitatori ?? 0) === 0}
                  {...deltaProps(crestere(trafic?.total.vizitatori ?? 0, trafic?.total_anterior.vizitatori ?? 0), comparatie, String(trafic?.total_anterior.vizitatori ?? 0))}
                  explicatie={"Oameni distincti, numarati PE ZI si insumati: cine revine in alta zi se numara din nou. "
                    + "Asa masuram fara sa punem niciun cookie in browserul vizitatorului."}
                />
                <CardStatistica
                  label="Sesiuni"
                  value={new Intl.NumberFormat("ro-RO").format(trafic?.total.sesiuni ?? 0)}
                  icon={Eye}
                  empty={(trafic?.total.sesiuni ?? 0) === 0}
                  {...deltaProps(crestere(trafic?.total.sesiuni ?? 0, trafic?.total_anterior.sesiuni ?? 0), comparatie, String(trafic?.total_anterior.sesiuni ?? 0))}
                  explicatie="O vizita, cu tot ce face omul in ea. Se incheie dupa 30 de minute fara nicio miscare."
                />
                <CardStatistica
                  label="Pagini pe sesiune"
                  value={pagini === null ? "-" : pagini.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}
                  icon={BarChart2}
                  empty={pagini === null}
                  {...deltaProps(pagini !== null && paginiAnt !== null ? crestere(pagini, paginiAnt) : null, comparatie, paginiAnt === null ? "-" : paginiAnt.toLocaleString("ro-RO", { maximumFractionDigits: 1 }))}
                  explicatie="Cate pagini deschide, in medie, o vizita. Cifra mica inseamna ca oamenii nu gasesc ce cauta."
                />
                <CardStatistica
                  label="Afisari de pagina"
                  value={new Intl.NumberFormat("ro-RO").format(trafic?.total.afisari ?? 0)}
                  icon={Eye}
                  empty={(trafic?.total.afisari ?? 0) === 0}
                  {...deltaProps(crestere(trafic?.total.afisari ?? 0, trafic?.total_anterior.afisari ?? 0), comparatie, String(trafic?.total_anterior.afisari ?? 0))}
                  explicatie={"De cate ori s-a deschis o pagina a magazinului. Aceasta era, pana acum, cifra aratata drept „vizitatori activi”."}
                />
              </div>

              <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="font-semibold text-foreground">Vanzari pe zile</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {perioadaScrisa}{comparatie && anterioaraScrisa && ` · comparat cu ${anterioaraScrisa}`}
                  </p>
                </div>
                <div className="px-5 py-5">
                  {seIncarca || !vanzari ? (
                    <div className="h-56 animate-pulse rounded-xl bg-muted" />
                  ) : vanzari.total.comenzi === 0 ? (
                    <p className="flex h-56 items-center justify-center text-center text-sm text-muted-foreground">
                      Nu ai primit comenzi in perioada asta.
                    </p>
                  ) : (
                    <GraficVanzari date={vanzari} masura="vanzari" comparatie={comparatie} />
                  )}
                </div>
              </div>

              <HartaJudete
                judete={judete}
                svgContent={svgContent}
                primaryColor={primaryColor}
                perioadaScrisa={perioadaScrisa}
              />
            </>
          )}

          {fila === "trafic" && (
            seIncarca && surse.length === 0
              ? <div className="h-64 animate-pulse rounded-xl bg-muted" />
              : <StatisticiTrafic surse={surse} palnie={palnie} perioadaScrisa={perioadaScrisa} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Cele trei insusiri de crestere ale unui card, dintr-un singur loc.
 *
 * ⚠ Cand comparatia e stinsa, cardul nu arata nici procent, nici „fata de":
 * un procent ramas pe ecran cu comparatia oprita ar fi o cifra fara perioada.
 */
function deltaProps(pct: number | null, comparatie: boolean, valoareAnterioara: string) {
  if (!comparatie || pct === null) return {};
  return {
    delta: `${Math.abs(pct).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`,
    deltaDir: (pct >= 0 ? "up" : "down") as "up" | "down",
    deltaCaption: `fata de ${valoareAnterioara}`,
  };
}
