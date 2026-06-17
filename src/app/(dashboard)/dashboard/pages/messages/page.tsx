import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";

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
    .select("id, data, created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/pages" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Mesaje</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Mesajele trimise prin formularele din paginile tale.</p>
        </div>
      </div>

      {(!subs || subs.length === 0) ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Niciun mesaj inca</p>
          <p className="text-xs text-muted-foreground">Mesajele din formularul de contact vor aparea aici.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subs.map((s) => {
            const fields = ((s.data as { fields?: SubField[] } | null)?.fields) ?? [];
            return (
              <div key={s.id} className="p-4 bg-surface border border-border rounded-xl">
                <p className="text-[11px] text-muted-foreground mb-3">{new Date(s.created_at).toLocaleString("ro-RO")}</p>
                <div className="space-y-2">
                  {fields.map((f, i) => (
                    <div key={i} className="grid grid-cols-[100px_1fr] gap-3">
                      <span className="text-xs font-semibold text-muted-foreground">{f.label}</span>
                      <span className="text-sm text-foreground whitespace-pre-wrap break-words">{f.value || "-"}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
