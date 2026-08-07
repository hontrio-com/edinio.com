import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { proiecteazaCoada } from "@/lib/storefront/catalog/proiector";

/**
 * Goleste coada de reproiectat a catalogului.
 *
 * Scrierile care trec prin aplicatie isi proiecteaza randul SINCRON, deci pentru
 * ele cronul n-are ce face — cand ajunge aici, coada e deja goala. Rostul lui e
 * tot restul, adica exact caile pe care nimeni nu si le aminteste cand se strica
 * ceva: editari din Supabase Studio, SQL rulat de mana, migratii, si orice
 * scriere viitoare care uita sa cheme proiectorul.
 *
 * Fara el, cele doua surse de adevar ar diverge tacut, iar un catalog care arata
 * un pret vechi nu semnaleaza nimic — arata doar gresit. Alarma din
 * `catalog_verifica()` (cronul orar) e a doua plasa, pentru cazul in care nici
 * asta n-a fost de ajuns.
 *
 * La fiecare minut, ca cele patru sincronizari de marketplace. Cand nu e nimic de
 * facut costa o singura interogare pe o tabela care e aproape mereu goala.
 */

/** Cate randuri se iau intr-o rulare. La un minut interval, e mult peste ce se
 *  poate acumula in mod normal; plafonul e pentru cazul unui import mare sau al
 *  unui UPDATE in masa rulat de mana. */
const MAX_PE_RULARE = 2000;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Service role: `catalog_produs` are RLS pornit si NICIO politica. Cu alt
  // client scrierea n-ar da eroare, ar raporta pur si simplu zero randuri.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const inceput = Date.now();
  const scrise = await proiecteazaCoada(admin, MAX_PE_RULARE);

  return NextResponse.json({ ok: true, scrise, ms: Date.now() - inceput });
}
