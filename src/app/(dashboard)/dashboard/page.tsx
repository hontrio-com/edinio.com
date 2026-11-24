import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { ShoppingCart, Wallet, Receipt, Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { acumCatTimp, formatPrice } from "@/lib/utils/format";
import { StocScazutRand } from "@/components/dashboard/StocScazutRand";
import { PRAG_STOC_SCAZUT } from "@/lib/stoc-prag";
import { orderStatus } from "@/lib/orders/status";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { deriveOrigin } from "@/lib/orders/origin";
import { SiteStatusBar } from "@/components/dashboard/SiteStatusBar";
import { PanouVanzari } from "@/components/dashboard/PanouVanzari";
import { citesteDateVanzari, crestere, intervalScris } from "@/lib/vanzari";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { marimeaRandului } from "@/lib/dashboard/cifra-pe-un-rand";
import {
  citesteDateCarduri, cresterePosibila, rataConversie, valoareMedie, zileScurt,
} from "@/lib/panou-carduri";
import { ActivationChecklist, type ChecklistStep } from "@/components/dashboard/ActivationChecklist";
import { AjutorConfigurare } from "@/components/dashboard/AjutorConfigurare";
import { COOKIE_AJUTOR_ASCUNS, esteContNou } from "@/lib/dashboard/ajutor-configurare";
import { CALE_AUTORIZARE, cerereInAsteptare } from "@/lib/hontrio/in-asteptare";

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  /*
   * Cererea de conectare venita de la Hontrio, cand omul a trebuit intai sa se logheze: logarea se
   * termina mereu aici, fara adresa de intoarcere. Vezi `cerereInAsteptare`.
   */
  if (await cerereInAsteptare()) redirect(CALE_AUTORIZARE);

  // `custom_domain_healthy` intra in select fiindca bara de stare nu are voie sa
  // dea verde pe un domeniu dovedit mort. `null` inseamna doar „neverificat".
  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, custom_domain_healthy, business_name, is_published, logo_url")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!business) redirect("/onboarding/details");

  // Adresa de platforma ramane calculata separat: e ce oferim cand domeniul
  // propriu nu raspunde, si acolo magazinul chiar se deschide.
  // Rezerva nu e cosmetica: pe calea de avarie asta devine linkul ANCORAT si
  // COPIAT de comerciant, deci un `undefined` s-ar duce la clienti prin clipboard.
  const platformUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.com"}/${business.slug}`;
  const publicUrl = business.custom_domain
    ? `https://${business.custom_domain}`
    : platformUrl;

  // Oferta de ajutor la configurare: doar conturilor noi, pana o inchid.
  const arataAjutor = esteContNou(user.created_at)
    && (await cookies()).get(COOKIE_AJUTOR_ASCUNS)?.value !== "1";

  /*
   * Bara de stare pleaca IMEDIAT; cifrele curg dupa ea.
   *
   * Panoul facea noua interogari inainte sa trimita ceva catre browser, iar
   * `loading.tsx` tinea toata pagina gri pana se termina si cea mai lenta. Dar
   * lucrul cel mai cerut de aici — daca magazinul e publicat si adresa lui — se
   * stie dupa PRIMA interogare.
   *
   * Asa, comerciantul vede bara de stare si isi poate deschide magazinul cat
   * timp statisticile inca se aduna.
   */
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <SiteStatusBar
        isPublished={business.is_published}
        businessId={business.id}
        publicUrl={publicUrl}
        platformUrl={platformUrl}
        customDomain={business.custom_domain}
        domainHealthy={business.custom_domain_healthy}
      />
      <Suspense fallback={<ScheletPanou />}>
        <ContinutPanou business={business} publicUrl={publicUrl} arataAjutor={arataAjutor} />
      </Suspense>
    </div>
  );
}

function ScheletPanou() {
  return (
    <div className="mt-6 space-y-6">
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

type BusinessPanou = {
  id: string; slug: string; custom_domain: string | null;
  business_name: string; is_published: boolean; logo_url: string | null;
};

async function ContinutPanou({
  business, publicUrl, arataAjutor,
}: { business: BusinessPanou; publicUrl: string; arataAjutor: boolean }) {
  const supabase = await createClient();

  /*
    ⚠ MARGINILE ZILELOR NU SE MAI CALCULEAZA AICI, ci in `panou_carduri`.

    Erau scrise `new Date(...).toISOString().split("T")[0]`, si asta a costat o
    luna intreaga de cifre gresite: `new Date(an, luna, 1)` inseamna miezul
    noptii LOCAL, care in Romania e ziua precedenta la 21:00 UTC, deci
    `toISOString()` da ULTIMA ZI A LUNII TRECUTE. Masurat pe baza demo:
    „Vanzari luna aceasta" arata 29.190,41 lei in loc de 28.215,56, fiindca
    inghitea si cele trei comenzi din 31 august (974,85 lei).

    Acum ziua e cea romaneasca si se taie in SQL, o singura data, pentru toate
    cele patru carduri.
  */
  const [
    { data: carduriRpc },
    { data: recentOrders },
    { data: vanzariRpc },
    { data: canaleVanzare },
    { data: numaratoareStoc },
    { count: productsTotal },
    { count: ordersTotal },
  ] = await Promise.all([
    /*
      Cele patru carduri din cap, dintr-o singura cerere: comenzi azi, vanzari
      luna aceasta, valoare medie comanda, rata de conversie, fiecare cu
      perioada dinainte.

      ⚠ Impreuna, fiindca doua dintre ele sunt impartiri intre celelalte (media
      = vanzari / comenzi, conversia = comenzi / vizite). Aduse din interogari
      separate, cifrele puteau fi ale unor ferestre usor diferite, iar
      impartirile ar fi iesit gresite fara sa dea nimeni eroare.

      ⚠ Sumele se fac in SQL, nu din randuri aduse in JS: PostgREST trunchiaza
      orice raspuns la 1000 de randuri, deci un `reduce` ar subestima veniturile
      la magazinele cu volum.
    */
    supabase.rpc("panou_carduri", { p_business: business.id }),
    supabase.from("orders").select("id, order_number, customer_name, total, status, created_at, order_source")
      .eq("business_id", business.id).order("created_at", { ascending: false }).limit(5),
    /*
      Prima fereastra a graficului de vanzari (ultimele 7 zile, toate canalele),
      adusa de pe server ca panoul sa nu porneasca gol. Restul perioadelor le
      cere componenta, din browser.

      ⚠ Ziua e cea ROMANEASCA, taiata in SQL. Graficul de pana acum folosea
      `orders_daily_revenue`, care grupeaza pe ziua UTC: vara, o comanda de la
      01:30 se vedea in ziua precedenta.
    */
    supabase.rpc("vanzari_panou", { p_business: business.id, p_fel: "7z" }),
    supabase.rpc("canale_vanzare", { p_business: business.id }),
    /*
      Cate produse sunt sub prag si cate s-au oprit din vanzare. Numaratoarea se
      face IN BAZA, fiindca trebuie sa se uite si in variante: un produs cu 17
      bucati in total poate avea o varianta pe zero (vezi `produse_sub_prag`).
      Un filtru pe `stock_quantity` ar fi sarit exact peste acelea.
    */
    supabase.rpc("numar_produse_sub_prag", { p_business: business.id, p_prag: PRAG_STOC_SCAZUT }),
    // ── Semnale pentru checklist-ul de activare ──
    supabase.from("products").select("*", { count: "exact", head: true })
      .eq("business_id", business.id),
    supabase.from("orders").select("*", { count: "exact", head: true })
      .eq("business_id", business.id),
    /*
      ⚠ Aici se mai citea planul contului (`users_profile`), doar pentru indemnul de
      plan din `ActivationChecklist`. Indemnul a iesit pe 24.11.2026, deci si citirea:
      un drum mai putin catre baza la fiecare deschidere a panoului.
    */
  ]);

  const fmt = (n: number) => new Intl.NumberFormat("ro-RO").format(n);
  const fmtDelta = (pct: number) =>
    `${Math.abs(pct).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`;

  /*
    Daca functia nu raspunde, cardurile arata zerouri in loc sa cada pagina.
    Fereastra ramane goala, deci nu exista nici crestere de aratat.
  */
  const carduri = citesteDateCarduri(carduriRpc) ?? {
    azi: { comenzi: 0 },
    ieri_pana_acum: { comenzi: 0, ora: "" },
    luna: { vanzari: 0, comenzi: 0, vizite: 0, de_la: "", pana_la: "" },
    luna_trecuta: { vanzari: 0, comenzi: 0, vizite: 0, de_la: "", pana_la: "" },
  };

  const medieLuna = valoareMedie(carduri.luna);
  const medieLunaTrecuta = valoareMedie(carduri.luna_trecuta);
  const conversieLuna = rataConversie(carduri.luna);
  const conversieLunaTrecuta = rataConversie(carduri.luna_trecuta);

  const pctComenziAzi = crestere(carduri.azi.comenzi, carduri.ieri_pana_acum.comenzi);
  const pctVanzari = crestere(carduri.luna.vanzari, carduri.luna_trecuta.vanzari);
  const pctMedie = cresterePosibila(medieLuna, medieLunaTrecuta);
  const pctConversie = cresterePosibila(conversieLuna, conversieLunaTrecuta);

  /* Aceleasi zile din luna trecuta: scurt sub cifra, intreg in explicatie. */
  const zileleLuniiTrecute = intervalScris({
    de_la: carduri.luna_trecuta.de_la,
    pana_la: carduri.luna_trecuta.pana_la,
  });
  const subCifra = `vs. ${zileScurt(carduri.luna_trecuta.de_la, carduri.luna_trecuta.pana_la)}`;

  const dateVanzari = citesteDateVanzari(vanzariRpc);

  // ── Checklist de activare: semnale calculate server-side ──
  // Pasul "customize" e bifat de logo (semnal server) SAU de vizitarea paginii de
  // editare, marcata client-side in ActivationChecklist (vezi customizeVisitedKey).
  const activationSteps: ChecklistStep[] = [
    { id: "product", title: "Adauga primul produs", description: "Fara produse, clientii nu au ce cumpara.", done: (productsTotal ?? 0) > 0, href: "/dashboard/products/new", cta: "Adauga" },
    { id: "customize", title: "Personalizeaza magazinul", description: "Adauga logo-ul si culorile magazinului tau.", done: !!business.logo_url, href: "/dashboard/editor", cta: "Personalizeaza" },
    { id: "publish", title: "Publica magazinul", description: "Fa magazinul vizibil pentru clientii tai.", done: business.is_published, href: "/dashboard/editor", cta: "Publica" },
    { id: "order", title: "Primeste prima comanda", description: "Distribuie link-ul pe WhatsApp si retele sociale.", done: (ordersTotal ?? 0) > 0, share: true, cta: "Distribuie" },
  ];

  const marimeCifre = marimeaRandului([
    fmt(carduri.azi.comenzi),
    { valoare: fmt(carduri.luna.vanzari), unitate: "lei" },
    medieLuna === null ? "-" : { valoare: fmt(Math.round(medieLuna * 100) / 100), unitate: "lei" },
    conversieLuna === null ? "-" : { valoare: conversieLuna.toLocaleString("ro-RO", { maximumFractionDigits: 1 }), unitate: "%" },
  ]);

  return (
    <>

      <ActivationChecklist
        steps={activationSteps}
        publicUrl={publicUrl}
      />

      {arataAjutor && <AjutorConfigurare />}

      <StocScazutRand
        businessId={business.id}
        epuizate={numaratoareStoc?.[0]?.epuizate ?? 0}
        subPrag={numaratoareStoc?.[0]?.sub_prag ?? 0}
      />

      {/*
        Stat cards

        ⚠⚠ O SINGURA MARIME PENTRU TOT RANDUL, data de cea mai lunga cifra.
        Lasata pe seama fiecarui card, „1.234.567 lei" ar fi scazut singur langa
        „12" ramas urias, si cele patru cutii n-ar mai fi aratat ca un set.
        Cerut de el pe 21.09.2026. ⚠ Unitatile intra si ele: se scriu langa cifra.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4">
        <CardStatistica marime={marimeCifre}
          label="Comenzi azi"
          value={fmt(carduri.azi.comenzi)}
          delta={pctComenziAzi !== null ? fmtDelta(pctComenziAzi) : undefined}
          deltaDir={pctComenziAzi !== null && pctComenziAzi >= 0 ? "up" : "down"}
          deltaCaption={`vs. ieri, ${carduri.ieri_pana_acum.ora}`}
          href="/dashboard/orders"
          icon={ShoppingCart}
          empty={carduri.azi.comenzi === 0}
        />
        <CardStatistica marime={marimeCifre}
          label="Vanzari luna aceasta"
          value={fmt(carduri.luna.vanzari)}
          unit="lei"
          delta={pctVanzari !== null ? fmtDelta(pctVanzari) : undefined}
          deltaDir={pctVanzari !== null && pctVanzari >= 0 ? "up" : "down"}
          deltaCaption={subCifra}
          href="/dashboard/orders"
          icon={Wallet}
          empty={carduri.luna.vanzari === 0}
        />
        <CardStatistica marime={marimeCifre}
          label="Valoare medie comanda"
          value={medieLuna === null ? "-" : fmt(Math.round(medieLuna * 100) / 100)}
          unit={medieLuna === null ? undefined : "lei"}
          delta={pctMedie !== null ? fmtDelta(pctMedie) : undefined}
          deltaDir={pctMedie !== null && pctMedie >= 0 ? "up" : "down"}
          deltaCaption={subCifra}
          href="/dashboard/orders"
          icon={Receipt}
          empty={medieLuna === null}
        />
        <CardStatistica marime={marimeCifre}
          label="Rata de conversie"
          value={conversieLuna === null ? "-" : conversieLuna.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}
          unit={conversieLuna === null ? undefined : "%"}
          delta={pctConversie !== null ? fmtDelta(pctConversie) : undefined}
          deltaDir={pctConversie !== null && pctConversie >= 0 ? "up" : "down"}
          deltaCaption={subCifra}
          href="/dashboard/analytics"
          icon={Target}
          empty={conversieLuna === null}
          explicatie={
            ["Comenzi / Vizite x 100",
             `${fmt(carduri.luna.comenzi)} / ${fmt(carduri.luna.vizite)} x 100 = `
               + `${conversieLuna === null ? "-" : conversieLuna.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`,
             "",
            ].join("\n")
            + "Luna aceasta, de pe 1 pana azi. O vizita e o deschidere a paginii magazinului, nu un om: "
            + "acelasi client care revine de trei ori inseamna trei vizite. "
            + `Procentul de dedesubt compara cu aceleasi zile din luna trecuta (${zileleLuniiTrecute}).`
          }
        />
      </div>

      {/* Chart + recent orders */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graficul de vanzari: perioade, canale, comparatie (vezi PanouVanzari) */}
        {dateVanzari ? (
          <PanouVanzari
            businessId={business.id}
            initial={dateVanzari}
            canale={(canaleVanzare ?? []).map((c) => ({ canal: c.canal, comenzi: Number(c.comenzi) }))}
          />
        ) : (
          /* Functia din baza n-a raspuns. Panoul nu cade pentru atat: locul
             graficului ramane, cu un rand care spune ce s-a intamplat. */
          <div className="lg:col-span-2 flex items-center justify-center rounded-xl bg-card px-5 py-16 text-sm text-muted-foreground ring-1 ring-foreground/10">
            Graficul de vanzari nu a putut fi incarcat.
          </div>
        )}

        {/* Recent orders */}
        <div className="bg-card ring-1 ring-foreground/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Comenzi recente</h2>
            <Link href="/dashboard/orders" className="text-xs text-primary hover:underline font-medium">
              Vezi toate
            </Link>
          </div>
          {(recentOrders ?? []).length > 0 ? (
            <div className="divide-y divide-border">
              {(recentOrders ?? []).map(order => {
                const status = orderStatus(order.status);
                return (
                  <Link
                    key={order.id}
                    href={`/dashboard/orders/${order.id}`}
                    className="flex items-start justify-between gap-3 px-5 py-3 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-medium text-foreground">{order.order_number}</div>
                      <div className="truncate text-xs text-muted-foreground">{order.customer_name}</div>
                      {/*
                        Cand a venit si de unde. `deriveOrigin` citeste
                        `order_source`: pentru marketplace da numele lor, pentru
                        magazinul propriu da sursa vizitei (Google, Facebook,
                        Direct). Comenzile vechi, fara `order_source`, dau
                        „Magazin online", deci randul nu ramane niciodata gol.
                      */}
                      <div className="mt-1 truncate text-[11px] text-muted-foreground/80">
                        {acumCatTimp(order.created_at)} · {deriveOrigin(order.order_source).label}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                      <span className="text-sm font-semibold text-foreground">{formatPrice(Number(order.total))}</span>
                      <EtichetaStare ton={status.ton} marime="mic">{status.label}</EtichetaStare>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <ShoppingCart className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Nu exista comenzi inca</p>
            </div>
          )}
        </div>
      </div>

      {/*
        ⚠ AICI A FOST SECTIUNEA „Noutăți”, scoasa pe 24.11.2026 la cererea proprietarului
        („Scoate sectiunea aia cu noutati”): ultimele cinci anunturi publicate din
        administrare si, in capul ei, legatura „Ce e nou în editor”.

        Ce urmeaza din asta, ca sa nu para scapari:
        - anunturile publicate din `/admin/noutati` nu se mai vad nicaieri in panoul
          comerciantului. Pagina de administrare a ramas;
        - turul actualizarii nu mai are legatura in panou. Fereastra lui se deschide
          in continuare singura, o data, conturilor de dinainte de lansare, si la
          adresa `/dashboard?tur=actualizare` (vezi `TurActualizare`).
      */}
    </>
  );
}
