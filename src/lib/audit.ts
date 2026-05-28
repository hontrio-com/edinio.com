import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

export type AuditAction =
  | "user.plan_change"
  | "user.role_change"
  | "user.suspend"
  | "user.unsuspend"
  | "user.delete"
  | "user.edit"
  | "user.impersonate"
  | "user.notify"
  | "user.bulk_plan_change"
  | "business.publish"
  | "business.unpublish"
  | "invoice.cancel"
  | "invoice.delete"
  | "invoice.reissue"
  | "ticket.delete"
  | "ticket.status_change"
  | "ticket.reply"
  | "settings.update"
  | "broadcast.send"
  | "export.users"
  | "export.invoices"
  | "export.orders";

export type AuditTargetType =
  | "user"
  | "business"
  | "invoice"
  | "ticket"
  | "settings"
  | "broadcast"
  | "export";

export async function logAudit(
  adminId: string,
  action: AuditAction,
  targetType: AuditTargetType,
  targetId: string | null,
  details?: Record<string, unknown>,
) {
  try {
    const admin = createAdminClient();
    await admin.from("admin_audit_log").insert({
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      details: (details ?? {}) as Json,
    });
  } catch (err) {
    console.error("[audit] Failed to log:", err);
  }
}
