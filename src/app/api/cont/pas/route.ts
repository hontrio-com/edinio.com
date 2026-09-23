import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import {
  anuntaParolaSchimbata, arePas, eLimitaDeIp, incheieIntrarea, mesajulPasului, MESAJ_PARTEA_INTAI,
  MESAJ_PREA_MULTE, permisDeCalcul, retrimitePas, tineMinteDispozitivul, verificaPas,
} from "@/lib/cont/autentificare";
import { amprentaParolei, problemaParolei } from "@/lib/cont/parola";
import { logError } from "@/lib/error-logger";
import { clientIp } from "@/lib/utils/rate-limit";
import { vineDePeMagazin } from "@/lib/cont/cerere";

/**
 * Pasul al doilea, pentru toate cele trei drumuri: contul nou, intrarea de pe un
 * dispozitiv nou si resetarea parolei.
 *
 *   `{ actiune: "confirma", cod, tineMinte?, parola? }`: codul (si, la resetare,
 *   parola noua). La reusita omul intra.
 *   `{ actiune: "retrimite" }`: un cod nou pe aceeasi provocare.
 *
 * ⚠⚠ Care drum e, afla baza din provocare, NU din cerere. Browserul nu poate
 * transforma un cod de cont nou intr-o resetare sau invers.
 *
 * ⚠ `expirat: true` in raspuns spune formularului sa se intoarca la primul pas:
 * provocarea nu mai exista, iar „Retrimite codul" n-ar mai avea ce retrimite.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  let magazin;
  try {
    magazin = await magazinulCereriiDeCont(req.headers.get("host"));
  } catch (e) {
    await logError({ action: "cont/pas", message: `cautarea magazinului a esuat: ${String(e)}`, severity: "error" });
    return NextResponse.json({ eroare: "Serviciu indisponibil temporar." }, { status: 503 });
  }
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const corp = await req.json().catch(() => null);
  const ip = clientIp(req);
  const expirat = () =>
    NextResponse.json({ eroare: "Pasul a expirat. Reia de la inceput.", expirat: true }, { status: 400 });

  try {
    if (corp?.actiune === "retrimite") {
      const r = await retrimitePas({ magazin, ip });
      if (r.motiv === "fara-provocare" || r.motiv === "provocare-incheiata") return expirat();
      if (eLimitaDeIp(r.motiv)) return NextResponse.json({ eroare: MESAJ_PREA_MULTE }, { status: 429 });
      /* La intrare omul a trecut deja de parola, deci i se poate spune adevarul. */
      if (r.scop === "doi-pasi" && !r.trimis) {
        return NextResponse.json({ eroare: "Nu am putut trimite alt cod acum. Foloseste-l pe ultimul primit sau asteapta cateva minute." }, { status: 400 });
      }
      return NextResponse.json({ mesaj: r.scop === "doi-pasi" ? "Ti-am trimis un cod nou." : MESAJ_PARTEA_INTAI }, { status: 200 });
    }

    if (corp?.actiune !== "confirma") {
      return NextResponse.json({ eroare: "Cerere nevalida." }, { status: 400 });
    }

    const cod = typeof corp?.cod === "string" ? corp.cod.trim() : "";
    if (!/^\d{6}$/.test(cod)) return NextResponse.json({ eroare: "Codul are sase cifre." }, { status: 400 });

    /* ⚠ Fara provocare nu e nimic de verificat: se raspunde INAINTEA oricarui calcul. */
    if (!(await arePas())) return expirat();

    let parolaHash: string | null = null;
    if (typeof corp?.parola === "string" && corp.parola !== "") {
      const problema = problemaParolei(corp.parola);
      if (problema) return NextResponse.json({ eroare: problema }, { status: 400 });
      if (!(await permisDeCalcul(ip))) return NextResponse.json({ eroare: MESAJ_PREA_MULTE }, { status: 429 });
      parolaHash = await amprentaParolei(corp.parola);
    }

    const r = await verificaPas({ magazin, cod, ip, parolaHash });
    if (!r.ok || !r.contId) {
      return NextResponse.json({ eroare: mesajulPasului(r.motiv) }, { status: eLimitaDeIp(r.motiv) ? 429 : 400 });
    }

    await incheieIntrarea(magazin.id, r.contId, ip);
    if (corp?.tineMinte === true) await tineMinteDispozitivul(magazin.id, r.contId);
    /* Parola s-a schimbat: la resetare, sau la un „cont nou" pe o adresa care avea deja cont. */
    if (r.scop === "resetare-parola" || (r.scop === "inregistrare" && !r.contNou)) {
      await anuntaParolaSchimbata(magazin, r.contId);
    }
    return NextResponse.json({ ok: true, contNou: r.contNou }, { status: 200 });
  } catch (e) {
    await logError({
      action: "cont/pas",
      message: `pasul al doilea a esuat: ${String(e)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return NextResponse.json({ eroare: "Nu am putut verifica codul. Incearca din nou." }, { status: 500 });
  }
}
