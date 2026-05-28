import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { status?: string; has_unread_reply?: boolean };

  const supabase = await createClient();

  const { error } = await supabase
    .from("support_tickets")
    .update({
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.has_unread_reply !== undefined ? { has_unread_reply: body.has_unread_reply } : {}),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
