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

  /* Filtrul „Necitite” (26.09.2026, auditul paginilor), in adresa, ca pagina. */
  const doarNecitite = sp.doar === "necitite";
  const [{ count }, { count: necitite }] = await Promise.all([
    (() => {
      let q = supabase.from("page_form_submissions").select("id", { count: "exact", head: true }).eq("business_id", business.id);
      if (doarNecitite) q = q.eq("is_read", false);
      return q;
    })(),
    supabase.from("page_form_submissions").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("is_read", false),
  ]);

  const cateSunt = count ?? 0;
  const { pagina, pagini, deLa, panaLa } = fereastraPaginii(pageParam(sp.page), cateSunt, PE_PAGINA);

  let cerere = supabase
    .from("page_form_submissions")
    .select("id, data, created_at, is_read, form_id, page_id")
    .eq("business_id", business.id);
  if (doarNecitite) cerere = cerere.eq("is_read", false);
  const { data: subs } = await cerere
    /* ⚠ `id` ca departajator: două completări din aceeași milisecundă (un robot
       trimite exact așa) s-ar fi putut așeza altfel de la o pagină la alta, deci
       un mesaj ar fi apărut de două ori și altul deloc. */
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(deLa, panaLa);

  /*
   * DE UNDE A VENIT fiecare mesaj: formularul, pagina sau newsletterul. Doua citiri
   * mici, numai pentru randurile paginii curente.
   */
  const idForme = [...new Set((subs ?? []).map((s) => s.form_id).filter((x): x is string => !!x))];
  const idPagini = [...new Set((subs ?? []).map((s) => s.page_id).filter((x): x is string => !!x))];
  const [{ data: forme }, { data: paginiSursa }] = await Promise.all([
    idForme.length ? supabase.from("forms").select("id, name").eq("business_id", business.id).in("id", idForme) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    idPagini.length ? supabase.from("custom_pages").select("id, title").eq("business_id", business.id).in("id", idPagini) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const numeForma = new Map((forme ?? []).map((f) => [f.id, f.name]));
  const titluPagina = new Map((paginiSursa ?? []).map((p) => [p.id, p.title]));
  // Data scrisa pe server, la ora Romaniei: in browser, `toLocaleString` fara fus dadea alt text decat serverul.
  const laOra = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const list = (subs ?? []).map((s) => {
    const d = s.data as { fields?: SubField[]; newsletter?: boolean } | null;
    const pagina = s.page_id ? titluPagina.get(s.page_id) : undefined;
    const sursa = d?.newsletter ? `Newsletter${pagina ? ` · ${pagina}` : ""}`
      : [s.form_id ? numeForma.get(s.form_id) ?? "Formular șters" : "Formular de contact", pagina].filter(Boolean).join(" · ");
    return {
      id: s.id,
      cand: laOra.format(new Date(s.created_at)),
      isRead: s.is_read,
      sursa,
      fields: (d?.fields ?? []) as SubField[],
    };
  });

  return (
    <MessagesClient
      submissions={list}
      doarNecitite={doarNecitite}
      necitite={necitite ?? 0}
      pagina={pagina}
      pagini={pagini}
      rezumat={rezumatulPaginii(cateSunt, pagina, PE_PAGINA, CUVINTELE_MESAJELOR)}
    />
  );
}
