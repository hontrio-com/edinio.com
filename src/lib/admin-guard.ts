import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { createClient } from "@/lib/supabase/server";
import { sesiuneCurentaNeconfirmata } from "@/lib/auth/cere-mfa";
import { opritFiindcaNareMfa } from "@/lib/auth/mfa";

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

/** Rolurile care au voie in redactia blogului. */
export type RolBlog = "admin" | "editor";

/**
 * Paza ecranelor de blog: admin SAU redactor.
 *
 * ⚠ NU LARGESTE `requireAdmin()`. Un redactor n-are ce cauta la utilizatori, la
 * facturi sau la setarile platformei. De aceea e o functie separata, chemata
 * doar de paginile de blog — iar celelalte 21 de pagini de admin isi pastreaza
 * `requireAdmin()`, fiecare pe capul ei.
 *
 * Intoarce si ROLUL, fiindca ecranele arata altceva: un redactor vede „Trimite
 * la verificare" acolo unde un admin vede „Publica".
 */
export async function requireBlogEditor() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("users_profile").select("role, full_name, avatar_url, mfa_email_enabled").eq("id", user.id).single();

  const rol = data?.role;
  if (rol !== "admin" && rol !== "editor") redirect("/dashboard");

  /*
    ⚠ UN ADMIN TRECE PE AICI CU EXACT ACELEASI TREI CONDITII CA LA `requireAdmin`.

    Prima scriere a functiei asteia verifica DOAR rolul din profil. Am scris-o
    copiind ce credeam ca face `requireAdmin()` — dar citisem versiunea de
    dinaintea unirii cu `main`, iar poarta MFA si claim-ul semnat tocmai de acolo
    veneau. Rezultatul: un admin cu sesiune valida dar NECONFIRMATA cu al doilea
    factor ajungea in blog, iar de acolo actiunile lucreaza cu cheia de serviciu.

    Adica exact modelul de securitate construit pentru /admin era ocolit printr-o
    usa laterala pe care o deschisesem eu.
  */
  if (rol === "admin" && !areClaimDeAdmin(user)) redirect("/dashboard");

  /*
    ⚠ REDACTORUL NU INTRĂ FĂRĂ AL DOILEA FACTOR. Adminul, da — și asta e o
    alegere a clientului, luată pe 31.08.2026, nu o scăpare.

    Până acum MFA era doar SUPORTAT: `sesiuneNeconfirmata` întoarce FALS când
    `mfa_email_enabled` e stins, deci un cont fără al doilea factor trecea exact
    ca înainte. Bun pentru admin, care e proprietarul și se poate încuia singur
    afară dintr-o poartă prost pusă.

    Redactorul e altceva: e rolul pe care îl dai unui OM DIN AFARĂ. Contul lui
    scrie conținut public al Edinio, iar acțiunile de acolo lucrează cu cheia de
    serviciu. Pentru el, „suportat" nu ajunge.

    ⚠ UȘA DIN DOS SE ÎNCHIDE SINGURĂ: paza asta rulează la FIECARE cerere, deci
    un redactor care își stinge MFA-ul din Setări pierde blogul la următoarea
    pagină. N-a fost nevoie să interzic dezactivarea — ar fi fost o a doua regulă
    care poate rămâne în urmă față de prima.
  */
  if (opritFiindcaNareMfa(rol, data?.mfa_email_enabled)) {
    redirect("/dashboard/settings?sectiune=securitate&mfa=cerut");
  }

  /*
    ⚠ MFA SI PENTRU REDACTOR, nu doar pentru admin. Un redactor schimba continut
    public al Edinio; contul lui merita al doilea factor la fel de mult.

    ⚠ RANDUL ASTA NU BLOCHEAZA PE NIMENI CARE N-A INROLAT MFA:
    `sesiuneNeconfirmata` intoarce FALS cand `mfa_email_enabled` e stins (vezi
    `lib/auth/mfa.ts`). El apara doar sesiunile celor care AU al doilea factor.

    Cine il CERE e verificarea de mai sus, si numai pentru redactori. Nota asta
    spunea „conturile fara al doilea factor merg exact ca inainte" — adevarat
    pana pe 31.08.2026, si adevarat si acum pentru ADMIN. Pentru redactor, nu.
  */
  if (await sesiuneCurentaNeconfirmata(user.id)) redirect("/login/mfa");

  return { user, profile: data, rol: rol as RolBlog };
}

/**
 * Aceeasi paza, pentru actiuni de server. `null` cand nu are voie.
 *
 * ⚠ ACTIUNILE FOLOSESC CHEIA DE SERVICIU, care sare peste drepturile pe rand.
 * Deci regulile din baza NU apara aici: ele sunt a doua plasa, pentru cazul in
 * care cineva ajunge la tabele pe alt drum. Marginea redactorului trebuie pusa
 * in cod, si de aceea functia asta intoarce rolul.
 */
export async function requireBlogEditorApi(): Promise<{ id: string; rol: RolBlog } | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("users_profile").select("role, mfa_email_enabled").eq("id", user.id).single();

  const rol = data?.role;
  if (rol !== "admin" && rol !== "editor") return null;

  /* ⚠ ACELEASI TREI CONDITII CA LA ECRAN, si din acelasi motiv. O poarta de
     actiune mai slaba decat poarta de pagina e o usa lasata deschisa in spate:
     actiunile se pot chema direct, fara sa treaca prin niciun ecran. */
  if (rol === "admin" && !areClaimDeAdmin(user)) return null;

  /* ⚠ ACEEAȘI REGULĂ CA LA ECRAN. O poartă de acțiune mai slabă decât poarta de
     pagină e o ușă lăsată deschisă în spate: acțiunile se pot chema direct. */
  if (opritFiindcaNareMfa(rol, data?.mfa_email_enabled)) return null;

  if (await sesiuneCurentaNeconfirmata(user.id)) return null;

  return { id: user.id, rol: rol as RolBlog };
}
