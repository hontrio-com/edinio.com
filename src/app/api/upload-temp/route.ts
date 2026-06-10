import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";

const SECRET = process.env.UPLOAD_TEMP_SECRET ?? "";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-upload-secret") !== SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const slug = formData.get("slug") as string | null;
  const businessId = formData.get("business_id") as string | null;

  if (!file || !slug || !businessId) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `products/${businessId}/${Date.now()}-${slug}.jpeg`;
  const url = await uploadToR2(buffer, key, file.type);

  return NextResponse.json({ url, slug });
}
