"use server";

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { clientIpFromHeaders, rateLimit } from "@/lib/utils/rate-limit";

/**
 * Acțiunile publice ale blogului.
 *
 * ⚠ FIȘIER SEPARAT DINADINS. `blog.actions.ts` are `requireAdminApi()` în prima
 * linie a fiecărei funcții, fără excepție — o regulă ușor de verificat dintr-o
 * privire. O funcție publică strecurată acolo ar fi rupt regula aceea și ar fi
 * făcut ca următorul care citește fișierul să nu mai poată avea încredere în ea.
 *
 * Aici, dimpotrivă: TOT ce e în fișierul ăsta e chemat de vizitatori nelogați,
 * deci fiecare funcție trebuie să fie sigură prin ea însăși.
 */
async function db(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

/**
 * Numără o citire de articol.
 *
 * ⚠ NUMĂRUL E O MĂSURĂ, NU O CONTABILITATE. Nu ține minte cine a citit, nu pune
 * cookie și nu deosebește un om de altul. Un cititor care reîncarcă pagina
 * numără de două ori, iar plafonul de mai jos oprește doar rafalele. E de ajuns
 * pentru întrebarea la care răspunde („ce articole se citesc?"), și e mult mai
 * puțin decât ar cere o unealtă de analiză — care ar fi însemnat și un banner
 * de cookie-uri în plus.
 *
 * ⚠ NU ARUNCĂ NICIODATĂ. E o socoteală de margine: dacă pică, articolul tot se
 * citește. O eroare aruncată de aici ar fi stricat pagina pentru un număr.
 */
export async function numaraCitirea(slug: string): Promise<void> {
  try {
    const s = (slug ?? "").trim();
    if (!s || s.length > 100) return;

    /* 30 pe minut de pe același IP: destul pentru cineva care răsfoiește, prea
       puțin pentru cineva care umflă cifrele cu un script. */
    const ip = clientIpFromHeaders(await headers());
    if (!rateLimit(`blogView:${ip}`, 30, 60_000)) return;

    /* Funcția din baza de date verifică ea însăși că articolul e publicat, deci
       o ciornă nu poate fi numărată nici dacă i se ghicește adresa. */
    await (await db()).rpc("blog_creste_citirile", { p_slug: s });
  } catch {
    /* Tăcere dinadins. Vezi nota de sus. */
  }
}
