import { NextRequest, NextResponse } from "next/server";

// ANAF Public API v9 — https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva
const ANAF_URL = "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva";

interface AnafDateGenerale {
  denumire?: string;
  adresa?: string;
  judet?: string;
  cui?: number;
}

interface AnafAdresaDomiciliu {
  ddenumire_Judet?: string;
  ddenumire_Localitate?: string;
  dstrada?: string;
  dnumar?: string;
  dbloc?: string;
  dscara?: string;
  dapartament?: string;
}

interface AnafFoundItem {
  date_generale?: AnafDateGenerale;
  adresa_domiciliu_fiscal?: AnafAdresaDomiciliu;
  // v8 flat fields (fallback)
  denumire?: string;
  adresa?: string;
  judet?: string;
}

interface AnafResponse {
  cod?: number;
  message?: string;
  found?: AnafFoundItem[];
  notFound?: number[];
}

export async function POST(req: NextRequest) {
  const { cui } = await req.json() as { cui: string };

  if (!cui) {
    return NextResponse.json({ error: "CUI lipsa" }, { status: 400 });
  }

  // Strip non-numeric characters ("RO" prefix etc.)
  const cuiNumeric = Number(cui.replace(/\D/g, ""));
  if (!cuiNumeric || cuiNumeric <= 0) {
    return NextResponse.json({ error: "CUI invalid" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];

  // Manual timeout via AbortController (AbortSignal.timeout not available everywhere)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(ANAF_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ cui: cuiNumeric, data: today }]),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.error("[anaf/lookup] HTTP error:", res.status);
      return NextResponse.json({ error: "Serviciul ANAF nu raspunde. Incearca din nou." }, { status: 502 });
    }

    const data = await res.json() as AnafResponse;

    if (!data.found || data.found.length === 0) {
      return NextResponse.json({ error: "CUI negasit in baza de date ANAF." }, { status: 404 });
    }

    const item = data.found[0];

    // Support both v9 nested structure and flat fallback
    const dateGenerale = item.date_generale ?? item;
    const adresa = item.adresa_domiciliu_fiscal;

    const businessName = (dateGenerale.denumire ?? "").trim();
    let county = (adresa?.ddenumire_Judet ?? dateGenerale.judet ?? "").trim();
    let city = (adresa?.ddenumire_Localitate ?? "").trim();

    // Build street address from domiciliu fiscal fields
    let street = "";
    if (adresa?.dstrada) {
      street = `Str. ${adresa.dstrada}`;
      if (adresa.dnumar) street += ` nr. ${adresa.dnumar}`;
      if (adresa.dbloc) street += ` bl. ${adresa.dbloc}`;
      if (adresa.dscara) street += ` sc. ${adresa.dscara}`;
      if (adresa.dapartament) street += ` ap. ${adresa.dapartament}`;
    } else {
      // Fallback: use raw address string
      street = (dateGenerale.adresa ?? "").trim();
    }

    // Fallback: if no city parsed, use county name
    if (!city) city = county;

    // Capitalize county/city properly (ANAF returns uppercase)
    const capitalize = (s: string) =>
      s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

    if (!businessName) {
      return NextResponse.json({ error: "Date incomplete in ANAF pentru acest CUI." }, { status: 404 });
    }

    return NextResponse.json({
      business_name: businessName,
      county: capitalize(county),
      city: capitalize(city),
      address: street,
    });
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error("[anaf/lookup] Error:", err);
    return NextResponse.json(
      { error: isTimeout ? "Serviciul ANAF nu raspunde (timeout)." : "Eroare la interogarea ANAF." },
      { status: 502 }
    );
  }
}
