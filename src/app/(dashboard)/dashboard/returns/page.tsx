import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { orSafeTerm } from "@/lib/orders/pagination";
import { fereastraPaginii } from "@/lib/paginare";
import { inGrupe, pozeleProduselor } from "@/lib/liste/poze";
import { inceputulZilei, sfarsitulZilei } from "@/lib/zi-romaneasca";
import { coloaneleComenzii, comandaDinRand, FARA_INTEGRARI, type ComandaLista } from "@/components/dashboard/comenzi/date";
import { cerereDinRand, COLOANE_RETUR } from "@/components/dashboard/retururi/date";
import { filtreDinAdresa, PE_PAGINA, STARI_RETUR, type FiltreRetur } from "@/components/dashboard/retururi/filtre";
import { ListaRetururi } from "@/components/dashboard/retururi/ListaRetururi";

export const metadata = { title: "Retururi" };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PAGINĂ DE CERERI, NU PRIMELE TREI SUTE                      (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ CE ERA. `.limit(300)`, fără `count` și fără nicio paginare: ecranul aducea
 * cele mai noi trei sute de cereri și le desena pe toate deodată. A trei sute
 * una nu se putea vedea în niciun fel, și nimic din ecran nu spunea că există.
 * Adică exact tăcerea pe care o vânez: comerciantul crede că aia e toată lista.
 *
 * ⚠ RETURURILE CRESC CU MAGAZINUL. Nu sunt un nomenclator cu șase rânduri, ci
 * un rând la fiecare retragere din contract (OUG 18/2026). Un magazin cu câteva
 * sute de comenzi pe lună trece de trei sute într-un an, și abia atunci ar fi
 * început să mintă, în tăcere.
 *
 * ⚠ SE NUMĂRĂ ÎNTÂI, ȘI ABIA APOI SE CERE PAGINA. Aceeași regulă ca la abonați:
 * un `?page=` dincolo de numărul de rânduri face PostgREST să răspundă 416, iar
 * `postgrest-js` citește `count` DOAR pe răspunsul bun, deci pierde chiar
 * numărul din `Content-Range`. `fereastraPaginii` strânge pagina cerută la câte
 * există cu adevărat, înainte de `range`.
 *
 * ═══ FILTRELE STAU ÎN ADRESĂ ȘI SE APLICĂ ÎN BAZĂ               (25.11.2026) ═══
 *
 * Starea, căutarea și perioada sunt noi (pagina avea doar `?page=`). Toate trei
 * ajung în SQL prin `cuFiltre`, aceeași funcție pentru numărătoare și pentru
 * pagină: numărul de pe o filă e și numărul cererilor din lista ei.
 */

type Rand = Record<string, unknown>;

/** Ce trebuie sa stie un constructor de interogare ca sa primeasca filtrele listei. */
type Filtrabil<T> = {
  eq(coloana: string, valoare: string): T;
  or(filtre: string): T;
  gte(coloana: string, valoare: string): T;
  lte(coloana: string, valoare: string): T;
};

/**
 * Filtrele listei de cereri, intr-un singur loc: starea, perioada si cautarea. Le primesc si
 * numaratoarea, si pagina; scrise de doua ori, numarul n-ar mai fi al listei.
 *
 * Perioada e in zile ROMANESTI, cu amandoua capetele incluse, ca la Comenzi. Cautarea merge pe
 * tot ce se vede intr-un rand: numarul comenzii, numele, telefonul si e-mailul clientului.
 */
function cuFiltre<T extends Filtrabil<T>>(interogare: T, f: FiltreRetur): T {
  let q = interogare;
  if (f.status !== "all") q = q.eq("status", f.status);
  const deLa = inceputulZilei(f.deLa);
  const panaLa = sfarsitulZilei(f.panaLa);
  if (deLa) q = q.gte("created_at", deLa);
  if (panaLa) q = q.lte("created_at", panaLa);
  const term = orSafeTerm(f.q);
  if (term) {
    q = q.or(
      `order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,customer_email.ilike.%${term}%`,
    );
  }
  return q;
}

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: business }, sp, antete] = await Promise.all([
    supabase
      .from("businesses").select("id, slug, custom_domain, is_published")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).single(),
    searchParams,
    headers(),
  ]);
  if (!business) redirect("/dashboard");
  const idMagazin = business.id;

  const filtre = filtreDinAdresa(sp);
  /* Un telefon are mereu loc doar pentru fise, deci lui nu i se mai trimite si tabelul. */
  const telefon = /Mobi/i.test(antete.get("user-agent") ?? "");
  const cereri = () => supabase.from("return_requests");

  /** Pagina filtrata: intai cate sunt, apoi fereastra stransa la cate exista. */
  async function pagina(): Promise<{ randuri: Rand[]; total: number; pagina: number }> {
    const { count } = await cuFiltre(cereri().select("id", { count: "exact", head: true }).eq("business_id", idMagazin), filtre);
    const total = count ?? 0;
    const fereastra = fereastraPaginii(filtre.page, total, PE_PAGINA);
    if (total === 0) return { randuri: [], total, pagina: 1 };
    const { data } = await cuFiltre(cereri().select(COLOANE_RETUR).eq("business_id", idMagazin), filtre)
      /* ⚠ `id` ca departajator: doua cereri sosite in aceeasi milisecunda s-ar fi putut aseza
         altfel de la o pagina la alta, deci un rand ar fi aparut de doua ori si altul deloc. */
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(fereastra.deLa, fereastra.panaLa);
    return { randuri: (data ?? []) as unknown as Rand[], total, pagina: fereastra.pagina };
  }

  /** Cate cereri are magazinul in fiecare stare, fara niciun filtru: numerele de pe file. */
  async function numaraStarile(): Promise<Record<string, number>> {
    const perechi = await Promise.all(STARI_RETUR.map(async (stare) => {
      const { count } = await cereri().select("id", { count: "exact", head: true }).eq("business_id", idMagazin).eq("status", stare);
      return [stare, count ?? 0] as const;
    }));
    return Object.fromEntries(perechi);
  }

  const [numarari, lista, { count: toate }] = await Promise.all([
    numaraStarile(),
    pagina(),
    /* Toate cererile magazinului, numarate separat: o cerere cu o stare necunoscuta nu intra pe nicio fila, dar exista. */
    cereri().select("id", { count: "exact", head: true }).eq("business_id", idMagazin),
  ]);

  /*
    Comenzile din care vin cererile: de acolo se stie cum s-a platit si ce factura are. Cu
    coloanele alese ale listei de comenzi; daca baza le refuza (o coloana care nu exista inca
    in baza aceea), cererea se reia cu toate.
  */
  async function comenzileCererilor(): Promise<Record<string, ComandaLista>> {
    const iduri = [...new Set(lista.randuri.map((r) => r.order_id).filter((v): v is string => typeof v === "string"))];
    if (iduri.length === 0) return {};
    const coloane = coloaneleComenzii().join(",");
    const raspunsuri = await Promise.all(inGrupe(iduri).map(async (grup) => {
      const cerere = (ce: string) => supabase.from("orders").select(ce).eq("business_id", idMagazin).in("id", grup);
      const prima = await cerere(coloane);
      return prima.error ? cerere("*") : prima;
    }));
    const comenzi: Record<string, ComandaLista> = {};
    for (const { data } of raspunsuri) {
      /* Fara integrari: de la comanda se citesc aici doar plata, totalul si documentul. */
      for (const r of (data ?? []) as unknown as Rand[]) comenzi[String(r.id)] = comandaDinRand(r, FARA_INTEGRARI, {});
    }
    return comenzi;
  }

  const [poze, comenzi] = await Promise.all([pozeleProduselor(supabase, lista.randuri, idMagazin), comenzileCererilor()]);

  /*
    Formularul prin care clientii trimit cererile. Pe domeniul propriu sta la radacina lui; pe
    adresa de platforma, sub numele magazinului (cale relativa: aceeasi origine ca panoul).
    Un magazin nepublicat nu are inca formular la vedere, deci nici legatura catre el.
  */
  const formular = !business.is_published ? null
    : business.custom_domain ? `https://${business.custom_domain}/retur`
      : business.slug ? `/${business.slug}/retur` : null;

  return (
    <ListaRetururi
      /* Pagina e cea STRANSA la cate exista: un `?page=99` scris de mana arata ultima pagina si o spune asa. */
      filtre={{ ...filtre, page: lista.pagina }}
      telefon={telefon}
      cereri={lista.randuri.map((r) => cerereDinRand(r, poze, comenzi))}
      totalFiltru={lista.total}
      numarari={numarari}
      total={Math.max(toate ?? 0, Object.values(numarari).reduce((s, n) => s + n, 0))}
      formular={formular}
    />
  );
}
