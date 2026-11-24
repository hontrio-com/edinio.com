import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { sesiuneCurenta } from "@/lib/cont/sesiune";
import { vineDePeMagazin } from "@/lib/cont/cerere";
import { contacteleMele } from "@/lib/cont/date";
import { profilulContului } from "@/lib/cont/profil";
import { clientIp, rateLimit } from "@/lib/utils/rate-limit";
import { suportGata } from "@/lib/suport/config";
import { citesteSuportDinBaza } from "@/lib/suport/server";
import { identitateaPentru } from "@/lib/suport/semnaturi";
import type { RaspunsIdentitate } from "@/lib/suport/tipuri-chat";

/**
 * Butonul de chat intreaba, la deschidere: „cine e omul asta, ca sa-i spun furnizorului de chat?”
 *
 * ⚠⚠ IDENTITATEA VINE NUMAI DIN SESIUNEA DE CONT. Din cerere nu se citeste nimic: nici corp, nici
 * parametri. Ruta semneaza, cu secretul comerciantului, exact omul pe care `sesiuneCurenta` il recunoaste
 * dupa cookie, deci nimeni nu poate cere o semnatura pentru altcineva.
 *
 * ⚠ NUMAI PE DOMENIUL PROPRIU AL MAGAZINULUI, CU CONTURILE PORNITE. Magazinul se ia din antetul `Host`
 * (`magazinulCereriiDeCont`), ca la toate rutele de cont: pe gazda platformei, unde magazinele impart
 * originea, ruta nu gaseste niciun magazin si raspunde gol.
 *
 * ⚠ Raspunde gol (200, fara identitate) in toate cazurile in care nu are ce spune: anonim, chat oprit,
 * comutatorul „Numele si emailul clientului” oprit, secret lipsa, email neconfirmat. Butonul deschide
 * atunci chatul anonim; ruta nu spune de ce.
 *
 * ⚠ Emailul pleaca numai daca e CONFIRMAT in cont: la Zendesk il trimitem cu `email_verified: true`.
 *
 * `no-store`: e identitatea unui singur om, semnata pe o ora.
 */
const NIMIC: RaspunsIdentitate = { identitate: null, amprenta: null };

function raspunde(r: RaspunsIdentitate, status = 200) {
  return NextResponse.json(r, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });
  /* Butonul intreaba o data la fiecare deschidere a chatului; peste atat nu e un om. */
  if (!rateLimit(`suport-identitate:${clientIp(req)}`, 60, 60_000)) return raspunde(NIMIC, 429);

  let magazin;
  try {
    magazin = await magazinulCereriiDeCont(req.headers.get("host"));
    if (magazin && (await magazinulEOprit(magazin))) magazin = null;
  } catch {
    return raspunde(NIMIC, 503);
  }
  if (!magazin) return raspunde(NIMIC);

  let config;
  try {
    config = await citesteSuportDinBaza(magazin.id);
  } catch {
    return raspunde(NIMIC, 503);
  }
  if (!config || !config.furnizor || !suportGata(config) || !config.date.identitate) return raspunde(NIMIC);

  const sesiune = await sesiuneCurenta(magazin.id).catch(() => null);
  if (!sesiune) return raspunde(NIMIC);

  let email = "";
  let nume = sesiune.nume ?? "";
  let telefon = "";
  try {
    const contacte = await contacteleMele(magazin.id, sesiune.contId);
    email = contacte.find((c) => c.fel === "email" && c.verificat)?.valoareBruta ?? "";
    const profil = await profilulContului(magazin.id, sesiune.contId);
    nume = profil.nume || nume;
    telefon = profil.telefon;
  } catch {
    return raspunde(NIMIC, 503);
  }
  if (!email) return raspunde(NIMIC);

  const identitate = identitateaPentru(config.furnizor, config, { id: sesiune.contId, nume, email, telefon });
  if (!identitate) return raspunde(NIMIC);

  /* Butonul tine minte doar amprenta: ii ajunge ca sa observe ca omul s-a schimbat intre doua deschideri. */
  const amprenta = createHash("sha256").update(`${magazin.id}:${sesiune.contId}`).digest("hex").slice(0, 16);
  return raspunde({ identitate, amprenta });
}
