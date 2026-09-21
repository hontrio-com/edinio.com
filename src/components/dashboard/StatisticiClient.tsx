"use client";

import { useEffect, useState } from "react";
import { BarChart2, Eye, Package, Receipt, ShoppingCart, Target, UserPlus, Users, UserCheck, Wallet, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { csvStatistici, numeFisierCsv } from "@/lib/statistici-csv";
import { concluzii } from "@/lib/statistici-concluzii";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "@/lib/utils/format";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { marimeaRandului } from "@/lib/dashboard/cifra-pe-un-rand";
import { GraficVanzari } from "@/components/dashboard/GraficVanzari";
import { HartaJudete } from "@/components/dashboard/HartaJudete";
import { StatisticiFiltre } from "@/components/dashboard/StatisticiFiltre";
import { StatisticiLive } from "@/components/dashboard/StatisticiLive";
import { StatisticiTrafic } from "@/components/dashboard/StatisticiTrafic";
import { StatisticiVanzari } from "@/components/dashboard/StatisticiVanzari";
import {
  citesteDateVanzari, crestere, intervalScris, MASURI, numeCanal, valoareTotal,
  type DateVanzari, type Granulatie, type Masura,
} from "@/lib/vanzari";
import {
  citesteCarduriSecundare, citesteDetaliuVanzari, DETALIU_GOL, paginiPeSesiune,
  rataAnulare, rataConversieSesiuni, citesteDateTrafic, sfatFaraDate,
  type DateTrafic, type DetaliuVanzari, type FelPerioadaStatistici,
  type Palnie, type PerechiCarduri, type RandJudet, type RandSursa,
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

type Fila = "prezentare" | "vanzari" | "trafic" | "live";

/** Cum se citeste granulatia aleasa de baza, in cuvintele comerciantului. */
const PE_BUCATA: Record<Granulatie, string> = {
  zi: "pe zile",
  saptamana: "pe saptamani",
  luna: "pe luni",
};

const FILE: { fila: Fila; eticheta: string }[] = [
  { fila: "prezentare", eticheta: "Prezentare" },
  { fila: "vanzari", eticheta: "Vanzari" },
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
  const [masura, setMasura] = useState<Masura>("vanzari");

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
    detaliu: DetaliuVanzari;
    secundare: PerechiCarduri;
  } | null>(null);

  const seIncarca = capeteGata && date?.cheie !== cheie;
  const vanzari = date?.vanzari ?? null;
  const trafic = date?.trafic ?? null;
  const judete = date?.judete ?? [];
  const surse = date?.surse ?? [];
  const palnie = date?.palnie ?? null;
  const detaliu = date?.detaliu ?? DETALIU_GOL;
  const secundare = date?.secundare ?? null;

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

      const [v, t, j, s, pl, dv, cs] = await Promise.all([
        supabase.rpc("vanzari_panou", { ...argPerioada, p_canal: canal || null }),
        supabase.rpc("trafic_panou", argPerioada),
        supabase.rpc("comenzi_pe_judet", { ...argPerioada, p_canal: canal || null }),
        supabase.rpc("trafic_pe_sursa", argPerioada),
        supabase.rpc("palnia_panou", argPerioada),
        supabase.rpc("vanzari_detaliu", { ...argPerioada, p_canal: canal || null }),
        supabase.rpc("carduri_secundare", { ...argPerioada, p_canal: canal || null }),
      ]);

      if (!valabil) return;
      setDate({
        cheie,
        vanzari: citesteDateVanzari(v.data),
        trafic: citesteDateTrafic(t.data),
        judete: (j.data ?? []) as RandJudet[],
        surse: (s.data ?? []) as RandSursa[],
        palnie: (pl.data?.[0] ?? null) as Palnie | null,
        detaliu: citesteDetaliuVanzari(dv.data) ?? DETALIU_GOL,
        secundare: citesteCarduriSecundare(cs.data),
      });
    })();

    return () => { valabil = false; };
  }, [businessId, perioada, deLa, panaLa, canal, custom, capeteGata, cheie]);

  function setCapete(care: "deLa" | "panaLa", v: string) {
    if (care === "deLa") setDeLa(v); else setPanaLa(v);
  }

  /*
    ⚠ BOM-ul („﻿") NU E DE PRISOS. Fara el, Excel pe Windows citeste
    fisierul ca ANSI, iar „Pled din lana merinos Carpati" iese cu diacriticele
    stricate - adica exact numele produselor, care sunt tot rostul fisierului.
  */
  function descarcaCsv() {
    if (!vanzari) return;
    const text = csvStatistici({ vanzari, trafic, detaliu, judete, perioadaScrisa, canal });
    const url = URL.createObjectURL(
      new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = numeFisierCsv("statistici", vanzari.interval.de_la, vanzari.interval.pana_la);
    a.click();
    URL.revokeObjectURL(url);
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

  const anulare = secundare ? rataAnulare(secundare.acum) : null;
  const anulareAnt = secundare ? rataAnulare(secundare.inainte) : null;

  /*
    ⚠ Se socotesc la fiecare randare, si asta e in regula: sunt cateva `if`-uri
    peste date deja aduse. Puse intr-o stare, ar fi fost inca un lucru care
    poate ramane in urma cifrelor de deasupra lor.
  */
  const sfaturi = concluzii({
    vanzari, detaliu, secundare: secundare?.acum ?? null, surse,
    palnie: palnie ? { sesiuni: palnie.sesiuni, cu_cos: palnie.cu_cos, cu_comanda: palnie.cu_comanda } : null,
  });

  const sfatGol = sfatFaraDate({ canal, perioada, numeCanal });

  const perioadaScrisa = vanzari ? intervalScris(vanzari.interval) : "";
  const anterioaraScrisa = vanzari ? intervalScris(vanzari.interval_anterior) : "";

  const vVanzari = new Intl.NumberFormat("ro-RO").format(totalV.vanzari);
  const vComenzi = new Intl.NumberFormat("ro-RO").format(totalV.comenzi);
  const vMedie = totalV.comenzi === 0 ? "-" : new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(medie);
  const vConversie = conversie === null ? "-" : `${conversie.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}`;
  const vVizitatori = new Intl.NumberFormat("ro-RO").format(trafic?.total.vizitatori ?? 0);
  const vSesiuni = new Intl.NumberFormat("ro-RO").format(trafic?.total.sesiuni ?? 0);
  const vPagini = pagini === null ? "-" : pagini.toLocaleString("ro-RO", { maximumFractionDigits: 1 });
  const vAfisari = new Intl.NumberFormat("ro-RO").format(trafic?.total.afisari ?? 0);
  const vNoi = new Intl.NumberFormat("ro-RO").format(secundare?.acum.clienti_noi ?? 0);
  const vRecurenti = new Intl.NumberFormat("ro-RO").format(secundare?.acum.clienti_recurenti ?? 0);
  const vBucati = new Intl.NumberFormat("ro-RO").format(secundare?.acum.bucati ?? 0);
  const vAnulare = anulare === null ? "-" : anulare.toLocaleString("ro-RO", { maximumFractionDigits: 2 });

  /*
   * ⚠⚠ O SINGURA MARIME PENTRU TOATE CARDURILE PAGINII, data de cea mai lunga
   * cifra. Lasata pe seama fiecarui card, „1.234.567 lei" ar fi scazut singur
   * langa „12" ramas urias, si cutiile n-ar mai fi aratat ca un set — vezi
   * `marimeaRandului`. Cele trei grile de aici au aceleasi coloane si stau una
   * sub alta, deci o singura marime le tine pe toate.
   *
   * ⚠ Unitatile intra si ele in socoteala: se scriu langa cifra, deci tin latime.
   */
  const marimeCifre = marimeaRandului([
    { valoare: vVanzari, unitate: "lei" }, vComenzi,
    { valoare: vMedie, unitate: "lei" }, { valoare: vConversie, unitate: "%" },
    vVizitatori, vSesiuni, vPagini, vAfisari,
    vNoi, vRecurenti, { valoare: vBucati, unitate: "buc." }, vAnulare,
  ]);

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
          descarca={descarcaCsv} poateDescarca={!seIncarca && vanzari !== null}
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
              {!seIncarca && sfaturi.length > 0 && (
                <ul className="space-y-2">
                  {sfaturi.map((c) => (
                    <li
                      key={c.cheie}
                      className={cn(
                        "flex gap-2.5 rounded-xl px-4 py-3 text-sm ring-1",
                        c.ton === "rau" ? "bg-destructive/5 text-foreground ring-destructive/20"
                          : c.ton === "bun" ? "bg-primary/5 text-foreground ring-primary/20"
                          : "bg-muted/50 text-foreground ring-foreground/10",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full",
                          c.ton === "rau" ? "bg-destructive" : c.ton === "bun" ? "bg-primary" : "bg-muted-foreground/50",
                        )}
                      />
                      {c.text}
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <CardStatistica marime={marimeCifre}
                  label="Vanzari"
                  /* ⚠ Cifra si unitatea SEPARAT, ca pe panou: trecute impreuna,
                     „34.864,17 lei" nu incape pe un rand la 44 de pixeli si se
                     rupe, cu „lei" cazut pe randul urmator. */
                  value={vVanzari}
                  unit="lei"
                  icon={Wallet}
                  empty={totalV.vanzari === 0}
                  {...deltaProps(crestere(totalV.vanzari, totalVant.vanzari), comparatie, formatPrice(totalVant.vanzari))}
                  explicatie={`Cat au platit clientii pentru comenzile din perioada aleasa, cu TVA si transport incluse. Nu intra comenzile anulate sau rambursate.${comparatie ? ` Se compara cu ${anterioaraScrisa}.` : ""}`}
                />
                <CardStatistica marime={marimeCifre}
                  label="Comenzi"
                  value={vComenzi}
                  icon={ShoppingCart}
                  empty={totalV.comenzi === 0}
                  {...deltaProps(crestere(totalV.comenzi, totalVant.comenzi), comparatie, String(totalVant.comenzi))}
                  explicatie="Cate comenzi au intrat in perioada aleasa, fara cele anulate sau rambursate."
                />
                <CardStatistica marime={marimeCifre}
                  label="Valoare medie comanda"
                  value={vMedie}
                  unit={totalV.comenzi === 0 ? undefined : "lei"}
                  icon={Receipt}
                  empty={totalV.comenzi === 0}
                  {...deltaProps(crestere(medie, medieAnt), comparatie, formatPrice(medieAnt))}
                  explicatie="Vanzarile perioadei impartite la numarul de comenzi. Se imparte suma la numar, nu se face media mediilor pe zile."
                />
                <CardStatistica marime={marimeCifre}
                  label="Rata de conversie"
                  value={vConversie}
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
                <CardStatistica marime={marimeCifre}
                  label="Vizitatori"
                  value={vVizitatori}
                  icon={Users}
                  empty={(trafic?.total.vizitatori ?? 0) === 0}
                  {...deltaProps(crestere(trafic?.total.vizitatori ?? 0, trafic?.total_anterior.vizitatori ?? 0), comparatie, String(trafic?.total_anterior.vizitatori ?? 0))}
                  explicatie={"Oameni distincti, numarati PE ZI si insumati: cine revine in alta zi se numara din nou. "
                    + "Asa masuram fara sa punem niciun cookie in browserul vizitatorului."}
                />
                <CardStatistica marime={marimeCifre}
                  label="Sesiuni"
                  value={vSesiuni}
                  icon={Eye}
                  empty={(trafic?.total.sesiuni ?? 0) === 0}
                  {...deltaProps(crestere(trafic?.total.sesiuni ?? 0, trafic?.total_anterior.sesiuni ?? 0), comparatie, String(trafic?.total_anterior.sesiuni ?? 0))}
                  explicatie="O vizita, cu tot ce face omul in ea. Se incheie dupa 30 de minute fara nicio miscare."
                />
                <CardStatistica marime={marimeCifre}
                  label="Pagini pe sesiune"
                  value={vPagini}
                  icon={BarChart2}
                  empty={pagini === null}
                  {...deltaProps(pagini !== null && paginiAnt !== null ? crestere(pagini, paginiAnt) : null, comparatie, paginiAnt === null ? "-" : paginiAnt.toLocaleString("ro-RO", { maximumFractionDigits: 1 }))}
                  explicatie="Cate pagini deschide, in medie, o vizita. Cifra mica inseamna ca oamenii nu gasesc ce cauta."
                />
                <CardStatistica marime={marimeCifre}
                  label="Afisari de pagina"
                  value={vAfisari}
                  icon={Eye}
                  empty={(trafic?.total.afisari ?? 0) === 0}
                  {...deltaProps(crestere(trafic?.total.afisari ?? 0, trafic?.total_anterior.afisari ?? 0), comparatie, String(trafic?.total_anterior.afisari ?? 0))}
                  explicatie={"De cate ori s-a deschis o pagina a magazinului. Aceasta era, pana acum, cifra aratata drept „vizitatori activi”."}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <CardStatistica marime={marimeCifre}
                  label="Clienti noi"
                  value={vNoi}
                  icon={UserPlus}
                  empty={(secundare?.acum.clienti_noi ?? 0) === 0}
                  {...deltaProps(crestere(secundare?.acum.clienti_noi ?? 0, secundare?.inainte.clienti_noi ?? 0), comparatie, String(secundare?.inainte.clienti_noi ?? 0))}
                  explicatie={"Cumparatori a caror PRIMA comanda din magazin cade in perioada aleasa. "
                    + "Se judeca pe toata istoria, nu pe fereastra: altfel, cu cat alegeai o perioada mai scurta, "
                    + "cu atat ti-ar fi aratat mai multi „clienti noi”."}
                />
                <CardStatistica marime={marimeCifre}
                  label="Clienti care revin"
                  value={vRecurenti}
                  icon={UserCheck}
                  empty={(secundare?.acum.clienti_recurenti ?? 0) === 0}
                  {...deltaProps(crestere(secundare?.acum.clienti_recurenti ?? 0, secundare?.inainte.clienti_recurenti ?? 0), comparatie, String(secundare?.inainte.clienti_recurenti ?? 0))}
                  explicatie="Cumparatori care mai comandasera si inainte de perioada asta. Clientul e adresa de email: comenzile fara email nu se numara la niciuna dintre cele doua cifre."
                />
                <CardStatistica marime={marimeCifre}
                  label="Produse vandute"
                  value={vBucati}
                  unit="buc."
                  icon={Package}
                  empty={(secundare?.acum.bucati ?? 0) === 0}
                  {...deltaProps(crestere(secundare?.acum.bucati ?? 0, secundare?.inainte.bucati ?? 0), comparatie, String(secundare?.inainte.bucati ?? 0))}
                  explicatie="Cate bucati au plecat, adunate din liniile comenzilor. O comanda cu trei perne se numara ca trei."
                />
                <CardStatistica marime={marimeCifre}
                  label="Rata de anulare"
                  value={vAnulare}
                  unit={anulare === null ? undefined : "%"}
                  icon={XCircle}
                  empty={anulare === null}
                  susEBine={false}
                  {...deltaProps(
                    anulare !== null && anulareAnt !== null ? crestere(anulare, anulareAnt) : null,
                    comparatie,
                    anulareAnt === null ? "-" : `${anulareAnt.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%`,
                  )}
                  explicatie={"Comenzi anulate / toate comenzile intrate x 100. "
                    + "Numitorul le cuprinde si pe cele anulate: impartite la cele ramase, "
                    + "un magazin cu 10 comenzi din care 5 anulate ar fi aratat „100%”. "
                    + "⚠ Aici, o crestere e o veste proasta."}
                />
              </div>

              <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="font-semibold text-foreground">
                    {MASURI.find((m) => m.masura === masura)?.eticheta ?? "Vanzari"}
                  </h2>
                  {/*
                    ⚠ SCRIE PE CE SE GRUPEAZA, fiindca nu e mereu pe zile. Titlul
                    era „Vanzari pe zile" oricat de lunga era perioada, dar baza
                    trece la saptamani peste 92 de zile si la luni peste 400: pe
                    „Anul acesta", fiecare punct aduna o saptamana intreaga, si
                    scria dedesubt ca ar fi o zi.
                  */}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {perioadaScrisa}
                    {vanzari && ` · ${PE_BUCATA[vanzari.granulatie]}`}
                    {comparatie && anterioaraScrisa && ` · comparat cu ${anterioaraScrisa}`}
                  </p>
                  <div className="mt-3 flex gap-0.5 rounded-xl bg-muted p-1">
                    {MASURI.map((m) => (
                      <button
                        key={m.masura}
                        type="button"
                        onClick={() => setMasura(m.masura)}
                        className={cn(
                          "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                          masura === m.masura
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {m.eticheta}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-5 py-5">
                  {seIncarca || !vanzari ? (
                    <div className="h-56 animate-pulse rounded-xl bg-muted" />
                  ) : vanzari.total.comenzi === 0 ? (
                    <div className="flex h-56 flex-col items-center justify-center gap-1 px-4 text-center">
                      <p className="text-sm text-foreground">Nu ai primit comenzi in perioada asta.</p>
                      <p className="text-xs text-muted-foreground">{sfatGol}</p>
                    </div>
                  ) : (
                    <GraficVanzari date={vanzari} masura={masura} comparatie={comparatie} />
                  )}
                </div>
              </div>

              <HartaJudete
                sfatGol={sfatGol}
                judete={judete}
                svgContent={svgContent}
                primaryColor={primaryColor}
                perioadaScrisa={perioadaScrisa}
              />
            </>
          )}

          {fila === "vanzari" && (
            seIncarca && !date
              ? <div className="h-64 animate-pulse rounded-xl bg-muted" />
              : <StatisticiVanzari date={detaliu} perioadaScrisa={perioadaScrisa} sfatGol={sfatGol} />
          )}

          {fila === "trafic" && (
            seIncarca && surse.length === 0
              ? <div className="h-64 animate-pulse rounded-xl bg-muted" />
              : <StatisticiTrafic surse={surse} palnie={palnie} perioadaScrisa={perioadaScrisa} sfatGol={sfatGol} />
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
