import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupAnaf } from "@/lib/anaf/lookup";

/**
 * Interogarea ANAF pentru PANOU (Setari > date firma, cumparare domeniu).
 *
 * Cere sesiune si nu are limita de cereri: aici apelantul e un comerciant
 * autentificat. Formularul de comanda NU foloseste ruta asta — cumparatorul e
 * anonim si ar primi 401; el trece prin `lookupCuiPublic` din
 * `lib/actions/anaf.actions.ts`, care are aceeasi logica dar si o limita.
 *
 * Toata munca sta in `lib/anaf/lookup.ts`; aici a ramas doar paza.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { cui } = (await req.json()) as { cui?: string };
  const result = await lookupAnaf(cui ?? "");

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Forma raspunsului e cea de dinainte, cheie cu cheie: `SettingsClient` si
  // `DomainSection` citesc exact campurile astea. `vat_payer` si `inactive` sunt
  // adaugate la coada, deci nu deranjeaza pe nimeni.
  const c = result.company;
  return NextResponse.json({
    business_name: c.business_name,
    county: c.county,
    city: c.city,
    address: c.address,
    reg_com: c.reg_com,
    post_code: c.post_code,
    vat_payer: c.vat_payer,
    inactive: c.inactive,
  });
}
