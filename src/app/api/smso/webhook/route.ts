import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { semnaturaCheii } from "@/lib/utils/cheie-neghicibila";
import { numarNormalizat, tineMinteDezabonarea, stareaLivrarii } from "@/lib/smso-urma";
import { logError } from "@/lib/error-logger";

/**
 * Rapoartele de livrare si raspunsurile primite, de la SMSO.
 *
 * ═══ ⚠⚠ EI NU SEMNEAZA NIMIC ═══
 *
 * Documentatia lor o spune pe fata: „No authentifications is required". Niciun antet de semnatura,
 * niciun secret comun, nicio lista de adrese. Deci ADRESA e singura paza, si trebuie sa fie
 * neghicibila.
 *
 * ⚠ CE AR FI PUTUT FACE CINEVA cu o adresa ghicibila: nu doar sa strice statistica de livrari, ci sa
 * trimita un raspuns falsificat cu textul „STOP" pentru fiecare numar al unui magazin, si sa-i
 * DEZABONEZE toata lista de clienti. De aceea secretul din adresa, si de aceea cele doua garzi de
 * mai jos, care cer ca mesajul sa fie unul pe care CHIAR noi l-am trimis.
 *
 * Adresa se compune cu `semnaturaCheii`, acelasi ajutor ca la etichetele de curier: derivata din
 * secretul serverului, deci stabila si nereconstruibila din id-ul magazinului.
 *
 * ⚠ SE RASPUNDE MEREU 200, ca la notice.ro: un raport de livrare repetat la nesfarsit n-ajuta pe
 * nimeni, iar o cerere falsificata nu merita sa fie reincercata.
 */

export const dynamic = "force-dynamic";

const ok = () => NextResponse.json({ received: true });

/** Ce scrie omul cand vrea sa nu mai primeasca. „STOP" e forma ceruta de lege in Romania. */
const CUVINTE_DE_OPRIRE = ["stop", "unsubscribe", "dezabonare", "dezabonat"];

function ceruOprirea(body: string | null): boolean {
  const t = String(body ?? "").trim().toLowerCase();
  if (!t) return false;
  /* Primul cuvant, nu oriunde in text: „nu ma opri din cumparat" n-ar trebui sa dezaboneze pe nimeni. */
  const primul = t.split(/\s+/)[0]?.replace(/[^\p{L}]/gu, "") ?? "";
  return CUVINTE_DE_OPRIRE.includes(primul);
}

/* ⚠ Regula starilor sta in `smso-urma`, fiindca o imparte cu cronul de reconciliere. */

export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  const businessId = url.searchParams.get("b");
  const semnatura = url.searchParams.get("s");
  if (!businessId || !semnatura) return ok();

  /*
   * ⚠ Comparatia se face pe sirul ASTEPTAT, calculat de noi. `semnaturaCheii` ARUNCA daca secretul
   * lipseste din mediu, deci nu exista drum in care garda sa devina tacut inofensiva.
   */
  let asteptat: string;
  try {
    asteptat = semnaturaCheii(`smso-webhook:${businessId}`);
  } catch {
    console.error("[smso/webhook] secretul de semnare lipseste");
    return ok();
  }
  if (semnatura !== asteptat) {
    console.error("[smso/webhook] adresa nu corespunde magazinului", { businessId });
    return ok();
  }

  let date: URLSearchParams;
  try {
    /* Ei trimit `application/x-www-form-urlencoded`, nu JSON. */
    date = new URLSearchParams(await request.text());
  } catch {
    return ok();
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Raport de livrare ──────────────────────────────────────────────────────
  const uuid = date.get("uuid");
  if (uuid) {
    const stare = stareaLivrarii(date.get("status"));
    if (!stare) return ok();

    /*
     * ⚠ SE POTRIVESTE PE (magazin, furnizor, id-ul lor), si abia asta face raportul de incredere:
     * un `uuid` inventat nu se potriveste cu niciun rand, deci nu schimba nimic. Fara `provider`,
     * randurile celor doi furnizori de SMS ar fi de nedeosebit.
     */
    const { data, error } = await admin
      .from("notice_sms_log")
      .update({
        delivery_status: stare,
        delivered_at: stare === "delivered" ? (date.get("delivered_at") || new Date().toISOString()) : null,
      } as never)
      .eq("business_id", businessId)
      .eq("provider", "smso")
      .eq("provider_id", uuid)
      .select("id");

    if (error) {
      await logError({
        action: "smso/webhook",
        message: `raportul de livrare nu s-a putut scrie: ${error.message}`,
        details: { uuid, stare }, businessId, severity: "warning",
      });
    } else if (!data || data.length === 0) {
      /* Nu e o defectiune: poate fi un mesaj mai vechi decat jurnalul, sau unul trimis din alta parte. */
      console.log("[smso/webhook] raport pentru un mesaj necunoscut:", { businessId, uuid });
    }
    return ok();
  }

  // ── Raspuns primit de la cumparator ────────────────────────────────────────
  const numar = date.get("sender[number]") ?? date.get("sender");
  if (numar && ceruOprirea(date.get("body"))) {
    const normalizat = numarNormalizat(numar);

    /*
     * ⚠⚠ A DOUA GARDA, SI E CEA CARE CONTEAZA CU ADEVARAT.
     *
     * Chiar cu adresa neghicibila, o dezabonare e o scriere cu efect de durata pornita de o cerere
     * NESEMNATA. Deci se cere ca numarul sa fie unul caruia magazinul CHIAR i-a trimis un mesaj.
     * Altfel cineva care ar afla adresa ar putea insira numere straine si le-ar bloca pe toate.
     */
    const { data: trimisVreodata } = await admin
      .from("notice_sms_log")
      .select("id")
      .eq("business_id", businessId)
      .eq("phone", normalizat)
      .limit(1);

    if (!trimisVreodata || trimisVreodata.length === 0) {
      console.log("[smso/webhook] cerere de oprire de la un numar caruia nu i-am scris:", { businessId });
      return ok();
    }

    await tineMinteDezabonarea(admin, businessId, numar, "raspuns_stop");
    await logError({
      action: "smso/webhook",
      message: "Un cumparator a raspuns STOP la SMS-urile de marketing. Nu va mai primi campanii de la acest magazin.",
      details: { telefon: normalizat }, businessId, severity: "info",
    });
  }

  return ok();
}
