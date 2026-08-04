import { Suspense, type ComponentProps } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { StoreEditor } from "@/components/editor/StoreEditor";
import { MarkEditorVisited } from "@/components/dashboard/MarkEditorVisited";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { Skeleton } from "@/components/ui/skeleton";

type PropsEditor = ComponentProps<typeof StoreEditor>;

export default async function EditorPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("businesses")
    /*
     * `store_settings(*)` ar aduce toate cele 59 de coloane si le-ar trimite
     * intregi unei Client Component (StoreEditor are "use client"), adica in
     * payload-ul RSC. Editorul citeste O SINGURA coloana: `page_content`.
     *
     * Conteaza in mod concret pentru PAROLA SMTP: pagina de setari o scoate
     * INTENTIONAT inainte de a trimite spre client (vezi settings/page.tsx,
     * `hasPassword: !!emailSmtp.pass` — camp write-only), iar editorul o scapa
     * inapoi in browser prin `*`. Restul paginilor de editor sunt deja proiectate
     * (editor/design, editor/sectiuni, products/[id]/edit, orders) — asta era
     * singura exceptie.
     *
     * ATENTIE: NU aplica aceeasi taiere in cached-queries.ts
     * (`getCachedBusinessWithSettings`) — acolo `store_settings(*)` e cerut de
     * cele ~24 de pagini de integrari, care chiar au nevoie de configuratiile lor.
     */
    .select("*, store_settings(page_content)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!row) redirect("/dashboard");

  const { store_settings: rawSettings, ...business } = row;
  const storeSettings = Array.isArray(rawSettings)
    ? rawSettings[0] ?? null
    : rawSettings ?? null;

  /*
   * Marcajul de vizita pleaca imediat; editorul curge dupa el.
   *
   * `fetchAllRows` pentru categorii inseamna cate un drum la baza LA FIECARE 1000
   * de randuri, unul dupa altul — la o taxonomie importata sunt mai multe. Pana
   * acum nimic nu ajungea in browser inainte sa se termine toate, desi pasul
   * „Personalizeaza magazinul" din lista de activare se bifeaza doar prin vizita
   * paginii (vezi `MarkEditorVisited`) si nu depinde de ele.
   */
  return (
    <>
      <MarkEditorVisited />
      <Suspense fallback={<ScheletEditor />}>
        <ContinutEditor
          business={business}
          storeSettings={storeSettings}
          businessId={row.id}
          userId={user.id}
        />
      </Suspense>
    </>
  );
}

function ScheletEditor() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-60" />
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
        <Skeleton className="md:col-span-2 h-96 rounded-xl" />
      </div>
    </div>
  );
}

async function ContinutEditor({
  business, storeSettings, businessId, userId,
}: {
  business: PropsEditor["business"];
  storeSettings: PropsEditor["storeSettings"];
  businessId: string;
  userId: string;
}) {
  const supabase = await createClient();

  // Categories windowed past the 1000-row PostgREST cap (big imported taxonomies).
  const [{ data: profile }, categories] = await Promise.all([
    supabase.from("users_profile").select("plan").eq("id", userId).single(),
    fetchAllRows("dashboard.editor.categories", (from, to) =>
      supabase.from("categories").select("id, name, parent_id, sort_order").eq("business_id", businessId)
        .order("sort_order").order("id").range(from, to)
    ),
  ]);

  return (
    <StoreEditor business={business} storeSettings={storeSettings} plan={profile?.plan ?? "free"} categories={categories} />
  );
}
