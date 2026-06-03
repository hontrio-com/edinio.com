"use server";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

interface LogErrorParams {
  action: string;
  message: string;
  details?: Record<string, unknown>;
  userId?: string;
  userEmail?: string;
  businessId?: string;
  severity?: "info" | "warning" | "error" | "critical";
}

/**
 * Log an error to the error_logs table (fire-and-forget).
 * Call this in server actions when a Supabase/external operation fails.
 */
export async function logError(params: LogErrorParams) {
  try {
    const supabase = await createClient();
    await supabase.from("error_logs").insert({
      action: params.action,
      message: params.message,
      details: (params.details ?? {}) as Record<string, Json>,
      user_id: params.userId ?? null,
      user_email: params.userEmail ?? null,
      business_id: params.businessId ?? null,
      severity: params.severity ?? "error",
    });
  } catch {
    // Silent fail — logging should never break the app
  }
}
