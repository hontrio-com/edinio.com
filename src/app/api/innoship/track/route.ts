import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { aplicaUrmarire, type ComandaDeUrmarit } from "@/lib/innoship/aplica-urmarire";
import type { UrmarireInnoship } from "@/lib/innoship/client";

/**
 * „Track push" — statusurile impinse de Innoship.
 *
 * ═══ CUM E APARAT ═══
 *
 * ⚠ Innoship NU semneaza nimic. Documentatia lor spune, cuvant cu cuvant, ca
 * „your endpoint may use any authentication method" — deci nu exista nici HMAC,
 * nici cheie a lor, nici antet de verificat. Tot ce ne apara e secretul din ADRESA,
 * pe care il generam noi si pe care comerciantul il lipeste in portalul lor.
 *
 * Acelasi tipar ca la notice.ro. Si aceleasi doua reguli:
 *   1. fara secret, nu se face nimic — fail-closed;
 *   2. secretul identifica MAGAZINUL, iar fiecare comanda din lot se potriveste
 *      apoi pe magazinul acela. Un lot nu poate atinge comenzile altcuiva nici
 *      daca ar contine referinte straine.
 *
 * ═══ ⚠ DE CE SE RASPUNDE MEREU 200 ═══
 *
 * Un webhook care raspunde cu eroare invita furnizorul sa reincerce — iar
 * politica lor de reincercare nu e documentata. La un lot de zeci de comenzi din
 * care una singura are o problema, reincercarea ar reface TOT lotul, la nesfarsit.
 *
 * Deci: ce se poate prelucra, se prelucreaza; ce nu, se scrie in loguri. Singura
 * cale prin care o comanda ramane in urma e sa fie ratata si de push, si de cron —
 * iar cronul exista tocmai pentru asta.
 */

export const dynamic = "force-dynamic";

/** ⚠ Corpul e o LISTA de obiecte, nu unul singur. Asa il trimit ei. */
function listaDinCorp(brut: unknown): UrmarireInnoship[] {
  if (Array.isArray(brut)) return brut.filter((x): x is UrmarireInnoship => !!x && typeof x === "object");
  /* Un singur obiect nu e forma documentata, dar nu costa nimic sa-l acceptam. */
  if (brut && typeof brut === "object") return [brut as UrmarireInnoship];
  return [];
}

/** Raspuns unic, ca sa nu existe doua feluri de a spune „am primit". */
function ok(prelucrate = 0): NextResponse {
  return NextResponse.json({ ok: true, prelucrate });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = new URL(req.url).searchParams.get("secret")?.trim();
  /* Fail-closed: fara secret nu se citeste nici macar corpul. */
  if (!secret) return ok();

  const admin = createAdminClient();

  /*
   * ⚠ Secretul se cauta pe valoarea DECRIPTATA: vederea `store_settings`
   * decripteaza pentru `service_role`, iar in tabelul privat sta cifrat. Cautat pe
   * cel cifrat, n-ar potrivi niciodata nimic — si webhookul ar tacea la nesfarsit,
   * fara nicio eroare. Vezi `notice_config->>webhook_secret`.
   */
  const { data: setari } = await admin
    .from("store_settings")
    .select("business_id")
    .eq("innoship_config->>webhook_secret" as never, secret)
    .limit(1);

  const businessId = (setari?.[0] as { business_id: string } | undefined)?.business_id;
  if (!businessId) return ok();

  let brut: unknown;
  try {
    brut = await req.json();
  } catch {
    return ok();
  }

  const urmariri = listaDinCorp(brut);
  if (urmariri.length === 0) return ok();

  /*
   * Comenzile se cauta o singura data, dupa referintele din lot. `externalOrderId`
   * e chiar `order_number`-ul nostru — vezi `referintaComenzii`.
   */
  const referinte = [...new Set(
    urmariri.map((u) => (u.externalOrderId ?? "").trim()).filter(Boolean),
  )];
  if (referinte.length === 0) return ok();

  const { data: comenzi, error } = await admin
    .from("orders")
    .select("id, business_id, status, order_number, payment_status, innoship_awb_number, innoship_status_code, innoship_cod_status_code")
    /* ⚠ Filtrul pe magazin nu e de prisos, e AUTORIZARE: fara el, un lot cu
       referinte straine ar atinge comenzile altui comerciant. Aceeasi lectie ca
       la tranzitia atomica a comenzii. */
    .eq("business_id", businessId)
    .in("order_number", referinte);

  if (error) {
    await logError({
      action: "innoship-push",
      message: `comenzile din lotul de push nu s-au putut citi: ${error.message}`,
      details: { businessId, referinte: referinte.length },
      businessId,
      severity: "warning",
    });
    return ok();
  }

  const dupaReferinta = new Map(
    (comenzi ?? []).map((o) => [String(o.order_number ?? ""), o as ComandaDeUrmarit]),
  );

  const { data: firma } = await admin
    .from("businesses").select("user_id").eq("id", businessId).single();
  const userId = (firma?.user_id as string | null) ?? null;

  let prelucrate = 0;
  for (const u of urmariri) {
    const comanda = dupaReferinta.get((u.externalOrderId ?? "").trim());
    /* O referinta pe care n-o cunoastem nu e o eroare: poate fi o comanda a lui
       facuta in alta parte, sau una stearsa. Se trece mai departe. */
    if (!comanda) continue;

    try {
      await aplicaUrmarire(admin, { comanda, urmarire: u, userId, sursa: "push" });
      prelucrate++;
    } catch (e) {
      /*
       * ⚠ Prins PER COMANDA. O singura comanda care crapa n-are voie sa opreasca
       * lotul: restul sunt bune, iar reincercarea intregului lot n-o repara oricum.
       */
      await logError({
        action: "innoship-push",
        message: `urmarirea n-a putut fi aplicata pe comanda ${comanda.order_number ?? comanda.id}: ${(e as Error).message}`,
        details: { orderId: comanda.id },
        businessId,
        severity: "warning",
      });
    }
  }

  return ok(prelucrate);
}
