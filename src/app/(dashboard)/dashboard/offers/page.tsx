import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { OffersClient } from "@/components/dashboard/OffersClient";
import { firstParam, pageParam } from "@/lib/orders/pagination";
import { OFERTE_PE_PAGINA, filtruValid, sortareValida, stareDinBaza } from "@/lib/offers/filtre";
import type { FiltruStare } from "@/lib/offers/filtre";
import type { OfertaDinLista } from "@/lib/offers/lista";
import {
  isOfferType, parseOfferTrigger, parseOfferConfig, parseOfferDisplay, type OfferType,
} from "@/lib/offers/offer.types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PAGINĂ DE OFERTE, NU TOATE                                  (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ CE ERA, ȘI DE CE S-A SCHIMBAT DEȘI NIMIC NU SE VEDEA STRICAT.
 *
 * Până azi pagina chema `listOffers`, care aducea TOATE ofertele magazinului
 * fără `limit` și fără `range`, iar căutarea lucra în memoria browserului.
 * Mergea, și măsurat era chiar rezonabil: 13 oferte în 4 magazine, cel mai
 * încărcat are 7.
 *
 * Marginea de sus nu era însă numărul acela, ci plafonul PostgREST — o mie de
 * rânduri. Aceeași hotărâre ca la Discounturi, cerută de el acolo: se rezolvă de
 * pe acum, nu când se va vedea.
 *
 * ⚠ FILTRUL, CĂUTAREA ȘI SORTAREA VIN DIN ADRESĂ, ca la Clienți și Discounturi:
 * un filtru pus se poate trimite prin legătură, iar „înapoi” din browser se
 * întoarce la ce vedeai.
 */
export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  const sp = await searchParams;
  /* ⚠ Tăiată la 80 de semne: un nume de ofertă e scurt, restul e doar trafic. */
  const q = (firstParam(sp.q) ?? "").trim().slice(0, 80);
  const stare: FiltruStare = filtruValid(firstParam(sp.stare));
  const sortare = sortareValida(firstParam(sp.sort));
  const pagina = pageParam(sp.page);

  const [{ data: randuri }, { data: peStare }, { data: totaluri }] = await Promise.all([
    /*
      ⚠ O SINGURĂ CITIRE pentru pagină: rândurile, starea fiecărei oferte ȘI
      numărul total al mulțimii filtrate (`count(*) over ()`). Cerut separat,
      totalul ar fi fost a doua interogare și a doua șansă să nu se potrivească
      cu ce se vede.
    */
    supabase.rpc("offers_page", {
      bid: biz.id,
      search: q || null,
      p_stare: stare,
      sort_key: sortare,
      page_limit: OFERTE_PE_PAGINA,
      page_offset: (pagina - 1) * OFERTE_PE_PAGINA,
    }),
    /*
      ⚠⚠ CIFRELE DE LÂNGĂ FILTRE SE NUMĂRĂ PESTE CĂUTARE, în bază. Socotite din
      pagina adusă, „Expirate (3)” ar fi însemnat „trei pe pagina asta”.
    */
    supabase.rpc("offer_state_counts", { bid: biz.id, search: q || null }),
    /*
      ⚠⚠ ȘI CIFRELE DIN CAP SE SOCOTESC PE TOT MAGAZINUL, nu pe pagină. Adunate
      din lista adusă, ar fi scăzut cu fiecare pagină răsfoită.
    */
    supabase.rpc("offer_totaluri", { bid: biz.id }),
  ]);

  const oferte: OfertaDinLista[] = (randuri ?? []).map((o) => {
    /* ⚠ Un tip necunoscut cade pe `cross_sell`, ca în `toOfferRow`: un rând cu
       un tip scos din schemă trebuie să se poată vedea, nu să rupă pagina. */
    const type = (isOfferType(o.type) ? o.type : "cross_sell") as OfferType;
    return {
      id: o.id,
      type,
      name: o.name,
      is_active: o.is_active,
      priority: o.priority,
      trigger: parseOfferTrigger(o.trigger),
      config: parseOfferConfig(o.config),
      display: parseOfferDisplay(o.display, type),
      starts_at: o.starts_at,
      ends_at: o.ends_at,
      impressions: Number(o.impressions) || 0,
      conversions: Number(o.conversions) || 0,
      revenue_added: Number(o.revenue_added) || 0,
      created_at: o.created_at,
      updated_at: o.updated_at,
      stare: stareDinBaza(o.stare),
      /* ⚠ Cate produse cere si cate se mai pot cumpara — socotit in ACELASI
         drum ca randul, de `offer_stoc`. Cerut separat, ar fi fost inca o
         interogare si inca o sansa sa nu se potriveasca cu ce se vede. */
      produseCerute: Number(o.produse_cerute ?? 0),
      produseRamase: Number(o.produse_ramase ?? 0),
    };
  });

  /* ⚠ Zero rânduri înseamnă zero potriviri, nu „n-am aflat”: funcția întoarce
     `total_count` pe fiecare rând, deci fără rânduri nu există de unde citi. */
  const cateSunt = Number(randuri?.[0]?.total_count ?? 0);

  const catePeStare = Object.fromEntries(
    (peStare ?? []).map((r) => [r.stare, Number(r.cate)]),
  ) as Record<string, number>;

  const t = totaluri?.[0];

  /* ⚠ `max-w-6xl`, ca Panoul, Clienții și Discounturile. Era `5xl`. */
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <OffersClient
        businessId={biz.id}
        oferte={oferte}
        cateSunt={cateSunt}
        pagina={pagina}
        catePeStare={catePeStare}
        totaluri={{
          oferte: Number(t?.oferte ?? 0),
          active: Number(t?.oferte_active ?? 0),
          afisari: Number(t?.afisari ?? 0),
          acceptari: Number(t?.acceptari ?? 0),
          venit: Number(t?.venit ?? 0),
          comenziCazute: Number(t?.comenzi_cazute ?? 0),
          baniDatiCazuti: Number(t?.bani_dati_cazuti ?? 0),
          oferteCiuntite: Number(t?.oferte_ciuntite ?? 0),
          oferteMoarte: Number(t?.oferte_moarte ?? 0),
        }}
        cautare={q}
        stare={stare}
        sortare={sortare}
      />
    </div>
  );
}
