import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { DiscountsClient } from "@/components/dashboard/DiscountsClient";
import { firstParam, pageParam } from "@/lib/orders/pagination";
import { CODURI_PE_PAGINA, filtruValid, sortareValida } from "@/lib/discounts/filtre";
import type { FiltruStare } from "@/lib/discounts/filtre";
import type { CodDinLista } from "@/lib/discounts/lista";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PAGINĂ DE CODURI, NU TOATE                                  (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ CE ERA, ȘI DE CE S-A SCHIMBAT DEȘI NIMIC NU SE VEDEA STRICAT.
 *
 * Până azi pagina aducea TOATE codurile magazinului într-o singură citire, fără
 * `limit` și fără `range`, iar căutarea, filtrele și sortarea lucrau în memoria
 * browserului. Mergea, și măsurat era chiar rezonabil: 14 coduri în 6 magazine,
 * cel mai încărcat are 5.
 *
 * Marginea de sus nu era însă numărul acela, ci plafonul PostgREST — o mie de
 * rânduri. Un magazin cu peste o mie de coduri (o campanie cu coduri unice, de
 * pildă) ar fi văzut lista **tăiată în tăcere**, fără nicio eroare, iar cifrele
 * din cap ar fi fost socotite pe ce s-a nimerit să încapă. Cerut de el: să se
 * rezolve de pe acum, nu când se va vedea.
 *
 * ⚠ FILTRUL, CĂUTAREA ȘI SORTAREA VIN DIN ADRESĂ, ca la Clienți: un filtru pus
 * se poate trimite prin legătură, iar „înapoi” din browser se întoarce la ce
 * vedeai. Ținute în starea componentei, s-ar fi pierdut la fiecare reîncărcare.
 */
export default async function DiscountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();

  if (!row) redirect("/dashboard");

  const sp = await searchParams;
  /* ⚠ Tăiată la 80 de semne: un cod are cel mult 20, restul e doar trafic. */
  const q = (firstParam(sp.q) ?? "").trim().slice(0, 80);
  const stare: FiltruStare = filtruValid(firstParam(sp.stare));
  const sortare = sortareValida(firstParam(sp.sort));
  const pagina = pageParam(sp.page);

  const [{ data: randuri }, { data: peStare }, { data: totaluri }, { data: faraLegatura }, { data: categorii }] =
    await Promise.all([
      /*
        ⚠ O SINGURĂ CITIRE pentru pagină: rândurile, cifrele fiecărui cod ȘI
        numărul total al mulțimii filtrate (`count(*) over ()`). Cerut separat,
        totalul ar fi fost a doua interogare și a doua șansă să nu se potrivească
        cu ce se vede.
      */
      supabase.rpc("discounts_page", {
        bid: row.id,
        search: q || null,
        p_stare: stare,
        sort_key: sortare,
        page_limit: CODURI_PE_PAGINA,
        page_offset: (pagina - 1) * CODURI_PE_PAGINA,
      }),
      /*
        ⚠⚠ CIFRELE DE LÂNGĂ FILTRE SE NUMĂRĂ PESTE CĂUTARE, în bază. Socotite din
        pagina adusă, „Expirate (3)” ar fi însemnat „trei pe pagina asta”.
      */
      supabase.rpc("discount_state_counts", { bid: row.id, search: q || null }),
      /*
        ⚠⚠ ȘI CIFRELE DIN CAP SE SOCOTESC PE TOT MAGAZINUL, nu pe pagină. Adunate
        din lista adusă — cum erau până azi — ar fi scăzut cu fiecare pagină
        răsfoită. Un raport care scade când răsfoiești e mai rău decât niciunul.
      */
      supabase.rpc("discount_totaluri", { bid: row.id }),
      supabase.rpc("discount_orders_fara_legatura", { bid: row.id }),
      /*
        ⚠ Categoriile se aduc INTREGI, si se poate: masurat, cel mai incarcat
        magazin are zeci de randuri. Produsele NU — pentru ele exista cautare
        (`searchProductsForPicker`), fiindca un catalog poate avea mii.
      */
      supabase.from("categories").select("id, name").eq("business_id", row.id).order("name"),
    ]);

  const coduri: CodDinLista[] = (randuri ?? []).map((d) => ({
    id: d.id,
    code: d.code,
    type: d.type,
    value: Number(d.value),
    min_order_amount: d.min_order_amount === null ? null : Number(d.min_order_amount),
    max_uses: d.max_uses,
    uses_count: d.uses_count,
    is_active: d.is_active,
    starts_at: d.starts_at,
    expires_at: d.expires_at,
    per_customer_limit: d.per_customer_limit,
    doar_prima_comanda: d.doar_prima_comanda,
    restrangere: d.restrangere,
    created_at: d.created_at,
    updated_at: d.updated_at,
    cifre: {
      comenziTotal: Number(d.comenzi_total),
      comenziValide: Number(d.comenzi_valide),
      comenziCazute: Number(d.comenzi_cazute),
      baniDati: Number(d.bani_dati),
      vanzari: Number(d.vanzari),
      comenziCuTransportOferit: Number(d.comenzi_cu_transport_oferit),
    },
  }));

  /* ⚠ Zero rânduri înseamnă zero potriviri, nu „n-am aflat”: funcția întoarce
     `total_count` pe fiecare rând, deci fără rânduri nu există de unde citi. */
  const cateSunt = Number(randuri?.[0]?.total_count ?? 0);

  const catePeStare = Object.fromEntries(
    (peStare ?? []).map((r) => [r.stare, Number(r.cate)]),
  ) as Record<string, number>;

  const t = totaluri?.[0];

  /*
    ⚠ `max-w-6xl`, ca Panoul si Clientii. Era `5xl` — singura pagina cu carduri
    mai ingusta decat restul panoului, iar de acolo venea jumatate din
    inghesuiala cifrelor din cap.
  */
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <DiscountsClient
        coduri={coduri}
        cateSunt={cateSunt}
        pagina={pagina}
        catePeStare={catePeStare}
        totaluri={{
          coduri: Number(t?.coduri ?? 0),
          potiFolosi: Number(t?.coduri_folosibile ?? 0),
          comenzi: Number(t?.comenzi ?? 0),
          baniDati: Number(t?.bani_dati ?? 0),
          vanzari: Number(t?.vanzari ?? 0),
        }}
        cautare={q}
        stare={stare}
        sortare={sortare}
        /*
          ⚠ Comenzile care poarta un cod dar n-au legatura catre el. Azi sunt
          ZERO peste tot; daca apar vreodata, toate cifrele de mai sus sunt
          incomplete, si comerciantul trebuie sa afle. Mai bine o cifra care
          spune asta decat un raport care tace.
        */
        faraLegatura={Number(faraLegatura ?? 0)}
        businessId={row.id}
        categorii={categorii ?? []}
      />
    </div>
  );
}
