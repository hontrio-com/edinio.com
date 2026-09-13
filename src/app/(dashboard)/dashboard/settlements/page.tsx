import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { SettlementsClient } from "@/components/dashboard/SettlementsClient";

/**
 * „Decontari": banii pe care curierul i-a incasat la livrare si i-a virat comerciantului.
 *
 * ⚠ Pana pe 13.09.2026, singurul raspuns posibil la „mi-a virat FAN banii pe comanda asta?"
 * era extrasul de banca si potrivirea de mana. Randurile vin din `courier_settlements`, umplut
 * de `api/cron/fancourier-settlements`.
 *
 * ⚠ Tabelul e GENERIC pe `courier`: FAN il inaugureaza, ceilalti paisprezece intra fara nicio
 * migratie si fara sa se schimbe nimic in pagina asta.
 */

/**
 * ⚠ Se cere si numarul TOTAL, nu doar randurile.
 *
 * PostgREST taie tacut la 1000 de randuri (vezi `lib/orders/pagination.ts`), iar un total
 * calculat peste o lista taiata ar fi o cifra in care comerciantul are incredere si NU trebuie:
 * ar arata mai putini bani decat a primit. Cu `count: "exact"` se poate spune limpede cand
 * lista e incompleta, in loc sa se minta prin omisiune.
 */
const LIMITA = 500;

export default async function SettlementsPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses").select("id").eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(1).single();
  if (!business) redirect("/dashboard");

  const { data: rows, count } = await supabase
    .from("courier_settlements")
    .select(
      "id, courier, awb_number, awb_date, transfer_date, transaction_date, amount_collected, content, return_awb_number, recipient_name, recipient_locality, order_id",
      { count: "exact" },
    )
    .eq("business_id", business.id)
    .order("transfer_date", { ascending: false })
    .order("awb_number", { ascending: false })
    .limit(LIMITA);

  const list = (rows ?? []).map((r) => ({
    id: r.id,
    courier: r.courier,
    awbNumber: r.awb_number,
    awbDate: r.awb_date,
    transferDate: r.transfer_date,
    transactionDate: r.transaction_date,
    /* ⚠ `numeric` vine ca SIR prin PostgREST la unele configurari. `Number(null)` ar fi ZERO,
       adica exact defectul din feedurile Facebook: o suma lipsa devenea o suma reala. */
    amount: typeof r.amount_collected === "number" ? r.amount_collected : Number(r.amount_collected ?? 0),
    content: r.content,
    returnAwbNumber: r.return_awb_number,
    recipientName: r.recipient_name,
    recipientLocality: r.recipient_locality,
    orderId: r.order_id,
  }));

  return (
    <SettlementsClient
      settlements={list}
      /* ⚠ Cate exista CU ADEVARAT, ca pagina sa poata spune ca a aratat doar o parte. */
      totalRanduri={count ?? list.length}
      limita={LIMITA}
    />
  );
}
