import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { numeFisier } from "@/lib/ecolet/documente";
import { etichetaEcolet } from "@/lib/ecolet/eticheta-sursa";
import { poartaEtichetei } from "@/lib/orders/poarta-eticheta";

/**
 * Eticheta eColet.
 *
 * ═══ INTAI DIN R2, APOI DE LA ECOLET ═══
 *
 * Copia de pe CDN se da instantaneu, merge si cand panoul lor e picat, si nu
 * consuma niciun apel.
 *
 * ⚠ Cererea catre eColet NU e periculoasa aici: `GET /order/{id}/download-waybill`
 * e o citire pura, care nu are cu ce sa descrie o expediere noua. (La GLS era
 * altfel — acolo a doua chemare a metodei de emitere ar fi creat un al doilea
 * colet real, si de aceea acolo trebuia neaparat alta metoda.)
 *
 * ⚠ POATE FI ZPL, NU DOAR PDF. `waybill_extension` din `GET /order/{id}` spune
 * care. Servit cu tipul gresit, browserul incearca sa deschida ZPL ca PDF si arata
 * o pagina goala — un defect care pare al nostru si nu e. De aceea extensia intra
 * si in cheia din R2: cele doua feluri nu au voie sa ajunga in acelasi fisier.
 *
 * ═══ ⚠ DOUA PAZE, INDEPENDENTE ═══
 *
 * Eticheta contine numele, adresa si telefonul CUMPARATORULUI — date personale ale
 * unui tert. Cheia din R2 nu se poate ghici (semnatura HMAC), iar ruta cere
 * sesiune si verifica proprietatea magazinului.
 *
 * ⚠ `Cache-Control: private, no-store` — altfel un intermediar sau CDN-ul ar putea
 * tine fisierul cu datele cumparatorului.
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

  const { data: order } = await supabase
    .from("orders")
    .select("id, ecolet_awb_number, ecolet_order_id, ecolet_send_state")
    .eq("id", orderId).eq("business_id", businessId).single();

  const awb = order?.ecolet_awb_number;
  const orderIdEcolet = Number(order?.ecolet_order_id);

  if (!awb || !Number.isInteger(orderIdEcolet) || orderIdEcolet <= 0) {
    /*
     * ⚠ Mesajul deosebeste „inca se emite" de „n-a fost emisa". La eColet prima
     * situatie e obisnuita si trece de la sine; a doua cere o apasare pe buton.
     */
    return NextResponse.json(
      {
        error: order?.ecolet_send_state === "new"
          ? "Expedierea e inca in curs de creare la eColet. Eticheta apare dupa ce primeste AWB."
          : "Comanda nu are expediere eColet.",
      },
      { status: 404 },
    );
  }

  const gasita = await etichetaEcolet(businessId, orderId, orderIdEcolet);
  if (!gasita) {
    return NextResponse.json(
      { error: `Eticheta pentru AWB ${awb} nu a putut fi obtinuta. O gasesti si in panel.ecolet.ro.` },
      { status: 404 },
    );
  }
  const { octeti, ext, tip } = gasita;

  return new NextResponse(new Uint8Array(octeti), {
    headers: {
      "Content-Type": tip,
      "Content-Disposition": `attachment; filename="${numeFisier(awb, ext)}"`,
      /* ⚠ Eticheta poarta numele, adresa si telefonul cumparatorului. */
      "Cache-Control": "private, no-store",
    },
  });
}
