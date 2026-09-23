import { NextRequest, NextResponse } from "next/server";
import { magazinulDupaGazda } from "@/lib/cont/magazinul-cererii";
import { inchideSesiune, stergeCookieContului } from "@/lib/cont/sesiune";

/**
 * Iesirea din cont.
 *
 * ⚠⚠ COOKIE-UL SE STERGE INTOTDEAUNA, chiar daca magazinul nu se poate rezolva.
 * Prima scriere il stergea numai cand gasea magazinul, iar magazinul se cauta
 * dupa gazda: nepublicat, domeniu tocmai schimbat sau baza cazuta insemnau ca
 * omul apasa „Iesi", pagina se reincarca si el e tot logat, fara nicio usa.
 *
 * ⚠ NU cere ca functia sa fie aprinsa din Setari: iesirea trebuie sa mearga mai
 * ales cand ceva s-a stricat. Acelasi rationament ca la iesirea din panou, care
 * e ruta tocmai ca sa mearga si dintr-o sesiune pe care poarta MFA o refuza.
 *
 * ⚠ Nu verifica `Origin`: o cerere straina care te DEconecteaza e o suparare, nu
 * o bresa, iar o verificare prea stramta aici ar inchide singura usa de iesire.
 *
 * Raspunsul e 303, ca browserul sa continue cu GET si formularul sa mearga si
 * fara JavaScript.
 */
export async function POST(req: NextRequest) {
  const magazin = await magazinulDupaGazda(req.headers.get("host")).catch(() => null);
  if (magazin) {
    await inchideSesiune(magazin.id);
  } else {
    await stergeCookieContului();
  }

  return NextResponse.redirect(new URL("/cont/intra", req.nextUrl.origin), 303);
}
