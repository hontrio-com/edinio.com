import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { MessagesClient } from "@/components/pages/MessagesClient";

interface SubField { label: string; value: string }

export default async function PageMessagesPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).single();
  if (!business) redirect("/dashboard");

  const { data: subs } = await supabase
    .from("page_form_submissions")
    .select("id, data, created_at, is_read")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(300);

  const list = (subs ?? []).map((s) => ({
    id: s.id,
    createdAt: s.created_at,
    isRead: s.is_read,
    fields: (((s.data as { fields?: SubField[] } | null)?.fields) ?? []) as SubField[],
  }));

  return <MessagesClient submissions={list} />;
}
