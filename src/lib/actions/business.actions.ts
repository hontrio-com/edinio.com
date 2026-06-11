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

  // Set plan + mark onboarding complete (free = 15-day trial)
  const plan = data.plan ?? "free";
  const planExpiresAt = plan === "free"
    ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { error: profileError } = await supabase
    .from("users_profile")
    .update({
      onboarding_completed: true,
      plan,
      plan_expires_at: planExpiresAt,
    })
    .eq("id", user.id);

  if (profileError) {
    await supabase
      .from("users_profile")
      .update({
        onboarding_completed: true,
        plan,
        plan_expires_at: planExpiresAt,
      })
      .eq("id", user.id);
  }

  // Send welcome email (non-blocking)
  if (user.email) {
    const { data: profile } = await supabase
      .from("users_profile")
      .select("full_name")
      .eq("id", user.id)
      .single();
    sendWelcomeEmail(user.email, {
      name: profile?.full_name ?? "",
      business_name: data.business_name,
      slug: business.slug,
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

  // Fetch old values to clean up replaced images
  const { data: oldBiz } = await supabase
    .from("businesses")
    .select("logo_url, cover_url, gallery")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from("businesses")
    .update(data as any)
    .eq("id", businessId)
    .eq("user_id", user.id);

  if (error) {
    logError({ action: "updateBusiness", message: error.message, details: { code: error.code, hint: error.hint, businessId }, userId: user.id });
    return { error: "Nu am putut salva modificarile." };
  }

  // Clean up replaced/removed images from R2 (fire-and-forget)
  if (oldBiz) {
    const { deleteFromR2, r2KeyFromUrl } = await import("@/lib/r2");
    const tryDelete = (url: string | null | undefined) => {
      if (!url) return;
      const key = r2KeyFromUrl(url);
      if (key) deleteFromR2(key).catch(() => {});
    };
    if (data.logo_url !== undefined && data.logo_url !== oldBiz.logo_url) tryDelete(oldBiz.logo_url);
    if (data.cover_url !== undefined && data.cover_url !== oldBiz.cover_url) tryDelete(oldBiz.cover_url);
    if (data.gallery !== undefined && Array.isArray(oldBiz.gallery)) {
      const newSet = new Set(data.gallery);
      for (const url of oldBiz.gallery as string[]) {
        if (!newSet.has(url)) tryDelete(url);
      }
    }
  }

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
