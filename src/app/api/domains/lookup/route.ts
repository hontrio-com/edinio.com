import { NextRequest, NextResponse } from "next/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import net from "net";

const TLDS = [".ro", ".com"];

const WHOIS_SERVERS: Record<string, string> = {
  ".ro":  "whois.rotld.ro",
  ".com": "whois.verisign-grs.com",
  ".net": "whois.verisign-grs.com",
  ".org": "whois.pir.org",
};

// Patterns that indicate a domain is NOT registered
const AVAILABLE_PATTERNS: Record<string, string[]> = {
  ".ro":  ["No entries found"],
  ".com": ["No match for"],
  ".net": ["No match for"],
  ".org": ["NOT FOUND"],
};

function whoisLookup(domain: string, server: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let data = "";

    socket.setTimeout(8000);
    socket.connect(43, server, () => {
      socket.write(`${domain}\r\n`);
    });

    socket.on("data", (chunk) => {
      data += chunk.toString();
    });

    socket.on("end", () => {
      resolve(data);
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("WHOIS timeout"));
    });

    socket.on("error", (err) => {
      reject(err);
    });
  });
}

async function checkAvailability(
  name: string,
  tld: string
): Promise<{ domain: string; tld: string; available: boolean | null }> {
  const fqdn = `${name}${tld}`;
  const server = WHOIS_SERVERS[tld];
  const patterns = AVAILABLE_PATTERNS[tld];

  if (!server || !patterns) {
    return { domain: fqdn, tld, available: null };
  }

  try {
    const response = await whoisLookup(fqdn, server);

    // If any "not found" pattern matches, domain is available
    const isAvailable = patterns.some((p) =>
      response.toUpperCase().includes(p.toUpperCase())
    );

    return { domain: fqdn, tld, available: isAvailable };
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
