"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIpFromHeaders, rateLimit } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";

/**
 * Acțiunile publice ale blogului.
 *
 * ⚠ FIȘIER SEPARAT DINADINS. `blog.actions.ts` are o pază în prima linie a
 * fiecărei funcții, fără excepție — o regulă ușor de verificat dintr-o privire.
 * O funcție publică strecurată acolo ar fi rupt regula aceea și ar fi făcut ca
 * următorul care citește fișierul să nu mai poată avea încredere în ea.
 *
 * Aici, dimpotrivă: TOT ce e în fișierul ăsta e chemat de vizitatori nelogați,
 * deci fiecare funcție trebuie să fie sigură prin ea însăși.
 */

/**
 * Numără o citire de articol.
 *
 * ⚠ TRECE PRIN CHEIA DE SERVICIU, NU PRIN CEA ANONIMĂ.
 *
 * Prima scriere chema funcția din bază cu clientul obișnuit, iar funcția avea
 * `grant execute ... to anon`. Cheia anonimă a Supabase e PUBLICĂ: oricine putea
 * chema direct `rpc/blog_creste_citirile` de câte ori voia, ocolind cu totul
 * plafonul de aici. Cifrele ar fi fost o glumă, iar baza ar fi luat scrierile.
 * Acum funcția e chemabilă doar cu cheia de serviciu, deci drumul ăsta e singurul.
 *
 * ⚠ DOUĂ PLAFOANE, NU UNUL. Cel din memorie oprește rafalele fără să coste
 * nimic, dar se pierde la fiecare desfășurare și e per instanță — pe serverless,
 * „30 pe minut" devine „30 × câte instanțe calde sunt". Cel durabil ține cu
 * adevărat, fiindcă stă în bază.
 *
 * ⚠ NU ARUNCĂ NICIODATĂ. E o socoteală de margine: dacă pică, articolul tot se
 * citește. O eroare aruncată de aici ar fi stricat pagina pentru un număr.
 */
export async function numaraCitirea(slug: string): Promise<void> {
  try {
    const s = (slug ?? "").trim();
    if (!s || s.length > 100) return;

    const ip = clientIpFromHeaders(await headers());

    /* Prima linie: în memorie, fără cost. 30 pe minut e destul pentru cineva
       care răsfoiește, prea puțin pentru un script. */
    if (!rateLimit(`blogView:${ip}`, 30, 60_000)) return;

    /* A doua linie: în bază, deci globală și supraviețuiește desfășurărilor.
       Mai largă decât prima dinadins — ea e pentru abuzul întins pe timp, nu
       pentru rafală. */
    const { permis } = await consumaLimita(`blog-view:ip:${ip}`, 300, 3600);
    if (!permis) return;

    /* Funcția din bază verifică ea însăși că articolul e publicat, deci o ciornă
       nu poate fi numărată nici dacă i se ghicește adresa. Și scrie în
       `blog_post_stats`, nu pe rândul articolului: vezi nota din `types.ts`. */
    /* ⚠ FARA TURNARE, din 30.08.2026: tabelele si functiile de blog sunt acum in
       `database.types.ts`, deci `tsc` verifica si numele functiei, si numele
       argumentului. Pana atunci, un `p_slug` scris gresit ar fi trecut de
       typecheck si de build, si ar fi cazut abia in trafic. */
    await createAdminClient().rpc("blog_creste_citirile", { p_slug: s });
  } catch {
    /* Tăcere dinadins. Vezi nota de sus. */
  }
}
