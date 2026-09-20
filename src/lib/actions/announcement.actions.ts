"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin-guard";
import type { Announcement, AnnouncementBlock } from "@/lib/announcements";

// "announcements" is not in the generated DB types yet — use an untyped client.
function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

/*
  ⚠ PUBLICAREA UNUI ANUNT NU-L MAI STINGE PE CELELALTE.

  Exista aici o functie, `unpublishOthers`, care la fiecare publicare stingea tot
  restul. Avea un singur motiv: panoul arata UN anunt, deci „publicat" insemna de
  fapt „cel de acum". Din 20.09 panoul arata ultimele cinci, deci regula aceea ar
  fi facut lista sa aiba mereu un singur rand.

  `is_published` inseamna de acum ce scrie: anuntul se vede sau nu. Butonul
  „Retrage" din panoul de administrare ramane singura cale de a-l ascunde.
*/

export type AnnouncementInput = {
  title: string;
  excerpt?: string | null;
  blocks: AnnouncementBlock[];
  cover_url?: string | null;
  is_pinned?: boolean;
  is_published?: boolean;
};

function revalidate() {
  revalidatePath("/admin/noutati");
  revalidatePath("/dashboard/noutati");
  revalidatePath("/dashboard");
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function listAnnouncements(): Promise<Announcement[]> {
  const admin = await requireAdminApi();
  if (!admin) return [];
  const { data } = await adminDb()
    .from("announcements")
    .select("*")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as Announcement[];
}

export async function createAnnouncement(data: AnnouncementInput) {
  const admin = await requireAdminApi();
  if (!admin) return { error: "Neautorizat" };
  if (!data.title?.trim()) return { error: "Titlul este obligatoriu." };

  const { data: row, error } = await adminDb().from("announcements").insert({
    title: data.title.trim(),
    excerpt: data.excerpt?.trim() || null,
    blocks: data.blocks ?? [],
    cover_url: data.cover_url || null,
    is_pinned: data.is_pinned ?? false,
    is_published: data.is_published ?? false,
    published_at: data.is_published ? new Date().toISOString() : null,
    created_by: admin.id,
  }).select("id").single();

  if (error) return { error: "Eroare la salvare. Incearca din nou." };
  const newId = (row as { id: string }).id;
  revalidate();
  return { success: true as const, id: newId };
}

export async function updateAnnouncement(id: string, data: AnnouncementInput) {
  const admin = await requireAdminApi();
  if (!admin) return { error: "Neautorizat" };
  if (!data.title?.trim()) return { error: "Titlul este obligatoriu." };

  const { data: existing } = await adminDb()
    .from("announcements").select("published_at").eq("id", id).single();
  const prevPublishedAt = (existing as { published_at?: string | null } | null)?.published_at ?? null;
  const willPublish = data.is_published ?? false;

  const { error } = await adminDb().from("announcements").update({
    title: data.title.trim(),
    excerpt: data.excerpt?.trim() || null,
    blocks: data.blocks ?? [],
    cover_url: data.cover_url || null,
    is_pinned: data.is_pinned ?? false,
    is_published: willPublish,
    // Set published_at on first publish; keep it once set; clear when unpublished.
    published_at: willPublish ? (prevPublishedAt ?? new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  if (error) return { error: "Eroare la salvare. Incearca din nou." };
  revalidate();
  return { success: true as const };
}

export async function deleteAnnouncement(id: string) {
  const admin = await requireAdminApi();
  if (!admin) return { error: "Neautorizat" };
  const { error } = await adminDb().from("announcements").delete().eq("id", id);
  if (error) return { error: "Eroare la stergere." };
  revalidate();
  return { success: true as const };
}

export async function togglePublishAnnouncement(id: string, publish: boolean) {
  const admin = await requireAdminApi();
  if (!admin) return { error: "Neautorizat" };
  const { data: existing } = await adminDb()
    .from("announcements").select("published_at").eq("id", id).single();
  const prevPublishedAt = (existing as { published_at?: string | null } | null)?.published_at ?? null;
  const { error } = await adminDb().from("announcements").update({
    is_published: publish,
    published_at: publish ? (prevPublishedAt ?? new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { error: "Eroare la actualizare." };
  revalidate();
  return { success: true as const };
}

export async function togglePinAnnouncement(id: string, pin: boolean) {
  const admin = await requireAdminApi();
  if (!admin) return { error: "Neautorizat" };
  const { error } = await adminDb().from("announcements")
    .update({ is_pinned: pin, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Eroare la actualizare." };
  revalidate();
  return { success: true as const };
}

// ── Dashboard (any signed-in user) ───────────────────────────────────────────

export async function getPublishedAnnouncements(): Promise<Announcement[]> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_published", true)
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false });
  return (data ?? []) as Announcement[];
}

export async function getLatestAnnouncement(): Promise<Announcement | null> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as Announcement | null;
}

/**
 * Ultimele anunturi publicate, pentru lista din panou.
 *
 * ⚠ Cele fixate („Important") vin primele, apoi restul dupa data publicarii:
 * un anunt fixat isi pierde rostul daca il impinge in jos orice noutate mai
 * proaspata.
 */
export async function getLatestAnnouncements(limita = 5): Promise<Announcement[]> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_published", true)
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(Math.min(Math.max(limita, 1), 20));
  return (data ?? []) as Announcement[];
}

export async function markAnnouncementsSeen() {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("users_profile")
    .update({ announcements_seen_at: new Date().toISOString() })
    .eq("id", user.id);
}

export async function getUnreadAnnouncementsCount(): Promise<number> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data: profile } = await supabase
    .from("users_profile").select("announcements_seen_at").eq("id", user.id).single();
  const seenAt = (profile as { announcements_seen_at?: string | null } | null)?.announcements_seen_at ?? null;
  let q = supabase.from("announcements").select("id", { count: "exact", head: true }).eq("is_published", true);
  if (seenAt) q = q.gt("published_at", seenAt);
  const { count } = await q;
  return count ?? 0;
}
