import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { stareaSmsului } from "@/lib/smso";
import { stareaLivrarii } from "@/lib/smso-urma";

/**
 * ⚠ RAPORTUL DE LIVRARE CARE N-A AJUNS NICIODATA.
 *
 * ═══ CE REPARA ═══
 *
 * Webhook-ul lor e „trimite si uita": ei incearca o data, iar daca cererea se pierde (o
 * redesfasurare la mijloc, o pana de retea, un 500 de-al nostru) mesajul ramane `sent` pe veci. Nu e
 * o pierdere de bani, ca la plati, dar e exact minciuna pe care trecerea asta o repara: „sent"
 * inseamna „ei au acceptat mesajul", nu „a ajuns la telefon". Un raport in care 90% din mesaje stau
 * pe „trimis" nu spune nimic nimanui.
 *
 * ═══ CUM ═══
 *
 * Se iau randurile din `notice_sms_log` care au un `provider_id` (deci SMSO chiar l-a primit) si au
 * ramas `sent`, si se intreaba `/status`. Verdictul trece prin ACEEASI `stareaLivrarii` ca raportul
 * venit pe webhook: o singura regula, doi apelanti.
 *
 * ⚠ NU CERE NICIO CREDENTIALA. Capatul lor de stare nu vrea cheie API („No authentifications is
 * required for checking the status"), deci cronul nu are nevoie sa decripteze nimic din
 * `store_settings`. Asta il si face sigur de rulat pentru toate magazinele deodata.
 *
 * ⚠ RASTIMPUL MINIM CONTEAZA. Un SMS trimis acum doua minute e legitim `sent`: reteaua nu l-a livrat
 * inca, iar webhook-ul poate fi pe drum. Se incepe de la o ora, ca sa nu intrebam despre mesaje care
 * urmau oricum sa se lamureasca singure.
 *
 * ⚠ SI NU SE UITA LA NESFARSIT IN URMA. Dupa cateva zile ei insisi nu mai au ce spune (starile lor
 * expira), iar un mesaj ramas `sent` de doua saptamani nu se mai lamureste. Fereastra tine loc de
 * memorie, ca la `netopia-reconciliere`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sub atat, `sent` e o stare legitima: reteaua inca lucreaza, iar webhook-ul poate fi pe drum. */
const ORE_MINIME = 1;
/** Cat de departe in urma se uita. `?zile=` largeste pentru o trecere peste istoric. */
const ZILE_IMPLICIT = 7;
/**
 * ⚠ Capatul lor primeste UN SINGUR mesaj pe cerere, deci plafonul e chiar numarul de cereri catre
 * ei. Tinut jos dinadins: la 55 de SMS-uri masurate pe toata platforma, o trecere n-are ce depasi.
 */
const MAX_MESAJE = 200;

export async function GET(req: NextRequest) {
  /*
   * ⚠ `verificaCron` intoarce `boolean`, nu un raspuns. Scris `const refuz = verificaCron(req);
   * if (refuz) return refuz;`, cronul ar rula DOAR pentru cine NU e autorizat. Vezi
   * `poarta-cronului-e-in-sensul-bun.test.ts`.
   */
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const zile = Math.min(Math.max(Number(req.nextUrl.searchParams.get("zile")) || ZILE_IMPLICIT, 1), 90);
  const pana = new Date(Date.now() - ORE_MINIME * 3600_000).toISOString();
  const de = new Date(Date.now() - zile * 24 * 3600_000).toISOString();

  const { data: randuri, error } = await admin
    .from("notice_sms_log")
    .select("id, business_id, provider_id, created_at")
    .eq("provider", "smso")
    .eq("delivery_status", "sent")
    .not("provider_id", "is", null)
    .gte("created_at", de)
    .lte("created_at", pana)
    .order("created_at", { ascending: true })
    .limit(MAX_MESAJE);

  if (error) {
    await logError({
      action: "cron/smso-livrari",
      message: `mesajele de reconciliat nu s-au putut citi: ${error.message}`,
      severity: "error",
    });
    return NextResponse.json({ error: "citire esuata" }, { status: 500 });
  }

  let intrebate = 0, livrate = 0, esuate = 0, neschimbate = 0, fara_raspuns = 0;

  for (const r of (randuri ?? []) as { id: string; business_id: string; provider_id: string }[]) {
    intrebate++;
    const spus = await stareaSmsului(r.provider_id);
    if ("error" in spus) { fara_raspuns++; continue; }

    const stare = stareaLivrarii(spus.status);
    /*
     * ⚠ `sent` inapoi NU e un rezultat de scris: e exact ce aveam. Si `null` (o stare pe care n-o
     * cunoastem) se lasa in pace dinadins, ca sa nu transformam o necunoscuta intr-un esec.
     */
    if (!stare || stare === "sent") { neschimbate++; continue; }

    const { error: eScriere } = await admin
      .from("notice_sms_log")
      .update({
        delivery_status: stare,
        delivered_at: stare === "delivered" ? (spus.delivered_at || new Date().toISOString()) : null,
      } as never)
      .eq("id", r.id)
      /* ⚠ Se rescrie DOAR daca a ramas `sent`: intre citire si scriere putea sosi chiar webhook-ul. */
      .eq("delivery_status", "sent");

    if (eScriere) {
      await logError({
        action: "cron/smso-livrari",
        message: `starea mesajului nu s-a putut scrie: ${eScriere.message}`,
        details: { id: r.id }, businessId: r.business_id, severity: "warning",
      });
      continue;
    }
    if (stare === "delivered") livrate++; else esuate++;
  }

  return NextResponse.json({ ok: true, intrebate, livrate, esuate, neschimbate, fara_raspuns });
}
