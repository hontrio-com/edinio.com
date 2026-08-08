import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { getDomainStatus, addDomainToVercel } from "@/lib/vercel";
import { sendBrokenDomainsToAdmin } from "@/lib/email";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { logError } from "@/lib/error-logger";

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

  /*
   * ⚠ AICI ERAU DOUA GAURI, si a doua e mai rea decat prima.
   *
   * `.range(0, 999)` taia la o mie de domenii, cu un `console.warn` pe care nu-l
   * citeste nimeni. Dar mai grav: `const { data } = await ...` nu se uita deloc la
   * `error`. La o interogare picata, `data` e `null`, `?? []` o preface intr-o
   * lista goala, si cronul raporta senin `checked: 0, broken: []` — o rulare
   * perfect sanatoasa la vedere, care n-a verificat NIMIC. Exact forma care a
   * tinut sitemapul gol doua saptamani.
   *
   * Strict: mai bine cronul cade zgomotos decat sa spuna ca toate domeniile sunt
   * in regula fiindca n-a reusit sa se uite la niciunul.
   */
  type Magazin = { id: string; slug: string | null; store_name: string | null; custom_domain: string | null };
  let rows: Magazin[];
  try {
    rows = await fetchAllRowsStrict<Magazin>("domains-reconcile.stores", (from, to) =>
      admin
        .from("businesses")
        .select("id, slug, store_name, custom_domain")
        .not("custom_domain", "is", null)
        .neq("custom_domain", "")
        .order("id")
        .range(from, to));
  } catch (e) {
    await logError({
      action: "domains-reconcile",
      message: e instanceof Error ? e.message : "citirea domeniilor a esuat",
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const repaired: string[] = [];
  const broken: { store: string; domain: string; problem: string }[] = [];
  const waiting: string[] = [];
  let healthy = 0;

  /*
   * Patru deodata, nu unul dupa altul.
   *
   * Fiecare domeniu inseamna una pana la trei cereri catre Vercel. La 15 domenii
   * (masurat la 18.08) nu conteaza; la o mie, secvential ar depasi limita de timp
   * a functiei si cronul ar fi taiat pe la jumatate — adica jumatate din domenii
   * neverificate, si un raspuns care arata a reusita. Patru sta departe de
   * plafonul de cereri al Vercel si nu incarca nimic.
   */
  const DEODATA = 4;
  for (let i = 0; i < rows.length; i += DEODATA) {
  await Promise.all(rows.slice(i, i + DEODATA).map(async (store) => {
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
          return;
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
        return;
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
  }));
  }

  if (broken.length > 0) {
    /*
     * Ce e stricat ajunge INTOTDEAUNA in `/admin/logs`. Pana acum cronul nu scria
     * nimic acolo: singura lui iesire era `console.log`, adica invizibil din
     * produs. Un domeniu cazut complet — nici site, nici email — merita sa se vada
     * unde se uita omul, nu doar in logurile Vercel.
     */
    await logError({
      action: "domains-reconcile",
      message: `${broken.length} domenii cu probleme: ${broken.map((b) => b.domain).join(", ")}`,
      details: { broken },
      severity: "critical",
    });

    /*
     * ═══ EMAILUL SE FRANEAZA. ═══
     *
     * Zona lipsa nu se repara automat, deliberat (vezi mai sus): o rezolva un om,
     * din butonul „Repara". Pana o face, cronul gaseste acelasi domeniu stricat la
     * fiecare ora — si trimitea de fiecare data un email. Douazeci si patru pe zi
     * pentru aceeasi problema, la nesfarsit.
     *
     * Asta nu e vigilenta, e antrenament: dupa a treia zi, emailul de la Edinio se
     * muta intr-un dosar si nu se mai citeste — inclusiv in ziua in care cade ALT
     * domeniu. O alarma care suna mereu e o alarma oprita.
     *
     * Marcajul sta in `error_logs`, nu intr-o tabela noua: acolo e deja istoricul,
     * si o citire pe `action` + `created_at` costa nimic. La indoiala (citirea
     * picata) se TRIMITE: un email in plus e mai ieftin decat unul lipsa.
     */
    const ORE_INTRE_EMAILURI = 12;
    const de = new Date(Date.now() - ORE_INTRE_EMAILURI * 3600_000).toISOString();
    const { data: trimisRecent, error: eCitire } = await admin
      .from("error_logs")
      .select("id")
      .eq("action", "domains-reconcile.email")
      .gte("created_at", de)
      .limit(1);

    if (eCitire || (trimisRecent ?? []).length === 0) {
      try {
        await sendBrokenDomainsToAdmin(broken);
        await logError({
          action: "domains-reconcile.email",
          message: `Alerta trimisa pentru ${broken.length} domenii.`,
          details: { domenii: broken.map((b) => b.domain) },
          severity: "info",
        });
      } catch (err) {
        // Domenii stricate SI emailul picat: dubla tacere de dinainte. Acum se
        // vede, si tot ce s-a gasit e deja in randul `critical` de mai sus.
        await logError({
          action: "domains-reconcile.email",
          message: `Alerta pe email a esuat: ${err instanceof Error ? err.message : String(err)}`,
          severity: "critical",
        });
      }
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
