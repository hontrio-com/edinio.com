import { NextRequest, NextResponse } from "next/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";

const TLDS = [".ro", ".com", ".net", ".org"];

/**
 * Check domain availability via DNS-over-HTTPS (Google Public DNS).
 * If the domain has NS records → it's registered (unavailable).
 * If we get NXDOMAIN (status 3) → it doesn't exist (available).
 */
async function checkAvailability(
  name: string,
  tld: string
): Promise<{ domain: string; tld: string; available: boolean | null }> {
  const fqdn = `${name}${tld}`;

  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(fqdn)}&type=NS`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) return { domain: fqdn, tld, available: null };

    const data = (await res.json()) as { Status: number; Answer?: unknown[] };

    // Status 3 = NXDOMAIN → domain does not exist → available
    if (data.Status === 3) return { domain: fqdn, tld, available: true };

    // Status 0 = NOERROR → domain exists (has DNS records) → unavailable
    if (data.Status === 0) return { domain: fqdn, tld, available: false };

    return { domain: fqdn, tld, available: null };
  } catch {
    return { domain: fqdn, tld, available: null };
  }
}

export async function POST(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { searchTerm?: string };
  const searchTerm = body.searchTerm?.trim().toLowerCase();

  if (!searchTerm || searchTerm.length < 2) {
    return NextResponse.json({ error: "searchTerm prea scurt" }, { status: 400 });
  }

  const results = await Promise.all(
    TLDS.map((tld) => checkAvailability(searchTerm, tld))
  );

  return NextResponse.json(results);
}
