import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { ReturnsClient } from "@/components/dashboard/ReturnsClient";
import { pageParam } from "@/lib/orders/pagination";
import { fereastraPaginii } from "@/lib/paginare";
import { rezumatulPaginii } from "@/lib/dashboard/paginare";

interface ReturnItem { product_id: string; name: string; quantity: number; price: number }

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PAGINĂ DE CERERI, NU PRIMELE TREI SUTE                      (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ CE ERA. `.limit(300)`, fără `count` și fără nicio paginare: ecranul aducea
 * cele mai noi trei sute de cereri și le desena pe toate deodată. A trei sute
 * una nu se putea vedea în niciun fel, și nimic din ecran nu spunea că există.
 * Adică exact tăcerea pe care o vânez: comerciantul crede că aia e toată lista.
 *
 * ⚠ RETURURILE CRESC CU MAGAZINUL. Nu sunt un nomenclator cu șase rânduri, ci
 * un rând la fiecare retragere din contract (OUG 18/2026). Un magazin cu câteva
 * sute de comenzi pe lună trece de trei sute într-un an, și abia atunci ar fi
 * început să mintă, în tăcere.
 *
 * ⚠ SE NUMĂRĂ ÎNTÂI, ȘI ABIA APOI SE CERE PAGINA. Aceeași regulă ca la abonați:
 * un `?page=` dincolo de numărul de rânduri face PostgREST să răspundă 416, iar
 * `postgrest-js` citește `count` DOAR pe răspunsul bun, deci pierde chiar
 * numărul din `Content-Range`. `fereastraPaginii` strânge pagina cerută la câte
 * există cu adevărat, înainte de `range`.
 */
const PE_PAGINA = 25;

const CUVINTELE_CERERILOR = {
  niciunul: "Nicio cerere", unul: "cerere", putine: "cereri", multe: "de cereri",
};

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: business }, sp] = await Promise.all([
    supabase
      .from("businesses").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).single(),
    searchParams,
  ]);
  if (!business) redirect("/dashboard");

  const { count } = await supabase
    .from("return_requests")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id);

  const cateSunt = count ?? 0;
  const { pagina, pagini, deLa, panaLa } = fereastraPaginii(pageParam(sp.page), cateSunt, PE_PAGINA);

  const { data: rows } = await supabase
    .from("return_requests")
    .select("id, order_number, customer_name, customer_email, customer_phone, items, reason, refund_method, refund_iban, status, is_read, created_at")
    .eq("business_id", business.id)
    /* ⚠ `id` ca departajator: două cereri sosite în aceeași milisecundă s-ar fi
       putut așeza altfel de la o pagină la alta, deci un rând ar fi apărut de
       două ori și altul deloc. */
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(deLa, panaLa);

  const list = (rows ?? []).map((r) => ({
    id: r.id,
    orderNumber: r.order_number,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    items: (Array.isArray(r.items) ? r.items : []) as unknown as ReturnItem[],
    reason: r.reason,
    refundMethod: r.refund_method,
    refundIban: r.refund_iban,
    status: r.status,
    isRead: r.is_read,
    createdAt: r.created_at,
  }));

  return (
    <ReturnsClient
      returns={list}
      pagina={pagina}
      pagini={pagini}
      rezumat={rezumatulPaginii(cateSunt, pagina, PE_PAGINA, CUVINTELE_CERERILOR)}
    />
  );
}
