import crypto from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Autentificarea job-urilor cron, intr-un singur loc.
 *
 * PROBLEMA PE CARE O REZOLVA — tiparul repetat in toate cele 12 rute era:
 *
 *     return req.headers.get("authorization")?.replace("Bearer ", "") === process.env.CRON_SECRET;
 *
 * Cand antetul lipseste, `?.replace(...)` da `undefined`. Cand `CRON_SECRET` nu
 * e setata in mediu, `process.env.CRON_SECRET` e tot `undefined`. Deci pe orice
 * deployment fara variabila, `undefined === undefined` era `true` si TOATE
 * cronurile deveneau publice — cu service role, adica ocolind RLS. Un preview
 * fara variabila e deosebit de periculos: scrie in baza de PRODUCTIE.
 *
 * Aici: secretul lipsa inseamna REFUZ (fail-closed), comparatia e in timp
 * constant si acceptam si antetul `x-vercel-cron` pe care il pune Vercel.
 */
export function verificaCron(req: NextRequest): boolean {
  const asteptat = process.env.CRON_SECRET;

  // Fail-closed: fara secret configurat, nimeni nu intra.
  if (!asteptat || asteptat.length === 0) {
    console.error("[cron] CRON_SECRET nu este setat — cerere respinsa");
    return false;
  }

  const antet = req.headers.get("authorization") ?? "";
  const primit = antet.startsWith("Bearer ") ? antet.slice(7) : antet;
  if (!primit) return false;

  const a = Buffer.from(primit);
  const b = Buffer.from(asteptat);
  // `timingSafeEqual` arunca la lungimi diferite; comparam intai lungimea.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
