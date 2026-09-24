import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { CustomersClient } from "@/components/dashboard/CustomersClient";
import { Skeleton } from "@/components/ui/skeleton";
import { CUSTOMERS_PAGE_SIZE, escapeLike, firstParam, pageParam } from "@/lib/orders/pagination";
import type { Customer, CustomersSummary } from "@/lib/customers";
import { PERIOADE, fereastra, type NumePerioada } from "@/lib/perioade";
import { segmentValid, treaptaValoare, type Segment } from "@/lib/customers/filtre";
import { FilelePaginii, filaValida } from "@/components/dashboard/clienti/FilelePaginii";
import { FilaSegmente } from "@/components/dashboard/clienti/FilaSegmente";
import { FilaImporturi } from "@/components/dashboard/clienti/FilaImporturi";
import { FilaConturi } from "@/components/dashboard/clienti/conturi/FilaConturi";
import { conturileClientilor } from "@/lib/cont/panou";
import { CAUTARE_MAXIMA, ordineValida, stareValida } from "@/lib/cont/panou-texte";
import { logError } from "@/lib/error-logger";

const SORT_KEYS = new Set(["recent", "spent", "orders", "name"]);

/**
 * Cadrul pleaca imediat; clientii curg dupa el.
 *
 * `customers_aggregate` si `customers_summary` parcurg TOT istoricul de comenzi
 * ca sa scoata o pagina de clienti — la magazinele cu vechime sunt cele mai
 * lente doua apeluri din panou. Ce e ieftin (utilizatorul si magazinul lui) se
 * afla insa dintr-o singura interogare, deci sub `<Suspense>` intra doar
 * rezultatul agregarii.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  /*
    ⚠ FILA SE CITESTE INAINTE DE ORICE ALTCEVA, fiindca ea hotaraste CE se aduce.
    Adusa lista de clienti si pentru „Importuri”, fiecare deschidere a filei
    aceleia ar fi parcurs tot istoricul de comenzi ca sa nu arate nimic din el.
  */
  const fila = filaValida(firstParam(sp.fila));
  const q = (firstParam(sp.q) ?? "").trim().slice(0, 80);
  const sortRaw = firstParam(sp.sort) ?? "recent";
  const sort = SORT_KEYS.has(sortRaw) ? sortRaw : "recent";
  const page = pageParam(sp.page);
  /*
    ⚠ PERIOADA IMPLICITA E „TOT ISTORICUL”, spre deosebire de Statistici si de
    Cosuri, unde e o fereastra scurta. Aici cifrele sunt despre RELATIA cu oamenii,
    iar relatiile se vad pe rastimpuri lungi: masurat pe demo, „clienti recurenti”
    pe 30 de zile da 2, iar pe tot istoricul da 22. Pornita pe 30 de zile, pagina ar
    fi aratat ca un magazin fara clienti care revin.
  */
  const perioadaRaw = firstParam(sp.perioada) ?? "tot";
  const perioada: NumePerioada = (PERIOADE as string[]).includes(perioadaRaw)
    ? (perioadaRaw as NumePerioada)
    : "tot";

  /*
    ⚠ SEGMENTUL SI TREAPTA DE VALOARE VIN DIN ADRESA, ca si cautarea si sortarea:
    un filtru pus se poate trimite prin legatura, iar „inapoi” din browser se
    intoarce la ce vedeai. Tinute doar in stare, s-ar fi pierdut la fiecare
    reincarcare si la fiecare deschidere de fisa.
  */
  const segment: Segment = segmentValid(firstParam(sp.segment));
  /*
    ⚠ JUDETUL SI CANALUL NU SE VALIDEAZA AICI dintr-o lista scrisa in cod: lista
    lor e chiar ce exista in magazin, si se cere de la baza (`customer_filter_options`).
    O valoare care nu se potriveste cu nimic da o lista goala — raspuns adevarat,
    si acelasi pe care il da un judet in care chiar n-ai niciun client.
  */
  const judet = (firstParam(sp.judet) ?? "").trim().slice(0, 80) || null;
  const canal = (firstParam(sp.canal) ?? "").trim().slice(0, 40) || null;
  /*
    ⚠ Un segment cu LISTA FIXA se deschide prin id-ul lui, nu prin criterii: el
    n-are criterii, are oameni. Cheile se afla pe server, mai jos.
  */
  const segmentId = (firstParam(sp.segment_id) ?? "").trim().slice(0, 40) || null;
  /*
    ⚠ „Numai clientii cu cont in magazin” (24.09.2026). E un criteriu ca oricare
    altul: intra si in segmentele salvate (`CriteriiSegment.cont`), altfel un
    segment salvat cu el ar fi pastrat numai jumatate din filtru.
  */
  const doarCuCont = firstParam(sp.cont) === "da";

  const { data: bizRow } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();

  if (!bizRow) redirect("/dashboard");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/*
        ⚠ ANTETUL SI FILELE SUNT ALE PAGINII, nu ale listei: raman pe loc la
        trecerea dintr-o fila in alta, si pleaca odata cu cadrul, inaintea
        oricarei agregari. Puse inauntrul listei, ar fi aparut abia dupa ce
        Postgres termina de numarat, iar trecerea intre file ar fi clipit.
      */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-foreground">Clienți</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Gestionează cumpărătorii, istoricul comenzilor și segmentele magazinului.
        </p>
      </div>

      <FilelePaginii activa={fila} />

      {fila === "segmente" && (
        <Suspense fallback={<ScheletFila />}>
          <FilaSegmente businessId={bizRow.id} />
        </Suspense>
      )}

      {fila === "importuri" && (
        <Suspense fallback={<ScheletFila />}>
          <FilaImporturi businessId={bizRow.id} />
        </Suspense>
      )}

      {fila === "conturi" && (
        <Suspense fallback={<ScheletFila />}>
          <FilaConturi businessId={bizRow.id} q={q.slice(0, CAUTARE_MAXIMA)} pagina={page}
            stare={stareValida(firstParam(sp.stare))} ordine={ordineValida(firstParam(sp.ordine))} />
        </Suspense>
      )}

      {fila === "clienti" && (
        <Suspense fallback={<ScheletClienti />}>
          <ListaClienti businessId={bizRow.id} q={q} sort={sort} page={page} perioada={perioada}
            segment={segment} valoare={firstParam(sp.valoare) ?? null}
            judet={judet} canal={canal} segmentId={segmentId} doarCuCont={doarCuCont} />
        </Suspense>
      )}
    </div>
  );
}

function ScheletFila() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}

function ScheletClienti() {
  return (
    <>
      {/* cele patru casete de sumar, apoi cautarea, apoi tabelul */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-xl mb-4" />
      <div className="space-y-px">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-none" />
        ))}
      </div>
    </>
  );
}

async function ListaClienti({
  businessId,
  q,
  sort,
  page,
  perioada,
  segment,
  valoare,
  judet,
  canal,
  segmentId,
  doarCuCont,
}: {
  businessId: string;
  q: string;
  sort: string;
  page: number;
  perioada: NumePerioada;
  segment: Segment;
  valoare: string | null;
  judet: string | null;
  canal: string | null;
  segmentId: string | null;
  doarCuCont: boolean;
}) {
  const supabase = await createClient();

  /*
    ⚠⚠ CHEILE UNUI SEGMENT CU LISTA SE CITESC INAINTE de agregare, si RLS le
    margineste la magazinul celui logat (politica trece prin segment, apoi prin
    `businesses`). Un id ghicit al altui magazin intoarce zero randuri.

    ⚠ `null` inseamna „fara filtru pe chei"; `[]` inseamna „niciun om". Cele doua
    NU se pot confunda: un segment sters intre timp trebuie sa dea lista goala,
    nu tot magazinul sub numele lui.
  */
  let chei: string[] | null = null;
  let segmentLipsa = false;
  if (segmentId) {
    const { data: membri } = await supabase
      .from("customer_segment_members")
      .select("cheie")
      .eq("segment_id", segmentId);
    chei = (membri ?? []).map((m) => m.cheie);
    segmentLipsa = chei.length === 0;
  }
  /*
    ⚠⚠ „Cu cont” se aplica prin ACEEASI usa ca segmentul cu lista (`p_chei`), deci
    filtrarea, numaratoarea si paginarea raman ale bazei. Cu un segment deschis,
    cele doua liste se INTERSECTEAZA: altfel unul l-ar fi inlocuit pe celalalt.
    ⚠ O eroare aici NU se inghite: o lista nefiltrata sub „cu cont” ar minti.
  */
  if (doarCuCont) {
    const cuCont = new Set((await conturileClientilor(businessId, null)).keys());
    chei = chei === null ? [...cuCont] : chei.filter((k) => cuCont.has(k));
  }
  const f = fereastra(perioada);
  const treapta = treaptaValoare(valoare);

  // Clientii sunt agregati, cautati si paginati in Postgres (functiile
  // customers_aggregate / customers_summary, sub RLS) — corect la orice numar
  // de comenzi; pagina primeste doar cei CUSTOMERS_PAGE_SIZE clienti afisati.
  const [{ data: custRows }, { data: summaryRows }, { data: optiuniRows }, { data: cateConturi }] = await Promise.all([
    supabase.rpc("customers_aggregate", {
      bid: businessId,
      search: q ? escapeLike(q) : undefined,
      sort_key: sort,
      page_limit: CUSTOMERS_PAGE_SIZE,
      page_offset: (page - 1) * CUSTOMERS_PAGE_SIZE,
      /*
        ⚠ FILTRAREA SE FACE IN BAZA, nu peste pagina adusa: `total_count` si
        paginarea trebuie sa fie ale multimii FILTRATE. Filtrat in JavaScript,
        comerciantul ar fi vazut „50 de clienti” dintr-un magazin cu trei sute, iar
        paginile de dupa ar fi fost goale.
      */
      p_segment: segment,
      p_valoare_min: treapta?.min ?? undefined,
      p_valoare_max: treapta?.max ?? undefined,
      p_judet: judet ?? undefined,
      p_canal: canal ?? undefined,
      p_chei: chei ?? undefined,
    }),
    /*
      ⚠ LISTA RAMANE PE TOT ISTORICUL, numai sumarul se taie pe perioada — cum a
      cerut el. Un client care n-a comandat luna asta nu dispare din lista: e tot
      clientul magazinului, iar o lista care se goleste la schimbarea perioadei ar
      parea stricata.
    */
    supabase.rpc("customers_summary", {
      bid: businessId,
      p_de_la: f.nume === "tot" ? undefined : f.deLa.toISOString(),
      p_pana: f.nume === "tot" ? undefined : f.panaLa.toISOString(),
    }),
    /*
      ⚠ MENIURILE SE FAC DIN DATE. Judetele tarii scrise in cod ar fi dat unui
      magazin care livreaza in douasprezece inca treizeci de optiuni care nu
      gasesc pe nimeni. A treia interogare merge in PARALEL cu celelalte doua,
      deci nu adauga nimic la asteptare.
    */
    supabase.rpc("customer_filter_options", { bid: businessId }),
    /* Cate conturi are magazinul: numai ca sa se stie daca filtrul „cu cont” are rost. */
    createAdminClient().rpc("cont_cate_conturi", { p_business: businessId }),
  ]);

  const optiuni = optiuniRows ?? [];
  const judete = optiuni.filter((o) => o.fel === "judet")
    .map((o) => ({ valoare: o.valoare, cati: Number(o.cati) }));
  const canale = optiuni.filter((o) => o.fel === "canal")
    .map((o) => ({ valoare: o.valoare, cati: Number(o.cati) }));

  const customers: Customer[] = (custRows ?? []).map((r) => ({
    key: r.key,
    name: r.name,
    phone: r.phone,
    email: r.email ?? null,
    city: r.city ?? null,
    county: r.county ?? null,
    address: r.address ?? null,
    orderCount: Number(r.order_count),
    validOrderCount: Number(r.valid_order_count),
    cancelledCount: Number(r.cancelled_count),
    refundedCount: Number(r.refunded_count),
    ordersValue: Number(r.orders_value),
    collectedTotal: Number(r.collected_total),
    aov: Number(r.aov),
    firstOrderAt: r.first_order_at,
    lastOrderAt: r.last_order_at,
    lastStatus: r.last_status,
    source: r.source ?? null,
    canal: r.canal ?? null,
  }));
  const totalCount = custRows?.length ? Number(custRows[0].total_count) : 0;

  /*
    Care clienti de pe pagina au cont in magazin (eticheta „Cont” si legatura din
    fisa). ⚠ Aici o eroare se inghite, cu jurnal: fara eticheta, lista ramane
    adevarata; cu pagina cazuta, comerciantul n-ar mai vedea niciun client.
  */
  let conturi: Record<string, string> = {};
  const areConturi = typeof cateConturi === "number" && cateConturi > 0;
  try {
    /* Fara niciun cont in magazin nu e nimic de cautat: cererea nu mai pleaca. */
    if (areConturi) conturi = Object.fromEntries(await conturileClientilor(businessId, customers.map((c) => c.key)));
  } catch (e) {
    await logError({
      action: "clienti/conturi",
      message: `eticheta „are cont” nu s-a putut citi: ${e instanceof Error ? e.message : String(e)}`,
      businessId,
      severity: "warning",
    });
  }

  const s = summaryRows?.[0];
  const summary: CustomersSummary = {
    totalContacts: Number(s?.total_contacts ?? 0),
    buyers: Number(s?.buyers ?? 0),
    importedContacts: Number(s?.imported_contacts ?? 0),
    returningCustomers: Number(s?.returning_customers ?? 0),
    returnRate: Number(s?.return_rate ?? 0),
    ordersValue: Number(s?.orders_value ?? 0),
    collectedTotal: Number(s?.collected_total ?? 0),
    valuePerCustomer: Number(s?.value_per_customer ?? 0),
  };

  return (
    <CustomersClient
      customers={customers}
      summary={summary}
      totalCount={totalCount}
      page={page}
      searchQuery={q}
      sort={sort}
      perioada={perioada}
      segment={segment}
      valoare={valoare}
      judet={judet}
      canal={canal}
      segmentId={segmentId}
      segmentLipsa={segmentLipsa}
      doarCuCont={doarCuCont}
      conturi={conturi}
      areConturi={areConturi}
      judete={judete}
      canale={canale}
      businessId={businessId}
    />
  );
}
