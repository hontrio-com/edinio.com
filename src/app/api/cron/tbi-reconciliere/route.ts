import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { proprietariiMagazinelor, semnaleazaExpedierea } from "@/lib/orders/semnalarea-ajunge-la-om";
import { STARI_DESCHISE } from "@/lib/tbi/stari";
import { anuleazaCerereaTbi, reiaPlataAprobata, type RandCerere } from "@/lib/tbi/server";

/**
 * Reconcilierea tbi. API-ul lor n-are nicio interogare de stare, deci aici nu se INTREABA banca
 * despre nimic: se pun in acord doua lucruri pe care le stim deja, in baza noastra.
 *
 * ═══ 1. ⚠⚠ O COMANDA ANULATA NU LASA IN URMA O CERERE DE CREDIT DESCHISA ═══
 *
 * Clientul care a ales plata in rate are o cerere deschisa la tbi. Daca magazinul anuleaza comanda
 * (din panou, din lot, sau clientul din contul lui), cererea ramane vie la banca: omul o poate
 * termina, banca o aproba, iar el ajunge cu un credit pentru o marfa care nu mai vine.
 *
 * Drumurile de anulare sunt multe si se pot inmulti; o anulare legata de fiecare ar fi uitata la
 * primul drum nou. Trecerea asta le prinde pe toate: orice cerere deschisa a unei comenzi anulate
 * (sau sterse) se anuleaza la tbi („CanceledByCustomer", ingaduita inainte de aprobare).
 *
 * ⚠ O SINGURA INCERCARE PE CERERE: `anuleazaCerereaTbi` scrie `anulare_ceruta_la`, iar trecerea
 * cauta numai cererile fara el. O anulare refuzata sau nelamurita se spune comerciantului, iar
 * butonul din pagina comenzii ramane pentru o noua incercare.
 *
 * ═══ 2. O APROBARE NU RAMANE NEINCASATA DIN CAUZA NOASTRA ═══
 *
 * Vestea „aprobata" scrie intai cererea, apoi marcheaza comanda platita. Daca baza cade intre cele
 * doua, ruta raspunde 503, dar documentatia lor nu spune daca tbi repeta vestile. Cererea ramane
 * „aprobata", comanda „neplatita", si n-ar mai trece nimeni pe acolo. Trecerea asta reia plata,
 * cu exact aceleasi garzi ca vestea (comanda anulata, alta metoda, alta suma: nu se atinge).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUGET_MS = maxDuration * 1000 - 15_000;
const MAX_ANULARI = 100;
/** Cat de departe in urma se cauta aprobarile neincasate. Peste o saptamana, e treaba omului. */
const ZILE_APROBARI = 7;

type CuComanda = RandCerere & {
  orders: { status: string | null; payment_status: string | null; payment_method: string | null } | null;
};

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const termen = Date.now() + BUGET_MS;

  const [deschise, aprobate] = await Promise.all([
    admin
      .from("tbi_cereri")
      .select("*, orders(status, payment_status, payment_method)")
      .in("stare", [...STARI_DESCHISE])
      .is("anulare_ceruta_la", null)
      .order("updated_at", { ascending: true })
      .limit(500),
    admin
      .from("tbi_cereri")
      .select("*, orders(status, payment_status, payment_method)")
      .eq("stare", "aprobata")
      .gte("updated_at", new Date(Date.now() - ZILE_APROBARI * 86_400_000).toISOString())
      .order("updated_at", { ascending: true })
      .limit(200),
  ]);
  /* Citirea principala nu are voie sa taca: o baza cazuta n-ar trebui sa arate ca „nimic de facut". */
  if (deschise.error || aprobate.error) {
    await logError({
      action: "tbi-reconciliere",
      message: `citirea cererilor a esuat: ${(deschise.error ?? aprobate.error)!.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const deAnulat = ((deschise.data ?? []) as CuComanda[])
    .filter((c) => !c.order_id || c.orders?.status === "cancelled")
    .slice(0, MAX_ANULARI);
  const deIncasat = ((aprobate.data ?? []) as CuComanda[])
    .filter((c) => !!c.orders && c.orders.payment_status !== "paid" && c.orders.status !== "cancelled" && c.orders.payment_method === "tbi");

  let anulate = 0;
  let nereusite = 0;
  let incasate = 0;
  let sarite = 0;

  if (deAnulat.length > 0) {
    const configuri = new Map<string, unknown>();
    const proprietari = await proprietariiMagazinelor(admin, deAnulat.map((c) => c.business_id));
    for (const c of deAnulat) {
      if (Date.now() > termen) { sarite++; continue; }
      if (!configuri.has(c.business_id)) {
        const { data: st, error: eS } = await admin
          .from("store_settings").select("tbi_config").eq("business_id", c.business_id).maybeSingle();
        if (eS) { sarite++; continue; }
        configuri.set(c.business_id, st?.tbi_config ?? null);
      }
      const r = await anuleazaCerereaTbi(admin, c, configuri.get(c.business_id));
      if (r.ok) { anulate++; continue; }
      nereusite++;
      await semnaleazaExpedierea(admin, {
        userId: proprietari.get(c.business_id) ?? null,
        businessId: c.business_id,
        orderId: c.order_id,
        orderNumber: c.order_number,
        tip: "plata",
        titlu: `Cererea tbi a comenzii ${c.order_number} n-a putut fi anulată`,
        mesaj: `Comanda ${c.order_number} e anulată, dar cererea ei de finanțare tbi bank e încă deschisă și nu am putut-o `
          + `anula automat: ${r.mesaj} Anuleaz-o din pagina comenzii sau anunță tbi bank, ca banca să nu aprobe creditul.`,
        actiune: "tbi-reconciliere",
        detalii: { cerere: c.id, necunoscut: r.necunoscut === true },
      });
    }
  }

  for (const c of deIncasat) {
    if (Date.now() > termen) { sarite++; continue; }
    const r = await reiaPlataAprobata(admin, c);
    if (r.fel === "aplicata") incasate++;
    else sarite++;
  }

  if (sarite > 0) console.log(`[tbi-reconciliere] ${sarite} cereri raman pentru rularea urmatoare`);
  return NextResponse.json({
    ok: true,
    cercetate: (deschise.data?.length ?? 0) + (aprobate.data?.length ?? 0),
    anulate, nereusite, incasate, sarite,
  });
}
