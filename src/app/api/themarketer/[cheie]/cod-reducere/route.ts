import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { egaleInTimpConstant } from "@/lib/themarketer/chei";
import { modulPornit } from "@/lib/themarketer/config";
import { citesteCererea, codNou } from "@/lib/themarketer/coduri";
import { insemneaza } from "@/lib/themarketer/server";
import { json, poarta, text } from "@/lib/themarketer/ruta";

/**
 * Generatorul de coduri de reducere unice, chemat de theMarketer:
 * `/api/themarketer/<cheie>/cod-reducere?key=<REST_KEY>&value=10&type=1&expiration_date=2026-12-31`.
 * Raspunde `{"code": "MKTR-…"}` (developers.themarketer.com/reference/discount-codes-generator).
 *
 * ═══ DOUA CHEI ═══
 * Cheia din cale (a noastra) gaseste magazinul; `key` (cheia REST a contului theMarketer, pe care ei o
 * trimit, dupa documentatia lor) dovedeste ca cererea vine de la theMarketer. Fara a doua, oricine ar fi
 * vazut adresa intr-o captura de ecran ar fi putut tipari coduri.
 *
 * ⚠ Codul e pentru O SINGURA comanda (`max_uses: 1`), ca la pluginul lor. Se marcheaza `generat_de`,
 * ca miile de coduri ale unei automatizari sa nu umple lista din panou.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** O automatizare poate cere cate un cod pentru fiecare om dintr-un segment: plafonul e larg. */
const PLAFON_PE_MINUT = 1200;
const INCERCARI_COD = 5;

export async function GET(req: Request, ctx: { params: Promise<{ cheie: string }> }) {
  const { cheie } = await ctx.params;
  const p = await poarta(cheie, "cod", PLAFON_PE_MINUT);
  if (!p.ok) return p.raspuns;
  const { businessId, config } = p;
  if (!modulPornit(config, "coduri")) return text("Not found", 404);

  const parametri = new URL(req.url).searchParams;
  /* Mesajele sunt ale pluginului lor („Incorrect REST API Key”): le citeste contul theMarketer. */
  if (!egaleInTimpConstant(parametri.get("key") ?? "", config.rest_key.trim())) {
    return json({ status: "Incorrect REST API Key" }, 403);
  }
  const cerere = citesteCererea(parametri);
  if ("eroare" in cerere) return json({ status: cerere.eroare }, 400);

  const admin = createAdminClient();
  for (let i = 0; i < INCERCARI_COD; i++) {
    const cod = codNou();
    const { error } = await admin.from("discounts").insert({
      business_id: businessId,
      code: cod,
      type: cerere.tip,
      value: cerere.valoare,
      min_order_amount: null,
      max_uses: 1,
      is_active: true,
      starts_at: null,
      expires_at: cerere.expira,
      per_customer_limit: null,
      doar_prima_comanda: false,
      generat_de: "themarketer",
    } as never);
    if (!error) {
      await insemneaza(businessId, "ultim_cod_la");
      return json({ code: cod });
    }
    /* Doua coduri la fel, din 36^10: aproape imposibil, dar nu se raspunde cu o eroare pentru atat. */
    if (error.code === "23505") continue;
    await logError({ action: "themarketer/cod", message: `codul nu s-a putut scrie: ${error.message}`, businessId, details: { code: error.code }, severity: "error" });
    return json({ status: "Temporarily unavailable" }, 503);
  }
  return json({ status: "Temporarily unavailable" }, 503);
}
