import { NextRequest, NextResponse } from "next/server";

interface AnafCompany {
  denumire: string;
  adresa: string;
  judet: string;
  cui: number;
  data_inregistrare: string | null;
  stare_inactiv: boolean;
}

interface AnafResponse {
  found: AnafCompany[];
  notFound: number[];
}

export async function POST(req: NextRequest) {
  const { cui } = await req.json() as { cui: string };

  if (!cui) {
    return NextResponse.json({ error: "CUI lipsa" }, { status: 400 });
  }

  // Strip non-numeric characters (e.g. "RO" prefix)
  const cuiNumeric = Number(cui.replace(/\D/g, ""));
  if (!cuiNumeric || cuiNumeric <= 0) {
    return NextResponse.json({ error: "CUI invalid" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];

  try {
    const res = await fetch(
      "https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ cui: cuiNumeric, data: today }]),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Serviciul ANAF nu raspunde" }, { status: 502 });
    }

    const data = await res.json() as AnafResponse;

    if (!data.found || data.found.length === 0) {
      return NextResponse.json({ error: "CUI negasit in baza de date ANAF" }, { status: 404 });
    }

    const company = data.found[0];

    // ANAF returns a single address string like "JUD. ILFOV, COM. VOLUNTARI, STR. EXEMPLU, NR. 5"
    // We parse it to extract city and county separately.
    const address = company.adresa ?? "";
    const county = company.judet ?? "";

    // Try to extract city from address (after county prefix)
    let city = "";
    const cityMatch = address.match(/(?:MUN\.|COM\.|OR\.|SECTOR\s+\d)\s+([^,]+)/i);
    if (cityMatch) {
      city = cityMatch[0]
        .replace(/^(?:MUN\.|COM\.|OR\.)\s*/i, "")
        .replace(/^SECTOR\s+/i, "Sector ")
        .trim();
    }

    // Street address: everything after the city part
    const streetMatch = address.match(/(?:STR\.|BD\.|CAL\.|SOS\.|AL\.|INTR\.|SL\.).*$/i);
    const street = streetMatch ? streetMatch[0].trim() : "";

    return NextResponse.json({
      business_name: company.denumire?.trim() ?? "",
      county: county.trim(),
      city: city || county.trim(),
      address: street || address.trim(),
    });
  } catch (err) {
    console.error("[anaf/lookup] Error:", err);
    return NextResponse.json({ error: "Eroare la interogarea ANAF" }, { status: 500 });
  }
}
