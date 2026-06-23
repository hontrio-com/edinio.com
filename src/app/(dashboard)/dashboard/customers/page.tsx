import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { CustomersClient } from "@/components/dashboard/CustomersClient";
import { aggregateCustomers, summarizeCustomers, type CustomerOrderInput } from "@/lib/customers";

export default async function CustomersPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: bizRow } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();

  if (!bizRow) redirect("/dashboard");

  // RLS lets the owner read their own orders. Lean columns only — enough to build
  // each customer + their history without shipping the full items payload.
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, customer_phone, customer_email, shipping_address, total, status, payment_method, payment_status, created_at, items")
    .eq("business_id", bizRow.id)
    .order("created_at", { ascending: false });

  const customers = aggregateCustomers((orders ?? []) as CustomerOrderInput[]);
  const summary = summarizeCustomers(customers);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <CustomersClient customers={customers} summary={summary} />
    </div>
  );
}
