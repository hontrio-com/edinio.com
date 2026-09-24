import { NextRequest, NextResponse } from "next/server";
import { magazinulDupaGazda } from "@/lib/cont/magazinul-cererii";
import { conturilePornite } from "@/lib/cont/origine";
import { vineDePeMagazin } from "@/lib/cont/cerere";
import { inchideSesiune, stergeCookieContului } from "@/lib/cont/sesiune";

/**
 * Iesirea din cont.
 *
 * ⚠⚠ COOKIE-UL SE STERGE INTOTDEAUNA, chiar daca magazinul nu se poate rezolva.
 * Prima scriere il stergea numai cand gasea magazinul, iar magazinul se cauta
 * dupa gazda: nepublicat, domeniu tocmai schimbat sau baza cazuta insemnau ca
 * omul apasa „Iesi”, pagina se reincarca si el e tot logat, fara nicio usa.
 *
 * ⚠ NU cere ca functia sa fie aprinsa din Setari: iesirea trebuie sa mearga mai
 * ales cand ceva s-a stricat. Acelasi rationament ca la iesirea din panou, care
 * e ruta tocmai ca sa mearga si dintr-o sesiune pe care poarta MFA o refuza.
 *
 * ⚠ `Origin` se verifica NUMAI cand vine: un formular de pe alt site trimite
 * `Origin` strain si nu mai poate deconecta omul (auditul din 24.09.2026). Un
 * browser vechi care nu-l trimite deloc tot poate iesi: o verificare prea stramta
 * aici ar fi inchis singura usa de iesire.
 *
 * Raspunsul e 303, ca browserul sa continue cu GET si formularul sa mearga si
 * fara JavaScript. Cu conturile oprite, spre prima pagina: intrarea ar fi 404.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") && !vineDePeMagazin(req)) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin), 303);
  }

  const magazin = await magazinulDupaGazda(req.headers.get("host")).catch(() => null);
  if (magazin) {
    await inchideSesiune(magazin.id);
  } else {
    await stergeCookieContului();
  }

  const spre = magazin && conturilePornite(magazin.contClientConfig) ? "/cont/intra" : "/";
  return NextResponse.redirect(new URL(spre, req.nextUrl.origin), 303);
}
