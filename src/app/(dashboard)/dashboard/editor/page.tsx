import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { StoreEditor } from "@/components/editor/StoreEditor";
import { MarkEditorVisited } from "@/components/dashboard/MarkEditorVisited";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function EditorPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
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

  // Categories windowed past the 1000-row PostgREST cap (big imported taxonomies).
  const [{ data: profile }, categories] = await Promise.all([
    supabase.from("users_profile").select("plan").eq("id", user.id).single(),
    fetchAllRows("dashboard.editor.categories", (from, to) =>
      supabase.from("categories").select("id, name, parent_id, sort_order").eq("business_id", row.id)
        .order("sort_order").order("id").range(from, to)
    ),
  ]);

  return (
    <>
      <MarkEditorVisited />
      <StoreEditor business={business} storeSettings={storeSettings} plan={profile?.plan ?? "free"} categories={categories} />
    </>
  );
}
