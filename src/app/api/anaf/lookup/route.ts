import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupAnaf, type AnafCompany } from "@/lib/anaf/lookup";
import { isValidCui, normalizeCui } from "@/lib/anaf/cui";
import { rateLimit } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { CacheScurt } from "@/lib/utils/cache-scurt";

/**
 * Interogarea ANAF pentru PANOU (Setari > date firma, cumparare domeniu).
 *
 * Cere sesiune. Formularul de comanda NU foloseste ruta asta — cumparatorul e
 * anonim si ar primi 401; el trece prin `lookupCuiPublic` din
 * `lib/actions/anaf.actions.ts`, care are aceeasi logica dar si o limita.
 *
 * DE CE ARE SI ASTA LIMITA, desi apelantul e autentificat. Aici nu se apara date
 * (registrul ANAF e public), ci reputatia IP-urilor Vercel pe care le impart
 * TOATE magazinele: un cont — inregistrarea e self-serve — putea bucla ruta pana
 * cand ANAF ne raspunde 429 tuturor deodata, si atunci pica autocompletarea CUI
 * si in checkout-ul celorlalti 127 de comercianti. Contul nu schimba cine plateste
 * paguba, doar cine o provoaca.
 *
 * Toata munca sta in `lib/anaf/lookup.ts`; aici a ramas paza si cache-ul.
 */

/*
 * Cache in MEMORIA instantei, nu `force-cache`: memoria proiectului consemneaza
 * un incident in care Vercel Data Cache a raspuns 500 pe nomenclatoare mici
 * (vezi vercel-datacache-forcecache-500), iar `lookupAnaf` cheama oricum cu
 * `no-store`. `CacheScurt` si nu o simpla `Map` fiindca CHEIA VINE DE LA CLIENT:
 * fara plafonul lui, CUI-uri inventate ar umfla harta pana la epuizarea memoriei.
 * Se pastreaza doar raspunsurile REUSITE — datele unei firme nu se schimba de la
 * o ora la alta, in timp ce un „negasit" trebuie sa dispara repede, ca o firma
 * tocmai inregistrata sa nu ramana negasita ore intregi.
 */
const cacheFirme = new CacheScurt<AnafCompany>(6 * 60 * 60 * 1000, 500);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  // Prima linie, in memorie: taie rafala fara sa atinga nici baza, nici ANAF.
  if (!rateLimit(`anaf:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: "Prea multe cautari. Asteapta un minut." }, { status: 429 });
  }

  const { cui } = (await req.json()) as { cui?: string };

  const cheie = normalizeCui(cui ?? "");
  const dinCache = cheie ? cacheFirme.get(cheie) : undefined;
  if (dinCache) return NextResponse.json(raspuns(dinCache));

  // A doua linie, durabila, chiar inainte de drumul catre ANAF. Se numara doar
  // cererile care chiar IES din platforma: nu si cele servite din cache, nici
  // cele pe care `lookupAnaf` le respinge local pe cifra de control. Altfel un
  // comerciant care greseste de cateva ori CUI-ul in formular si-ar consuma
  // bugetul pe cereri care n-au atins niciodata ANAF.
  if (isValidCui(cheie) && !(await consumaLimita(`anaf:${user.id}`, 60, 3600)).permis) {
    return NextResponse.json(
      { error: "Ai facut prea multe cautari ANAF in ultima ora. Incearca mai tarziu." },
      { status: 429 },
    );
  }

  const result = await lookupAnaf(cui ?? "");

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (cheie) cacheFirme.set(cheie, result.company);

  return NextResponse.json(raspuns(result.company));
}

// Forma raspunsului e cea de dinainte, cheie cu cheie: `SettingsClient` si
// `DomainSection` citesc exact campurile astea. `vat_payer` si `inactive` sunt
// adaugate la coada, deci nu deranjeaza pe nimeni. Sta separat ca sa iasa
// identica si din cache, si de la ANAF.
function raspuns(c: AnafCompany) {
  return {
    business_name: c.business_name,
    county: c.county,
    city: c.city,
    address: c.address,
    reg_com: c.reg_com,
    post_code: c.post_code,
    vat_payer: c.vat_payer,
    inactive: c.inactive,
  };
}
