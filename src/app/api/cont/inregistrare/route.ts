import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { eLimitaDeIp, MESAJ_PARTEA_INTAI, MESAJ_PREA_MULTE, permisDeCalcul, pornestePas } from "@/lib/cont/autentificare";
import { amprentaParolei, problemaParolei } from "@/lib/cont/parola";
import { logError } from "@/lib/error-logger";
import { clientIp } from "@/lib/utils/rate-limit";
import { adresaEmailValida, vineDePeMagazin } from "@/lib/cont/cerere";

/**
 * „Vreau cont": emailul si parola aleasa. Contul NU se creeaza aici, ci abia dupa
 * codul de pe email (`/api/cont/pas`), cand adresa e dovedita.
 *
 * ⚠⚠ ACELASI RASPUNS pentru o adresa noua si pentru una care are deja cont. In
 * al doilea caz codul pleaca oricum, cu alt text (codul SCHIMBA parola contului
 * existent), iar dupa el omul primeste si emailul „parola s-a schimbat". Emailul
 * pleaca DUPA raspuns, ca nici timpul raspunsului sa nu spuna ceva. Singurul
 * refuz spus pe fata e plafonul pe IP, care nu tine de adresa.
 *
 * ⚠ Parola se amprenteaza AICI, inaintea bazei, dar abia DUPA plafonul pe IP:
 * scrypt e scump. Nu ajunge in `logError`.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  let magazin;
  try {
    magazin = await magazinulCereriiDeCont(req.headers.get("host"));
  } catch (e) {
    await logError({ action: "cont/inregistrare", message: `cautarea magazinului a esuat: ${String(e)}`, severity: "error" });
    return NextResponse.json({ eroare: "Serviciul este indisponibil momentan. Incearca mai tarziu." }, { status: 503 });
  }
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const corp = await req.json().catch(() => null);
  const email = typeof corp?.email === "string" ? corp.email.trim() : "";
  if (!adresaEmailValida(email)) {
    return NextResponse.json({ eroare: "Scrie o adresa de email valida." }, { status: 400 });
  }
  /* Regula parolei nu tine de adresa, deci poate fi spusa pe fata fara oracol. */
  const problema = problemaParolei(corp?.parola, email);
  if (problema) return NextResponse.json({ eroare: problema }, { status: 400 });

  const ip = clientIp(req);
  if (!(await permisDeCalcul(ip))) return NextResponse.json({ eroare: MESAJ_PREA_MULTE }, { status: 429 });

  try {
    const parolaHash = await amprentaParolei(corp.parola as string);
    const r = await pornestePas({ magazin, scop: "inregistrare", email, parolaHash, ip, inFundal: true });
    /* ⚠ Numai plafonul pe IP se spune; orice alt motiv raspunde ca o reusita. */
    if (eLimitaDeIp(r.motiv)) return NextResponse.json({ eroare: MESAJ_PREA_MULTE }, { status: 429 });
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
