import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadToR2 } from "@/lib/r2";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ALL_ALLOWED_TYPES = [...IMAGE_TYPES, "application/pdf", "image/gif"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const VALID_BUCKETS = ["logos", "covers", "gallery", "products", "avatars"];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nu esti autentificat." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const bucket = formData.get("bucket") as string | null;
  const folder = formData.get("folder") as string | null;

  if (!file || !bucket) {
    return NextResponse.json({ error: "Fisier si bucket obligatorii." }, { status: 400 });
  }

  if (!VALID_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: "Bucket invalid." }, { status: 400 });
  }

  if (!ALL_ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Tipul de fisier nu este acceptat." }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Fisierul este prea mare. Limita este 5MB." }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "webp";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const key = folder
    ? `${bucket}/${user.id}/${folder}/${filename}`
    : `${bucket}/${user.id}/${filename}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadToR2(buffer, key, file.type);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[upload] R2 upload failed:", err);
    return NextResponse.json({ error: "Incarcarea a esuat. Incearca din nou." }, { status: 500 });
  }
}
