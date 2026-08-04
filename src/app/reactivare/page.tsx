import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getInactiveReason } from "@/lib/subscription";
import { ReactivateClient } from "./ReactivateClient";
import { esteAdminConfirmat } from "@/lib/admin-guard";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export const metadata: Metadata = {
  title: "Reactiveaza-ti contul",
  robots: { index: false, follow: false },
};

export default async function ReactivarePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users_profile")
    .select("plan, plan_expires_at, role")
    .eq("id", user.id)
    .single();

  // Adminii nu sunt blocati niciodata — dar cere ambele surse de rol.
  if (esteAdminConfirmat(user, profile?.role)) redirect("/dashboard");

  const { data: businesses } = await supabase
    .from("businesses")
    .select("suspended_until")
    .eq("user_id", user.id);

  const reason = getInactiveReason({
    plan: profile?.plan ?? "free",
    planExpiresAt: profile?.plan_expires_at ?? null,
    suspendedUntils: (businesses ?? []).map((b) => b.suspended_until),
  });

  // Cont activ (platit / reactivat) → inapoi la dashboard. Pe ?success=1, cat timp
  // webhook-ul inca nu a procesat plata, reason ramane setat si ReactivateClient
  // afiseaza starea de activare + polling; la urmatorul refresh reason devine null
  // si ajungem aici la redirect.
  if (!reason) redirect("/dashboard");

  const { success } = await searchParams;

  return (
    <ReactivateClient
      reason={reason}
      success={success === "1"}
      currentPlan={profile?.plan ?? "free"}
      userEmail={user.email ?? ""}
    />
  );
}
