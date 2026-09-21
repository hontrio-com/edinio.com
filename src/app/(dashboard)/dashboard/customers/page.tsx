import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { CustomersClient } from "@/components/dashboard/CustomersClient";
import { Skeleton } from "@/components/ui/skeleton";
import { CUSTOMERS_PAGE_SIZE, escapeLike, firstParam, pageParam } from "@/lib/orders/pagination";
import type { Customer, CustomersSummary } from "@/lib/customers";
import { PERIOADE, fereastra, type NumePerioada } from "@/lib/perioade";
import { segmentValid, treaptaValoare, type Segment } from "@/lib/customers/filtre";

const SORT_KEYS = new Set(["recent", "spent", "orders", "name"]);

/**
 * Cadrul pleaca imediat; clientii curg dupa el.
 *
 * `customers_aggregate` si `customers_summary` parcurg TOT istoricul de comenzi
 * ca sa scoata o pagina de clienti — la magazinele cu vechime sunt cele mai
 * lente doua apeluri din panou. Ce e ieftin (utilizatorul si magazinul lui) se
 * afla insa dintr-o singura interogare, deci sub `<Suspense>` intra doar
 * rezultatul agregarii.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const q = (firstParam(sp.q) ?? "").trim().slice(0, 80);
  const sortRaw = firstParam(sp.sort) ?? "recent";
  const sort = SORT_KEYS.has(sortRaw) ? sortRaw : "recent";
  const page = pageParam(sp.page);
  /*
    ⚠ PERIOADA IMPLICITA E „TOT ISTORICUL", spre deosebire de Statistici si de
    Cosuri, unde e o fereastra scurta. Aici cifrele sunt despre RELATIA cu oamenii,
    iar relatiile se vad pe rastimpuri lungi: masurat pe demo, „clienti recurenti"
    pe 30 de zile da 2, iar pe tot istoricul da 22. Pornita pe 30 de zile, pagina ar
    fi aratat ca un magazin fara clienti care revin.
  */
  const perioadaRaw = firstParam(sp.perioada) ?? "tot";
  const perioada: NumePerioada = (PERIOADE as string[]).includes(perioadaRaw)
    ? (perioadaRaw as NumePerioada)
    : "tot";

  /*
    ⚠ SEGMENTUL SI TREAPTA DE VALOARE VIN DIN ADRESA, ca si cautarea si sortarea:
    un filtru pus se poate trimite prin legatura, iar „inapoi" din browser se
    intoarce la ce vedeai. Tinute doar in stare, s-ar fi pierdut la fiecare
    reincarcare si la fiecare deschidere de fisa.
  */
  const segment: Segment = segmentValid(firstParam(sp.segment));
  const valoare = treaptaValoare(firstParam(sp.valoare));

  const { data: bizRow } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();

  if (!bizRow) redirect("/dashboard");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Suspense fallback={<ScheletClienti />}>
        <ListaClienti businessId={bizRow.id} q={q} sort={sort} page={page} perioada={perioada}
          segment={segment} valoare={firstParam(sp.valoare) ?? null} />
      </Suspense>
    </div>
  );
}

function ScheletClienti() {
  return (
    <>
      <div className="space-y-2 mb-5">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* cele patru casete de sumar, apoi cautarea, apoi tabelul */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-xl mb-4" />
      <div className="space-y-px">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-none" />
        ))}
      </div>
    </>
  );
}

async function ListaClienti({
  businessId,
  q,
  sort,
  page,
  perioada,
  segment,
  valoare,
}: {
  businessId: string;
  q: string;
  sort: string;
  page: number;
  perioada: NumePerioada;
  segment: Segment;
  valoare: string | null;
}) {
  const supabase = await createClient();
  const f = fereastra(perioada);
  const treapta = treaptaValoare(valoare);

  // Clientii sunt agregati, cautati si paginati in Postgres (functiile
  // customers_aggregate / customers_summary, sub RLS) — corect la orice numar
  // de comenzi; pagina primeste doar cei CUSTOMERS_PAGE_SIZE clienti afisati.
  const [{ data: custRows }, { data: summaryRows }] = await Promise.all([
    supabase.rpc("customers_aggregate", {
      bid: businessId,
      search: q ? escapeLike(q) : undefined,
      sort_key: sort,
      page_limit: CUSTOMERS_PAGE_SIZE,
      page_offset: (page - 1) * CUSTOMERS_PAGE_SIZE,
      /*
        ⚠ FILTRAREA SE FACE IN BAZA, nu peste pagina adusa: `total_count` si
        paginarea trebuie sa fie ale multimii FILTRATE. Filtrat in JavaScript,
        comerciantul ar fi vazut „50 de clienti" dintr-un magazin cu trei sute, iar
        paginile de dupa ar fi fost goale.
      */
      p_segment: segment,
      p_valoare_min: treapta?.min ?? undefined,
      p_valoare_max: treapta?.max ?? undefined,
    }),
    /*
      ⚠ LISTA RAMANE PE TOT ISTORICUL, numai sumarul se taie pe perioada — cum a
      cerut el. Un client care n-a comandat luna asta nu dispare din lista: e tot
      clientul magazinului, iar o lista care se goleste la schimbarea perioadei ar
      parea stricata.
    */
    supabase.rpc("customers_summary", {
      bid: businessId,
      p_de_la: f.nume === "tot" ? undefined : f.deLa.toISOString(),
      p_pana: f.nume === "tot" ? undefined : f.panaLa.toISOString(),
    }),
  ]);

  const customers: Customer[] = (custRows ?? []).map((r) => ({
    key: r.key,
    name: r.name,
    phone: r.phone,
    email: r.email ?? null,
    city: r.city ?? null,
    county: r.county ?? null,
    address: r.address ?? null,
    orderCount: Number(r.order_count),
    validOrderCount: Number(r.valid_order_count),
    cancelledCount: Number(r.cancelled_count),
    refundedCount: Number(r.refunded_count),
    ordersValue: Number(r.orders_value),
    collectedTotal: Number(r.collected_total),
    aov: Number(r.aov),
    firstOrderAt: r.first_order_at,
    lastOrderAt: r.last_order_at,
    lastStatus: r.last_status,
  }));
  const totalCount = custRows?.length ? Number(custRows[0].total_count) : 0;

  const s = summaryRows?.[0];
  const summary: CustomersSummary = {
    totalContacts: Number(s?.total_contacts ?? 0),
    buyers: Number(s?.buyers ?? 0),
    importedContacts: Number(s?.imported_contacts ?? 0),
    returningCustomers: Number(s?.returning_customers ?? 0),
    returnRate: Number(s?.return_rate ?? 0),
    ordersValue: Number(s?.orders_value ?? 0),
    collectedTotal: Number(s?.collected_total ?? 0),
    valuePerCustomer: Number(s?.value_per_customer ?? 0),
  };

  return (
    <CustomersClient
      customers={customers}
      summary={summary}
      totalCount={totalCount}
      page={page}
      searchQuery={q}
      sort={sort}
      perioada={perioada}
      segment={segment}
      valoare={valoare}
      businessId={businessId}
    />
  );
}
