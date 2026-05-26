import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Pencil } from "lucide-react";

export default async function StoreEditorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();

  if (!business) redirect("/dashboard");

  const { data: storeSettings } = await supabase
    .from("store_settings")
    .select("*")
    .eq("business_id", business.id)
    .single();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Editeaza magazinul</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Personalizeaza aspectul si setarile magazinului tau</p>
      </div>

      <div className="bg-surface border border-border rounded-xl p-8 text-center">
        <Pencil className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
        <p className="text-sm font-medium text-foreground mb-1">Editorul de magazin</p>
        <p className="text-xs text-muted-foreground">
          Aceasta sectiune este in curs de dezvoltare. Reveniti curand.
        </p>
      </div>
    </div>
  );
}
