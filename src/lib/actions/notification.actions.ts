"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function markNotificationsRead(ids: string[]): Promise<{ success: true } | { error: string }> {
  if (ids.length === 0) return { success: true };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .in("id", ids)
    .eq("user_id", user.id);

  if (error) return { error: "Eroare la actualizare." };
  revalidatePath("/dashboard");
  return { success: true };
}

// Order notifications (pending orders shown in the bell) have no per-row DB record,
// so "mark as read" is a server-side watermark on the user's profile. An order is
// unread when its created_at is newer than orders_seen_at. Mirrors
// markAnnouncementsSeen — persists across devices, unlike the old localStorage-only flag.
export async function markOrderNotificationsSeen(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("users_profile")
    .update({ orders_seen_at: new Date().toISOString() })
    .eq("id", user.id);

  revalidatePath("/dashboard");
}
