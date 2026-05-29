import { NextRequest, NextResponse } from "next/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";

const RDAP_ENDPOINTS: Record<string, string> = {
  ".com": "https://rdap.verisign.com/com/v1/domain/",
  ".net": "https://rdap.verisign.com/net/v1/domain/",
  ".org": "https://rdap.org/domain/",
  ".ro":  "https://rdap.org/domain/",
};

const TLDS = [".ro", ".com", ".net", ".org"];

async function checkAvailability(
  domain: string,
  tld: string
): Promise<{ domain: string; tld: string; available: boolean | null }> {
  const fqdn = `${domain}${tld}`;
  const endpoint = RDAP_ENDPOINTS[tld] ?? "https://rdap.org/domain/";

  try {
    const res = await fetch(`${endpoint}${fqdn}`, {
      headers: { Accept: "application/rdap+json" },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });

    if (res.status === 404) return { domain: fqdn, tld, available: true };
    if (res.ok) return { domain: fqdn, tld, available: false };
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

  // Check all TLDs in parallel via RDAP
  const results = await Promise.all(
    TLDS.map((tld) => checkAvailability(searchTerm, tld))
  );

  return NextResponse.json(results);
}
