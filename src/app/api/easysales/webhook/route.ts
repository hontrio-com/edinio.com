import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { citesteConfigEasySales, depozitDinSupabase } from "@/lib/easysales/depozit";
import { citesteCorpulMarginit, corpulRaspunsului, primesteLivrarea, type DepsPrimire } from "@/lib/easysales/webhook";
import { prelucreazaInboxul } from "@/lib/easysales/inbox";

/**
 * Livrarile easySales: `POST /api/easysales/webhook?businessId=<uuid>&t=<jeton>` (planul, §6).
 *
 * Toata logica sta in `primesteLivrarea` (probata pe dependinte false); aici numai legaturile.
 *
 * ⚠ RASPUNSUL PLEACA IN SUB 3 SECUNDE: o livrare mai lenta e socotita esuata la ei. Ruta
 * autentifica, curata si scrie in inbox, atat. Prelucrarea (o recitire prin API, termen 20 s)
 * ruleaza in `after`, in fereastra lui `maxDuration`; ce ramane neprelucrat reia cronul.
 *
 * ⚠ Adresa intreaga nu ajunge niciodata in jurnal: jetonul sta in query string.
 */
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  const jeton = req.nextUrl.searchParams.get("t");

  const corp = await citesteCorpulMarginit(req);
  if (corp === null) {
    /* Peste plafon: un eveniment de-al lor are cativa KB. Nu se citeste, nu se reincearca. */
    return NextResponse.json(corpulRaspunsului(200), { status: 200 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const dep = depozitDinSupabase(admin);

  const deps: DepsPrimire = {
    async citesteConfig(b) {
      /* ⚠ Arunca la o citire cazuta (503, ei reincearca); `{}` = magazin fara configurare. */
      const c = await citesteConfigEasySales(admin, b);
      return Object.keys(c).length ? c : null;
    },
    async scrieInbox(rand) {
      const { data, error } = await admin.from("easysales_webhook_inbox").insert({
        business_id: rand.business_id,
        slug: rand.slug,
        amprenta: rand.amprenta,
        corp: rand.corp as Json,
        semnatura_ok: rand.semnatura_ok,
        semnatura_varianta: rand.semnatura_varianta,
        motiv: rand.motiv,
      }).select("id").single();
      if (error || !data) {
        await logError({ action: "easysales.webhook", severity: "error", businessId: rand.business_id, message: `livrarea nu s-a putut scrie in inbox: ${error?.message ?? "fara rand"}` });
        return null;
      }
      return data.id as string;
    },
    peticConfig: (b, p) => dep.peticConfig(b, p),
    async poateSemnala(cheie) {
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "necunoscut";
      return (await consumaLimita(`${cheie}:${ip}`, 1, 3600)).permis;
    },
    async alarma(p) {
      await logError({ action: "easysales.webhook", severity: p.severitate, businessId: p.businessId, message: p.mesaj, details: p.detalii });
    },
    dupaRaspuns(b, inboxId) {
      dupaRaspuns(() => prelucreazaInboxul(admin, { id: inboxId, limita: 1 }), "easysales.webhook", b);
    },
  };

  const r = await primesteLivrarea(deps, { businessId, jeton, corpBrut: corp, antetSemnatura: req.headers.get("signature") });
  /* ⚠ `{"success": true}`, nu alt corp: altfel easySales noteaza livrarea esuata (vezi `corpulRaspunsului`). */
  return NextResponse.json(corpulRaspunsului(r.status), { status: r.status });
}
