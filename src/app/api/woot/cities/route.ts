import { NextRequest, NextResponse } from "next/server";
import { fetchCities } from "@/lib/woot";
import { logError } from "@/lib/error-logger";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";

/*
 * Acelasi rationament ca la /api/woot/counties: nomenclator public si stabil,
 * ruta publica si nelimitata. Cache pe judet, in memoria procesului (NU
 * `force-cache` — vezi incidentul cu Vercel Data Cache si 500 pe nomenclatoare).
 */
const cacheOrase = new Map<number, { date: unknown; expira: number }>();
const DURATA_CACHE_MS = 6 * 60 * 60 * 1000;


export async function GET(request: NextRequest) {
  const county_id = Number(request.nextUrl.searchParams.get("county_id"));
  if (!county_id) return NextResponse.json([], { status: 400 });

  const dinCache = cacheOrase.get(county_id);
  if (dinCache && dinCache.expira > Date.now()) {
    return NextResponse.json(dinCache.date);
  }
  if (!rateLimit(`woot-orase:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json([], { status: 429 });
  }

  try {
    const cities = await fetchCities(county_id);
    // 42 de judete: harta nu poate creste necontrolat.
    cacheOrase.set(county_id, { date: cities, expira: Date.now() + DURATA_CACHE_MS });
    return NextResponse.json(cities);
  } catch (e) {
    await logError({ action: "woot.cities", message: e instanceof Error ? e.message : String(e), details: { county_id } });
    return NextResponse.json([], { status: 500 });
  }
}
