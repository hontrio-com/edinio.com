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

/*
 * TREI stari, nu doua: „sigur liber", „sigur ocupat" si „nu stiu".
 *
 * Pana acum exista o singura intrebare — „scrie «not found»?" — si orice alt
 * raspuns insemna „ocupat". Deci un banner de rate-limit de la ROTLD, o
 * mentenanta sau o conexiune inchisa devenea „domeniu indisponibil": clientului i
 * se spunea ca un domeniu LIBER e luat si i se ascundea butonul de comanda.
 * Acum fiecare verdict cere tiparul LUI, iar ce nu se potriveste cu niciunul
 * ramane necunoscut si se spune ca atare.
 */

/** Tipare care dovedesc ca domeniul NU e inregistrat. */
const TIPARE_LIBER: Record<string, string[]> = {
  ".ro":  ["no entries found"],
  ".com": ["no match for"],
  ".net": ["no match for"],
  ".org": ["not found"],
};

/** Tipare care dovedesc ca domeniul CHIAR e inregistrat. */
const TIPARE_OCUPAT: Record<string, string[]> = {
  ".ro":  ["domain name:"],
  ".com": ["domain name:"],
  ".net": ["domain name:"],
  ".org": ["domain name:"],
};

const MESAJ_NECUNOSCUT =
  "Nu am putut verifica acum disponibilitatea (registrul nu a dat un raspuns clar). " +
  "Poti plasa comanda oricum: verificam manual inainte de inregistrare.";

type Stare = "liber" | "ocupat" | "necunoscut";

type Rezultat = {
  domain: string;
  tld: string;
  /** Pastrat pentru interfata veche. `null` inseamna „nu stiu", nu „ocupat". */
  available: boolean | null;
  stare: Stare;
  mesaj?: string;
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

function necunoscut(fqdn: string, tld: string, mesaj: string): Rezultat {
  return { domain: fqdn, tld, available: null, stare: "necunoscut", mesaj };
}

async function checkAvailability(name: string, tld: string): Promise<Rezultat> {
  const fqdn = `${name}${tld}`;
  const server = WHOIS_SERVERS[tld];
  const tipareLiber = TIPARE_LIBER[tld];
  const tipareOcupat = TIPARE_OCUPAT[tld];

  if (!server || !tipareLiber || !tipareOcupat) {
    return necunoscut(fqdn, tld, `Disponibilitatea pentru ${tld} nu se verifica automat.`);
  }

  let raspuns: string;
  try {
    raspuns = (await whoisLookup(fqdn, server)).toLowerCase();
  } catch {
    return necunoscut(fqdn, tld, MESAJ_NECUNOSCUT);
  }

  // „Liber" are prioritate cand s-ar potrivi amandoua: tiparul de liber e o
  // propozitie explicita a registrului („No entries found"), pe cand „Domain
  // Name:" poate fi si simplul ecou al intrebarii noastre din antetul raspunsului.
  if (tipareLiber.some((p) => raspuns.includes(p.toLowerCase()))) {
    return { domain: fqdn, tld, available: true, stare: "liber" };
  }
  if (tipareOcupat.some((p) => raspuns.includes(p.toLowerCase()))) {
    return { domain: fqdn, tld, available: false, stare: "ocupat" };
  }

  // Raspuns gol, banner de limitare, mentenanta: nu ghicim in nicio directie.
  return necunoscut(fqdn, tld, MESAJ_NECUNOSCUT);
}

/*
 * Fiecare cerere deschide socket-uri WHOIS BRUTE catre ROTLD si Verisign, cate
 * unul per TLD verificat. Fara plafon, un cont putea cauta in bucla si obtine
 * blocarea platformei de catre registre (rate-limiting la ei inseamna IP-ul
 * nostru, comun tuturor comerciantilor). Cache scurt in memorie: disponibilitatea
 * unui domeniu nu se schimba de la o secunda la alta.
 */
const cacheWhois = new Map<string, { date: Rezultat[]; expira: number }>();
const DURATA_CACHE_MS = 5 * 60 * 1000;
// Un „nu stiu" nu se tine cinci minute: ar lipi de client un banner trecator de
// rate-limit, exact raspunsul pe care vrem sa-l putem relua repede.
const DURATA_CACHE_NESIGUR_MS = 30 * 1000;

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

  const results = await Promise.all(
    TLDS.map((tld) => checkAvailability(searchTerm, tld))
  );

  /*
   * SCRIEREA in cache lipsea cu totul: harta era doar citita si golita, deci
   * niciun raspuns n-a fost vreodata reutilizat si fiecare tastare deschidea din
   * nou cate o conexiune bruta pe portul 43 catre ROTLD si Verisign — adica exact
   * traficul pe care comentariul de mai sus spunea ca il evita.
   */
  if (cacheWhois.size > 500) cacheWhois.clear();
  const totClar = results.every((r) => r.stare !== "necunoscut");
  cacheWhois.set(searchTerm, {
    date: results,
    expira: Date.now() + (totClar ? DURATA_CACHE_MS : DURATA_CACHE_NESIGUR_MS),
  });

  return NextResponse.json(results);
}
