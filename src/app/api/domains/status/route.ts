import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getDomainStatus, repairDomainOnVercel, sanatateDomeniu, type DomainStatus } from "@/lib/vercel";

/**
 * Adevarul despre un domeniu, cerut de la Vercel si de la DNS-ul public — nu
 * dedus din baza noastra.
 *
 * Pana acum „Domeniu conectat" se aprindea doar pentru ca `custom_domain` era
 * nenul. Un magazin putea sta zile intregi complet cazut cu bulina verde aprinsa.
 * GET raspunde ce e; POST incearca sa repare, apoi raspunde tot ce e.
 */

/**
 * Forma stabila pe care o consuma interfata.
 *
 * `ok` si `poateRepara` sunt lucruri DIFERITE si de aceea sunt doua campuri:
 * „nu am putut verifica" nu e ok, dar nici nu se repara pe orb; „merge dar fara
 * www" chiar are ce sa repare. Pana acum interfata deducea butonul din `!ok`,
 * deci exista exact cazul in care textul spunea „apasa Repara" iar butonul nu
 * se randa deloc.
 */
type Diagnostic = { ok: boolean; title: string; detail: string; poateRepara: boolean };

/*
 * Instructiunile se dau PER METODA, si numai cu valori primite de la Vercel
 * pentru acest proiect. Nimic hardcodat: tintele de A/CNAME sunt per-proiect, iar
 * nameserverele le spune tot Vercel in randul din cont. O valoare inventata de
 * noi trimite clientul sa strice DNS-ul cu mana lui.
 */

/** Metoda A/CNAME: clientul isi pastreaza DNS-ul, deci si emailul. */
function pasiInregistrari(domain: string, s: DomainStatus): string | null {
  const bucati: string[] = [];
  if (s.recommendedIPv4[0]) bucati.push(`o inregistrare A pe @ catre ${s.recommendedIPv4[0]}`);
  if (s.recommendedCNAME[0]) bucati.push(`un CNAME pe www catre ${s.recommendedCNAME[0]}`);
  if (!bucati.length) return null;
  return (
    `la registrarul unde tii DNS-ul lui ${domain}, adauga ${bucati.join(" si ")}; ` +
    `restul zonei ramane neatins, deci emailul (MX) merge mai departe`
  );
}

/** Metoda nameservere: cere zona la Vercel, iar zona porneste GOALA. */
function pasiNameservere(domain: string, s: DomainStatus): string | null {
  if (!s.intendedNameservers.length) return null;
  return (
    `muta nameserverele lui ${domain} la ${s.intendedNameservers.join(", ")}; ` +
    `zona de la noi porneste goala, deci imediat dupa mutare trebuie readaugate ` +
    `inregistrarile de email (MX), altfel emailul se opreste`
  );
}

/** Pe ce cale ajunge de fapt traficul la noi, citita din DNS-ul real. */
function prinMetoda(s: DomainStatus): string {
  if (s.metoda === "nameservere") return ", prin nameservere delegate catre Vercel";
  if (s.metoda === "inregistrari") return ", prin inregistrari A/CNAME la registrarul tau";
  return "";
}

/** Ce are clientul de facut, pe metoda care i se potriveste LUI. */
function instructiuni(domain: string, s: DomainStatus): string {
  const inreg = pasiInregistrari(domain, s);
  const ns = pasiNameservere(domain, s);

  /*
   * Recomandarea urmeaza REALITATEA din DNS, nu preferinta noastra. Unui domeniu
   * cu nameserverele deja mutate la Vercel nu are rost sa-i ceri A/CNAME la
   * registrarul vechi: acela nu mai e autoritativ, deci ce se scrie acolo nu vede
   * nimeni. Si invers: cui tine DNS-ul la el nu-i dai instructiuni de zona.
   */
  if (s.delegated) {
    const vazute = s.currentNameservers.length ? ` (${s.currentNameservers.join(", ")})` : "";
    const iesire = inreg
      ? ` Daca preferi sa nu depinzi de zona gazduita la noi si sa-ti tii emailul unde e acum, ` +
        `muta nameserverele inapoi la registrarul tau si ${inreg}.`
      : "";
    return (
      `Nameserverele lui ${domain}${vazute} sunt deja mutate la Vercel, deci configurarea DNS ` +
      `se face la noi, nu la registrar; inregistrarile ramase acolo nu mai au niciun efect.${iesire}`
    );
  }

  if (inreg && ns) return `Metoda recomandata, care nu-ti atinge emailul: ${inreg}. Metoda alternativa: ${ns}.`;
  if (inreg) return `Metoda recomandata, care nu-ti atinge emailul: ${inreg}.`;
  if (ns) return `Singura metoda pe care ti-o putem da acum: ${ns}.`;
  return `Deschide setarile DNS ale lui ${domain} la registrarul tau si urmeaza pasii din sectiunea „Conecteaza domeniu".`;
}

/** Ce anume lipseste, spus pe romaneste, in ordinea in care conteaza. */
function diagnose(domain: string, s: DomainStatus): Diagnostic {
  /*
   * Dovada de moarte se MASOARA (`false`), nu se deduce. Cand exista, ea bate
   * citirea incompleta: altfel un `error` partial (n-am putut citi randul din
   * contul Vercel) ar ascunde un domeniu care chiar e cazut — exact felul de
   * tacere care a tinut esafe.ro offline.
   */
  const mortDovedit = s.zoneMissing || s.dnsRaspunde === false;

  if (s.error && !mortDovedit) {
    return {
      ok: false,
      poateRepara: false,
      title: "Nu am putut verifica domeniul",
      detail:
        `${s.error} Asta NU inseamna ca ${domain} e stricat, ci ca acum nu avem raspuns. ` +
        `Nu pornim nicio reparatie pe o citire incompleta. Incearca „Verifica din nou" peste cateva minute.`,
    };
  }

  // Cazul fatal: delegat catre noi si nu raspunde nimeni. Cad si site, si email.
  if (s.zoneMissing) {
    const iesire = pasiInregistrari(domain, s);
    return {
      ok: false,
      poateRepara: true,
      title: "Domeniul nu are zona DNS la noi",
      detail:
        `Nameserverele lui ${domain} arata catre Vercel, dar nu raspunde nimeni pentru domeniu: ` +
        `sunt cazute si site-ul, si emailul. Apasa „Repara" — incercam sa cream zona. ` +
        (iesire
          ? `Daca nu reuseste, iesirea sigura e sa muti nameserverele inapoi la registrarul tau si ${iesire}: ` +
            `metoda asta nu are nevoie de zona la noi.`
          : `Daca nu reuseste, muta nameserverele inapoi la registrarul tau si scrie-ne: te conectam prin ` +
            `inregistrari A/CNAME, care nu au nevoie de zona la noi.`),
    };
  }

  // Nu e delegat catre noi si tot nu raspunde nimeni: e rupt la registrarul lui.
  if (s.dnsRaspunde === false) {
    const vazute = s.currentNameservers.length
      ? `Nameserverele pe care le vede lumea sunt ${s.currentNameservers.join(", ")}. `
      : "";
    return {
      ok: false,
      poateRepara: false,
      title: "Domeniul nu raspunde deloc",
      detail:
        `Nimeni nu raspunde pentru ${domain}: nici site-ul, nici emailul. ${vazute}` +
        `Problema e la registrarul sau la furnizorul tau de DNS, nu in rutarea noastra — verifica acolo ` +
        `daca domeniul mai e platit si daca zona lui mai exista. Reparatia din pagina asta nu are ce face pana atunci.`,
    };
  }

  // `false` si `null` sunt lucruri diferite: primul e o lipsa dovedita si se
  // repara, al doilea e o citire care n-a raspuns si NU se atinge.
  if (s.inProject === false) {
    return {
      ok: false,
      poateRepara: true,
      title: "Domeniul nu e legat de magazin",
      detail: `${domain} nu e atasat magazinului tau in rutare, deci nici DNS-ul corect nu l-ar ajuta. Apasa „Repara" ca sa-l atasam.`,
    };
  }
  if (s.inProject === null) {
    return {
      ok: false,
      poateRepara: false,
      title: "Nu am putut verifica legatura cu magazinul",
      detail:
        `Vercel nu ne-a spus daca ${domain} e atasat magazinului. Nu declaram nimic pe o citire care lipseste; ` +
        `incearca „Verifica din nou" peste cateva minute.`,
    };
  }

  if (s.misconfigured) {
    return {
      ok: false,
      poateRepara: false,
      title: "Asteptam DNS-ul",
      detail:
        `De partea noastra totul e pregatit, dar DNS-ul lui ${domain} inca nu ajunge la noi. ` +
        `${instructiuni(domain, s)} Dupa modificare, propagarea dureaza pana la cateva ore.`,
    };
  }

  if (!s.verified) {
    return {
      ok: false,
      poateRepara: true,
      title: "Verificare in curs",
      detail: `DNS-ul lui ${domain} arata bine, dar configuratia nu e inca confirmata de Vercel. Mai asteapta cateva minute; daca ramane asa, apasa „Repara".`,
    };
  }

  if (s.wwwInProject === false) {
    return {
      /*
       * `ok:false` DELIBERAT, desi apexul raspunde: cine tasteaza www.<domeniu>
       * primeste eroare de certificat, deci domeniul nu e configurat complet. Si
       * asa mesajul si butonul ajung impreuna la client — versiunea de dinainte
       * intorcea `ok:true` si scria „apasa Repara" intr-un panou care nu randa
       * niciun buton.
       */
      ok: false,
      poateRepara: true,
      title: "Merge, dar fara www",
      detail:
        `${domain} raspunde corect${prinMetoda(s)}. Varianta www.${domain} nu e configurata, deci cine o ` +
        `tasteaza primeste eroare de certificat. Apasa „Repara" ca s-o adaugam.`,
    };
  }

  if (s.wwwInProject === null) {
    return {
      ok: true,
      poateRepara: true,
      title: "Domeniul functioneaza",
      detail:
        `${domain} raspunde corect${prinMetoda(s)}. Nu am putut verifica varianta www.${domain}; ` +
        `daca vizitatorii se plang de ea, apasa „Repara".`,
    };
  }

  return {
    ok: true,
    poateRepara: false,
    title: "Domeniul functioneaza",
    detail: `${domain} si www.${domain} sunt configurate corect si certificatul e activ${prinMetoda(s)}.`,
  };
}

/**
 * Scrie in baza ce am DOVEDIT despre domeniu, ca proxy-ul sa afle imediat.
 *
 * Numai dovezi: `true` cand statusul e sanatos peste tot, `false` cand
 * nameserverele chiar nu raspund. Pe „nu stiu" nu scriem nimic — un `null` pus
 * peste un `false` dovedit ar reporni redirectul de pe edinio.com/<slug> catre un
 * domeniu mort, adica exact defectul din 10.08.2026. Fara asta, clientul apasa
 * „Verifica", vede verde, si tot asteapta pana la o ora dupa cron ca magazinul
 * sa redevina accesibil pe adresa de platforma.
 */
async function noteazaSanatate(businessId: string, s: DomainStatus): Promise<void> {
  // Acelasi predicat ca in cron (`sanatateDomeniu`), nu o copie: cele doua cai de
  // scriere erau scrise separat si divergeau deja.
  const sanatos = sanatateDomeniu(s);
  if (sanatos === null) return;

  // `custom_domain_healthy` nu are grant de UPDATE pentru `authenticated`:
  // sanatatea se constata din masuratori, nu si-o declara comerciantul singur.
  await createAdminClient()
    .from("businesses")
    .update({ custom_domain_healthy: sanatos, custom_domain_checked_at: new Date().toISOString() })
    .eq("id", businessId);
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
  await noteazaSanatate(businessId, status);

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
  await noteazaSanatate(businessId, status);

  return NextResponse.json({
    domain,
    // `repaired` reflecta ce s-a intamplat CU ADEVARAT: repararea re-citeste
    // starea si refuza sa raporteze succes daca problema pentru care a fost
    // chemata e tot acolo.
    repaired: repair.success,
    repairError: repair.error,
    // Acelasi esec partial (geamanul www nereusit, zona lipsa pe cale A/CNAME) era
    // vizibil la conectare si INVIZIBIL la reparare: ruta de connect il propaga,
    // asta il arunca.
    repairWarning: repair.warning,
    status,
    diagnosis: diagnose(domain, status),
  });
}
