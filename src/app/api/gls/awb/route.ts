import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { etichetaGls } from "@/lib/gls/eticheta-sursa";
import { poartaEtichetei } from "@/lib/orders/poarta-eticheta";

/*
 * Eticheta GLS.
 *
 * DRUMUL (din R2, altfel de la ei, cu retiparirea partiala tratata) s-a mutat in
 * `@/lib/gls/eticheta-sursa`: de cand exista descarcarea in masa, acelasi drum e
 * chemat din doua locuri, si a doua copie s-ar fi despartit de prima.
 *
 * Aici raman cele doua paze ale RUTEI, independente de cea a cheii din R2:
 * sesiune + proprietatea magazinului, si poarta de abonament.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  const businessId = searchParams.get("businessId");

  if (!orderId || !businessId) {
    return NextResponse.json({ error: "Parametri lipsa" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return NextResponse.json({ error: "Acces interzis" }, { status: 403 });

  /* ⚠ SI STAREA CONTULUI, dupa dovedirea proprietatii. Vezi `poarta-eticheta.ts`. */
  const oprit = await poartaEtichetei(businessId);
  if (oprit) return oprit;

  /* Comanda trebuie sa fie a magazinului SI sa aiba AWB — altfel n-are eticheta. */
  const { data: order } = await supabase
    .from("orders").select("id, order_number, gls_awb_number")
    .eq("id", orderId).eq("business_id", businessId).single();

  const awb = (order as { gls_awb_number?: string | null } | null)?.gls_awb_number;
  if (!awb) return NextResponse.json({ error: "Comanda nu are AWB GLS" }, { status: 404 });

  const gasita = await etichetaGls(businessId, orderId);
  if (!gasita) {
    return NextResponse.json(
      { error: "Eticheta nu a putut fi obtinuta pentru aceasta comanda. O gasesti in contul MyGLS, la coletul " + awb },
      { status: 404 },
    );
  }
  const { continut, fel } = gasita;

  return new NextResponse(new Uint8Array(continut), {
    headers: {
      "Content-Type": fel.tipMime,
      "Content-Disposition": `attachment; filename="eticheta-gls-${awb}.${fel.ext}"`,
      /* ⚠ Eticheta poarta numele, adresa si telefonul cumparatorului. */
      "Cache-Control": "private, no-store",
    },
  });
}
