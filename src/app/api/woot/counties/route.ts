import { NextResponse } from "next/server";
import { fetchCounties } from "@/lib/woot";
import { logError } from "@/lib/error-logger";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { headers } from "next/headers";

/*
 * Judetele Romaniei nu se schimba. Ruta era publica, neautentificata si
 * nelimitata, iar fiecare cerere insemna o invocare de functie plus o cerere
 * catre API-ul Woot — adica un amplificator de cost gratuit pentru oricine.
 *
 * Cache in MEMORIA procesului, nu `force-cache`: memoria proiectului consemneaza
 * un incident in care Vercel Data Cache a raspuns 500 exact pe nomenclatoare mici
 * (vezi vercel-datacache-forcecache-500). Per instanta e suficient — nomenclatorul
 * e mic si identic pentru toata lumea.
 */
let cacheJudete: { date: unknown; expira: number } | null = null;
const DURATA_CACHE_MS = 6 * 60 * 60 * 1000; // 6 ore

export async function GET() {
  if (cacheJudete && cacheJudete.expira > Date.now()) {
    return NextResponse.json(cacheJudete.date);
  }
  if (!rateLimit(`woot-judete:${clientIpFromHeaders(await headers())}`, 30, 60_000)) {
    return NextResponse.json([], { status: 429 });
  }
  try {
    const counties = await fetchCounties();
    cacheJudete = { date: counties, expira: Date.now() + DURATA_CACHE_MS };
    return NextResponse.json(counties);
  } catch (e) {
    await logError({ action: "woot.counties", message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json([], { status: 500 });
  }
}
