import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { sesiuneCurenta } from "@/lib/cont/sesiune";
import { cheieIp, sesiuneExpirata, vineDePeMagazin } from "@/lib/cont/cerere";
import { POZA_MAX_OCTETI } from "@/lib/cont/profil-reguli";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { logError } from "@/lib/error-logger";

export const runtime = "nodejs";

/**
 * Poza de profil: se vede (GET), se schimba (POST) si se scoate (DELETE).
 *
 * ⚠⚠ POZA NU SE PASTREAZA CUM A VENIT. Serverul o deschide cu `sharp`, o intoarce
 * dupa EXIF (pozele de pe telefon vin culcate), o taie patrat la 256x256 si o
 * scrie WebP. Asa pleaca si metadatele (locul unde a fost facuta, telefonul), iar
 * ce ajunge in baza e mic si are o singura forma, oricat de ciudat ar fi fost
 * fisierul trimis.
 *
 * ⚠ Se vede NUMAI cu sesiunea contului: e poza omului, nu o imagine a magazinului,
 * deci nu sta intr-o galeata publica si nu are adresa ghicibila.
 */

async function contul(req: NextRequest) {
  const magazin = await magazinulCereriiDeCont(req.headers.get("host")).catch(() => null);
  if (!magazin || (await magazinulEOprit(magazin))) return { magazin: null, contId: null } as const;
  const s = await sesiuneCurenta(magazin.id).catch(() => null);
  return { magazin, contId: s?.contId ?? null } as const;
}

export async function GET(req: NextRequest) {
  const { magazin, contId } = await contul(req);
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (!contId) return new NextResponse("Unauthorized", { status: 401, headers: { "Cache-Control": "private, no-store" } });

  const { data, error } = await createAdminClient().rpc("cont_poza", { p_business: magazin.id, p_cont: contId });
  const r = Array.isArray(data) ? data[0] : data;
  if (error || !r?.imagine_b64) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  const octeti = Buffer.from(r.imagine_b64, "base64");
  return new NextResponse(new Uint8Array(octeti), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      /* Adresa poarta momentul schimbarii (`?v=`), deci poza veche nu se mai cere; `private`: e a unui singur om. */
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });
  const { magazin, contId } = await contul(req);
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (!contId) return sesiuneExpirata();

  if (!rateLimit(`contPoza:ip:${cheieIp(clientIp(req))}`, 10, 10 * 60_000)) {
    return NextResponse.json({ eroare: "Ai schimbat poza de prea multe ori. Incearca din nou peste cateva minute." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  const fisier = form?.get("poza");
  if (!(fisier instanceof File) || fisier.size === 0) {
    return NextResponse.json({ eroare: "Alege o poza." }, { status: 400 });
  }
  if (fisier.size > POZA_MAX_OCTETI) {
    return NextResponse.json({ eroare: "Poza e prea mare. Alege alta poza." }, { status: 400 });
  }

  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await fisier.arrayBuffer()), { limitInputPixels: 50_000_000, animated: false })
      .rotate()
      .resize(256, 256, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return NextResponse.json({ eroare: "Nu am putut deschide poza. Incearca o imagine JPG sau PNG." }, { status: 400 });
  }

  const { data, error } = await createAdminClient().rpc("cont_poza_salveaza", {
    p_business: magazin.id,
    p_cont: contId,
    p_imagine_b64: webp.toString("base64"),
  });
  if (error || data !== "salvata") {
    if (data === "negasit") return sesiuneExpirata();
    await logError({
      action: "cont/poza",
      message: `salvarea pozei a esuat: ${error?.message ?? String(data)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return NextResponse.json({ eroare: "Nu am putut salva poza. Incearca din nou." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });
  const { magazin, contId } = await contul(req);
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (!contId) return sesiuneExpirata();

  const { error } = await createAdminClient().rpc("cont_poza_sterge", { p_business: magazin.id, p_cont: contId });
  if (error) {
    await logError({
      action: "cont/poza",
      message: `stergerea pozei a esuat: ${error.message}`,
      businessId: magazin.id,
      severity: "error",
    });
    return NextResponse.json({ eroare: "Nu am putut scoate poza. Incearca din nou." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
