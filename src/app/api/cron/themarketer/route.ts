import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { semnaleaza } from "@/lib/themarketer/server";
import { poateSincroniza, sincronizeazaDezabonatii, sincronizeazaRecenziile } from "@/lib/themarketer/sync";

/*
  ══════════════════════════════════════════════════════════════════
  SINCRONIZARILE PERIODICE THEMARKETER (o data pe ora)
  ══════════════════════════════════════════════════════════════════

  Pentru fiecare magazin cu theMarketer pornit:
    - dezabonatii (`unsubscribed_emails`) → `recovery_optout`: plasa de sub webhookul de dezabonare, care
      poate sa nu fie legat sau sa se piarda pe drum;
    - recenziile noi din modulul Feedback (`product_reviews`) → `recenzii_produse`, daca modulul e pornit.

  Comenzile NU pleaca de aici: le duce coada de email marketing (`/api/cron/email-marketing`), din minut
  in minut, cu reincercari.
*/

export const maxDuration = 300;

/** Bugetul buclei: nu mai porneste un magazin nou dupa el, ca rularea sa se termine inainte de `maxDuration`. */
const BUGET_MS = maxDuration * 1000 - 70_000;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }
  const inceput = Date.now();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("store_settings")
    .select("business_id, themarketer_config")
    .eq("themarketer_config->>enabled", "true");
  if (error) {
    await logError({ action: "cron.themarketer", message: `magazinele nu s-au putut citi: ${error.message}`, severity: "error" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  let dezabonati = 0, recenzii = 0, esecuri = 0, amanate = 0;
  for (const rand of (data ?? []) as { business_id: string; themarketer_config: unknown }[]) {
    if (Date.now() - inceput > BUGET_MS) { amanate++; continue; }
    const config = rand.themarketer_config;
    /* ⚠ Fiecare magazin in `try`-ul lui: unul cazut nu opreste restul. */
    try {
      if (poateSincroniza(config, "dezabonari")) {
        const r = await sincronizeazaDezabonatii(rand.business_id, config);
        if (r.ok) dezabonati += r.noi;
        else { esecuri++; await semnaleaza(rand.business_id, "dezabonari", r.mesaj); }
      }
      if (poateSincroniza(config, "recenzii")) {
        const r = await sincronizeazaRecenziile(rand.business_id, config);
        if (r.ok) recenzii += r.scrise;
        else { esecuri++; await semnaleaza(rand.business_id, "recenzii", r.mesaj); }
      }
    } catch (e) {
      esecuri++;
      await logError({
        action: "cron.themarketer",
        message: e instanceof Error ? e.message : "sincronizarea a cazut",
        businessId: rand.business_id,
        severity: "warning",
      });
    }
  }
  if (amanate > 0) {
    await logError({ action: "cron.themarketer.amanate", message: `${amanate} magazine au ramas pentru ora urmatoare`, severity: "info" });
  }
  return NextResponse.json({ ok: true, magazine: data?.length ?? 0, dezabonati, recenzii, esecuri, amanate });
}
