import { cache, Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { TrendyolClient } from "@/components/dashboard/TrendyolClient";
import { TrendyolReturns } from "@/components/dashboard/TrendyolReturns";
import { TrendyolAutoMap } from "@/components/dashboard/TrendyolAutoMap";
import { TrendyolCategoryMapping } from "@/components/dashboard/TrendyolCategoryMapping";
import { TrendyolListings } from "@/components/dashboard/TrendyolListings";
import {
  AntetMarketplace, FapteMarketplace, FapteMarketplaceSchelet, VitrinaMarketplace, type FaptMarketplace,
} from "@/components/dashboard/integrare/AntetMarketplace";
import { FileMarketplace, type FilaMarketplace } from "@/components/dashboard/integrare/FileMarketplace";
import { getTrendyolStatus, type TrendyolStatus } from "@/lib/actions/trendyol.actions";
import { TRENDYOL_STOREFRONTS } from "@/lib/trendyol/types";
import { pozeleVitrinei } from "@/lib/marketplace/vitrina";
import { acumCatTimp, pluralRo } from "@/lib/utils/format";

/**
 * Trendyol Marketplace, refacuta „premium” pe 15.11.2026 ca eMAG (cerut de proprietar: „fa si la
 * restul”): antet cu sigla mare si starea contului (`AntetMarketplace`), apoi file (`FileMarketplace`).
 *
 * ⚠ PE TOT ECRANUL, ca la eMAG, si din acelasi motiv. Cerut de el pe 22.09.2026: lista de listari are opt
 * coloane, iar stransa la `max-w-3xl` randurile tabelului se rupeau pe doua linii.
 *
 * ⚠ ANTETUL PLEACA INAINTEA STARII, tot ca la eMAG. `getTrendyolStatus` face sapte numaratori in baza, iar
 * citirea categoriilor trece prin TOT catalogul, o mie de randuri o data: la un magazin mare, cu antetul
 * inauntru, primul lucru pe care il vedea comerciantul era un ecran gol.
 */

const TITLU = "Trendyol";
const DESCRIERE = "Listează-ți produsele pe Trendyol și primești comenzile direct în Edinio.";
const PANOU = { href: "https://partner.trendyol.com/", text: "Panoul Trendyol" };

/** O singura citire a starii pe cerere, oricate parti ale paginii o cer (antetul si filele). */
const stareaTrendyol = cache((businessId: string) => getTrendyolStatus(businessId));

/**
 * Categoriile magazinului (pentru mapare si pentru numaratoarea celor nelegate din antet). Doar lista de
 * categorii se incarca pe server; produsele vin paginat, la cerere, fiindca un magazin cu mii de produse
 * nu incape intr-o pagina.
 */
const categoriileMagazinului = cache(async (businessId: string): Promise<string[]> => {
  const supabase = await createClient();
  const catRows: { category: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("products").select("category").eq("business_id", businessId).not("category", "is", null)
      .order("id").range(from, from + 999);
    catRows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return [...new Set(catRows.map((r) => r.category as string).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ro"));
});

export default async function TrendyolPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-4 pb-16 sm:p-6 sm:pb-16">
      <Suspense fallback={<AntetTrendyolSchelet />}>
        <AntetTrendyol businessId={biz.id} />
      </Suspense>
      <Suspense fallback={<ScheletTrendyol />}>
        <ContinutTrendyol businessId={biz.id} />
      </Suspense>
    </div>
  );
}

function AntetTrendyolSchelet() {
  return (
    <AntetMarketplace
      id="trendyol"
      titlu={TITLU}
      descriere={DESCRIERE}
      panou={PANOU}
      stari={<Skeleton className="h-6 w-44 rounded-md" />}
      fapte={<FapteMarketplaceSchelet />}
    />
  );
}

const merge = (st: TrendyolStatus) => st.connected && st.globallyEnabled && !st.needsReconnect;

async function AntetTrendyol({ businessId }: { businessId: string }) {
  const status = await stareaTrendyol(businessId);
  if ("error" in status) {
    return (
      <AntetMarketplace
        id="trendyol"
        titlu={TITLU}
        descriere={DESCRIERE}
        panou={PANOU}
        stari={<EtichetaStare ton="rau">Starea contului nu s-a putut citi</EtichetaStare>}
      />
    );
  }

  const [categorii, poze] = merge(status)
    ? await Promise.all([categoriileMagazinului(businessId), pozeleDePeTrendyol(businessId)])
    : [[], []];
  const ramase = status.counts.listings - poze.length;

  return (
    <AntetMarketplace
      id="trendyol"
      titlu={TITLU}
      descriere={DESCRIERE}
      panou={PANOU}
      stari={<StariTrendyol status={status} />}
      fapte={<FapteMarketplace fapte={fapteTrendyol(status, categorii)} />}
      vitrina={
        <VitrinaMarketplace
          titlu="Pe Trendyol acum"
          poze={poze}
          rest={ramase > 0 ? `și încă ${pluralRo(ramase, "listare", "listări")}` : null}
          legatura={{ href: "#listari", text: "Vezi listările" }}
        />
      }
    />
  );
}

function StariTrendyol({ status }: { status: TrendyolStatus }) {
  if (!status.globallyEnabled) return <EtichetaStare ton="neutru">Indisponibilă momentan</EtichetaStare>;
  if (!status.connected) return <EtichetaStare ton="neutru">Neconectat</EtichetaStare>;
  return (
    <>
      {status.needsReconnect
        ? <EtichetaStare ton="rau">Sesiunea a expirat</EtichetaStare>
        : <EtichetaStare ton="bun">Conectat</EtichetaStare>}
      {/* Stage nu e o stare buna, e una de proba: galben, nu verde. */}
      <EtichetaStare ton={status.environment === "stage" ? "asteptare" : "neutru"}>
        {status.environment === "stage" ? "Stage (testare)" : "Producție"}
      </EtichetaStare>
      <EtichetaStare ton="neutru">{status.storefrontLabel}</EtichetaStare>
      <EtichetaStare ton={status.autoSync ? "bun" : "asteptare"}>
        {status.autoSync ? "Sincronizare automată pornită" : "Sincronizare automată oprită"}
      </EtichetaStare>
    </>
  );
}

/**
 * Banda de sub antet. Conectat: contul, cand s-au citit ultima oara comenzile, webhook-ul si categoriile.
 * Neconectat: ce face integrarea. ⚠ Cifrele listarilor NU stau aici: au cartonasele lor (`CardStatistica`)
 * in fila „Prezentare”, cerute de proprietar pe 22.09.2026 la fel ca pe Panou.
 */
function fapteTrendyol(status: TrendyolStatus, categorii: string[]): FaptMarketplace[] {
  if (!status.connected) {
    const tari = TRENDYOL_STOREFRONTS.map((s) => s.tara);
    return [
      { eticheta: "Țări", valoare: `${tari.length} vitrine`, detaliu: `${tari.slice(0, 3).join(", ")} și altele` },
      { eticheta: "Comenzi", valoare: "Intră singure", detaliu: "În Comenzi, ca cele din magazin." },
      { eticheta: "Stoc și preț", valoare: "Pleacă singure", detaliu: "La fiecare vânzare sau modificare." },
      { eticheta: "Facturi", valoare: "Opțional", detaliu: "Prin SmartBill, Oblio sau fGO." },
    ];
  }
  const legate = categorii.filter((c) => status.categoryMap[c]).length;
  const nelegate = categorii.length - legate;
  const sincronizare = status.ordersSyncedAt ?? status.lastSyncAt;
  return [
    {
      eticheta: "Contul",
      valoare: <span className="font-mono">{status.supplierId ? `Seller ${status.supplierId}` : "fără seller"}</span>,
      detaliu: `${status.storefrontLabel} · ${status.currency}`,
    },
    {
      eticheta: "Ultima sincronizare",
      valoare: sincronizare ? acumCatTimp(sincronizare) : "Încă niciodată",
      detaliu: `${pluralRo(status.counts.orders, "comandă importată", "comenzi importate")}`,
    },
    {
      eticheta: "Comenzi instant",
      valoare: status.webhookActive ? "Pornite" : "Nepornite",
      detaliu: status.webhookActive ? "Prin webhook, pe loc." : "Opțional: comenzile vin oricum, periodic.",
    },
    {
      eticheta: "Categorii legate",
      valoare: categorii.length > 0 ? `${legate} din ${categorii.length}` : String(legate),
      detaliu: nelegate > 0 ? `${pluralRo(nelegate, "categorie nelegată", "categorii nelegate")}` : "Produsele din ele se pot lista.",
    },
  ];
}

/** Cateva poze din listarile aprobate, pentru banda din antet. O citire cazuta nu strica pagina. */
async function pozeleDePeTrendyol(businessId: string): Promise<{ src: string; alt: string }[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("trendyol_listings")
      .select("product_id, products(name, images)")
      .eq("business_id", businessId)
      .in("status", ["approved", "active"])
      .not("product_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(24);
    if (error) {
      console.error("[trendyol] pozele din antet", error.message);
      return [];
    }
    return pozeleVitrinei(data);
  } catch (e) {
    console.error("[trendyol] pozele din antet", (e as Error).message);
    return [];
  }
}

/** ⚠ Forma scheletului e chiar forma paginii: bara filelor, randul de cifre, apoi panourile. */
function ScheletTrendyol() {
  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-border pb-3">
        {["w-24", "w-20", "w-20", "w-20", "w-16"].map((w, i) => <Skeleton key={i} className={`h-5 rounded-md ${w}`} />)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px] rounded-xl sm:h-[168px]" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

async function ContinutTrendyol({ businessId }: { businessId: string }) {
  const status = await stareaTrendyol(businessId);
  const st = "error" in status ? null : status;

  /* Fara file cand nu e nimic de facut in ele: neconectat (cerintele si formularul) sau integrarea oprita. */
  if (!st?.connected || !st.globallyEnabled) {
    return <TrendyolClient businessId={businessId} status={st} parte="prezentare" />;
  }

  /*
   * ⚠ FILELE CU DATE DE LA TRENDYOL APAR NUMAI CU UN CONT CARE MERGE. Cu sesiunea expirata, maparea si
   * listarile ar fi pornit cereri respinse, iar comerciantul ar fi vazut erori fara legatura cu ce are de
   * facut: sa reconecteze contul. Raman „Prezentare” (care o spune) si „Setări”.
   */
  const contMerge = merge(st);
  const categorii = contMerge ? await categoriileMagazinului(businessId) : [];
  const nemapate = categorii.filter((c) => !st.categoryMap[c]).length;

  const file: FilaMarketplace[] = [
    {
      id: "prezentare",
      titlu: "Prezentare",
      continut: <TrendyolClient businessId={businessId} status={st} parte="prezentare" />,
    },
    ...(contMerge ? [
      {
        id: "listari",
        titlu: "Listări",
        numar: st.counts.listings,
        continut: <TrendyolListings businessId={businessId} categories={categorii} storefront={st.storefront} />,
      },
      {
        id: "categorii",
        titlu: "Categorii",
        numar: categorii.length - nemapate,
        /* Punctul de atentie: un produs dintr-o categorie nelegata nu se poate lista deloc. */
        atentie: nemapate > 0,
        continut: (
          <>
            {categorii.length > 0 && (
              <TrendyolAutoMap businessId={businessId} categories={categorii} nemapate={nemapate} />
            )}
            <TrendyolCategoryMapping businessId={businessId} edinioCategories={categorii} mapped={st.categoryMap} />
          </>
        ),
      },
      /* ⚠ Retururile au fila lor: pana pe 22.09 comerciantul afla de ele din panoul Trendyol si hotara acolo. */
      { id: "retururi", titlu: "Retururi", continut: <TrendyolReturns businessId={businessId} /> },
    ] : []),
    {
      id: "setari",
      titlu: "Setări",
      continut: <TrendyolClient businessId={businessId} status={st} parte="setari" />,
    },
  ];

  return <FileMarketplace file={file} eticheta="Secțiunile integrării Trendyol" />;
}
