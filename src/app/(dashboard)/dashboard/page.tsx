import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import {
  ShoppingCart, Wallet, Receipt, Target,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getLatestAnnouncements } from "@/lib/actions/announcement.actions";
import { acumCatTimp, formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { StocScazutRand } from "@/components/dashboard/StocScazutRand";
import { PRAG_STOC_SCAZUT } from "@/lib/stoc-prag";
import { orderStatus } from "@/lib/orders/status";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { deriveOrigin } from "@/lib/orders/origin";
import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import { ListaNoutati, type RandNoutate } from "@/components/dashboard/ListaNoutati";
import { rezumatScurt, type Announcement } from "@/lib/announcements";

// Sanitize text-block HTML before it reaches the client renderer.
function announcementToArticle(a: Announcement) {
  return {
    title: a.title,
    excerpt: a.excerpt,
    cover_url: a.cover_url,
    is_pinned: a.is_pinned,
    published_at: a.published_at,
    blocks: (Array.isArray(a.blocks) ? a.blocks : []).map((b) =>
      b.type === "text" ? { ...b, html: sanitizeHtml(b.html) } : b
    ),
  };
}
import { SiteStatusBar } from "@/components/dashboard/SiteStatusBar";
import { PanouVanzari } from "@/components/dashboard/PanouVanzari";
import { citesteDateVanzari, crestere, intervalScris } from "@/lib/vanzari";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import {
  citesteDateCarduri, cresterePosibila, rataConversie, valoareMedie, zileScurt,
} from "@/lib/panou-carduri";
import { ActivationChecklist, type ChecklistStep } from "@/components/dashboard/ActivationChecklist";

type StatCardProps = {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaDir?: "up" | "down";
  deltaCaption?: string;
  href: string;
  icon: LucideIcon;
  empty?: boolean;
  /** Cum se calculeaza cifra, pe intelesul comerciantului. Vezi `ExplicatieCard`. */
  explicatie?: string;
};

function StatCard({
  label,
  value,
  unit,
  delta,
  deltaDir = "up",
  deltaCaption = "vs. ieri",
  href,
  icon: Icon,
  empty = false,
  explicatie,
}: StatCardProps) {
  return (
    /*
      ⚠ CARDUL NU MAI E O LEGATURA, ci o cutie cu o legatura intinsa peste ea.

      Semnul de intrebare e un `<button>`; inauntrul unui `<a>` ar fi fost si
      cuibarire nevalida de HTML, si o capcana: orice apasare pe el ar fi dus
      omul la pagina de detalii in loc sa-i arate explicatia. Asa, legatura
      acopera cardul (`absolute inset-0`), iar butonul sta deasupra ei.
    */
    <div
      className={[
        "group relative flex flex-col overflow-hidden rounded-xl bg-surface",
        "shadow-[0_1px_2px_rgba(15,23,20,0.04)]",
        "border border-border transition-all duration-200",
        "hover:-translate-y-0.5",
        "hover:shadow-[0_1px_2px_rgba(15,23,20,0.04),0_18px_32px_-20px_rgba(15,23,20,0.12)]",
        "min-h-[168px]",
      ].join(" ")}
    >
      <Link
        href={href}
        aria-label={`${label}: vezi detalii`}
        className="absolute inset-0 z-10 no-underline"
      />

      {/* top — label + icon */}
      <div className="flex items-center justify-between border-b border-dashed border-border px-[18px] py-[14px]">
        <span className="text-[12px] font-medium text-muted-foreground tracking-[0.01em]">
          {label}
        </span>
        <span className="flex items-center gap-0.5">
          {explicatie && <ExplicatieCard text={explicatie} eticheta={label} />}
          <span className="grid h-7 w-7 place-items-center text-muted-foreground">
            <Icon strokeWidth={1.4} className="h-[15px] w-[15px]" />
          </span>
        </span>
      </div>

      {/* bottom — value + footer */}
      <div className="flex flex-1 flex-col justify-between px-[18px] pt-4 pb-[18px]">
        <div
          className={cn(
            "text-[44px] leading-none font-medium tracking-[-0.03em] tabular-nums",
            empty ? "text-muted-foreground/30" : "text-foreground"
          )}
        >
          {value}
          {unit && (
            <span className="ml-1 text-[20px] font-normal text-muted-foreground">
              {unit}
            </span>
          )}
        </div>

        {/*
          ⚠ Cresterea si „Vezi detalii" stau pe RANDURI DIFERITE.
          Pe acelasi rand, un card cu crestere de doua cifre si o perioada scrisa
          („19,5% vs. 1 - 20 aug.") impingea „Vezi detalii" in trei bucati
          suprapuse. Randul de jos e mereu scurt, deci nu se mai poate rupe.
        */}
        <div className="mt-[14px] flex flex-col gap-1 text-[12px] text-muted-foreground">
          <div className="flex items-center gap-2">
            {!empty && delta ? (
              <>
                <span className={cn(
                  "font-medium tabular-nums",
                  deltaDir === "down" ? "text-destructive" : "text-primary"
                )}>
                  {deltaDir === "up" ? "↑" : "↓"} {delta}
                </span>
                <span>{deltaCaption}</span>
              </>
            ) : (
              <span>Actualizat acum</span>
            )}
          </div>

          <span className="inline-flex items-center gap-1.5 self-end text-[12px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            Vezi detalii
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-[3px]">
              →
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

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
        <ContinutPanou business={business} userId={user.id} publicUrl={publicUrl} />
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
  business, userId, publicUrl,
}: { business: BusinessPanou; userId: string; publicUrl: string }) {
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
    { data: dashProfile },
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
    supabase.from("users_profile").select("plan, plan_expires_at").eq("id", userId).maybeSingle(),
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

  /*
    Ultimele cinci noutati, cate un rand fiecare. HTML-ul din blocurile de text
    se curata AICI, pe server, inainte sa ajunga la componenta care il pune in
    pagina (vezi `announcementToArticle`).
  */
  const noutati: RandNoutate[] = (await getLatestAnnouncements(5).catch(() => [])).map((a) => ({
    id: a.id,
    titlu: a.title,
    rezumat: rezumatScurt(a),
    data: a.published_at,
    fixat: a.is_pinned,
    articol: announcementToArticle(a),
  }));

  // ── Checklist de activare: semnale calculate server-side ──
  // Pasul "customize" e bifat de logo (semnal server) SAU de vizitarea paginii de
  // editare, marcata client-side in ActivationChecklist (vezi customizeVisitedKey).
  const activationSteps: ChecklistStep[] = [
    { id: "product", title: "Adauga primul produs", description: "Fara produse, clientii nu au ce cumpara.", done: (productsTotal ?? 0) > 0, href: "/dashboard/products/new", cta: "Adauga" },
    { id: "customize", title: "Personalizeaza magazinul", description: "Adauga logo, culori si detaliile magazinului tau.", done: !!business.logo_url, href: "/dashboard/editor", cta: "Personalizeaza" },
    { id: "publish", title: "Publica magazinul", description: "Fa magazinul vizibil pentru clientii tai.", done: business.is_published, href: "/dashboard/editor", cta: "Publica" },
    { id: "order", title: "Primeste prima comanda", description: "Distribuie link-ul pe WhatsApp si retele sociale.", done: (ordersTotal ?? 0) > 0, share: true, cta: "Distribuie" },
  ];

  return (
    <>

      <ActivationChecklist
        steps={activationSteps}
        plan={dashProfile?.plan ?? "free"}
        planExpiresAt={dashProfile?.plan_expires_at ?? null}
        publicUrl={publicUrl}
      />

      <StocScazutRand
        businessId={business.id}
        epuizate={numaratoareStoc?.[0]?.epuizate ?? 0}
        subPrag={numaratoareStoc?.[0]?.sub_prag ?? 0}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4">
        <StatCard
          label="Comenzi azi"
          value={fmt(carduri.azi.comenzi)}
          delta={pctComenziAzi !== null ? fmtDelta(pctComenziAzi) : undefined}
          deltaDir={pctComenziAzi !== null && pctComenziAzi >= 0 ? "up" : "down"}
          deltaCaption={`vs. ieri, ${carduri.ieri_pana_acum.ora}`}
          href="/dashboard/orders"
          icon={ShoppingCart}
          empty={carduri.azi.comenzi === 0}
        />
        <StatCard
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
        <StatCard
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
        <StatCard
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

      {noutati.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Noutati</h2>
          <ListaNoutati noutati={noutati} />
        </div>
      )}
    </>
  );
}
