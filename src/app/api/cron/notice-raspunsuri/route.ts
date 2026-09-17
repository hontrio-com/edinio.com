import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { citesteRaspunsurile } from "@/lib/notice-raspunsuri";
import type { NoticeConfig } from "@/lib/notice";

/**
 * ⚠⚠ RASPUNSUL CUMPARATORULUI PE CARE NU-L AUZEA NIMENI.
 *
 * ═══ CE REPARA ═══
 *
 * notice.ro duce TOT traficul real de SMS al platformei: 405 mesaje in trei luni, 3 magazine, si
 * inca trimite. Singurul drum DOCUMENTAT catre ce a scris cumparatorul e `GET /sms-in`, adica o cerere
 * pe care o faci tu. (Un webhook poate exista in panoul lor, dar nu e in specificatia API si n-a fost
 * vazut niciodata mergand; vezi `notice-raspunsuri.ts`.)
 *
 * `getNoticeInboundSms` era scrisa anume pentru capatul asta, si **nu o chema nimeni**. Masurat:
 * `notice_inbox` avea ZERO randuri. Deci un om care raspundea „STOP” nu era auzit, iar magazinul nu
 * vedea niciun raspuns.
 *
 * ═══ CUM ═══
 *
 * Din ora in ora, pentru fiecare magazin cu notice.ro pornit, se cere lista si se aseaza prin
 * `asazaRaspunsurile`: fiecare rand intra o singura data (index unic pe magazin + id-ul lor), iar un
 * „STOP” intra in `sms_optout`, acelasi tabel pe care il citeste si SMSO.
 *
 * ⚠ TOKENUL SE CITESTE CU SERVICE ROLE, fiindca `store_settings` e o VEDERE care decripteaza si
 * `secretDinConfig` cere un utilizator logat, pe care un cron nu-l are. Acelasi tipar ca in
 * `maybeSendNoticeNotification`.
 *
 * ⚠ UN MAGAZIN PICAT NU OPRESTE RESTUL. Tokenul unuia poate fi expirat (masurat: doua mesaje au esuat
 * candva cu „Token API invalid sau expirat”); asta nu e un motiv sa nu citim raspunsurile celorlalti.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cate magazine se ating intr-o trecere. La 3 magazine configurate, nu e o limita care sa muste. */
const MAX_MAGAZINE = 50;

/**
 * Cate mesaje intorc ei pe o pagina la celelalte liste („paginated 25 per page, newest first”).
 * Pentru `/sms-in` nu scrie, deci e doar pragul la care spunem ca s-ar putea sa fi ramas ceva pe
 * pagina a doua. Nu se urmeaza paginile: forma paginarii nu e documentata.
 */
const PAGINA_LOR = 25;

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

  const { data: magazine, error } = await admin
    .from("store_settings")
    .select("business_id, notice_config")
    .not("notice_config", "is", null)
    .limit(MAX_MAGAZINE);

  if (error) {
    await logError({
      action: "cron/notice-raspunsuri",
      message: `magazinele nu s-au putut citi: ${error.message}`,
      severity: "error",
    });
    return NextResponse.json({ error: "citire esuata" }, { status: 500 });
  }

  let magazine_atinse = 0, citite = 0, scrise = 0, opriri = 0, fara_id = 0, straini = 0, picate = 0;
  let forma_necunoscuta = 0, pagini_pline = 0;

  for (const rand of (magazine ?? []) as { business_id: string; notice_config: NoticeConfig | null }[]) {
    const config = rand.notice_config;
    if (!config?.enabled || !config.api_token) continue;
    magazine_atinse++;

    const bilant = await citesteRaspunsurile(admin, rand.business_id, config.api_token);
    if ("error" in bilant) {
      picate++;
      /*
       * ⚠ `warning`, nu `error`: un token expirat la un magazin e o treaba a comerciantului, iar
       * cronul si-a facut datoria pentru celelalte. Ridicat la `error`, ar fi sunat ca o cadere a
       * platformei de fiecare ora, si semnalul adevarat s-ar fi pierdut in zgomot.
       */
      await logError({
        action: "cron/notice-raspunsuri",
        message: `raspunsurile nu s-au putut citi: ${bilant.error}`,
        businessId: rand.business_id, severity: "warning",
      });
      continue;
    }

    /*
     * ═══ ⚠⚠ O LISTA PE CARE N-O INTELEGEM NU E O LISTA GOALA ═══
     *
     * Forma lui `/sms-in` nu e documentata nicaieri: colectia n-are exemple, iar colectia veche e
     * stearsa. Daca ei intorc mesaje si NICIUNUL nu are un numar pe care sa-l recunoastem, parserul
     * tolerant le-ar sari pe toate, iar cronul ar raporta „ok” din ora in ora, cu zero scrise. Exact
     * felul in care `notice_inbox` a stat trei luni gol fara ca nimeni sa afle.
     */
    if (bilant.citite > 0 && bilant.faraNumar === bilant.citite) {
      forma_necunoscuta++;
      await logError({
        action: "cron/notice-raspunsuri",
        message: `notice.ro a intors ${bilant.citite} mesaje, dar niciunul nu are un numar recunoscut: forma lui /sms-in nu e cea asteptata`,
        /* ⚠ Doar NUMELE campurilor, fara valori: ajung ca sa reparam citirea, fara sa copiem mesajele cuiva. */
        details: { campuri_primite: bilant.chei },
        businessId: rand.business_id, severity: "warning",
      });
    }
    if (bilant.citite >= PAGINA_LOR && bilant.scrise === bilant.citite) pagini_pline++;

    citite += bilant.citite;
    scrise += bilant.scrise;
    opriri += bilant.opriri;
    fara_id += bilant.faraId;
    straini += bilant.straini;
  }

  const bilantTrecere = {
    magazine_atinse, citite, scrise, opriri, fara_id, straini, picate, forma_necunoscuta, pagini_pline,
  };
  /*
   * ⚠ Scris si in jurnal, nu doar in raspuns: un cron chemat de Vercel nu-si arata corpul nicaieri, iar
   * dupa desfasurare numerele de aici sunt singura dovada ca trecerea chiar a citit ceva. Doar numere.
   */
  console.log("[cron/notice-raspunsuri]", JSON.stringify(bilantTrecere));
  return NextResponse.json({ ok: true, ...bilantTrecere });
}
