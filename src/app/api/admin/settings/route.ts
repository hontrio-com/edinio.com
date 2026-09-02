import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import type { Json } from "@/types/database.types";
import { setariPentruBrowser, type PlatformSetting } from "@/lib/setari-platforma";

export async function GET() {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("platform_settings")
    .select("*");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /*
    ⚠ SECRETELE NU PLEACA DE AICI. Randul asta intorcea valorile intregi, ceea ce
    a fost bine cat timp in tabela stateau numai comutatoare. Din 02.09.2026
    acolo sta si legatura Google a platformei, cu un `refresh_token` care nu
    expira. Vezi `lib/setari-platforma.ts` pentru regula si pentru de ce e pe
    CAMP, nu pe cheia randului.
  */
  const settings = setariPentruBrowser((data ?? []) as PlatformSetting[]);

  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { key: string; value: Json };

  if (!body.key || body.value === undefined) {
    return NextResponse.json({ error: "key si value sunt obligatorii" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("platform_settings")
    .upsert(
      {
        key: body.key,
        value: body.value,
        updated_at: new Date().toISOString(),
        updated_by: admin.id,
      },
      { onConflict: "key" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(admin.id, "settings.update", "settings", body.key, {
    setting_key: body.key,
    new_value: body.value,
  });

  return NextResponse.json({ success: true });
}
