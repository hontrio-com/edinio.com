import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { getDomainStatus, addDomainToVercel } from "@/lib/vercel";
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
// magazinele. Repara singur DOAR ce se poate repara adaugand: atasarea la
// proiect si geamanul www. Totul e idempotent, nimic nu e distructiv.
//
// Zona lipsa o RAPORTEAZA pe email, nu o repara: recrearea zonei inseamna sa
// scoti domeniul din cont si sa-l pui la loc, iar aia se face doar de om, din
// butonul „Repara". Vezi lib/vercel.ts pentru de ce.
//
// Ce NU raporteaza: domeniile care asteapta clientul sa schimbe DNS-ul la
// registrar (`misconfigured` fara `zoneMissing`). Aia nu e defectiunea noastra
// si nu are rost sa sune alarma pentru ea in fiecare ora.

/*
 * Verificarea comuna, nu una proprie.
 *
 * Ce era aici: `req.headers.get("authorization")?.replace(...) === process.env.CRON_SECRET`.
 * `headers.get()` intoarce `null` cand antetul lipseste, `null?.replace()` da
 * `undefined`, iar `CRON_SECRET` nesetat e tot `undefined` — deci
 * `undefined === undefined` si ruta se deschidea la o cerere FARA niciun antet.
 * Fail-OPEN, adica pe dos decat trebuie o poarta.
 *
 * `verificaCron` a fost scris exact pentru bug-ul asta si a fost pus peste tot;
 * ruta asta a ramas singura pe forma veche. Acum nu mai exista niciuna.
 */
export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
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

      /*
       * Cronul face DOAR reparatii care adauga: ataseaza domeniul la proiect,
       * adauga geamanul www. Nimic distructiv, niciodata, nesupravegheat.
       *
       * Recrearea zonei (scoate din cont + readauga) ramane exclusiv in spatele
       * butonului „Repara", apasat de un om pe propriul domeniu. Motivul e ce
       * s-a vazut pe 07.08.2026: judecata automata „domeniul asta e stricat" s-a
       * inselat de doua ori intr-o singura zi — o data crezand ca lipsa zonei e
       * defect (ar fi demolat `caian-textile.ro`, care merge pe DNS extern), o
       * data crezand ca zona exista pentru ca API-ul Vercel o raporta, desi
       * nameserverele raspundeau REFUSED. O reparatie automata care se poate
       * insela in favoarea distrugerii nu merita viteza pe care o cumpara.
       */
      const oursToFix = !status.inProject || !status.wwwInProject;

      if (oursToFix) {
        const fix = await addDomainToVercel(domain);
        status = await getDomainStatus(domain);

        if (status.inProject) {
          repaired.push(domain);
        } else {
          broken.push({
            store: label,
            domain,
            problem: `Nu e atasat proiectului Vercel. ${fix.error ?? ""}`.trim(),
          });
          continue;
        }
      }

      // Zona lipsa se RAPORTEAZA, nu se repara aici.
      if (status.zoneMissing) {
        broken.push({
          store: label,
          domain,
          problem:
            "Nameserverele arata catre Vercel, dar Vercel nu are zona DNS — domeniul " +
            "e cazut complet, si site si email. Se rezolva din Setari > Domenii, butonul Repara.",
        });
        continue;
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
