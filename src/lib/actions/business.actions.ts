"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/email";
import { logError } from "@/lib/error-logger";
import { NON_STORE_SEGMENTS } from "@/proxy";

/*
 * Adresa magazinului se valideaza AICI, pe server, nu doar in formular.
 *
 * Pana pe 05.08.2026 singura validare (zod + slugify) traia in componenta de
 * onboarding, adica in browser, iar apelantul citeste slug-ul din
 * sessionStorage — deci nici nu era nevoie de un apel brut de actiune, era
 * destul devtools. Migratia din 04.08 a inchis doar UPDATE-ul pe `slug`;
 * INSERT-ul a ramas deschis.
 *
 * Ce scapa apoi din aplicatie: rutele de intoarcere de la plata construiesc
 * `new URL(`/${slug}/confirm...`, baseUrl)`. Un slug care incepe cu „/" face din
 * asta „//evil.com/confirm..." — adica schimba GAZDA, nu calea. Rezultatul e ca
 * https://www.edinio.com/api/stripe/return?... raspunde 307 catre alt domeniu:
 * redirectare deschisa, gazduita pe domeniul platformei, buna de phishing cu
 * marca Edinio. Cine scoate verificarea de mai jos redeschide exact asta.
 *
 * Regula e mai stricta decat cea din formular (care accepta si „---"): minim 3,
 * maxim 50, fara liniuta la capete. Lista de segmente rezervate NU se copiaza
 * aici — vine din proxy, unde traiesc oricum rutele de aplicatie.
 *
 * Liniutele de la capete se TAIE, nu se refuza. `slugify` le taie deja, dar
 * formularul scurteaza rezultatul la 50 de caractere DUPA aceea, si taietura
 * poate cadea exact pe o liniuta. Un refuz acolo ar pica in ultimul pas al
 * onboarding-ului, pe un slug pe care omul nu l-a scris el.
 */
const SLUG_MAGAZIN = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

function normalizeazaSlug(brut: string): string {
  return (brut ?? "").trim().replace(/^-+|-+$/g, "");
}

function motivSlugRespins(slug: string): string | null {
  if (!SLUG_MAGAZIN.test(slug)) {
    return "Adresa magazinului trebuie sa aiba intre 3 si 50 de caractere, doar litere mici, cifre si liniute, si sa nu inceapa sau sa se termine cu liniuta.";
  }
  if (NON_STORE_SEGMENTS.has(slug)) {
    return "Aceasta adresa este rezervata de platforma. Alege alta.";
  }
  return null;
}

export async function createBusiness(data: {
  business_name: string;
  tagline?: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  county?: string;
  slug: string;
  logo_url?: string;
  cover_url?: string;
  primary_color: string;
  // NU exista `plan` aici, intentionat. Planul e decis EXCLUSIV pe server:
  // planurile platite vin din webhook-ul Stripe (checkout.session.completed /
  // invoice.payment_succeeded), iar trialul gratuit se acorda mai jos. Cand
  // parametrul exista, oricine putea trimite `plan: "ultra"` si primea planul
  // cel mai scump fara sa plateasca.
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu esti autentificat." };

  const slug = normalizeazaSlug(data.slug);
  const motiv = motivSlugRespins(slug);
  if (motiv) return { error: motiv };

  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .insert({
      user_id: user.id,
      type: "ministore",
      slug,
      business_name: data.business_name,
      tagline: data.tagline || null,
      phone: data.phone,
      whatsapp: data.whatsapp || null,
      email: data.email || null,
      address: data.address || null,
      city: data.city || null,
      county: data.county || null,
      store_address: data.address || null,
      store_city: data.city || null,
      store_county: data.county || null,
      logo_url: data.logo_url || null,
      cover_url: data.cover_url || null,
      primary_color: data.primary_color,
    })
    .select()
    .single();

  if (bizError) {
    if (bizError.code === "23505") {
      return { error: "Aceasta adresa de magazin este deja folosita. Alege alta." };
    }
    logError({ action: "createBusiness", message: bizError.message, details: { code: bizError.code, hint: bizError.hint, slug }, userId: user.id, severity: "critical" });
    return { error: "Nu am putut crea magazinul. Incearca din nou." };
  }

  // Create store settings
  await supabase.from("store_settings").insert({ business_id: business.id });

  // Marcheaza onboarding-ul incheiat si acorda trialul gratuit.
  //
  // Coloanele `onboarding_completed`, `plan` si `plan_expires_at` sunt
  // PRIVILEGIATE: clientul utilizatorului nu mai are voie sa le scrie (vezi
  // migrations/2026-08-04-blocare-escaladare-rol.sql), asa ca trecem prin
  // service role.
  //
  // Planul nu se mai ia de la client. Trialul de 15 zile se acorda DOAR daca
  // nimeni nu a stabilit deja un plan: cand utilizatorul a platit, webhook-ul
  // Stripe a scris intre timp `plan` + `plan_expires_at` reale, iar noi nu
  // trebuie sa le stricam (race-ul checkout → webhook → finalizeBusiness).
  // Conditia pe `plan_expires_at is null` face si operatia idempotenta: un al
  // doilea magazin al aceluiasi cont nu reporneste trialul.
  const adminDb = createAdminClient();

  const { data: currentProfile } = await adminDb
    .from("users_profile")
    .select("plan, plan_expires_at")
    .eq("id", user.id)
    .single();

  const areDejaPlan =
    !!currentProfile?.plan_expires_at || (currentProfile?.plan ?? "free") !== "free";

  const profilePayload: { onboarding_completed: boolean; plan?: string; plan_expires_at?: string } =
    { onboarding_completed: true };

  if (!areDejaPlan) {
    profilePayload.plan = "free";
    profilePayload.plan_expires_at = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
  }

  const { error: profileError } = await adminDb
    .from("users_profile")
    .update(profilePayload as never)
    .eq("id", user.id);

  if (profileError) {
    logError({
      action: "createBusiness.profileUpdate",
      message: profileError.message,
      details: { code: profileError.code },
      userId: user.id,
      severity: "critical",
    });
    await adminDb.from("users_profile").update(profilePayload as never).eq("id", user.id);
  }

  // Send welcome email + notify admin (non-blocking)
  if (user.email) {
    const { data: profile } = await supabase
      .from("users_profile")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const ownerName = profile?.full_name ?? "";
    sendWelcomeEmail(user.email, {
      name: ownerName,
      business_name: data.business_name,
      slug: business.slug,
    }).catch(() => {});
    import("@/lib/email").then(({ sendAdminNewStoreNotification }) => {
      sendAdminNewStoreNotification({
        ownerName,
        ownerEmail: user.email!,
        businessName: data.business_name,
        slug: business.slug,
      }).catch(() => {});
    }).catch(() => {});
  }

  revalidatePath("/dashboard", "layout");
  return { success: true, businessId: business.id, slug: business.slug };
}

export async function updateBusiness(
  businessId: string,
  data: Partial<{
    business_name: string;
    store_name: string | null;
    tagline: string | null;
    description: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    county: string | null;
    store_address: string | null;
    store_city: string | null;
    store_county: string | null;
    lat: number | null;
    lng: number | null;
    logo_url: string | null;
    cover_url: string | null;
    primary_color: string;
    social: Record<string, string>;
    gallery: string[];
    features: Record<string, boolean>;
    is_published: boolean;
  }>
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu esti autentificat." };

  // Lista alba, aplicata la RULARE. Tipul `Partial<{...}>` de mai sus dispare la
  // compilare, iar `data` vine INTREG de la client (e Server Action), deci pana
  // acum orice cheie in plus ajungea direct in UPDATE: `suspended_until: null`
  // anula suspendarea/perioada de gratie, `custom_domain` ocolea validarea si
  // sincronizarea cu Vercel din /api/domains/connect, `slug` permitea mutarea
  // magazinului pe alta adresa. `user_id` era deja blocat de RLS (USING tine loc
  // de WITH CHECK), dar il tinem afara oricum.
  const COLOANE_PERMISE = new Set([
    "business_name", "store_name", "tagline", "description",
    "phone", "whatsapp", "email", "website",
    "address", "city", "county",
    "store_address", "store_city", "store_county",
    "lat", "lng",
    "logo_url", "cover_url", "primary_color",
    "social", "gallery", "features", "is_published",
  ]);

  const payload: Record<string, unknown> = {};
  for (const [cheie, valoare] of Object.entries(data ?? {})) {
    if (COLOANE_PERMISE.has(cheie)) payload[cheie] = valoare;
  }

  if (Object.keys(payload).length === 0) {
    return { error: "Nu exista nimic de salvat." };
  }

  const { error } = await supabase
    .from("businesses")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(payload as any)
    .eq("id", businessId)
    .eq("user_id", user.id);

  if (error) {
    logError({ action: "updateBusiness", message: error.message, details: { code: error.code, hint: error.hint, businessId }, userId: user.id });
    return { error: "Nu am putut salva modificarile." };
  }

  // Note: replaced/removed logo/cover/gallery images are intentionally NOT deleted
  // from R2 here — the Media Library is the single deletion authority. They stay in
  // the library for reuse and are removed only via deleteMedia.

  revalidatePath("/dashboard/editor");
  revalidatePath("/dashboard/features");
  revalidatePath(`/[slug]`, "page");
  return { success: true };
}

export async function getUserBusiness() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("businesses")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data ?? null;
}

export async function checkSlugAvailability(slug: string): Promise<boolean> {
  /*
   * Aceleasi reguli ca la INSERT, si pe aceeasi valoare NORMALIZATA.
   *
   * Pasul 1 al onboarding-ului e ULTIMUL loc in care omul mai poate schimba
   * adresa: dupa el vine alegerea planului, iar pentru planurile platite
   * `createBusiness` ruleaza abia la INTOARCEREA de la Stripe, cu abonamentul
   * deja incasat (onboarding/plan/page.tsx: `finalizeBusiness` din ramura
   * `?success=1`). Orice „liber" mincinos aici se plateste acolo: toast de
   * eroare, niciun magazin, si nicio cale inapoi in afara de a relua plata.
   *
   * Doua feluri de minciuna, amandoua aparute odata cu verificarea de pe server:
   *   - segment rezervat („demo", „start", „contact") — oracolul zicea „liber",
   *     serverul refuza;
   *   - forma nenormalizata — „florarie-" chiar nu exista in tabel, dar se
   *     insereaza „florarie", care poate fi luata, deci 23505 dupa plata.
   *     (Liniuta terminala nu e ipotetica: formularul taie la 50 de caractere
   *     DUPA slugify, iar taietura poate cadea pe o liniuta.)
   *
   * Raspunsul ramane boolean, deci un slug rezervat apare in interfata drept
   * „deja folosita". Nu e formularea ideala, dar e adevarata — adresa e luata,
   * de platforma — si opreste omul INAINTE de plata, ceea ce conteaza.
   */
  const normalizat = normalizeazaSlug(slug);
  if (motivSlugRespins(normalizat)) return false;

  // Use admin client to bypass RLS — unpublished businesses are hidden from anon
  // but the UNIQUE constraint still blocks the INSERT
  const admin = createAdminClient();
  const { data } = await admin
    .from("businesses")
    .select("id")
    .eq("slug", normalizat)
    .maybeSingle();
  return !data;
}
