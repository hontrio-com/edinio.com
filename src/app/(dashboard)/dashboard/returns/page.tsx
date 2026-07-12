import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { ReturnsClient } from "@/components/dashboard/ReturnsClient";

interface ReturnItem { product_id: string; name: string; quantity: number; price: number }

export default async function ReturnsPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).single();
  if (!business) redirect("/dashboard");

  const { data: rows } = await supabase
    .from("return_requests")
    .select("id, order_number, customer_name, customer_email, customer_phone, items, reason, refund_method, refund_iban, status, is_read, created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(300);

  const list = (rows ?? []).map((r) => ({
    id: r.id,
    orderNumber: r.order_number,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    items: (Array.isArray(r.items) ? r.items : []) as unknown as ReturnItem[],
    reason: r.reason,
    refundMethod: r.refund_method,
    refundIban: r.refund_iban,
    status: r.status,
    isRead: r.is_read,
    createdAt: r.created_at,
  }));

  return <ReturnsClient returns={list} />;
}
