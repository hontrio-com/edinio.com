import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { cereCod, MESAJ_UNIC, type FelContact } from "@/lib/cont/cod";
import { logError } from "@/lib/error-logger";

/**
 * „Trimite-mi un cod."
 *
 * ⚠⚠ RASPUNDE ACELASI LUCRU IN TOATE CAZURILE in care cererea e bine formata:
 * contact cunoscut sau necunoscut, blocat, peste plafon, email cazut. Altfel
 * formularul devine un oracol prin care oricine afla ce adrese cunoaste
 * magazinul. Adevarul se scrie in jurnal, nu pe ecran.
 *
 * ⚠ Magazinul se ia DIN GAZDA, niciodata din corp sau din adresa. Vezi
 * `magazinulCereriiDeCont`: daca tinta s-ar alege din cerere, un strain ar putea
 * alege al cui credit de SMS se consuma.
 */
export async function POST(req: NextRequest) {
  let magazin;
  try {
    magazin = await magazinulCereriiDeCont(req.headers.get("host"));
  } catch (e) {
    /* O pana de baza nu inseamna „nu e magazin": 503, nu 404. */
    await logError({ action: "cont/cod", message: `cautarea magazinului a esuat: ${String(e)}`, severity: "error" });
    return NextResponse.json({ eroare: "Serviciu indisponibil temporar." }, { status: 503 });
  }
  if (!magazin) return new NextResponse("Not found", { status: 404 });

  /* ⚠ Magazin oprit: aceeasi poarta ca la /cos si /checkout. Fara ea, un cont ar
     fi putut cheltui creditul unui comerciant care nu mai plateste. */
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const corp = await req.json().catch(() => null);
  const fel = corp?.fel === "telefon" ? "telefon" : "email";
  const destinatie = typeof corp?.destinatie === "string" ? corp.destinatie : "";
  if (!destinatie.trim()) {
    return NextResponse.json({ mesaj: MESAJ_UNIC }, { status: 200 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "necunoscut";

  try {
    const r = await cereCod(magazin, fel as FelContact, destinatie, ip);
    return NextResponse.json({ mesaj: r.mesaj }, { status: 200 });
  } catch (e) {
    /*
      ⚠ NICIUN CONTACT IN JURNAL. `error_logs` nu are retentie: randurile lui nu
      se sterg niciodata, spre deosebire de `cont_jurnal`, care se curata la 12
      luni. Un email scris aici ar fi trait mai mult decat contul omului.
    */
    await logError({
      action: "cont/cod",
      message: `cererea codului a esuat: ${String(e)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return NextResponse.json({ eroare: "Nu am putut trimite codul. Incearca din nou." }, { status: 500 });
  }
}
