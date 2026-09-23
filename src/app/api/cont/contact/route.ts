import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { sesiuneCurenta } from "@/lib/cont/sesiune";
import { vineDePeMagazin } from "@/lib/cont/cerere";
import { clientIp } from "@/lib/utils/rate-limit";
import { cereCod, verificaCod, mesajulRefuzului, MESAJ_SMS_INCA_NU } from "@/lib/cont/cod";
import { scoateContact } from "@/lib/cont/date";
import { logError } from "@/lib/error-logger";

/**
 * Contactele contului: adaugarea unuia nou (in doi pasi, cu cod) si scoaterea.
 *
 * ⚠⚠ ADAUGAREA E LEGATA DE CONTUL CARE A CERUT CODUL. `cont_cere_cod` primeste
 * `p_cont`, iar `cont_verifica_cod` refuza daca acela nu se potriveste cu contul
 * din sesiune. Fara asta, cineva pacalit sa transmita codul primit si-ar fi
 * vazut contactul lipit de contul altcuiva.
 *
 * ⚠ Si un contact care e deja al altui cont NU se muta tacit: functia raspunde
 * `contact-la-alt-cont` si omul afla.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  const magazin = await magazinulCereriiDeCont(req.headers.get("host")).catch(() => null);
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const s = await sesiuneCurenta(magazin.id).catch(() => null);
  if (!s) return new NextResponse("Not found", { status: 404 });

  const corp = await req.json().catch(() => null);
  const actiune = corp?.actiune;
  const fel: "email" | "telefon" = corp?.fel === "telefon" ? "telefon" : "email";
  const valoare = typeof corp?.valoare === "string" ? corp.valoare : "";
  if (!valoare.trim()) return NextResponse.json({ eroare: "Scrie un contact." }, { status: 400 });

  const ip = clientIp(req);

  try {
    if (actiune === "cere-cod") {
      if (fel === "telefon") return NextResponse.json({ eroare: MESAJ_SMS_INCA_NU }, { status: 400 });
      const r = await cereCod(magazin, fel, valoare, ip, "adaugare-contact", s.contId);
      return NextResponse.json({ mesaj: r.mesaj }, { status: 200 });
    }

    if (actiune === "confirma") {
      const cod = typeof corp?.cod === "string" ? corp.cod.trim() : "";
      if (!/^\d{6}$/.test(cod)) return NextResponse.json({ eroare: "Codul are sase cifre." }, { status: 400 });
      const r = await verificaCod(magazin, fel, valoare, cod, ip, "adaugare-contact", s.contId);
      if (!r.ok) return NextResponse.json({ eroare: mesajulRefuzului(r.motiv) }, { status: 400 });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (actiune === "scoate") {
      const r = await scoateContact(magazin.id, s.contId, fel, valoare);
      if (!r.ok) {
        /*
          ⚠ Aici mesajul e ANUME deosebit, si nu e o scapare de la „un singur
          raspuns": regula aceea apara existenta contactelor ALTORA. Asta e despre
          propriul lui cont, si daca nu i se spune de ce nu se poate, apasa la
          nesfarsit un buton care nu face nimic.
        */
        const text = r.motiv === "ultimul-contact"
          ? "Nu poti scoate ultimul contact confirmat: fara el nu ai cum sa mai intri in cont. Adauga altul intai."
          : "Contactul nu s-a putut scoate.";
        return NextResponse.json({ eroare: text }, { status: 400 });
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ eroare: "Cerere nevalida." }, { status: 400 });
  } catch (e) {
    await logError({
      action: "cont/contact",
      message: `actiunea pe contact a esuat: ${String(e)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return NextResponse.json({ eroare: "Nu am putut salva. Incearca din nou." }, { status: 500 });
  }
}
