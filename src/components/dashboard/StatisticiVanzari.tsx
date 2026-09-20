"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "@/lib/utils/format";
import { Bani } from "@/components/dashboard/Bani";
import { numeCanal } from "@/lib/vanzari";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { ORDER_STATUS, type OrderStatus } from "@/lib/orders/status";
import type { DetaliuVanzari } from "@/lib/statistici";

/*
  ═══════════════════════════════════════════════════════════════════════════
  FILA VANZARI: nu CAT s-a vandut, ci CE s-a vandut
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ CIFRELE DE DEDESUBT NU SE ADUNA IN TOTAL, si de-aia nu sunt asezate ca o
  adunare. Verificat pe datele din baza: la 26 din 95 de comenzi,
  `subtotal + transport + ramburs - reduceri` nu da `total`. Comenzile de
  marketplace isi scriu `subtotal` FARA TVA, pe cand `total` e cu TVA (7110:
  270,25 x 1,21 = 327,00), iar unele comenzi din magazin poarta in total sume
  care n-au coloana lor. Cifrele vin inghetate pe comanda, din sisteme cu reguli
  diferite; o lista care se termina cu „Total" si nu iese arata ca un defect.

  ⚠ SUMA COLOANEI „VANZARI" DE LA PRODUSE NU DA NICI EA TOTALUL, si scrie si
  asta sub tabel. Liniile poarta pretul lor (`pret x bucati`).

  ⚠ TABELUL DE STARI NUMARA SI ANULATELE. Toate celelalte cifre ale paginii le
  lasa afara (asa e definita vanzarea peste tot in panou), dar tocmai de-aia
  trebuie sa existe un loc unde se vede cat se pierde.
*/

export function StatisticiVanzari({ date, perioadaScrisa }: {
  date: DetaliuVanzari;
  perioadaScrisa: string;
}) {
  const { sumar } = date;

  if (sumar.comenzi === 0 && sumar.anulate === 0 && sumar.rambursate === 0) {
    return (
      <p className="rounded-xl bg-card px-5 py-12 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
        Nu ai primit nicio comanda in perioada asta. Alege o perioada mai lunga sau scoate
        filtrul de canal.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Cifrele perioadei ──────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">Cifrele perioadei</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{perioadaScrisa}</p>
        </div>
        <dl className="divide-y divide-border">
          <Rand eticheta="Total incasat" valoare={formatPrice(sumar.vanzari)} tare />
          <Rand
            eticheta="din care TVA"
            valoare={formatPrice(sumar.tva)}
            nota="Cat din suma de mai sus e taxa, nu venitul tau."
          />
          {(sumar.anulate > 0 || sumar.rambursate > 0) && (
            <Rand
              eticheta="Pierdut din anulari si rambursari"
              valoare={formatPrice(sumar.pierdute)}
              nota={`${sumar.anulate} anulate, ${sumar.rambursate} rambursate. Nu intra in totalul de mai sus.`}
            />
          )}
        </dl>
      </div>

      {/* ── Cum au fost scrise comenzile ───────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">Cum au fost scrise comenzile</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{perioadaScrisa}</p>
        </div>
        <dl className="divide-y divide-border">
          <Rand eticheta="Valoarea produselor" valoare={formatPrice(sumar.produse)} />
          <Rand eticheta="Transport" valoare={formatPrice(sumar.transport)} />
          {sumar.taxa_ramburs > 0 && (
            <Rand eticheta="Taxa de ramburs" valoare={formatPrice(sumar.taxa_ramburs)} />
          )}
          {sumar.reduceri > 0 && (
            <Rand eticheta="Reduceri date" valoare={`- ${formatPrice(sumar.reduceri)}`} />
          )}
        </dl>
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          ⚠ Cifrele astea nu se aduna in „Total incasat”, si nu e o greseala de socoteala:
          fiecare comanda si le poarta inghetate de cand a fost plasata, iar comenzile venite
          de la marketplace sunt scrise dupa regulile lor (unele fara TVA in „valoarea
          produselor”). Totalul de sus e suma chiar a totalurilor comenzilor.
        </p>
      </div>

      {/* ── Produse ────────────────────────────────────────────────────────── */}
      <Tabel
        titlu="Cele mai vandute produse"
        subtitlu={perioadaScrisa}
        coloana="Produs"
        randuri={date.produse.map((p) => ({
          cheie: p.product_id ?? p.nume,
          nume: p.nume,
          href: p.product_id ? `/dashboard/products/${p.product_id}` : undefined,
          cifre: [
            { text: nr(p.bucati), titlu: "bucati" },
            { text: String(p.comenzi), titlu: "comenzi" },
            { text: <Bani valoare={p.vanzari} />, titlu: "vanzari", tare: true },
          ],
        }))}
        capete={["Bucati", "Comenzi", "Vanzari"]}
        subsol={"Valoarea liniilor (pret x bucati). Nu da exact totalul de sus: acolo intra si "
          + "transportul, si se scad reducerile de cod, de card sau de ramburs."}
      />

      {/* ── Categorii ──────────────────────────────────────────────────────── */}
      <Tabel
        titlu="Categorii"
        subtitlu={perioadaScrisa}
        coloana="Categorie"
        randuri={date.categorii.map((c) => ({
          cheie: c.categorie,
          nume: c.categorie,
          cifre: [
            { text: nr(c.bucati), titlu: "bucati" },
            { text: String(c.comenzi), titlu: "comenzi" },
            { text: <Bani valoare={c.vanzari} />, titlu: "vanzari", tare: true },
          ],
        }))}
        capete={["Bucati", "Comenzi", "Vanzari"]}
        subsol={"O comanda cu produse din trei categorii se numara la toate trei, deci suma "
          + "coloanei „Comenzi” poate depasi numarul comenzilor."}
      />

      {/* ── Canale ─────────────────────────────────────────────────────────── */}
      {date.canale.length > 1 && (
        <Tabel
          titlu="Canale de vanzare"
          subtitlu={perioadaScrisa}
          coloana="Canal"
          randuri={date.canale.map((c) => ({
            cheie: c.canal,
            nume: numeCanal(c.canal),
            cifre: [
              { text: String(c.comenzi), titlu: "comenzi" },
              { text: <Bani valoare={c.vanzari} />, titlu: "vanzari", tare: true },
            ],
          }))}
          capete={["Comenzi", "Vanzari"]}
        />
      )}

      {/* ── Stari ──────────────────────────────────────────────────────────── */}
      <Tabel
        titlu="In ce stare sunt comenzile"
        subtitlu={perioadaScrisa}
        coloana="Stare"
        randuri={date.statusuri.map((s) => ({
          cheie: s.status,
          /* ⚠ Starea necunoscuta se scrie asa cum e, nu se imbraca in „In
             asteptare": `orderStatus()` da acel implicit, si o stare venita
             de la un marketplace ar fi aparut aici cu alt nume decat are. */
          nume: ORDER_STATUS[s.status as OrderStatus]
            ? <EtichetaStare ton={ORDER_STATUS[s.status as OrderStatus].ton} marime="mic">
                {ORDER_STATUS[s.status as OrderStatus].label}
              </EtichetaStare>
            : s.status,
          stins: s.status === "cancelled" || s.status === "refunded",
          cifre: [
            { text: String(s.comenzi), titlu: "comenzi" },
            { text: <Bani valoare={s.vanzari} />, titlu: "valoare", tare: true },
          ],
        }))}
        capete={["Comenzi", "Valoare"]}
        subsol={"Singurul tabel al paginii care numara si comenzile anulate sau rambursate "
          + "(scrise mai sters). Toate celelalte cifre le lasa afara."}
      />
    </div>
  );
}

function nr(x: number): string {
  return x.toLocaleString("ro-RO", { maximumFractionDigits: 2 });
}

function Rand({ eticheta, valoare, nota, tare }: {
  eticheta: string;
  valoare: string;
  nota?: string;
  tare?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3">
      <dt className={cn("text-sm", tare ? "font-semibold text-foreground" : "text-muted-foreground")}>
        {eticheta}
        {nota && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{nota}</span>}
      </dt>
      <dd className={cn(
        "flex-shrink-0 tabular-nums",
        tare ? "text-base font-semibold text-foreground" : "text-sm text-muted-foreground",
      )}>
        {valoare}
      </dd>
    </div>
  );
}

type Cifra = { text: React.ReactNode; titlu: string; tare?: boolean };
type RandTabel = { cheie: string; nume: React.ReactNode; href?: string; stins?: boolean; cifre: Cifra[] };

function Tabel({ titlu, subtitlu, coloana, capete, randuri, subsol }: {
  titlu: string;
  subtitlu: string;
  coloana: string;
  capete: string[];
  randuri: RandTabel[];
  subsol?: string;
}) {
  if (randuri.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-semibold text-foreground">{titlu}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitlu}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] text-muted-foreground sm:text-xs">
              <th scope="col" className="px-3 py-2 font-medium sm:px-5">{coloana}</th>
              {capete.map((c) => (
                <th key={c} scope="col" className="px-1.5 py-2 text-right font-medium sm:px-5">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {randuri.map((r) => (
              <tr key={r.cheie}>
                <th
                  scope="row"
                  className={cn(
                    /* ⚠ NUMELE SE SCURTEAZA MAI DEVREME PE TELEFON. Lasat la
                       18rem, singur impingea cifrele in afara ecranului, iar pe
                       mobil se vedea o lista de nume fara nicio suma - adica
                       tocmai fara raspunsul pentru care se deschide tabelul. */
                    "max-w-[8.5rem] truncate px-3 py-2.5 text-left font-medium sm:max-w-[18rem] sm:px-5",
                    r.stins ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {r.href ? (
                    <Link href={r.href} className="hover:underline">{r.nume}</Link>
                  ) : r.nume}
                </th>
                {r.cifre.map((c) => (
                  <td
                    key={c.titlu}
                    className={cn(
                      "px-1.5 py-2.5 text-right text-xs tabular-nums sm:px-5 sm:text-sm",
                      c.tare && !r.stins ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {c.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {subsol && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{subsol}</p>
      )}
    </div>
  );
}
