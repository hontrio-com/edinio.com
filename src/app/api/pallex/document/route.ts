import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { numeFisier } from "@/lib/pallex/documente";
import { documentPallex } from "@/lib/pallex/eticheta-sursa";
import { type FelDocument } from "@/lib/pallex/client";
import { poartaEtichetei } from "@/lib/orders/poarta-eticheta";

/**
 * Documentele de transport Pall-Ex: eticheta (`label`) si avizul (`note`).
 *
 * ═══ INTAI DIN R2, SI ABIA APOI DE LA PALL-EX ═══
 *
 * Copia de pe CDN se da instantaneu, merge si cand ClientPlus e picat, si nu
 * consuma niciun apel. De aia se incearca prima.
 *
 * ⚠ Aici, spre deosebire de GLS, cererea de la furnizor NU e periculoasa:
 * `GET /consignments/{id}/label` e o citire pura, care nu are cu ce sa descrie o
 * partida noua. La GLS `PrintLabels` ar fi creat un al doilea colet real, si de
 * aceea acolo trebuia neaparat alta metoda pentru retiparire.
 *
 * ⚠ Documentele apar de obicei abia DUPA validarea borderoului (pasul 5 din
 * fluxul documentat de Pall-Ex). Un 404 inainte de asta nu e un defect — si de
 * aceea mesajul de mai jos spune ce are omul de facut, in loc sa arate o eroare.
 *
 * ═══ ⚠ DOUA PAZE, INDEPENDENTE ═══
 *
 * Un aviz de transport contine numele, adresa si telefonul DESTINATARULUI — date
 * personale ale unui tert, nu ale comerciantului.
 *
 *   1. **Cheia din R2 nu se poate ghici**: are o semnatura HMAC din secretul
 *      serverului (vezi `cheieDocument`). Cine stie cele doua UUID-uri — iar
 *      comerciantul le stie pe ale lui, si un fost angajat la fel — tot nu poate
 *      compune adresa.
 *   2. **Ruta cere sesiune si proprietate**, aici.
 *
 * Sunt independente dinadins: daca vreodata un URL scapa public, tot nu se poate
 * ghici altul; daca cineva deduce structura cheii, ruta tot cere autentificare.
 *
 * ⚠ `Cache-Control: private, no-store` — altfel un intermediar sau CDN-ul ar putea
 * tine PDF-ul cu datele cumparatorului.
 */

/** Doar cele doua feluri documentate. Orice altceva ar fi o cale compusa din URL. */
function felValid(v: string | null): v is FelDocument {
  return v === "label" || v === "note";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  const businessId = searchParams.get("businessId");
  const felBrut = searchParams.get("fel") ?? "label";

  if (!orderId || !businessId) {
    return NextResponse.json({ error: "Parametri lipsa" }, { status: 400 });
  }
  /*
   * ⚠ Se verifica pe o lista ALBA, nu se curata. `fel` intra intr-o cale catre
   * Pall-Ex (`/consignments/{id}/{fel}`); orice altceva decat cele doua valori ar
   * fi insemnat sa lasam browserul sa compuna calea.
   */
  if (!felValid(felBrut)) {
    return NextResponse.json({ error: "Document necunoscut" }, { status: 400 });
  }
  const fel: FelDocument = felBrut;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return NextResponse.json({ error: "Acces interzis" }, { status: 403 });

  /*
   * ⚠ SI STAREA CONTULUI, dupa dovedirea proprietatii. Vezi `poarta-eticheta.ts`.
   *
   * ⚠ LIPSEA DE CAND EXISTA RUTA, si n-a vazut-o nimeni fiindca plasa din
   * `poarta-eticheta.test.ts` cauta doar `<furnizor>/awb/route.ts`, iar asta se
   * cheama `pallex/document`. Adica exact defectul pe care plasa fusese pusa sa-l
   * prinda, scapat printr-un nume de dosar. Gasita pe 21.09.2026, cand plasa a fost
   * largita pentru ruta lotului de etichete.
   */
  const oprit = await poartaEtichetei(businessId);
  if (oprit) return oprit;

  /* Comanda trebuie sa fie a magazinului SI sa aiba partida — altfel n-are documente. */
  const { data: order } = await supabase
    .from("orders").select("id, order_number, pallex_awb_number, pallex_consignment_id")
    .eq("id", orderId).eq("business_id", businessId).single();

  const awb = order?.pallex_awb_number;
  const consignmentId = Number(order?.pallex_consignment_id);
  if (!awb) return NextResponse.json({ error: "Comanda nu are partida Pall-Ex" }, { status: 404 });

  const pdf = await documentPallex(businessId, orderId, consignmentId, fel);
  if (!pdf) {
    if (!Number.isInteger(consignmentId) || consignmentId <= 0) {
      return NextResponse.json(
        { error: `Identificatorul intern al partidei ${awb} nu a fost pastrat. Descarca documentul din contul ClientPlus.` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        error:
          fel === "label"
            ? `Eticheta pentru partida ${awb} nu e inca disponibila. Pall-Ex o pregateste dupa validarea borderoului.`
            : `Avizul pentru partida ${awb} nu e inca disponibil. Pall-Ex il pregateste dupa validarea borderoului.`,
      },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${numeFisier(fel, awb)}"`,
      /* ⚠ Documentul poarta numele, adresa si telefonul cumparatorului. */
      "Cache-Control": "private, no-store",
    },
  });
}
