import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getDomainStatus, repairDomainOnVercel } from "@/lib/vercel";
import { sendBrokenDomainsToAdmin } from "@/lib/email";

// Plasa de siguranta pentru domeniile custom.
//
// Pe 2026-08-07, `atelierullarisei.ro` a stat doua zile complet cazut — nici
// site, nici email — pentru ca domeniul fusese atasat proiectului Vercel dar
// nu inregistrat in cont, deci fara zona DNS. Nameserverele Vercel raspundeau
// REFUSED, iar in Edinio scria linistit „Domeniu conectat". Nimeni nu avea de
// unde sa afle: nimic din produs nu compara ce zice baza noastra cu ce are
// Vercel de fapt.
//
// Cronul asta face exact comparatia aia, din ora in ora, pentru toate
// magazinele. Ce poate repara singur (zona lipsa, domeniu nelegat de proiect,
// geaman www lipsa) repara pe loc — toti pasii sunt idempotenti. Ce ramane
// stricat ajunge pe email la admin.
//
// Ce NU raporteaza: domeniile care asteapta clientul sa schimbe nameserverele
// la registrar (`misconfigured`). Aia nu e defectiunea noastra si nu are rost
// sa sune alarma pentru ea in fiecare ora.

function verifyCron(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    return NextResponse.json({ skipped: "Vercel API neconfigurat" });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: stores } = await admin
    .from("businesses")
    .select("id, slug, store_name, custom_domain")
    .not("custom_domain", "is", null)
    .neq("custom_domain", "")
    .range(0, 999);

  const rows = stores ?? [];
  if (rows.length === 1000) {
    console.warn("[domains-reconcile] 1000 de randuri — posibil taiate de PostgREST.");
  }

  const repaired: string[] = [];
  const broken: { store: string; domain: string; problem: string }[] = [];
  const waiting: string[] = [];
  let healthy = 0;

  for (const store of rows) {
    const domain = store.custom_domain as string;
    const label = (store.store_name as string | null) ?? (store.slug as string);

    try {
      let status = await getDomainStatus(domain);

      // Ce tine de noi: zona, legarea de proiect, geamanul www.
      const oursToFix = !status.zone || !status.inProject || !status.wwwInProject;

      if (oursToFix) {
        const fix = await repairDomainOnVercel(domain);
        status = await getDomainStatus(domain);

        if (status.zone && status.inProject) {
          repaired.push(domain);
        } else {
          broken.push({
            store: label,
            domain,
            problem: !status.zone
              ? `Fara zona DNS pe Vercel — domeniul e cazut complet. ${fix.error ?? ""}`.trim()
              : `Nu e atasat proiectului Vercel. ${fix.error ?? ""}`.trim(),
          });
          continue;
        }
      }

      if (status.healthy) healthy++;
      else if (status.misconfigured) waiting.push(domain);
    } catch (err) {
      broken.push({
        store: label,
        domain,
        problem: `Verificarea a esuat: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  if (broken.length > 0) {
    try {
      await sendBrokenDomainsToAdmin(broken);
    } catch (err) {
      console.error("[domains-reconcile] Alerta pe email a esuat:", err);
    }
  }

  const summary = {
    checked: rows.length,
    healthy,
    repaired,
    waitingForNameservers: waiting,
    broken,
  };
  console.log("[domains-reconcile]", JSON.stringify(summary));

  return NextResponse.json(summary);
}
