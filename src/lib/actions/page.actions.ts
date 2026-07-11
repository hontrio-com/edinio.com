"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { maybeSyncMailchimpSubscriber } from "@/lib/mailchimp-sync";
import { maybeSyncBrevoSubscriber } from "@/lib/brevo-sync";
import { validatePageSlug } from "@/lib/pages/reserved-slugs";
import type { Block, PageSeo } from "@/lib/pages/blocks.types";
import type { MenuItem } from "@/lib/pages/menu";
import { sendPageFormEmail } from "@/lib/email";
import type { Database } from "@/types/database.types";

type DB = SupabaseClient<Database>;

const MAX_BLOCKS_BYTES = 400_000; // ~400KB of block JSON per page

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

async function getUserAndBusiness(
  supabase: DB,
  businessId: string,
): Promise<{ userId: string; slug: string | null; isAdmin: boolean } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return null;
  const { data: profile } = await supabase
    .from("users_profile").select("role").eq("id", user.id).single();
  return { userId: user.id, slug: biz.slug, isAdmin: profile?.role === "admin" };
}

/** Unique page slug per business: "contact", "contact-2", ... */
async function resolveUniquePageSlug(
  supabase: DB,
  businessId: string,
  base: string,
  excludePageId?: string,
): Promise<string> {
  const { data: rows } = await supabase
    .from("custom_pages").select("id, slug").eq("business_id", businessId).like("slug", `${base}%`);
  const taken = new Set(
    (rows ?? []).filter((r) => r.id !== excludePageId).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Strip the admin-only `raw` flag from html blocks unless the actor is admin. */
function gateRawBlocks(blocks: Block[], isAdmin: boolean, actorId: string): Block[] {
  return blocks.map((b) => {
    if (b.type !== "html") return b;
    if (b.raw && !isAdmin) return { ...b, raw: false, rawApprovedBy: null };
    if (b.raw && isAdmin) return { ...b, raw: true, rawApprovedBy: b.rawApprovedBy ?? actorId };
    return b;
  });
}

function revalidatePage(slug: string | null, pageSlug?: string) {
  revalidatePath("/dashboard/pages");
  if (!slug) return;
  revalidatePath(`/${slug}`);
  if (pageSlug) revalidatePath(`/${slug}/${pageSlug}`);
}

/* ─── CRUD ─────────────────────────────────────────────────────────────────── */

export async function createPage(input: {
  businessId: string; title: string; slug?: string;
}): Promise<{ error: string } | { success: true; pageId: string; slug: string }> {
  const supabase = await createClient();
  const ctx = await getUserAndBusiness(supabase, input.businessId);
  if (!ctx) return { error: "Neautorizat" };

  const title = input.title.trim();
  if (title.length < 2) return { error: "Titlul paginii e prea scurt." };

  const v = validatePageSlug(input.slug?.trim() || title);
  if (!v.ok) return { error: v.error };
  const slug = await resolveUniquePageSlug(supabase, input.businessId, v.slug);

  const { data, error } = await supabase
    .from("custom_pages")
    .insert({ business_id: input.businessId, title, slug, blocks: [], is_published: false })
    .select("id, slug")
    .single();

  if (error || !data) {
    logError({ action: "createPage", message: error?.message ?? "no row", details: { businessId: input.businessId }, userId: ctx.userId });
    return { error: "Eroare la crearea paginii." };
  }
  revalidatePage(ctx.slug, data.slug);
  return { success: true, pageId: data.id, slug: data.slug };
}

export async function updatePage(
  pageId: string,
  patch: { title?: string; slug?: string; blocks?: Block[]; page_css?: string | null; seo?: PageSeo; is_published?: boolean },
): Promise<{ error: string } | { success: true; slug: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  // Resolve the page + its business (ownership enforced via RLS + explicit check).
  const { data: page } = await supabase
    .from("custom_pages").select("id, business_id, slug").eq("id", pageId).single();
  if (!page) return { error: "Pagina negasita" };

  const ctx = await getUserAndBusiness(supabase, page.business_id);
  if (!ctx) return { error: "Neautorizat" };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length < 2) return { error: "Titlul paginii e prea scurt." };
    update.title = t;
  }

  let nextSlug = page.slug;
  if (patch.slug !== undefined) {
    const v = validatePageSlug(patch.slug);
    if (!v.ok) return { error: v.error };
    nextSlug = await resolveUniquePageSlug(supabase, page.business_id, v.slug, pageId);
    update.slug = nextSlug;
  }

  if (patch.blocks !== undefined) {
    const gated = gateRawBlocks(patch.blocks, ctx.isAdmin, ctx.userId);
    if (JSON.stringify(gated).length > MAX_BLOCKS_BYTES) {
      return { error: "Pagina e prea mare. Imparte continutul sau elimina blocuri." };
    }
    update.blocks = gated;
  }
  if (patch.page_css !== undefined) update.page_css = patch.page_css;
  if (patch.seo !== undefined) update.seo = patch.seo;
  if (patch.is_published !== undefined) update.is_published = patch.is_published;

  const { error } = await supabase.from("custom_pages").update(update as never).eq("id", pageId);
  if (error) {
    logError({ action: "updatePage", message: error.message, details: { pageId }, userId: user.id });
    return { error: "Eroare la salvarea paginii." };
  }
  revalidatePage(ctx.slug, nextSlug);
  if (nextSlug !== page.slug) revalidatePage(ctx.slug, page.slug); // old URL too
  return { success: true, slug: nextSlug };
}

export async function deletePage(pageId: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: page } = await supabase
    .from("custom_pages").select("id, business_id, slug, businesses(slug)").eq("id", pageId).single();
  if (!page) return { error: "Pagina negasita" };

  const { error } = await supabase.from("custom_pages").delete().eq("id", pageId);
  if (error) return { error: "Eroare la stergerea paginii." };

  const bizSlug = (page as unknown as { businesses: { slug: string | null } | null }).businesses?.slug ?? null;
  revalidatePage(bizSlug, page.slug);
  return { success: true };
}

export async function duplicatePage(pageId: string): Promise<{ error: string } | { success: true; pageId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: src } = await supabase
    .from("custom_pages").select("*").eq("id", pageId).single();
  if (!src) return { error: "Pagina negasita" };

  const ctx = await getUserAndBusiness(supabase, src.business_id);
  if (!ctx) return { error: "Neautorizat" };

  const slug = await resolveUniquePageSlug(supabase, src.business_id, `${src.slug}-copie`);
  const { data, error } = await supabase
    .from("custom_pages")
    .insert({
      business_id: src.business_id,
      title: `${src.title} (copie)`,
      slug,
      blocks: src.blocks as never,
      page_css: src.page_css,
      seo: src.seo as never,
      is_published: false,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Eroare la duplicarea paginii." };
  revalidatePage(ctx.slug, slug);
  return { success: true, pageId: data.id };
}

/* ─── Navigation menu (store_settings.page_content.menu) ───────────────────── */

export async function updateStoreMenu(
  businessId: string,
  items: MenuItem[],
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const ctx = await getUserAndBusiness(supabase, businessId);
  if (!ctx) return { error: "Neautorizat" };

  // Merge into existing page_content so we don't clobber other store config.
  const { data: existing } = await supabase
    .from("store_settings").select("id, page_content").eq("business_id", businessId).single();

  const clean = items
    .filter((i) => i.label?.trim())
    .map((i) => ({ id: i.id, type: i.type, label: i.label.trim(), target: i.target?.trim() || undefined }));

  let error;
  if (existing) {
    const pc = { ...(existing.page_content as Record<string, unknown> | null ?? {}), menu: clean };
    ({ error } = await supabase.from("store_settings")
      .update({ page_content: pc as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, page_content: { menu: clean } as never }));
  }
  if (error) {
    logError({ action: "updateStoreMenu", message: error.message, details: { businessId }, userId: ctx.userId });
    return { error: "Eroare la salvarea meniului." };
  }
  if (ctx.slug) revalidatePath(`/${ctx.slug}`);
  revalidatePath("/dashboard/pages");
  return { success: true };
}

/* ─── Public form submission ───────────────────────────────────────────────── */

export async function submitPageForm(input: {
  businessId: string;
  formId?: string | null;
  pageId?: string;
  blockId?: string;
  fields: { label: string; value: string }[];
  honeypot?: string;
}): Promise<{ error: string } | { success: true }> {
  // Bot trap: a filled honeypot pretends to succeed without doing anything.
  if (input.honeypot && input.honeypot.trim() !== "") return { success: true };

  const fields = (input.fields ?? [])
    .filter((f) => f && typeof f.label === "string")
    .slice(0, 40)
    .map((f) => ({ label: String(f.label).slice(0, 120), value: String(f.value ?? "").slice(0, 5000) }));
  if (fields.length === 0) return { error: "Formular gol." };

  const admin = createAdminClient();

  // Light burst limit: cap submissions per business in the last minute.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("page_form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", input.businessId)
    .gte("created_at", since);
  if ((count ?? 0) >= 8) return { error: "Prea multe mesaje. Incearca din nou peste un minut." };

  const { data: biz } = await admin
    .from("businesses")
    .select("id, business_name, store_name, slug, custom_domain, email, user_id, is_published")
    .eq("id", input.businessId)
    .single();
  if (!biz || !biz.is_published) return { error: "Magazin indisponibil." };

  // Resolve email settings SERVER-SIDE. The recipient is never taken from the
  // client (prevents using the form as an open relay / spam amplifier).
  let emailEnabled = false;
  let emailTo = "";
  let title = "Formular";
  let formId: string | null = null;
  let mailchimpEnabled = false;
  let brevoEnabled = false;

  if (input.formId) {
    const { data: form } = await admin
      .from("forms").select("id, name, email_enabled, email_to, mailchimp_enabled, brevo_enabled")
      .eq("id", input.formId).eq("business_id", biz.id).single();
    if (form) {
      formId = form.id;
      title = form.name;
      emailEnabled = form.email_enabled;
      emailTo = (form.email_to ?? "").trim();
      mailchimpEnabled = form.mailchimp_enabled;
      brevoEnabled = form.brevo_enabled ?? false;
    }
  } else if (input.pageId && input.blockId) {
    // Built-in contact block: read its opt-in flag from the stored page (trusted).
    const { data: page } = await admin
      .from("custom_pages").select("blocks, title")
      .eq("id", input.pageId).eq("business_id", biz.id).single();
    const blocks = (page?.blocks as Array<Record<string, unknown>> | null) ?? [];
    const block = blocks.find((b) => b.id === input.blockId);
    if (block && block.emailEnabled === true) emailEnabled = true;
    if (page?.title) title = page.title;
  }

  const { error } = await admin.from("page_form_submissions").insert({
    business_id: biz.id,
    page_id: input.pageId ?? null,
    block_id: input.blockId ?? null,
    form_id: formId,
    data: { fields } as never,
  });
  if (error) {
    logError({ action: "submitPageForm", message: error.message, details: { businessId: input.businessId } });
    return { error: "Eroare la trimitere. Incearca din nou." };
  }

  // Mailchimp — a signup form flagged for sync adds the submitter as a subscriber. Fire-and-forget.
  if (mailchimpEnabled) {
    const emailVal = fields.find((f) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value))?.value;
    if (emailVal) {
      const nameVal = fields.find((f) => /nume|name/i.test(f.label))?.value;
      const phoneVal = fields.find((f) => /telefon|phone|mobil/i.test(f.label))?.value;
      void maybeSyncMailchimpSubscriber({ businessId: biz.id, source: "forms", email: emailVal, name: nameVal, phone: phoneVal, tags: title ? [title] : undefined });
    }
  }

  // Brevo — a signup form flagged for sync adds the submitter as a subscriber. Fire-and-forget.
  if (brevoEnabled) {
    const emailVal = fields.find((f) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value))?.value;
    if (emailVal) {
      const nameVal = fields.find((f) => /nume|name/i.test(f.label))?.value;
      const phoneVal = fields.find((f) => /telefon|phone|mobil/i.test(f.label))?.value;
      void maybeSyncBrevoSubscriber({ businessId: biz.id, source: "forms", email: emailVal, name: nameVal, phone: phoneVal });
    }
  }

  // Email the merchant ONLY when they opted in. Recipient is server-trusted.
  if (emailEnabled) {
    try {
      let to = emailTo || biz.email?.trim() || "";
      if (!to) {
        const { data: u } = await admin.auth.admin.getUserById(biz.user_id);
        to = u.user?.email ?? "";
      }
      if (to) {
        const storeName = biz.store_name ?? biz.business_name;
        const pageUrl = biz.custom_domain
          ? `https://${biz.custom_domain}`
          : `https://www.edinio.com/${biz.slug}`;
        await sendPageFormEmail(to, { storeName, pageTitle: title, pageUrl, fields });
      }
    } catch (e) {
      logError({ action: "submitPageForm.email", message: e instanceof Error ? e.message : "email failed", details: { businessId: input.businessId } });
    }
  }

  return { success: true };
}
