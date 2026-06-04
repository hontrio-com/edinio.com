import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.com";

export async function POST(req: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const adminClient = createAdminClient();

  // Get user email
  const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(body.userId);
  if (userError || !userData.user) return NextResponse.json({ error: "Utilizator negasit" }, { status: 404 });

  const email = userData.user.email;
  if (!email) return NextResponse.json({ error: "Utilizatorul nu are email" }, { status: 400 });

  // Generate magic link
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json({ error: error?.message ?? "Eroare la generarea linkului" }, { status: 500 });
  }

  await logAudit(admin.id, "user.impersonate", "user", body.userId, {
    email,
  });

  // Route through /auth/callback for server-side token verification (sets session cookies properly)
  const callbackUrl = `${SITE_URL}/auth/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink`;
  return NextResponse.json({ url: callbackUrl });
}
