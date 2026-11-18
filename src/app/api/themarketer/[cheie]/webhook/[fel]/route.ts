import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { FELURI_WEBHOOK, type FelWebhook } from "@/lib/themarketer/chei";
import { modulPornit } from "@/lib/themarketer/config";
import { insemneaza } from "@/lib/themarketer/server";
import { json, poarta, text } from "@/lib/themarketer/ruta";
import { adreseDinWebhook } from "@/lib/themarketer/webhook";

/**
 * Webhookurile theMarketer (Settings → Webhooks la ei): `/api/themarketer/<cheie>/webhook/<fel>`, cu
 * `fel` = `dezabonat` (Contact unsubscribed), `respins` (Email bounced) sau `spam` (Email marked as spam).
 *
 * ⚠ FELUL E IN ADRESA, nu in corp: corpul lor nu spune ce eveniment e (dezabonarea si abonarea au
 * exact aceeasi forma, `{email, firstname, lastname, phone}`). Fiecare webhook se leaga la adresa lui.
 *
 * Cine ajunge aici nu mai primeste emailurile Edinio de cos abandonat (`recovery_optout`, cu motivele
 * pe care panoul le stie). Webhookul e drumul rapid; cronul care citeste `unsubscribed_emails` e plasa
 * pentru ce s-ar pierde pe drum.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MOTIV: Record<FelWebhook, "dezabonare" | "email_respins" | "reclamatie_spam"> = {
  dezabonat: "dezabonare",
  respins: "email_respins",
  spam: "reclamatie_spam",
};

/** Un corp de webhook e mic; peste atat nu e de la ei. */
const MARIME_MAXIMA = 64 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ cheie: string; fel: string }> }) {
  const { cheie, fel } = await ctx.params;
  const p = await poarta(cheie, "webhook", 600);
  if (!p.ok) return p.raspuns;
  if (!(FELURI_WEBHOOK as readonly string[]).includes(fel)) return text("Not found", 404);
  const { businessId, config } = p;

  /* Modul oprit: se raspunde 200, ca theMarketer sa nu reincerce la nesfarsit un webhook uitat legat. */
  if (!modulPornit(config, "dezabonari")) return json({ ok: true, ignorat: "modul oprit" });

  const brut = await req.text().catch(() => "");
  if (brut.length > MARIME_MAXIMA) return json({ status: "Payload too large" }, 413);
  let corp: unknown;
  try {
    corp = JSON.parse(brut);
  } catch {
    return json({ status: "Invalid JSON" }, 400);
  }

  const adrese = adreseDinWebhook(fel as FelWebhook, corp);
  await insemneaza(businessId, "ultim_webhook_la");
  if (adrese.length === 0) return json({ ok: true, scrise: 0 });

  const { data, error } = await createAdminClient().rpc("themarketer_dezaboneaza", {
    p_business: businessId,
    p_emailuri: adrese,
    p_motiv: MOTIV[fel as FelWebhook],
  });
  if (error) {
    await logError({ action: "themarketer/webhook", message: `dezabonarea nu s-a putut scrie: ${error.message}`, businessId, details: { fel }, severity: "error" });
    /* 503: theMarketer reincearca, iar dezabonarea nu se pierde. */
    return json({ status: "Temporarily unavailable" }, 503);
  }
  return json({ ok: true, scrise: Number(data) || 0 });
}
