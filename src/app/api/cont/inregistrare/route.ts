import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { MESAJ_PARTEA_INTAI, pornestePas } from "@/lib/cont/autentificare";
import { amprentaParolei, problemaParolei } from "@/lib/cont/parola";
import { logError } from "@/lib/error-logger";
import { clientIp } from "@/lib/utils/rate-limit";
import { vineDePeMagazin } from "@/lib/cont/cerere";

/**
 * „Vreau cont": emailul si parola aleasa. Contul NU se creeaza aici, ci abia dupa
 * codul de pe email (`/api/cont/pas`), cand adresa e dovedita.
 *
 * ⚠⚠ ACELASI RASPUNS pentru o adresa noua si pentru una care are deja cont. In
 * al doilea caz codul pleaca oricum, iar dupa el parola aleasa devine parola
 * contului existent (codul dovedeste ca adresa e a lui) si omul primeste emailul
 * „parola s-a schimbat". Un raspuns deosebit ar fi spus oricui ce adrese au cont.
 *
 * ⚠ Parola se amprenteaza AICI, inaintea bazei: pe cod asteapta numai amprenta.
 * Nu ajunge in `logError`.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  let magazin;
  try {
    magazin = await magazinulCereriiDeCont(req.headers.get("host"));
  } catch (e) {
    await logError({ action: "cont/inregistrare", message: `cautarea magazinului a esuat: ${String(e)}`, severity: "error" });
    return NextResponse.json({ eroare: "Serviciu indisponibil temporar." }, { status: 503 });
  }
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const corp = await req.json().catch(() => null);
  const email = typeof corp?.email === "string" ? corp.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return NextResponse.json({ eroare: "Scrie o adresa de email valida." }, { status: 400 });
  }
  /* Regula parolei nu tine de adresa, deci poate fi spusa pe fata fara oracol. */
  const problema = problemaParolei(corp?.parola, email);
  if (problema) return NextResponse.json({ eroare: problema }, { status: 400 });

  try {
    const parolaHash = await amprentaParolei(corp.parola as string);
    await pornestePas({ magazin, scop: "inregistrare", email, parolaHash, ip: clientIp(req) });
  } catch (e) {
    await logError({
      action: "cont/inregistrare",
      message: `pornirea contului nou a esuat: ${String(e)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return NextResponse.json({ eroare: "Nu am putut trimite codul. Incearca din nou." }, { status: 500 });
  }
  return NextResponse.json({ pas: "cod", mesaj: MESAJ_PARTEA_INTAI }, { status: 200 });
}
