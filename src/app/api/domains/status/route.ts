import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getDomainStatus, repairDomainOnVercel, type DomainStatus } from "@/lib/vercel";

/**
 * Adevarul despre un domeniu, cerut de la Vercel — nu dedus din baza noastra.
 *
 * Pana acum „Domeniu conectat" se aprindea doar pentru ca `custom_domain` era
 * nenul. Un magazin putea sta zile intregi complet cazut cu bulina verde aprinsa.
 * GET raspunde ce e; POST incearca sa repare, apoi raspunde tot ce e.
 */

/** Ce anume lipseste, spus pe romaneste, in ordinea in care conteaza. */
function diagnose(domain: string, s: DomainStatus): { ok: boolean; title: string; detail: string } {
  if (s.error) {
    return {
      ok: false,
      title: "Nu am putut verifica domeniul",
      detail: s.error,
    };
  }
  if (!s.zone) {
    return {
      ok: false,
      title: "Domeniul nu are zona DNS pe Vercel",
      detail:
        `Nameserverele Vercel nu raspund deloc pentru ${domain}, deci nici site-ul ` +
        `nici emailul nu functioneaza. Apasa „Repara" — inregistram domeniul in cont ` +
        `si cream zona.`,
    };
  }
  if (!s.inProject) {
    return {
      ok: false,
      title: "Domeniul nu e legat de magazin",
      detail: `Zona DNS exista, dar ${domain} nu e atasat proiectului. Apasa „Repara".`,
    };
  }
  if (s.misconfigured) {
    const ns = s.intendedNameservers.length ? s.intendedNameservers : ["ns1.vercel-dns.com", "ns2.vercel-dns.com"];
    return {
      ok: false,
      title: "Asteptam nameserverele",
      detail:
        `Totul e pregatit de partea noastra. La registrarul unde ai cumparat ` +
        `${domain} pune nameserverele: ${ns.join(", ")}. ` +
        (s.currentNameservers.length
          ? `Acum sunt setate: ${s.currentNameservers.join(", ")}. `
          : "") +
        `Dupa schimbare dureaza pana la cateva ore.`,
    };
  }
  if (!s.verified) {
    return {
      ok: false,
      title: "Verificare in curs",
      detail: `DNS-ul arata bine; Vercel inca valideaza proprietatea pentru ${domain}.`,
    };
  }
  if (!s.wwwInProject) {
    return {
      ok: true,
      title: "Functioneaza, dar fara www",
      detail:
        `${domain} merge. Varianta www.${domain} nu e configurata, deci cine o ` +
        `tasteaza primeste eroare de certificat. Apasa „Repara" ca s-o adaugam.`,
    };
  }
  return {
    ok: true,
    title: "Domeniul functioneaza",
    detail: `${domain} si www.${domain} sunt configurate corect si certificatul e activ.`,
  };
}

async function resolveDomain(businessId: string, userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("custom_domain")
    .eq("id", businessId)
    .eq("user_id", userId)
    .single();
  return data?.custom_domain ?? null;
}

export async function GET(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "Date incomplete" }, { status: 400 });
  }

  const domain = await resolveDomain(businessId, user.id);
  if (!domain) {
    return NextResponse.json({ error: "Niciun domeniu conectat" }, { status: 404 });
  }

  const status = await getDomainStatus(domain);
  return NextResponse.json({ domain, status, diagnosis: diagnose(domain, status) });
}

export async function POST(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { businessId } = (await req.json()) as { businessId: string };
  if (!businessId) {
    return NextResponse.json({ error: "Date incomplete" }, { status: 400 });
  }

  const domain = await resolveDomain(businessId, user.id);
  if (!domain) {
    return NextResponse.json({ error: "Niciun domeniu conectat" }, { status: 404 });
  }

  const repair = await repairDomainOnVercel(domain);
  const status = await getDomainStatus(domain);

  return NextResponse.json({
    domain,
    repaired: repair.success,
    repairError: repair.error,
    status,
    diagnosis: diagnose(domain, status),
  });
}
