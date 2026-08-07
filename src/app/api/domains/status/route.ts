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

type Diagnostic = { ok: boolean; title: string; detail: string };

/** Instructiunile DNS, cu valorile REALE primite de la Vercel pentru acest proiect. */
function instructiuni(domain: string, s: DomainStatus): string {
  const a = s.recommendedIPv4[0];
  const cname = s.recommendedCNAME[0];
  const ns = s.intendedNameservers.length ? s.intendedNameservers : null;

  const peInregistrari = a
    ? `La registrarul unde ai cumparat ${domain}, pune un A pe domeniu (@) catre ${a}` +
      (cname ? `, si un CNAME pe www catre ${cname}.` : ".")
    : null;

  // Nameserverele se recomanda DOAR daca Vercel chiar gazduieste zona. Fara
  // zona, mutarea nameserverelor nu e o imbunatatire — omoara domeniul complet,
  // si site si email. Exact asta a patit atelierullarisei.ro pe 07.08.2026.
  const peNameservere =
    s.zone && ns
      ? ` Alternativ, poti muta nameserverele domeniului la Vercel: ${ns.join(", ")} — ` +
        `dar atunci trebuie sa readaugi aici si inregistrarile de email (MX), pentru ` +
        `ca zona porneste goala.`
      : "";

  if (peInregistrari) return peInregistrari + peNameservere;
  if (ns && s.zone) return `Muta nameserverele domeniului ${domain} la: ${ns.join(", ")}.`;
  return `Deschide setarile DNS ale domeniului ${domain} la registrarul tau si urmeaza instructiunile din pagina.`;
}

/** Ce anume lipseste, spus pe romaneste, in ordinea in care conteaza. */
function diagnose(domain: string, s: DomainStatus): Diagnostic {
  if (s.error) {
    return { ok: false, title: "Nu am putut verifica domeniul", detail: s.error };
  }

  // Cazul fatal: zona DOVEDIT lipsa, si domeniul chiar nu ajunge la noi.
  if (s.zoneMissing) {
    return {
      ok: false,
      title: "Domeniul nu are zona DNS pe Vercel",
      detail:
        `Nu raspunde nimeni pentru ${domain} — nici site-ul, nici emailul. ` +
        `Apasa „Repara". Daca nici dupa aceea nu merge, ${instructiuni(domain, s)}`,
    };
  }

  if (!s.inProject) {
    return {
      ok: false,
      title: "Domeniul nu e legat de magazin",
      detail: `${domain} nu e atasat magazinului tau in rutare. Apasa „Repara".`,
    };
  }

  if (s.misconfigured) {
    return {
      ok: false,
      title: "Asteptam DNS-ul",
      detail:
        `Totul e pregatit de partea noastra. ${instructiuni(domain, s)} ` +
        (s.currentNameservers.length
          ? `Momentan nameserverele sunt: ${s.currentNameservers.join(", ")}. `
          : "") +
        `Dupa modificare dureaza pana la cateva ore.`,
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
    // `repaired` reflecta acum ce s-a intamplat CU ADEVARAT: repararea
    // re-citeste starea si refuza sa raporteze succes daca problema pentru care
    // a fost chemata e tot acolo.
    repaired: repair.success,
    repairError: repair.error,
    status,
    diagnosis: diagnose(domain, status),
  });
}
