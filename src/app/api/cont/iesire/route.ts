import { NextRequest, NextResponse } from "next/server";
import { magazinulDupaGazda } from "@/lib/cont/magazinul-cererii";
import { inchideSesiune } from "@/lib/cont/sesiune";

/**
 * Iesirea din cont.
 *
 * ⚠ NU cere ca magazinul sa fie pornit sau nesuspendat. Iesirea trebuie sa
 * mearga MAI ALES cand ceva s-a stricat: altfel omul ramane cu un cookie pe care
 * nu-l mai poate scoate de nicaieri. Acelasi rationament ca la iesirea din panou,
 * care e ruta tocmai ca sa mearga si dintr-o sesiune pe care poarta o refuza.
 *
 * Raspunsul e 303, ca browserul sa continue cu GET si formularul sa mearga si
 * fara JavaScript.
 */
export async function POST(req: NextRequest) {
  const magazin = await magazinulDupaGazda(req.headers.get("host")).catch(() => null);
  if (magazin) await inchideSesiune(magazin.id);

  return NextResponse.redirect(new URL("/cont/intra", req.nextUrl.origin), 303);
}
