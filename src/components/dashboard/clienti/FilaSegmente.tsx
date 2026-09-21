import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { NUMELE_SEGMENTULUI } from "@/lib/customers/filtre";
import {
  CRITERII_GOALE, SEGMENTE_IMPLICITE, adresaSegmentului, catiIn, criteriiGoale, criteriiValide,
  felValid,
} from "@/lib/customers/segmente";
import type { SegmentSalvat } from "@/lib/actions/customer-segments.actions";
import { SegmenteSalvate } from "./SegmenteSalvate";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILA „SEGMENTE”                                               (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Doua randuri de lucruri: segmentele gata facute, cu cate un numar pe ele, si
 * cele salvate de comerciant din filtrele lui.
 *
 * ⚠⚠ NUMARUL DE PE PLACA SI LISTA DE SUB EA SE SOCOTESC DIN ACEEASI REGULA
 * (`customer_in_segment`). Scrise separat, placa ar fi spus 98 si lista ar fi
 * aratat 140, fara nicio eroare si fara vreun fel de a afla care minte. Vezi
 * `segmentul-are-un-singur-loc.test.ts`.
 *
 * ⚠ SEGMENTELE SALVATE NU PRIMESC TOATE UN NUMAR, si asta e dinadins. Numarul
 * unuia care are si cautare, si treapta de valoare, ar fi cerut inca o trecere
 * prin tot istoricul de comenzi — cincizeci de segmente, cincizeci de treceri la
 * fiecare deschidere. Cele care sunt CHIAR un segment, fara alte filtre, isi iau
 * numarul din numaratoarea deja facuta, pe gratis. Restul arata ce filtreaza si
 * duc la lista. Mai bine fara cifra decat cu una scumpa sau inventata.
 */

export async function FilaSegmente({ businessId }: { businessId: string }) {
  const supabase = await createClient();

  const [{ data: numarate }, { data: salvateBrute }, { data: membriBruti }] = await Promise.all([
    supabase.rpc("customer_segment_counts", { bid: businessId }),
    supabase
      .from("customer_segments")
      .select("id, nume, fel, criterii, creat_la")
      .eq("business_id", businessId)
      .order("creat_la", { ascending: false }),
    /*
      ⚠⚠ NUMĂRAREA SE FACE ÎN BAZĂ, un rând pe segment.

      Prima scriere aducea CHEILE (`select("segment_id").limit(10000)`) și le
      număra aici. Plafoanele îngăduie 50 de segmente × 500 de oameni = 25.000
      de rânduri, deci tăia la 10.000 — TĂCUT. Comerciantul ar fi văzut
      „312 clienți" la o listă care are 500, fără să aibă de unde să bănuiască:
      cifra arată a cifră. Iar peste asta, PostgREST are plafonul LUI, pe care
      platforma l-a mai lovit o dată, la 1.000.

      Socotită în bază nu mai e niciun plafon de trecut, și nici nu se mai cară
      rânduri degeaba prin rețea.
    */
    supabase.rpc("customer_segment_sizes", { bid: businessId }),
  ]);

  const cateAreLista = new Map<string, number>();
  for (const m of membriBruti ?? []) {
    cateAreLista.set(m.segment_id, Number(m.cati));
  }

  const cifre = numarate ? numarate.map((r) => ({ segment: r.segment, cati: Number(r.cati) })) : null;

  const salvate: SegmentSalvat[] = (salvateBrute ?? []).map((r) => ({
    id: r.id,
    nume: r.nume,
    fel: felValid(r.fel),
    criterii: criteriiValide(r.criterii),
    creatLa: r.creat_la,
    cati: felValid(r.fel) === "lista" ? (cateAreLista.get(r.id) ?? 0) : undefined,
  }));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-semibold text-foreground">Segmente gata făcute</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Se recalculează singure. Apasă pe unul ca să vezi cine e în el acum.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SEGMENTE_IMPLICITE.map((seg) => {
            const cati = catiIn(cifre, seg);
            return (
              <Link
                key={seg}
                href={adresaSegmentului({ ...CRITERII_GOALE, segment: seg, valoare: null, q: "" })}
                className="group rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {NUMELE_SEGMENTULUI[seg]}
                  </span>
                  <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                {/*
                  ⚠ „Nu se știe” arată altfel decât „zero”: prima înseamnă că baza
                  n-a răspuns, a doua e un răspuns adevărat despre magazin.
                */}
                <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                  {cati === null ? <span className="text-base text-muted-foreground">nu se știe</span> : cati}
                </p>
                <p className="text-xs text-muted-foreground">
                  {cati === 1 ? "client" : "clienți"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Segmentele tale</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Se salvează din filtrele puse în „Toți clienții” — și atunci păstrează întrebarea,
          deci rămân la zi singure. Cele făcute din clienți bifați păstrează lista de oameni
          din ziua aceea și nu se mai schimbă.
        </p>

        {salvate.length === 0 ? (
          <div className="mt-3 rounded-xl bg-card p-6 text-center ring-1 ring-foreground/10">
            <Users className="mx-auto h-6 w-6 text-muted-foreground/60" />
            <p className="mt-2 text-sm text-foreground">Niciun segment salvat încă.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pune un filtru în lista de clienți și apasă „Salvează segmentul”.
            </p>
            <Link
              href="/dashboard/customers"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              Mergi la listă <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <SegmenteSalvate
            businessId={businessId}
            segmente={salvate}
            /*
              ⚠ Numarul se da numai celor care sunt CHIAR un segment. Vezi capul
              fisierului: restul ar fi cerut cate o trecere prin tot istoricul.
            */
            cifre={salvate.map((s) => ({
              id: s.id,
              /* O listă își știe numărul exact; un segment cu criterii doar când e „curat". */
              cati:
                s.fel === "lista"
                  ? (s.cati ?? 0)
                  : !s.criterii.valoare && !s.criterii.q && !criteriiGoale(s.criterii)
                    ? catiIn(cifre, s.criterii.segment)
                    : null,
            }))}
          />
        )}
      </section>
    </div>
  );
}
