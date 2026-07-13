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
  plan?: string;
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

  // Set plan + mark onboarding complete (free = 15-day trial). Pentru planurile
  // PLATITE nu atingem plan_expires_at: e gestionat exclusiv de webhook-ul Stripe
  // (checkout.session.completed / invoice.payment_succeeded). Daca l-am seta la
  // `null` aici, un race cu webhook-ul (care ruleaza in paralel dupa plata) ar
  // sterge data reala de reinnoire → user platitor cu plan_expires_at gol.
  const plan = data.plan ?? "free";
  const profilePayload: { onboarding_completed: boolean; plan: string; plan_expires_at?: string } = {
    onboarding_completed: true,
    plan,
  };
  if (plan === "free") {
    profilePayload.plan_expires_at = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
  }

  const { error: profileError } = await supabase
    .from("users_profile")
    .update(profilePayload)
    .eq("id", user.id);

  if (profileError) {
    await supabase.from("users_profile").update(profilePayload).eq("id", user.id);
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

  const { error } = await supabase
    .from("businesses")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(data as any)
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
