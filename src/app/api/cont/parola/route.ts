import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import {
  anuntaParolaSchimbata, dispozitivCunoscut, eLimitaDeIp, ipPentruBaza, MESAJ_PARTEA_INTAI, MESAJ_PREA_MULTE,
  parolaDinCont, permisDeCalcul, pornestePas, tineMinteDispozitivul,
} from "@/lib/cont/autentificare";
import { amprentaParolei, problemaParolei } from "@/lib/cont/parola";
import { deschideSesiune, sesiuneCurenta } from "@/lib/cont/sesiune";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { clientIp } from "@/lib/utils/rate-limit";
import { adresaEmailValida, vineDePeMagazin } from "@/lib/cont/cerere";

/**
 * Parola contului.
 *
 *   `{ actiune: "uitata", email }`: porneste resetarea (codul, apoi parola noua
 *   prin `/api/cont/pas`). ⚠ ACELASI raspuns si pentru o adresa fara cont (baza
 *   scrie atunci un rand-momeala), iar emailul pleaca dupa raspuns.
 *   `{ actiune: "schimba", parolaVeche?, parolaNoua }`: din cont, cu sesiune.
 *   Parola veche se cere cand exista; un cont facut inainte de parole (numai pe
 *   demo) isi poate seta una direct.
 *
 * ⚠ Schimbarea scoate din cont TOATE celelalte dispozitive (epoca urca in baza)
 * si deschide pe loc o sesiune noua aici, ca omul sa ramana inauntru. Browserul
 * de aici ramane „de incredere" NUMAI daca era si inainte.
 * ⚠ Parolele nu ajung in `logError`.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  let magazin;
  try {
    magazin = await magazinulCereriiDeCont(req.headers.get("host"));
  } catch (e) {
    await logError({ action: "cont/parola", message: `cautarea magazinului a esuat: ${String(e)}`, severity: "error" });
    return NextResponse.json({ eroare: "Serviciu indisponibil temporar." }, { status: 503 });
  }
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const corp = await req.json().catch(() => null);
  const ip = clientIp(req);

  if (corp?.actiune === "uitata") {
    const email = typeof corp?.email === "string" ? corp.email.trim() : "";
    if (!adresaEmailValida(email)) return NextResponse.json({ eroare: "Scrie adresa de email a contului." }, { status: 400 });
    try {
      const r = await pornestePas({ magazin, scop: "resetare-parola", email, ip, inFundal: true });
      /* ⚠ Numai plafonul pe IP se spune; orice alt motiv raspunde ca o reusita. */
      if (eLimitaDeIp(r.motiv)) return NextResponse.json({ eroare: MESAJ_PREA_MULTE }, { status: 429 });
    } catch (e) {
      await logError({ action: "cont/parola", message: `resetarea nu a pornit: ${String(e)}`, businessId: magazin.id, severity: "error" });
      return NextResponse.json({ eroare: "Nu am putut trimite codul. Incearca din nou." }, { status: 500 });
    }
    return NextResponse.json({ pas: "cod", mesaj: MESAJ_PARTEA_INTAI }, { status: 200 });
  }

  if (corp?.actiune !== "schimba") {
    return NextResponse.json({ eroare: "Cerere nevalida." }, { status: 400 });
  }

  const s = await sesiuneCurenta(magazin.id).catch(() => null);
  if (!s) return new NextResponse("Not found", { status: 404 });
  if (!(await permisDeCalcul(ip))) return NextResponse.json({ eroare: MESAJ_PREA_MULTE }, { status: 429 });

  try {
    const admin = createAdminClient();
    /* Acelasi plafon ca la intrare: altfel ruta asta ar fi fost o usa de ghicit parole. */
    const v = await parolaDinCont({
      magazinId: magazin.id, contId: s.contId, parola: corp?.parolaVeche, ip,
      mesajGresita: "Parola actuala nu e buna.", permisCerut: true,
    });
    if (!v.ok) return NextResponse.json({ eroare: v.eroare }, { status: v.status });
    const cont = v.cont;

    const eraDeIncredere = await dispozitivCunoscut(magazin.id, s.contId);

    const problema = problemaParolei(corp?.parolaNoua, cont.email);
    if (problema) return NextResponse.json({ eroare: problema }, { status: 400 });

    const { data: ok, error: e2 } = await admin.rpc("cont_schimba_parola", {
      p_business: magazin.id,
      p_cont: s.contId,
      p_parola_hash: await amprentaParolei(corp.parolaNoua as string),
      p_ip: ipPentruBaza(ip),
    });
    if (e2) throw e2;
    if (ok !== true) throw new Error("cont_schimba_parola a intors fals");

    /* Epoca a urcat: sesiunea de acum a cazut si ea. Se deschide alta, aici. */
    await deschideSesiune(magazin.id, s.contId, ipPentruBaza(ip));
    if (eraDeIncredere) await tineMinteDispozitivul(magazin.id, s.contId);
    await anuntaParolaSchimbata(magazin, s.contId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    await logError({
      action: "cont/parola",
      message: `schimbarea parolei a esuat: ${String(e)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return NextResponse.json({ eroare: "Nu am putut schimba parola. Incearca din nou." }, { status: 500 });
  }
}
