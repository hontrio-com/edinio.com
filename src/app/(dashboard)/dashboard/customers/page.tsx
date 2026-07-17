import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { CustomersClient } from "@/components/dashboard/CustomersClient";
import { CUSTOMERS_PAGE_SIZE, escapeLike, firstParam, pageParam } from "@/lib/orders/pagination";
import type { Customer, CustomersSummary } from "@/lib/customers";

const SORT_KEYS = new Set(["recent", "spent", "orders", "name"]);

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

  const { data: bizRow } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();

  if (!bizRow) redirect("/dashboard");

  // Clientii sunt agregati, cautati si paginati in Postgres (functiile
  // customers_aggregate / customers_summary, sub RLS) — corect la orice numar
  // de comenzi; pagina primeste doar cei CUSTOMERS_PAGE_SIZE clienti afisati.
  const [{ data: custRows }, { data: summaryRows }] = await Promise.all([
    supabase.rpc("customers_aggregate", {
      bid: bizRow.id,
      search: q ? escapeLike(q) : undefined,
      sort_key: sort,
      page_limit: CUSTOMERS_PAGE_SIZE,
      page_offset: (page - 1) * CUSTOMERS_PAGE_SIZE,
    }),
    supabase.rpc("customers_summary", { bid: bizRow.id }),
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
    paidOrderCount: Number(r.paid_order_count),
    totalSpent: Number(r.total_spent),
    aov: Number(r.aov),
    firstOrderAt: r.first_order_at,
    lastOrderAt: r.last_order_at,
    lastStatus: r.last_status,
  }));
  const totalCount = custRows?.length ? Number(custRows[0].total_count) : 0;

  const s = summaryRows?.[0];
  const summary: CustomersSummary = {
    totalCustomers: Number(s?.total_customers ?? 0),
    returningCustomers: Number(s?.returning_customers ?? 0),
    totalRevenue: Number(s?.total_revenue ?? 0),
    averageOrderValue: Number(s?.average_order_value ?? 0),
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <CustomersClient
        customers={customers}
        summary={summary}
        totalCount={totalCount}
        page={page}
        searchQuery={q}
        sort={sort}
        businessId={bizRow.id}
      />
    </div>
  );
}
