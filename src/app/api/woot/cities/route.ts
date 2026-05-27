import { NextRequest, NextResponse } from "next/server";
import { fetchCities } from "@/lib/woot";

export async function GET(request: NextRequest) {
  const county_id = Number(request.nextUrl.searchParams.get("county_id"));
  if (!county_id) return NextResponse.json([], { status: 400 });

  try {
    const cities = await fetchCities(county_id);
    return NextResponse.json(cities);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
