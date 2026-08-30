import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { innoshipGata, urmarestePeComenzi, MAX_COMENZI_PE_CERERE, type InnoshipConfig } from "@/lib/innoship/client";
import { eStareFinala } from "@/lib/innoship/statusuri";
import { aplicaUrmarire, type ComandaDeUrmarit } from "@/lib/innoship/aplica-urmarire";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea expedierilor Innoship — PLASA DE SIGURANTA.
 *
 * ═══ ⚠ NU E CALEA PRINCIPALA ═══
 *
 * Statusurile vin prin „Track push", webhookul lor (`/api/innoship/track`).
 * Cronul asta culege doar ce a ratat pushul: un magazin care nu si-a pus inca
 * URL-ul in portalul Innoship, o cadere de retea la ei, un lot pierdut.
 *
 * De aia e si mai rar decat celelalte cronuri de urmarire, si de aia interpreteaza
 * prin ACELASI `aplicaUrmarire` ca webhookul: doua interpretari ar insemna ca
 * aceeasi comanda se misca altfel dupa cum a sosit vestea.
 *
 * ═══ ⚠ SE INTREABA DUPA ID-UL NOSTRU DE COMANDA, IN LOT ═══
 *
 * `POST /api/Track/by-external-order-id` primeste o lista de referinte ale
 * NOASTRE. Deci, spre deosebire de GLS, Pall-Ex si Posta — unde e un apel pe
 * colet — aici zeci de comenzi incap intr-o singura cerere. Ca la eColet, dar fara
 * sa avem nevoie macar de AWB-ul lor.
 */

export const maxDuration = 60;

/**
 * Cat de departe in urma ne uitam.
 *
 * Mai lunga decat la curieri (21 de zile): Innoship duce si international, unde
 * un colet poate umbla saptamani. Mai scurta decat la Posta (45), unde termenul
 * de pastrare la oficiu se masoara singur in saptamani.
 */
const ZILE = 30;

/**
 * Plafonul pe rulare.
 *
 * ⚠ E mult mai mare decat la ceilalti (120), si asta NU e neglijenta: aici un apel
 * duce `MAX_COMENZI_PE_CERERE` comenzi, deci 600 inseamna vreo 12 cereri, nu 600.
 * Aceeasi socoteala ca la eColet.
 */
const MAX_COMENZI = 600;

const ASTEPTARE_MS = 15_000;
const MARJA_MS = 5_000;
const BUGET_MS = maxDuration * 1000 - ASTEPTARE_MS - MARJA_MS;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const since = new Date(Date.now() - ZILE * 86400000).toISOString();

  const { data: orders, error: eOrders } = await admin
    .from("orders")
    .select("id, business_id, status, order_number, payment_status, created_at, innoship_awb_number, innoship_awb_at, innoship_status_code, innoship_cod_status_code, innoship_status_checked_at")
    .not("innoship_awb_number", "is", null)
    .neq("innoship_awb_number", "")
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /* ⚠ Fereastra se ancoreaza pe EMITERE, nu pe data comenzii: pe `created_at`, o
       comanda veche careia i se emite AWB acum n-ar fi interogata niciodata.
       Doi termeni simpli, nu `and(...)` imbricat: o greseala acolo n-ar da eroare,
       ar da LISTA GOALA — adica urmarirea ar muri raportand `ok: true`. */
    .or(`innoship_awb_at.gte.${since},innoship_awb_at.is.null`)
    .order("innoship_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /* ⚠ O citire picata nu are voie sa raporteze „zero de verificat". */
  if (eOrders) {
    await logError({
      action: "innoship-tracking",
      message: `comenzile cu AWB Innoship nu s-au putut citi: ${eOrders.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const inFereastra = (orders ?? []).filter(
    (o) => o.innoship_awb_at !== null || (o.created_at ?? "") >= since,
  );
  if (inFereastra.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, mutate: 0, semnalate: 0 });
  }

  const bizIds = [...new Set(inFereastra.map((o) => o.business_id))];
  const [{ data: settingsRows, error: eCfg }, { data: firme }] = await Promise.all([
    admin.from("store_settings").select("business_id, innoship_config").in("business_id", bizIds),
    admin.from("businesses").select("id, user_id").in("id", bizIds),
  ]);

  if (eCfg) {
    await logError({
      action: "innoship-tracking",
      message: `configuratiile Innoship nu s-au putut citi: ${eCfg.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const configuri = new Map(
    (settingsRows ?? []).map((r) => [r.business_id, r.innoship_config as InnoshipConfig | null]),
  );
  const proprietari = new Map((firme ?? []).map((f) => [f.id, f.user_id]));

  const termen = Date.now() + BUGET_MS;
  let verificate = 0, mutate = 0, semnalate = 0, incheiate = 0, faraConfig = 0, ramase = 0, esuate = 0;

  /* Marcheaza ca verificata o comanda pe care n-am intrebat-o, ca sa nu ramana in
     capul cozii la fiecare rulare. Aceeasi lectie ca la GLS. */
  const marcheaza = async (o: { id: string; business_id: string }) => {
    await admin.from("orders")
      .update({ innoship_status_checked_at: new Date().toISOString() })
      .eq("id", o.id).eq("business_id", o.business_id);
  };

  /* Se grupeaza pe magazin: fiecare are cheia lui de API. */
  const peMagazin = new Map<string, typeof inFereastra>();
  for (const o of inFereastra) {
    if (!peMagazin.has(o.business_id)) peMagazin.set(o.business_id, []);
    peMagazin.get(o.business_id)!.push(o);
  }

  for (const [bizId, comenzi] of peMagazin) {
    const config = configuri.get(bizId);
    if (!innoshipGata(config)) {
      /* Magazinul si-a oprit integrarea, dar comenzile vechi isi pastreaza AWB-ul. */
      faraConfig += comenzi.length;
      for (const o of comenzi) await marcheaza(o);
      continue;
    }

    const userId = proprietari.get(bizId) ?? null;

    for (let i = 0; i < comenzi.length; i += MAX_COMENZI_PE_CERERE) {
      if (Date.now() >= termen) { ramase += comenzi.length - i; break; }
      const felie = comenzi.slice(i, i + MAX_COMENZI_PE_CERERE);

      /*
       * ⚠ Cele incheiate se dau la RAND, nu se scot din interogare: un retur nu
       * misca statusul comenzii, deci ea ramane in fereastra toate cele 30 de
       * zile. Sarita fara marcaj, si-ar pastra locul in fata cozii pentru
       * totdeauna. Si filtrarea se face AICI, nu in SQL: un `not in (…)` pe o
       * coloana care poate fi NULL ar arunca afara chiar comenzile neverificate.
       */
      const deIntrebat = [];
      for (const o of felie) {
        if (eStareFinala(o.innoship_status_code)) { incheiate++; await marcheaza(o); }
        else deIntrebat.push(o);
      }
      if (deIntrebat.length === 0) continue;

      const referinte = deIntrebat.map((o) => String(o.order_number ?? o.id));
      let urmariri;
      try {
        urmariri = await urmarestePeComenzi(config, referinte, ASTEPTARE_MS);
      } catch (e) {
        esuate += deIntrebat.length;
        console.error("[innoship-tracking] felie esuata:", (e as Error).message);
        /* Se marcheaza oricum: altfel felia asta iese prima la fiecare rulare. */
        for (const o of deIntrebat) await marcheaza(o);
        continue;
      }

      const dupaReferinta = new Map(
        urmariri.map((u) => [(u.externalOrderId ?? "").trim(), u]),
      );

      for (const o of deIntrebat) {
        const u = dupaReferinta.get(String(o.order_number ?? o.id));
        /*
         * ⚠ Se marcheaza si comenzile pe care Innoship NU le-a intors. Raspunsul
         * poate sa nu contina tot ce s-a cerut, iar cele necunoscute ar ramane cu
         * marcaj gol si ar bloca pentru totdeauna capul cozii — lectia eColet.
         */
        if (!u) { await marcheaza(o); continue; }

        verificate++;
        try {
          const r = await aplicaUrmarire(admin, { comanda: o as ComandaDeUrmarit, urmarire: u, userId, sursa: "cron" });
          if (r.mutata) mutate++;
          if (r.semnalata) semnalate++;
        } catch (e) {
          esuate++;
          await logError({
            action: "innoship-tracking",
            message: `urmarirea n-a putut fi aplicata pe comanda ${o.order_number ?? o.id}: ${(e as Error).message}`,
            details: { orderId: o.id },
            businessId: bizId,
            severity: "warning",
          });
          await marcheaza(o);
        }
      }
    }
  }

  return NextResponse.json({
    ok: true, verificate, mutate, semnalate, incheiate, faraConfig, ramase, esuate,
  });
}
