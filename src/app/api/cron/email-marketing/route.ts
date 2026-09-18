import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { revendica, marcheazaIncheiat, marcheazaEsuat, ARENDA_MS } from "@/lib/email-marketing/coada";
import { trimiteEveniment } from "@/lib/email-marketing/comanda";
import { TERMEN_MS } from "@/lib/email-marketing/transport";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  GOLIREA COZII DE EVENIMENTE DE COMANDA CATRE MAILCHIMP, BREVO SI KLAVIYO
  ═══════════════════════════════════════════════════════════════════════════════

  Randurile le scrie triggerul de pe `orders` (vezi `lib/email-marketing/coada.ts`). Aici se iau cele
  scadente, se trimit una dupa alta si se insemneaza. Acelasi tipar ca `/api/cron/conversii`: un esec
  se reprogrameaza (nu se reia in aceeasi rulare), un refuz se abandoneaza pe loc, cu motivul scris.
*/

/** Cate se iau intr-o rulare. Cronul merge din minut in minut. */
const PE_RULARE = 40;

export const maxDuration = 120;

/**
 * Cat are voie sa dureze bucla.
 *
 * ⚠ DE CE MAI MIC DECAT `maxDuration`, SI DE CE ARENDA E MAI MARE DECAT AMANDOUA. Un rand se trimite
 * in cateva cereri (la Mailchimp, crearea unei comenzi verifica fiecare produs al ei), fiecare cu
 * termenul transportului. Bucla nu mai porneste un rand nou dupa `BUGET_MS`, deci se termina inainte
 * de `maxDuration`; iar arenda (5 minute) e mai lunga decat `maxDuration`, deci nici o rulare taiata
 * nu lasa randul sa fie luat de urmatoarea cat timp inca il trimite.
 */
const BUGET_MS = maxDuration * 1000 - 3 * TERMEN_MS - 10_000;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }
  const inceput = Date.now();

  const randuri = await revendica(PE_RULARE);
  if (randuri.length === 0) return NextResponse.json({ ok: true, luate: 0 });

  let trimise = 0, sarite = 0, esecuri = 0, refuzate = 0, abandonate = 0, amanate = 0;

  for (const r of randuri) {
    /* Randurile ramase nu se pierd: arenda lor expira si le ia o rulare urmatoare. */
    if (Date.now() - inceput > BUGET_MS) { amanate++; continue; }

    /* ⚠ Fiecare rand in `try`-ul lui: o exceptie la al treilea nu are voie sa blocheze restul lotului. */
    try {
      const v = await trimiteEveniment(r.furnizor, r.order_id, r.fel);
      if (v.fel === "trimis") { await marcheazaIncheiat(r.id, "trimis"); trimise++; continue; }
      if (v.fel === "sarit") { await marcheazaIncheiat(r.id, `sarit: ${v.motiv}`); sarite++; continue; }
      if (v.fel === "refuzat") {
        /* ⚠ Un refuz nu se reincearca: la a saptea incercare raspunsul e acelasi. Se scrie, ca sa se repare. */
        await marcheazaEsuat(r.id, r.incercari + 1, v.motiv, true);
        refuzate++;
        await logError({
          action: `email.${r.furnizor}.refuzat`,
          message: `${r.furnizor}/${r.fel}: ${v.motiv}`,
          businessId: r.business_id,
          details: { orderId: r.order_id },
          severity: "warning",
        });
        continue;
      }
      const dupa = await marcheazaEsuat(r.id, r.incercari + 1, v.motiv);
      esecuri++;
      if (dupa === "abandonat") {
        abandonate++;
        /* ⚠ Abandonul dupa toate reincercarile e o comanda care n-a mai ajuns la furnizor: se striga. */
        await logError({
          action: `email.${r.furnizor}.abandonat`,
          message: `${r.furnizor}/${r.fel} abandonat dupa ${r.incercari + 1} incercari: ${v.motiv}`,
          businessId: r.business_id,
          details: { orderId: r.order_id },
          severity: "warning",
        });
      }
    } catch (e) {
      await marcheazaEsuat(r.id, r.incercari + 1, e instanceof Error ? e.message : "exceptie");
      esecuri++;
    }
  }

  if (amanate > 0) {
    await logError({
      action: "email.coada.amanate",
      message: `${amanate} evenimente au ramas pentru rularea urmatoare (bugetul de ${Math.round(BUGET_MS / 1000)}s, arenda de ${ARENDA_MS / 60_000} minute)`,
      severity: "info",
    });
  }

  return NextResponse.json({ ok: true, luate: randuri.length, trimise, sarite, esecuri, refuzate, abandonate, amanate });
}
