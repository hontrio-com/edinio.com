"use client";

import { cn } from "@/lib/utils/cn";
import { Bani } from "@/components/dashboard/Bani";
import type { Palnie, RandSursa } from "@/lib/statistici";

/*
  ═══════════════════════════════════════════════════════════════════════════
  FILA TRAFIC: de unde vin oamenii si unde ii pierzi
  ═══════════════════════════════════════════════════════════════════════════

  Pana acum, pagina arata doar cate vizite vin din fiecare sursa. Atat nu
  raspunde la intrebarea care conteaza: „ce sursa imi aduce bani?". Un canal cu
  800 de vizite si 2 comenzi e mai prost decat unul cu 200 de vizite si 10.

  ⚠ COMENZILE SI VENITUL SUNT ALE SESIUNII, atribuite PRIMEI surse a ei. Cine
  intra din Google, revine din Facebook si cumpara, are o singura sesiune de
  cumparare; numarata la ambele, suma surselor ar fi depasit vanzarile.
*/

const NUME_SURSA: Record<string, string> = {
  direct: "Direct", google: "Google", facebook: "Facebook",
  instagram: "Instagram", tiktok: "TikTok", other: "Alta sursa",
};

const NUME_DISPOZITIV: Record<string, string> = {
  mobile: "Mobil", desktop: "Desktop", tablet: "Tableta", necunoscut: "Necunoscut",
};

function procent(parte: number, intreg: number): string {
  if (intreg <= 0) return "-";
  return `${((parte / intreg) * 100).toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%`;
}

export function StatisticiTrafic({ surse, palnie, perioadaScrisa, sfatGol }: {
  surse: RandSursa[];
  palnie: Palnie | null;
  perioadaScrisa: string;
  sfatGol: string;
}) {
  /* Aceleasi randuri, strânse o data pe sursa si o data pe dispozitiv. */
  const peSursa = aduna(surse, (r) => NUME_SURSA[r.sursa] ?? r.sursa);
  const peDispozitiv = aduna(surse, (r) => NUME_DISPOZITIV[r.dispozitiv] ?? r.dispozitiv);
  const totalSesiuni = surse.reduce((s, r) => s + r.sesiuni, 0);

  if (totalSesiuni === 0) {
    return (
      <div className="rounded-xl bg-card px-5 py-12 text-center ring-1 ring-foreground/10">
        <p className="text-sm text-foreground">Nu exista inca trafic masurat in perioada asta.</p>
        <p className="mt-1 text-xs text-muted-foreground">{sfatGol}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {palnie && palnie.sesiuni > 0 && (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold text-foreground">Drumul pana la comanda</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {perioadaScrisa} · cate sesiuni au facut fiecare pas
            </p>
          </div>
          <div className="space-y-2 px-5 py-4">
            {[
              { eticheta: "Au intrat in magazin", valoare: palnie.sesiuni },
              { eticheta: "S-au uitat la un produs", valoare: palnie.cu_produs },
              { eticheta: "Au pus ceva in cos", valoare: palnie.cu_cos },
              { eticheta: "Au inceput finalizarea", valoare: palnie.cu_checkout },
              { eticheta: "Au comandat", valoare: palnie.cu_comanda },
            ].map((prag) => (
              <div key={prag.eticheta} className="flex items-center gap-3">
                <span className="w-24 flex-shrink-0 text-[11px] leading-tight text-muted-foreground sm:w-44 sm:text-xs">{prag.eticheta}</span>
                <div className="h-7 flex-1 overflow-hidden rounded-lg bg-muted">
                  <div
                    className="flex h-full items-center rounded-lg bg-primary/80 px-2 text-[11px] font-semibold text-white transition-all"
                    style={{ width: `${Math.max(2, (prag.valoare / palnie.sesiuni) * 100)}%` }}
                  >
                    {prag.valoare}
                  </div>
                </div>
                <span className="w-12 flex-shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:w-14 sm:text-xs">
                  {procent(prag.valoare, palnie.sesiuni)}
                </span>
              </div>
            ))}
          </div>
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            ⚠ Pragurile nu sunt neaparat in scadere: se poate adauga in cos si din lista de
            produse, fara sa fi fost deschisa pagina produsului.
          </p>
        </div>
      )}

      <Tabel titlu="Surse de trafic" perioadaScrisa={perioadaScrisa} randuri={peSursa} totalSesiuni={totalSesiuni} numeColoana="Sursa" />
      <Tabel titlu="Dispozitive" perioadaScrisa={perioadaScrisa} randuri={peDispozitiv} totalSesiuni={totalSesiuni} numeColoana="Dispozitiv" />
    </div>
  );
}

type RandAdunat = { nume: string; sesiuni: number; comenzi: number; vanzari: number };

function aduna(randuri: RandSursa[], cheie: (r: RandSursa) => string): RandAdunat[] {
  const harta = new Map<string, RandAdunat>();
  for (const r of randuri) {
    const nume = cheie(r);
    const existent = harta.get(nume) ?? { nume, sesiuni: 0, comenzi: 0, vanzari: 0 };
    existent.sesiuni += r.sesiuni;
    existent.comenzi += r.sesiuni_cu_comanda;
    existent.vanzari += Number(r.vanzari ?? 0);
    harta.set(nume, existent);
  }
  return [...harta.values()].sort((a, b) => b.sesiuni - a.sesiuni);
}

function Tabel({ titlu, perioadaScrisa, randuri, totalSesiuni, numeColoana }: {
  titlu: string;
  perioadaScrisa: string;
  randuri: RandAdunat[];
  totalSesiuni: number;
  numeColoana: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-semibold text-foreground">{titlu}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{perioadaScrisa}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] text-muted-foreground sm:text-xs">
              <th scope="col" className="px-3 py-2 font-medium sm:px-5">{numeColoana}</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium sm:px-5">Sesiuni</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium sm:px-5">Comenzi</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium sm:px-5">Conversie</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium sm:px-5">Vanzari</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {randuri.map((r) => (
              <tr key={r.nume}>
                <th scope="row" className="px-3 py-2.5 text-left font-medium text-foreground sm:px-5">
                  {r.nume}
                  <span className="block text-[11px] font-normal text-muted-foreground sm:ml-2 sm:inline sm:text-xs">
                    {procent(r.sesiuni, totalSesiuni)} din trafic
                  </span>
                </th>
                <td className="px-1.5 py-2.5 text-right text-xs tabular-nums text-muted-foreground sm:px-5 sm:text-sm">{r.sesiuni}</td>
                <td className="px-1.5 py-2.5 text-right text-xs tabular-nums text-muted-foreground sm:px-5 sm:text-sm">{r.comenzi}</td>
                <td className={cn(
                  "px-1.5 py-2.5 text-right text-xs tabular-nums sm:px-5 sm:text-sm",
                  r.comenzi > 0 ? "font-medium text-foreground" : "text-muted-foreground",
                )}>
                  {procent(r.comenzi, r.sesiuni)}
                </td>
                <td className="px-1.5 py-2.5 text-right text-xs tabular-nums text-muted-foreground sm:px-5 sm:text-sm">
                  {r.vanzari > 0 ? <Bani valoare={r.vanzari} /> : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
