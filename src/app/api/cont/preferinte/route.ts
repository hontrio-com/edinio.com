import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { sesiuneCurenta } from "@/lib/cont/sesiune";
import { sesiuneExpirata, vineDePeMagazin } from "@/lib/cont/cerere";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";

/**
 * Schimba preferintele de comunicare ale cumparatorului.
 *
 * ⚠ Lucreaza NUMAI pe contactele verificate ale contului: un contact adaugat si
 * neconfirmat nu poate dezabona pe nimeni, altfel cineva si-ar fi scris in cont
 * adresa altui om si i-ar fi oprit mesajele.
 *
 * ⚠ Dezabonarea nu se sterge de altundeva: anonimizarea o pastreaza dinadins,
 * fiindca omul care cere stergerea e de multe ori chiar cel care ceruse sa nu mai
 * primeasca mesaje. Aici o schimba EL, si asta e cu totul altceva.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  const magazin = await magazinulCereriiDeCont(req.headers.get("host")).catch(() => null);
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const s = await sesiuneCurenta(magazin.id).catch(() => null);
  if (!s) return sesiuneExpirata();

  const corp = await req.json().catch(() => null);
  const canal = corp?.canal === "sms" ? "sms" : corp?.canal === "email" ? "email" : null;
  if (!canal || typeof corp?.vrea !== "boolean") {
    return NextResponse.json({ eroare: "Cerere nevalida." }, { status: 400 });
  }

  const { error } = await createAdminClient().rpc("cont_preferinte_schimba", {
    p_business: magazin.id,
    p_cont: s.contId,
    p_canal: canal,
    p_vrea: corp.vrea,
  });
  if (error) {
    await logError({
      action: "cont/preferinte",
      message: `schimbarea preferintelor a esuat: ${error.message}`,
      businessId: magazin.id,
      severity: "error",
    });
    return NextResponse.json({ eroare: "Nu am putut salva. Incearca din nou." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
