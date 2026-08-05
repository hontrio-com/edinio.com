import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { createClient } from "@/lib/supabase/server";
import { sesiuneCurentaNeconfirmata } from "@/lib/auth/cere-mfa";

/**
 * Garda de administrator de platforma.
 *
 * Cere DOUA surse independente, ambele scriibile doar cu service role:
 *
 *   1. `app_metadata.role` din JWT — pus de GoTrue la emiterea tokenului. Un
 *      client nu il poate atinge: `user_metadata` e scriibil de utilizator,
 *      `app_metadata` NU. Tokenul e semnat, deci nici nu poate fi falsificat.
 *   2. `users_profile.role` — coloana e blocata de la 04.08.2026 (revocare de
 *      UPDATE la nivel de coloana + trigger), deci a redevenit de incredere.
 *
 * De ce doua: pana la migratia din 04.08.2026, garda se sprijinea EXCLUSIV pe
 * coloana din tabel, iar politica UPDATE de pe users_profile permitea oricarui
 * utilizator logat sa-si scrie `role='admin'` cu cheia anon publica. De acolo se
 * deschidea tot /api/admin/**, inclusiv impersonarea oricarui cont. Cu doua
 * surse, o singura regresie (un grant re-acordat din greseala, o politica
 * relaxata) nu mai e suficienta ca sa dea cuiva panoul de administrare.
 *
 * ATENTIE OPERATIONALA: claim-ul intra in JWT la EMITEREA lui. Un administrator
 * caruia tocmai i s-a acordat rolul trebuie sa se reconecteze (sau sa astepte
 * reimprospatarea tokenului) ca sa-l primeasca.
 */
export function areClaimDeAdmin(user: User | null): boolean {
  if (!user) return false;
  const meta = user.app_metadata as Record<string, unknown> | undefined;
  return meta?.role === "admin";
}

/**
 * Pentru locurile care au deja si utilizatorul, si rolul din profil incarcate
 * (ex. layout-ul de dashboard) si nu vrem inca o interogare.
 */
export function esteAdminConfirmat(user: User | null, rolDinProfil: string | null | undefined): boolean {
  return areClaimDeAdmin(user) && rolDinProfil === "admin";
}

async function areRolInProfil(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users_profile")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role === "admin";
}

/**
 * DE CE AL DOILEA FACTOR SE VERIFICA SI AICI (05.08.2026)
 *
 * /admin sta intr-un grup de rute separat — (admin) — deci layout-ul de
 * /dashboard, unde statea singura poarta MFA, nu se randeaza NICIODATA acolo.
 * Rezultatul: o parola de administrator furata dadea acces imediat la /admin si
 * la /api/admin/impersonate, care emite cookie-uri de sesiune complete pentru
 * ORICE cont. Era calea cea mai scurta de la „am o parola" la „am platforma".
 *
 * Verificarea sta in garda, nu in layout, tocmai fiindca rutele /api/admin/**
 * nu randeaza niciun layout.
 */
export async function requireAdmin() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("users_profile")
    .select("role, full_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (data?.role !== "admin" || !areClaimDeAdmin(user)) redirect("/dashboard");

  // Ordinea conteaza: intai rolul, apoi MFA. Cine nu e admin pleaca la
  // /dashboard fara sa afle nimic despre existenta panoului de platforma.
  if (await sesiuneCurentaNeconfirmata(user.id)) redirect("/login/mfa");

  return { user, profile: data };
}

export async function requireAdminApi(): Promise<{ id: string; email?: string } | null> {
  const user = await getCachedUser();
  if (!user) return null;
  if (!areClaimDeAdmin(user)) return null;
  if (!(await areRolInProfil(user.id))) return null;
  if (await sesiuneCurentaNeconfirmata(user.id)) return null;
  return user;
}

/**
 * Varianta care nu redirectioneaza si nu returneaza utilizatorul — pentru
 * locurile care au nevoie doar de un raspuns da/nu (ex. gating in editor).
 */
export async function esteAdmin(): Promise<boolean> {
  const user = await getCachedUser();
  if (!user || !areClaimDeAdmin(user)) return false;
  return areRolInProfil(user.id);
}
