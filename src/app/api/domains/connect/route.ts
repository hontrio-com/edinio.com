import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { addDomainToVercel, removeDomainFromVercel, type MetodaConectare } from "@/lib/vercel";
import { valideazaDomeniuClient } from "@/lib/platform-hosts";

/**
 * Metoda de conectare, asa cum a ales-o clientul.
 *
 * Implicit „inregistrari": e singura varianta care nu poate strica nimic din ce
 * are deja. „nameservere" cere zona la Vercel, iar zona porneste GOALA — deci ii
 * opreste emailul pana isi readauga MX-urile. Cand lipseste, alegem varianta
 * care nu face rau.
 *
 * O valoare necunoscuta se REFUZA, nu se rezolva tacit in cea implicita: daca
 * interfata trimite altceva decat stim noi, clientul a apasat „nameservere" si
 * ar primi tacut conectarea prin inregistrari, cu instructiuni pentru cealalta
 * metoda. Etichetele vechi ale interfetei sunt acceptate explicit ca sinonime.
 */
function citesteMetoda(brut: unknown): MetodaConectare | null {
  if (brut === undefined || brut === null || brut === "") return "inregistrari";
  if (brut === "inregistrari" || brut === "records") return "inregistrari";
  if (brut === "nameservere" || brut === "nameservers") return "nameservere";
  return null;
}

/**
 * Scoate domeniul din Vercel doar daca niciun ALT magazin nu-l mai foloseste.
 *
 * Pana acum se stergea neconditionat. Doi clienti care ating acelasi domeniu — sau
 * unul care il muta de pe un magazin pe altul in doi pasi — si primul il rupea pe
 * al doilea: domeniul disparea din proiectul Vercel in timp ce magazinul celuilalt
 * il avea inca scris in baza si ii arata clientului „conectat". E aceeasi clasa cu
 * `addOne`, care inghitea „already in use" drept succes.
 */
async function stergeDacaNuIlMaiFoloseseNimeni(
  domeniu: string,
  businessIdCurent: string,
): Promise<{ success: boolean; error?: string }> {
  // Cautarea trebuie facuta cu SERVICE ROLE, nu cu clientul utilizatorului:
  // RLS ii arata userului doar magazinele PUBLICATE plus ale lui, deci un
  // magazin nepublicat al altui comerciant care foloseste acelasi domeniu era
  // invizibil aici si domeniul i se stergea din Vercel de sub picioare.
  const { data: altele, error } = await createAdminClient()
    .from("businesses").select("id").eq("custom_domain", domeniu).neq("id", businessIdCurent).limit(1);

  // Daca nu putem sti cine mai foloseste domeniul, NU stergem: o stergere gresita
  // scoate din rutare magazinul altui comerciant.
  if (error) {
    return { success: false, error: "Nu am putut verifica daca domeniul mai e folosit de alt magazin." };
  }
  if (altele && altele.length > 0) return { success: true };

  return await removeDomainFromVercel(domeniu);
}

export async function POST(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const body = (await req.json()) as {
    domain?: string;
    businessId?: string;
    metoda?: unknown;
  };
  const { domain, businessId } = body;

  if (!domain || !businessId) {
    return NextResponse.json({ error: "Date incomplete" }, { status: 400 });
  }

  const metoda = citesteMetoda(body.metoda);
  if (!metoda) {
    return NextResponse.json(
      { error: "Metoda de conectare necunoscuta. Alege inregistrari A/CNAME sau nameservere." },
      { status: 400 },
    );
  }

  // Valideaza INAINTE de orice apel catre Vercel si inainte de orice scriere:
  // sintaxa de hostname + refuzul gazdelor platformei (edinio.com, *.edinio.com,
  // *.vercel.app, localhost). Fara asta, un comerciant putea revendica domeniul
  // platformei si, la deconectare, il stergea din proiectul Vercel.
  // Normalizeaza tot aici la apex (Vercel inregistreaza geamanul www ca
  // redirectare, iar proxy-ul trimite www → apex).
  const verdict = valideazaDomeniuClient(domain);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.motiv }, { status: 400 });
  }
  const clean = verdict.domeniu;

  const supabase = await createClient();

  // Verify ownership
  const { data: biz } = await supabase
    .from("businesses")
    .select("id, custom_domain")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();

  if (!biz) {
    return NextResponse.json({ error: "Afacere negasita" }, { status: 404 });
  }

  // Domeniul e UNIQUE in baza, dar verificam explicit ca sa dam un mesaj clar in
  // loc de eroarea 23505 si ca sa nu atingem Vercel degeaba pentru un domeniu
  // deja luat de alt magazin (inclusiv unul nepublicat, invizibil prin RLS).
  const { data: ocupat } = await createAdminClient()
    .from("businesses").select("id").eq("custom_domain", clean).neq("id", businessId).limit(1);
  if (ocupat && ocupat.length > 0) {
    return NextResponse.json(
      { error: "Acest domeniu este deja conectat la alt magazin." },
      { status: 409 },
    );
  }

  const domeniuVechi = biz.custom_domain;

  // Ordinea conteaza. Pana acum domeniul VECHI se scotea din Vercel PRIMUL, deci
  // orice esec de dupa (adaugarea celui nou, scrierea in baza) lasa magazinul cu
  // domeniul vechi smuls din rutare si baza aratand tot spre el — offline, si
  // fara nimic in interfata care sa spuna asta. Acum cel nou e complet pus la
  // punct si salvat inainte sa se demonteze ceva.

  // 1. Adauga domeniul nou. Zona DNS se atinge DOAR pe metoda „nameservere".
  const vercelResult = await addDomainToVercel(clean, { metoda });
  if (!vercelResult.success) {
    return NextResponse.json(
      { error: vercelResult.error ?? "Nu am putut adauga domeniul pe Vercel" },
      { status: 500 }
    );
  }

  // 2. Salveaza. `custom_domain` e coloana privilegiata (fara grant de
  // UPDATE pentru `authenticated`), tocmai ca sa nu poata fi scrisa direct din
  // browser, ocolind validarea de mai sus si sincronizarea cu Vercel. Scrierea
  // ramane legata de `user_id` ca sa nu depinda doar de grant.
  const { error } = await createAdminClient()
    .from("businesses")
    .update({
      custom_domain: clean,
      /*
       * Domeniu nou = sanatate NECUNOSCUTA, nu „stricata". `null` lasa proxy-ul
       * sa redirectioneze catre el imediat, fara sa astepte cronul; doar o
       * masuratoare care DOVEDESTE ca e mort il opreste. Daca am lasa aici
       * steagul mostenit de la domeniul dinainte, un `false` vechi ar taia
       * redirectul catre un domeniu care poate merge perfect.
       */
      custom_domain_healthy: null,
      custom_domain_checked_at: null,
    })
    .eq("id", businessId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Nu am putut salva domeniul" }, { status: 500 });
  }

  const avertismente = vercelResult.warning ? [vercelResult.warning] : [];

  // 3. Abia acum retragem domeniul vechi. Esecul nu pica cererea — domeniul nou
  // e deja salvat si functional — dar nici nu se ascunde: pana se rezolva, cel
  // vechi ramane atasat proiectului nostru.
  if (domeniuVechi && domeniuVechi !== clean) {
    const scos = await stergeDacaNuIlMaiFoloseseNimeni(domeniuVechi, businessId);
    if (!scos.success) {
      avertismente.push(`Domeniul vechi ${domeniuVechi} nu a putut fi scos din rutare: ${scos.error ?? "eroare necunoscuta"}`);
    }
  }

  return NextResponse.json({
    success: true,
    domain: clean,
    metoda,
    warning: avertismente.length ? avertismente.join(" ") : undefined,
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { businessId } = (await req.json()) as { businessId: string };
  if (!businessId) {
    return NextResponse.json({ error: "Date incomplete" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, custom_domain")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();

  if (!biz || !biz.custom_domain) {
    return NextResponse.json({ error: "Niciun domeniu de deconectat" }, { status: 404 });
  }

  const domainToRemove = biz.custom_domain;

  /*
   * Vercel INTAI, baza dupa.
   *
   * Invers — cum era pana acum — un esec la Vercel lasa domeniul atasat in
   * proiect dar sters din `custom_domain`, adica invizibil pentru tot ce porneste
   * de la coloana aia: cronul de reconciliere, emailurile, /admin/logs. Nimeni
   * nu-l mai vedea, deci nimeni nu-l mai putea repara, iar comerciantul primea
   * „deconectat" pe un domeniu care ii tinea in continuare rutarea. Asa, cel mai
   * rau caz e o deconectare care esueaza VIZIBIL si se poate reincerca.
   */
  const scos = await stergeDacaNuIlMaiFoloseseNimeni(domainToRemove, businessId);
  if (!scos.success) {
    return NextResponse.json(
      {
        error:
          `Nu am putut scoate ${domainToRemove} din rutarea Vercel: ${scos.error ?? "eroare necunoscuta"} ` +
          `Domeniul a ramas conectat la magazin. Incearca din nou in cateva minute.`,
      },
      { status: 502 },
    );
  }

  const { error } = await createAdminClient()
    .from("businesses")
    .update({
      custom_domain: null,
      // Steagurile de sanatate se refera la un domeniu care nu mai e al
      // magazinului; lasate in urma, ar minti despre urmatorul.
      custom_domain_healthy: null,
      custom_domain_checked_at: null,
    })
    .eq("id", businessId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      {
        error:
          `${domainToRemove} a fost scos din rutare, dar magazinul a ramas salvat cu el. ` +
          `Reincarca pagina si incearca deconectarea din nou.`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
