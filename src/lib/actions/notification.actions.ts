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
