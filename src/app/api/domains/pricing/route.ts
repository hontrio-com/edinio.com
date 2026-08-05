import { NextResponse } from "next/server";
import { resellerCall } from "@/lib/reseller";
import { getCachedUser } from "@/lib/supabase/cached-queries";

/*
 * Lista de preturi TLD e IDENTICA pentru toti utilizatorii si se schimba de
 * cateva ori pe an. Fara cache, fiecare deschidere a sectiunii de domenii — sau
 * fiecare cerere buclata de un cont oarecare — insemna un apel `resellerCall`
 * catre reseller.ro cu cheia de API a PLATFORMEI, adica reputatia si cota
 * noastra la un furnizor tert, arse de un singur apelant.
 *
 * Cache in MEMORIA instantei, nu `force-cache`: memoria proiectului consemneaza
 * un incident in care Vercel Data Cache a raspuns 500 exact pe nomenclatoare mici
 * (vezi vercel-datacache-forcecache-500). Per instanta e suficient — in cel mai
 * rau caz fiecare instanta calda face cate un apel la sase ore.
 */
let cachePreturi: { date: Record<string, unknown>; expira: number } | null = null;
const DURATA_CACHE_MS = 6 * 60 * 60 * 1000; // 6 ore

export async function GET() {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (cachePreturi && cachePreturi.expira > Date.now()) {
    return NextResponse.json(cachePreturi.date);
  }

  const data = await resellerCall("/tlds/pricing", "GET");
  // Un esec nu se cache-uieste: altfel o clipire a furnizorului ar tine sectiunea
  // de domenii goala sase ore. `resellerCall` intoarce `result: "error"` si cand
  // raspunsul nu e macar JSON, deci verificam campul, nu doar exceptiile.
  if (data.result !== "error") {
    cachePreturi = { date: data, expira: Date.now() + DURATA_CACHE_MS };
  }
  return NextResponse.json(data);
}
