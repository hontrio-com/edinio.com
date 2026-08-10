import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFromR2 } from "@/lib/r2";
import { cheieEticheta } from "@/lib/gls/eticheta";

/**
 * Eticheta GLS salvata la emitere.
 *
 * ═══ DE CE NU SE CERE DE LA GLS ═══
 *
 * Spre deosebire de ceilalti curieri, MyGLS intoarce PDF-ul o SINGURA data, la
 * creare. Un al doilea `PrintLabels` ar crea un al doilea colet, real si
 * facturat. Deci ruta asta NU vorbeste cu GLS: citeste din R2 ce s-a salvat
 * atunci.
 *
 * ═══ ⚠ DOUA PAZE, INDEPENDENTE ═══
 *
 * O eticheta AWB contine numele, adresa si telefonul cumparatorului — date
 * personale ale unui TERT, nu ale comerciantului.
 *
 * 1. **Cheia din R2 nu se poate ghici**: are o semnatura HMAC din secretul
 *    serverului (vezi `cheieEticheta`). Cine stie cele doua UUID-uri — iar
 *    comerciantul le stie pe ale lui, si un fost angajat la fel — tot nu poate
 *    compune adresa.
 * 2. **Ruta cere sesiune si proprietate**, aici.
 *
 * Sunt independente dinadins: daca vreodata un URL scapa public, tot nu se poate
 * ghici altul; daca cineva deduce structura cheii, ruta tot cere autentificare.
 *
 * ⚠ `Cache-Control: private, no-store` — altfel un intermediar sau CDN-ul ar
 * putea tine PDF-ul cu datele cumparatorului.
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

  /* Comanda trebuie sa fie a magazinului SI sa aiba AWB — altfel n-are eticheta. */
  const { data: order } = await supabase
    .from("orders").select("id, order_number, gls_awb_number")
    .eq("id", orderId).eq("business_id", businessId).single();

  const awb = (order as { gls_awb_number?: string | null } | null)?.gls_awb_number;
  if (!awb) return NextResponse.json({ error: "Comanda nu are AWB GLS" }, { status: 404 });

  const pdf = await getFromR2(cheieEticheta(businessId, orderId));
  if (!pdf) {
    /*
     * Se intampla pentru AWB-urile emise inainte de salvarea in R2, sau daca
     * urcarea a picat atunci. Mesajul spune exact unde se gaseste eticheta, in
     * loc sa lase omul sa creada ca s-a stricat ceva.
     */
    return NextResponse.json(
      { error: "Eticheta nu a fost salvata pentru aceasta comanda. O gasesti in contul MyGLS, la coletul " + awb },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="eticheta-gls-${awb}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
