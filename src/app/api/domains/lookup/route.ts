import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
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

/*
 * Fiecare cerere deschide socket-uri WHOIS BRUTE catre ROTLD si Verisign, cate
 * unul per TLD verificat. Fara plafon, un cont putea cauta in bucla si obtine
 * blocarea platformei de catre registre (rate-limiting la ei inseamna IP-ul
 * nostru, comun tuturor comerciantilor). Cache scurt in memorie: disponibilitatea
 * unui domeniu nu se schimba de la o secunda la alta.
 */
const cacheWhois = new Map<string, { date: unknown; expira: number }>();
const DURATA_CACHE_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`whois:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "Prea multe cautari. Asteapta un minut." }, { status: 429 });
  }

  const body = (await req.json()) as { searchTerm?: string };
  // Curata si aici: scoate un TLD tastat (.ro/.com) inainte de a elimina punctele,
  // ca sa nu ajungem sa interogam "nume.ro.ro" daca primim din greseala eticheta cu TLD.
  const searchTerm = body.searchTerm
    ?.trim()
    .toLowerCase()
    .replace(/\.[a-z]{2,}$/, "")
    .replace(/[^a-z0-9-]/g, "");

  if (!searchTerm || searchTerm.length < 2) {
    return NextResponse.json({ error: "searchTerm prea scurt" }, { status: 400 });
  }

  const dinCache = cacheWhois.get(searchTerm);
  if (dinCache && dinCache.expira > Date.now()) {
    return NextResponse.json(dinCache.date);
  }
  if (!(await consumaLimita(`whois:${user.id}`, 60, 3600)).permis) {
    return NextResponse.json({ error: "Ai facut prea multe cautari. Incearca mai tarziu." }, { status: 429 });
  }
  if (cacheWhois.size > 500) cacheWhois.clear();

  const results = await Promise.all(
    TLDS.map((tld) => checkAvailability(searchTerm, tld))
  );

  return NextResponse.json(results);
}
