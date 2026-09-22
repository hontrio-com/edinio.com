import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { MessagesClient } from "@/components/pages/MessagesClient";
import { pageParam } from "@/lib/orders/pagination";
import { fereastraPaginii } from "@/lib/paginare";
import { rezumatulPaginii } from "@/lib/dashboard/paginare";

interface SubField { label: string; value: string }

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PAGINĂ DE MESAJE, NU PRIMELE TREI SUTE                      (23.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ CE ERA. `.limit(300)`, fără `count` și fără nicio răsfoire: cele mai noi
 * trei sute de completări, desenate toate deodată, și niciun semn că ar exista
 * a trei sute una. Un mesaj mai vechi nu se putea ajunge în niciun fel.
 *
 * ⚠ CUTIA ASTA E SINGURA CU O INTRARE PUBLICĂ. Rândurile nu le scrie
 * comerciantul, le scriu vizitatorii lui, deci lista crește cu traficul, nu cu
 * munca din panou, iar roboții de formulare o umflă cel mai repede dintre toate
 * listele panoului. Trei sute e o seară, nu un an.
 *
 * ⚠ SE NUMĂRĂ ÎNTÂI, ȘI ABIA APOI SE CERE PAGINA: un `?page=` dincolo de
 * numărul de rânduri face PostgREST să răspundă 416, iar `count` se pierde cu
 * totul. Vezi `fereastraPaginii`.
 */
const PE_PAGINA = 25;

const CUVINTELE_MESAJELOR = {
  niciunul: "Niciun mesaj", unul: "mesaj", putine: "mesaje", multe: "de mesaje",
};

export default async function PageMessagesPage({
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
    .from("page_form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id);

  const cateSunt = count ?? 0;
  const { pagina, pagini, deLa, panaLa } = fereastraPaginii(pageParam(sp.page), cateSunt, PE_PAGINA);

  const { data: subs } = await supabase
    .from("page_form_submissions")
    .select("id, data, created_at, is_read")
    .eq("business_id", business.id)
    /* ⚠ `id` ca departajator: două completări din aceeași milisecundă (un robot
       trimite exact așa) s-ar fi putut așeza altfel de la o pagină la alta, deci
       un mesaj ar fi apărut de două ori și altul deloc. */
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(deLa, panaLa);

  const list = (subs ?? []).map((s) => ({
    id: s.id,
    createdAt: s.created_at,
    isRead: s.is_read,
    fields: (((s.data as { fields?: SubField[] } | null)?.fields) ?? []) as SubField[],
  }));

  return (
    <MessagesClient
      submissions={list}
      pagina={pagina}
      pagini={pagini}
      rezumat={rezumatulPaginii(cateSunt, pagina, PE_PAGINA, CUVINTELE_MESAJELOR)}
    />
  );
}
