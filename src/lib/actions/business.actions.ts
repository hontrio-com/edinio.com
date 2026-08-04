"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/email";
import { logError } from "@/lib/error-logger";

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

  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .insert({
      user_id: user.id,
      type: "ministore",
      slug: data.slug,
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
    logError({ action: "createBusiness", message: bizError.message, details: { code: bizError.code, hint: bizError.hint, slug: data.slug }, userId: user.id, severity: "critical" });
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
  // Use admin client to bypass RLS — unpublished businesses are hidden from anon
  // but the UNIQUE constraint still blocks the INSERT
  const admin = createAdminClient();
  const { data } = await admin
    .from("businesses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return !data;
}
