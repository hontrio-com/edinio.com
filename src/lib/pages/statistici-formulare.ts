import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { Block } from "./blocks.types";
import { flattenBlocks } from "./block-tree";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

type DB = SupabaseClient<Database>;

/*
  ═══════════════════════════════════════════════════════════════════════════
  STATISTICILE FORMULARELOR                                        (26.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: sa vada statisticile fiecarui formular. Din ce exista deja:
  completarile (`page_form_submissions`) si paginile pe care e pus.

  ⚠ Nu exista „afisari” ale formularului (nu se masoara), deci nicio „rata de
  conversie”: o rata fara numitor adevarat ar fi o cifra inventata.

  ⚠ Citirea completarilor merge prin RLS-ul proprietarului („Owners can read
  own submissions”), cu clientul lui, nu cu cel de serviciu.
*/

export interface StatisticaFormular {
  total: number;
  ultimele30: number;
  /** 30 de valori, cea mai veche prima; ziua de azi e ultima. */
  peZile: number[];
  ultima: string | null;
  pagini: { titlu: string; slug: string }[];
}

const ZI = 86_400_000;

/** Ziua (ora Romaniei), ca cheie `AAAA-LL-ZZ`. */
const ziua = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(d);

/**
 * Cele 30 de zile CALENDARISTICE ale Romaniei care se termina azi, cea mai veche prima.
 * Socotite pe CHEIE (la miezul zilei UTC), nu scazand 24 de ore din acum: la
 * schimbarea orei din octombrie, doua scaderi de 24h cadeau in aceeasi zi.
 */
export function ultimele30Zile(acum: number): string[] {
  const [a, l, z] = ziua(new Date(acum)).split("-").map(Number);
  const azi = Date.UTC(a, l - 1, z, 12);
  return Array.from({ length: 30 }, (_, i) => new Date(azi - (29 - i) * ZI).toISOString().slice(0, 10));
}

export async function statisticiFormulare(supabase: DB, businessId: string, formIds: string[]): Promise<Record<string, StatisticaFormular>> {
  const rez: Record<string, StatisticaFormular> = {};
  if (formIds.length === 0) return rez;
  const acum = Date.now();
  const zile = ultimele30Zile(acum);
  const inFereastra = new Set(zile);
  // Cu o zi in plus: randurile din afara celor 30 de zile romanesti se scot mai jos, dupa cheie.
  const deLa = new Date(acum - 31 * ZI).toISOString();

  const { data: pagini } = await supabase.from("custom_pages").select("title, slug, blocks").eq("business_id", businessId).limit(500);
  const unde = new Map<string, { titlu: string; slug: string }[]>();
  for (const p of pagini ?? []) {
    for (const b of flattenBlocks((p.blocks as unknown as Block[]) ?? [])) {
      if (b.type !== "contact" || !b.formId) continue;
      const l = unde.get(b.formId) ?? [];
      if (!l.some((x) => x.slug === p.slug)) l.push({ titlu: p.title, slug: p.slug });
      unde.set(b.formId, l);
    }
  }

  await Promise.all(formIds.map(async (id) => {
    const [{ count }, { data: recente }, { data: ultima }] = await Promise.all([
      supabase.from("page_form_submissions").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("form_id", id),
      /* Toate, pe ferestre de 1000: o limita de 5000 era taiata tacut la 1000 de PostgREST.
         (Forma `{ data }` de mai jos pastreaza destructurarea comuna.) */
      fetchAllRows("pagini.statistici-formulare", (from, to) =>
        supabase.from("page_form_submissions").select("created_at").eq("business_id", businessId).eq("form_id", id)
          .gte("created_at", deLa).order("created_at").order("id").range(from, to)).then((data) => ({ data })),
      supabase.from("page_form_submissions").select("created_at").eq("business_id", businessId).eq("form_id", id).order("created_at", { ascending: false }).limit(1),
    ]);
    const peZi = new Map<string, number>();
    for (const r of recente ?? []) {
      const k = ziua(new Date(r.created_at));
      if (inFereastra.has(k)) peZi.set(k, (peZi.get(k) ?? 0) + 1);
    }
    const peZile = zile.map((z) => peZi.get(z) ?? 0);
    rez[id] = {
      total: count ?? 0,
      // Suma barelor: „ultimele 30 de zile” si graficul numara ACELEASI zile.
      ultimele30: peZile.reduce((a, b) => a + b, 0),
      peZile,
      ultima: ultima?.[0]?.created_at ?? null,
      pagini: unde.get(id) ?? [],
    };
  }));
  return rez;
}
