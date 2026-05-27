import { NextResponse } from "next/server";
import { fetchCounties } from "@/lib/woot";

export async function GET() {
  try {
    const counties = await fetchCounties();
    return NextResponse.json(counties);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
