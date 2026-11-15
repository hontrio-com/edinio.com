import { cache, Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { AboutYouClient } from "@/components/dashboard/AboutYouClient";
import { AboutYouReturns } from "@/components/dashboard/AboutYouReturns";
import { AboutYouCategoryMapping } from "@/components/dashboard/AboutYouCategoryMapping";
import { AboutYouCarrierMapping } from "@/components/dashboard/AboutYouCarrierMapping";
import { AboutYouListings } from "@/components/dashboard/AboutYouListings";
import { AboutYouPreVerificare } from "@/components/dashboard/AboutYouPreVerificare";
import { AboutYouOrders } from "@/components/dashboard/AboutYouOrders";
import {
  AntetMarketplace, FapteMarketplace, FapteMarketplaceSchelet, VitrinaMarketplace, type FaptMarketplace,
} from "@/components/dashboard/integrare/AntetMarketplace";
import { FileMarketplace, type FilaMarketplace } from "@/components/dashboard/integrare/FileMarketplace";
import {
  getAboutYouOrders, getAboutYouPreVerificare, getAboutYouProductPage, getAboutYouStatus,
  type AboutYouStatus,
} from "@/lib/actions/aboutyou.actions";
import { pozeleVitrinei } from "@/lib/marketplace/vitrina";
import { acumCatTimp, pluralRo } from "@/lib/utils/format";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * About You Marketplace, refacuta „premium” pe 15.11.2026 ca eMAG (cerut de proprietar: „fa si la
 * restul”): antet cu sigla mare si starea contului (`AntetMarketplace`), apoi file (`FileMarketplace`).
 *
 * ⚠ PE TOT ECRANUL, ca la Trendyol si eMAG, si din acelasi motiv. Cerut de el pe 22.09.2026: listele au cate o
 * duzina de coloane, iar stranse la `max-w-3xl` randurile se rupeau pe doua linii.
 *
 * ⚠ ANTETUL PLEACA IMEDIAT; starea conexiunii curge dupa el. `getAboutYouStatus` inseamna un drum pana la
 * SCAYLE, iar cand magazinul e legat mai vin dupa el categoriile (citite din 1000 in 1000), produsele si
 * listarile. Starea se citeste O SINGURA DATA pe cerere (`cache`), oricate parti ale paginii o cer.
 */

const TITLU = "About You";
const DESCRIERE = "Listează-ți produsele pe About You Marketplace și primești comenzile direct în Edinio.";

const stareaAboutYou = cache((businessId: string) => getAboutYouStatus(businessId));

/** Categoriile magazinului, citite peste plafonul de 1000 de randuri al PostgREST. */
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
  return [...new Set(catRows.map((r) => r.category as string).filter(Boolean))].sort();
});

export default async function AboutYouPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-4 pb-16 sm:p-6 sm:pb-16">
      <Suspense fallback={<AntetAboutYouSchelet />}>
        <AntetAboutYou businessId={biz.id} />
      </Suspense>
      <Suspense fallback={<ScheletAboutYou />}>
        <ContinutAboutYou businessId={biz.id} />
      </Suspense>
    </div>
  );
}

function AntetAboutYouSchelet() {
  return (
    <AntetMarketplace
      id="aboutyou"
      titlu={TITLU}
      descriere={DESCRIERE}
      stari={<Skeleton className="h-6 w-44 rounded-md" />}
      fapte={<FapteMarketplaceSchelet />}
    />
  );
}

const merge = (st: AboutYouStatus) => st.connected && st.globallyEnabled && !st.needsReconnect;

async function AntetAboutYou({ businessId }: { businessId: string }) {
  const status = await stareaAboutYou(businessId);
  if ("error" in status) {
    return (
      <AntetMarketplace
        id="aboutyou"
        titlu={TITLU}
        descriere={DESCRIERE}
        stari={<EtichetaStare ton="rau">Starea contului nu s-a putut citi</EtichetaStare>}
      />
    );
  }
  const poze = merge(status) ? await pozeleDePeAboutYou(businessId) : [];
  const ramase = status.counts.listings - poze.length;
  return (
    <AntetMarketplace
      id="aboutyou"
      titlu={TITLU}
      descriere={DESCRIERE}
      stari={<StariAboutYou status={status} />}
      fapte={<FapteMarketplace fapte={fapteAboutYou(status)} />}
      vitrina={
        <VitrinaMarketplace
          titlu="Pe About You acum"
          poze={poze}
          rest={ramase > 0 ? `și încă ${pluralRo(ramase, "listare", "listări")}` : null}
          legatura={{ href: "#produse", text: "Vezi produsele" }}
        />
      }
    />
  );
}

function StariAboutYou({ status }: { status: AboutYouStatus }) {
  if (!status.globallyEnabled) return <EtichetaStare ton="neutru">Indisponibilă momentan</EtichetaStare>;
  if (!status.connected) return <EtichetaStare ton="neutru">Neconectat</EtichetaStare>;
  return (
    <>
      {status.needsReconnect
        ? <EtichetaStare ton="rau">Sesiunea a expirat</EtichetaStare>
        : <EtichetaStare ton="bun">Conectat</EtichetaStare>}
      {/* Sandbox nu e o stare buna, e una de proba: galben, nu verde. */}
      <EtichetaStare ton={status.environment === "sandbox" ? "asteptare" : "neutru"}>
        {status.environment === "sandbox" ? "Sandbox (testare)" : "Producție"}
      </EtichetaStare>
      <EtichetaStare ton={status.autoSync ? "bun" : "asteptare"}>
        {status.autoSync ? "Sincronizare automată pornită" : "Sincronizare automată oprită"}
      </EtichetaStare>
      {!status.ready && !status.needsReconnect && <EtichetaStare ton="asteptare">Publicarea nu e pregătită</EtichetaStare>}
    </>
  );
}

/**
 * Banda de sub antet. Conectat: contul, tarile de listare, cum se face pretul si notificarile. Neconectat: ce
 * face integrarea. ⚠ Cifrele listarilor raman in cartonasele din fila „Prezentare” (`CardStatistica`).
 */
function fapteAboutYou(status: AboutYouStatus): FaptMarketplace[] {
  if (!status.connected) {
    return [
      { eticheta: "Piață", valoare: "Modă, în Europa", detaliu: "Un singur cont, mai multe țări." },
      { eticheta: "Comenzi", valoare: "Intră singure", detaliu: "În Comenzi, ca cele din magazin." },
      { eticheta: "Stoc și preț", valoare: "Pleacă singure", detaliu: "La fiecare vânzare sau modificare." },
      { eticheta: "Prețul", valoare: "Din lei, în euro", detaliu: "Cu cursul și adaosul alese de tine." },
    ];
  }
  const tari = status.shipCountries;
  return [
    {
      eticheta: "Contul",
      valoare: status.sellerName ?? "Cont About You",
      detaliu: <>Cheia <span className="font-mono">{status.apiKeyMasked ?? "lipsă"}</span></>,
    },
    {
      eticheta: "Țări de listare",
      valoare: tari.length > 0 ? pluralRo(tari.length, "țară", "țări") : "Niciuna aleasă",
      detaliu: tari.length > 0 ? tari.slice(0, 6).join(", ") + (tari.length > 6 ? "…" : "") : "Se aleg în fila Setări.",
    },
    {
      eticheta: "Prețul",
      valoare: status.priceMode === "manual_eur"
        ? "Manual, în euro"
        : status.fxRate ? `1 EUR = ${status.fxRate.toLocaleString("ro-RO")} lei` : "Curs nesetat",
      detaliu: status.priceMode === "manual_eur"
        ? "Pus pe fiecare produs."
        : status.fxMarginPct ? `Plus ${status.fxMarginPct}% adaos.` : "Fără adaos.",
    },
    {
      eticheta: "Notificări",
      valoare: status.webhookActive ? "Pornite" : "Nepornite",
      detaliu: status.lastSyncAt ? `Ultima sincronizare: ${acumCatTimp(status.lastSyncAt)}` : "Încă nicio sincronizare.",
    },
  ];
}

/** Cateva poze din listarile active, pentru banda din antet. O citire cazuta nu strica pagina. */
async function pozeleDePeAboutYou(businessId: string): Promise<{ src: string; alt: string }[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("aboutyou_listings")
      .select("product_id, products(name, images)")
      .eq("business_id", businessId)
      .in("status", ["published", "active"])
      .not("product_id", "is", null)
      .order("last_synced_at", { ascending: false, nullsFirst: false })
      .limit(24);
    if (error) {
      console.error("[aboutyou] pozele din antet", error.message);
      return [];
    }
    return pozeleVitrinei(data);
  } catch (e) {
    console.error("[aboutyou] pozele din antet", (e as Error).message);
    return [];
  }
}

/** ⚠ Forma scheletului e chiar forma paginii: bara filelor, randul de cifre, apoi panourile. */
function ScheletAboutYou() {
  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-border pb-3">
        {["w-24", "w-20", "w-20", "w-20", "w-20", "w-16"].map((w, i) => <Skeleton key={i} className={`h-5 rounded-md ${w}`} />)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px] rounded-xl sm:h-[168px]" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

async function ContinutAboutYou({ businessId }: { businessId: string }) {
  const status = await stareaAboutYou(businessId);
  const st = "error" in status ? null : status;

  /* Fara file cand nu e nimic de facut in ele: neconectat (cerintele si formularul) sau integrarea oprita. */
  if (!st?.connected || !st.globallyEnabled) {
    return <AboutYouClient businessId={businessId} status={st} parte="prezentare" />;
  }

  /*
   * ⚠ FILELE CU DATE DE LA ABOUT YOU APAR NUMAI CU UN CONT CARE MERGE. Cu sesiunea expirata, cererile catre
   * SCAYLE ar fi fost respinse si ecranele ar fi aratat erori fara legatura cu ce are omul de facut: sa
   * reconecteze contul. Raman „Prezentare” (care o spune) si „Setări”.
   */
  const contMerge = merge(st);
  const [categorii, p, pv, paginaComenzi] = contMerge
    ? await Promise.all([
      categoriileMagazinului(businessId),
      getAboutYouProductPage(businessId, 1, ""),
      getAboutYouPreVerificare(businessId),
      /* Doar PRIMA pagina de comenzi: restul le cere ecranul, cu bara de paginare. */
      getAboutYouOrders(businessId, 1, false),
    ])
    : [[], null, null, null];
  const paginaProduse = p && !("error" in p) ? p : null;
  const preVerificare = pv && !("error" in pv) ? pv : null;
  const nemapate = categorii.filter((c) => !st.categoryMap[c]).length;

  const file: FilaMarketplace[] = [
    {
      id: "prezentare",
      titlu: "Prezentare",
      continut: (
        <>
          <AboutYouClient businessId={businessId} status={st} parte="prezentare" />
          {/* Inainte de mapari si de editor: ce lipseste, numarat pe datele reale. */}
          {preVerificare && <AboutYouPreVerificare date={preVerificare} />}
        </>
      ),
    },
    ...(contMerge ? [
      ...(paginaProduse ? [{
        id: "produse",
        titlu: "Produse",
        numar: st.counts.listings,
        continut: (
          <AboutYouListings
            businessId={businessId}
            pagina={paginaProduse}
            pricing={{ mode: st.priceMode, rate: st.fxRate, marginPct: st.fxMarginPct }}
          />
        ),
      }] : []),
      {
        id: "categorii",
        titlu: "Categorii",
        numar: categorii.length - nemapate,
        /* Punctul de atentie: un produs dintr-o categorie nelegata nu se poate lista. */
        atentie: nemapate > 0,
        continut: <AboutYouCategoryMapping businessId={businessId} edinioCategories={categorii} mapped={st.categoryMap} />,
      },
      ...(paginaComenzi ? [{
        id: "comenzi",
        titlu: "Comenzi",
        numar: paginaComenzi.total,
        atentie: paginaComenzi.cuProbleme > 0,
        continut: <AboutYouOrders businessId={businessId} pagina={paginaComenzi} />,
      }] : []),
      /*
       * ⚠ Retururile au fila lor: ecranul exista fiindca repunerea automata in stoc s-a oprit. Taiata fara el,
       * marfa intoarsa n-ar mai fi ajuns niciodata inapoi.
       */
      { id: "retururi", titlu: "Retururi", continut: <AboutYouReturns businessId={businessId} /> },
    ] : []),
    {
      id: "setari",
      titlu: "Setări",
      continut: (
        <AboutYouClient
          businessId={businessId}
          status={st}
          parte="setari"
          /* Curierii stau sub setari: se aleg o data, ca brandul sau tarile de listare. */
          dupaSetari={contMerge
            ? <AboutYouCarrierMapping businessId={businessId} carrierMap={st.carrierMap} returBidirectional={st.returBidirectional} />
            : null}
        />
      ),
    },
  ];

  return <FileMarketplace file={file} eticheta="Secțiunile integrării About You" />;
}
