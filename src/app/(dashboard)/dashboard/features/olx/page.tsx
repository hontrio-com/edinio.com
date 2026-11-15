import { cache, Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { OlxClient, type ParteOlx } from "@/components/dashboard/OlxClient";
import {
  AntetMarketplace, FapteMarketplace, FapteMarketplaceSchelet, VitrinaMarketplace, type FaptMarketplace,
} from "@/components/dashboard/integrare/AntetMarketplace";
import { FileMarketplace, type FilaMarketplace } from "@/components/dashboard/integrare/FileMarketplace";
import { getOlxStatus, getOlxAdverts, type OlxStatus } from "@/lib/actions/olx.actions";
import { pozeleVitrinei } from "@/lib/marketplace/vitrina";
import { acumCatTimp, pluralRo } from "@/lib/utils/format";

/**
 * OLX, refacuta „premium” pe 15.11.2026 ca eMAG (cerut de proprietar: „fa si la restul”): antet cu sigla
 * mare si starea contului (`AntetMarketplace`), apoi file (`FileMarketplace`): Prezentare, Anunțuri,
 * Categorii, Mesaje, Cont OLX, Setări. Pana acum toate stateau una sub alta, iar mesajele cumparatorilor
 * se gaseau abia dupa tabelul de anunturi.
 *
 * ⚠ ANTETUL PLEACA IMEDIAT; starea curge dupa el si se citeste O SINGURA DATA pe cerere (`cache`).
 */

const TITLU = "OLX";
const DESCRIERE = "Publică-ți produsele ca anunțuri pe OLX.ro și gestionează-le din Edinio.";
const PANOU = { href: "https://www.olx.ro/myaccount/", text: "Contul tău OLX" };

const stareaOlx = cache((businessId: string) => getOlxStatus(businessId));

export default async function OlxPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  /*
    ⚠ O CITIRE CAZUTA NU E „n-ai magazin" (02.09.2026). Se citea numai `data`, iar o pană de bază
    trimitea comerciantul înapoi în `/dashboard` fără niciun cuvânt — adică exact ce se întâmplă dacă
    magazinul chiar nu există. `maybeSingle`, fiindcă `single` face din zero rânduri o eroare.
  */
  const { data: biz, error: eBiz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).maybeSingle();
  if (eBiz) throw new Error("Nu am putut citi magazinul. Încearcă din nou peste câteva momente.");
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-4 pb-16 sm:p-6 sm:pb-16">
      <Suspense fallback={<AntetOlxSchelet />}>
        <AntetOlx businessId={biz.id} />
      </Suspense>
      <Suspense fallback={<ScheletOlx />}>
        <ContinutOlx businessId={biz.id} />
      </Suspense>
    </div>
  );
}

function AntetOlxSchelet() {
  return (
    <AntetMarketplace
      id="olx"
      titlu={TITLU}
      descriere={DESCRIERE}
      panou={PANOU}
      stari={<Skeleton className="h-6 w-44 rounded-md" />}
      fapte={<FapteMarketplaceSchelet />}
    />
  );
}

async function AntetOlx({ businessId }: { businessId: string }) {
  const status = await stareaOlx(businessId);
  if ("error" in status) {
    return (
      <AntetMarketplace
        id="olx"
        titlu={TITLU}
        descriere={DESCRIERE}
        panou={PANOU}
        stari={<EtichetaStare ton="rau">Starea contului nu s-a putut citi</EtichetaStare>}
      />
    );
  }
  /* ⚠ Integrarea nepregatita la noi (`configured`) arata ca una neconectata: pagina spune „în curând”. */
  const poze = status.configured && status.connected && !status.needsReconnect ? await pozeleDePeOlx(businessId) : [];
  const ramase = status.counts.active - poze.length;
  return (
    <AntetMarketplace
      id="olx"
      titlu={TITLU}
      descriere={DESCRIERE}
      panou={PANOU}
      stari={<StariOlx status={status} />}
      fapte={<FapteMarketplace fapte={fapteOlx(status)} />}
      vitrina={
        <VitrinaMarketplace
          titlu="Pe OLX acum"
          poze={poze}
          rest={ramase > 0 ? `și încă ${pluralRo(ramase, "anunț activ", "anunțuri active")}` : null}
          legatura={{ href: "#anunturi", text: "Vezi anunțurile" }}
        />
      }
    />
  );
}

function StariOlx({ status }: { status: OlxStatus }) {
  if (!status.configured) return <EtichetaStare ton="asteptare">În pregătire</EtichetaStare>;
  if (!status.connected) return <EtichetaStare ton="neutru">Neconectat</EtichetaStare>;
  return (
    <>
      {status.needsReconnect
        ? <EtichetaStare ton="rau">Sesiunea a expirat</EtichetaStare>
        : <EtichetaStare ton="bun">Conectat</EtichetaStare>}
      <EtichetaStare ton="neutru">{status.advertiserType === "business" ? "Firmă" : "Persoană fizică"}</EtichetaStare>
      <EtichetaStare ton={status.autoSync ? "bun" : "asteptare"}>
        {status.autoSync ? "Sincronizare automată pornită" : "Sincronizare automată oprită"}
      </EtichetaStare>
      {!status.ready && !status.needsReconnect && <EtichetaStare ton="asteptare">Publicarea nu e pregătită</EtichetaStare>}
    </>
  );
}

/**
 * Banda de sub antet. Conectat: contul, localitatea anunturilor, livrarea si ultima sincronizare. Neconectat:
 * ce face integrarea. ⚠ Cifrele anunturilor raman in cartonasele din fila „Prezentare” (`CardStatistica`).
 */
function fapteOlx(status: OlxStatus): FaptMarketplace[] {
  if (!status.connected || !status.configured) {
    return [
      { eticheta: "Anunțuri", valoare: "Din produsele tale", detaliu: "Cu poze, preț și stoc." },
      { eticheta: "Mesaje", valoare: "Le citești aici", detaliu: "Răspunzi fără să intri pe OLX." },
      { eticheta: "Stoc și preț", valoare: "Pleacă singure", detaliu: "La fiecare vânzare sau modificare." },
      { eticheta: "Pachete", valoare: "Din Edinio", detaliu: "Promovări și anunțuri peste limită." },
    ];
  }
  const loc = [status.cityName, status.districtName].filter(Boolean).join(", ");
  return [
    {
      eticheta: "Contul",
      valoare: status.olxUserName ?? "Cont OLX",
      detaliu: status.advertiserType === "business" ? "Firmă" : "Persoană fizică",
    },
    {
      eticheta: "Localitatea",
      valoare: loc || "Nealeasă",
      detaliu: loc ? "Apare pe fiecare anunț." : "Se alege în fila Setări.",
    },
    {
      eticheta: "Livrare OLX",
      valoare: status.courierEnabled ? "Pornită" : "Oprită",
      detaliu: status.autoExtend ? "Anunțurile se prelungesc singure." : "Prelungirea se face de mână.",
    },
    {
      eticheta: "Ultima sincronizare",
      valoare: status.lastSyncAt ? acumCatTimp(status.lastSyncAt) : "Încă niciodată",
      detaliu: pluralRo(status.counts.active, "anunț activ", "anunțuri active"),
    },
  ];
}

/** Cateva poze din anunturile active, pentru banda din antet. O citire cazuta nu strica pagina. */
async function pozeleDePeOlx(businessId: string): Promise<{ src: string; alt: string }[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("olx_adverts")
      .select("product_id, products(name, images)")
      .eq("business_id", businessId)
      .eq("status", "active")
      .not("product_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(24);
    if (error) {
      console.error("[olx] pozele din antet", error.message);
      return [];
    }
    return pozeleVitrinei(data);
  } catch (e) {
    console.error("[olx] pozele din antet", (e as Error).message);
    return [];
  }
}

/** ⚠ Forma scheletului e chiar forma paginii: bara filelor, randul de cifre, apoi panourile. */
function ScheletOlx() {
  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-border pb-3">
        {["w-24", "w-20", "w-20", "w-16", "w-20", "w-16"].map((w, i) => <Skeleton key={i} className={`h-5 rounded-md ${w}`} />)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px] rounded-xl sm:h-[168px]" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

async function ContinutOlx({ businessId }: { businessId: string }) {
  const supabase = await createClient();
  const status = await stareaOlx(businessId);
  const st = "error" in status ? null : status;

  /*
    ⚠ PRIMA PAGINĂ, NU TOT TABELUL (22.09.2026). Citirea aducea 200 de anunțuri și tăcea despre
    restul. Acum vine o pagină de 50, cu numărul adevărat lângă ea, iar `AdvertTable` cere singur
    paginile următoare. Prima rămâne randată pe server, ca ecranul să nu se nască gol.
  */
  const rAdverts = !st
    ? { adverts: [], total: 0, pagini: 1, deLa: 0 }
    : await getOlxAdverts(businessId, 1);
  /*
    ⚠ Lista nu se poate citi: se arată goală, dar cu spusa alături. Un tabel gol fără explicație e
    tocmai zeroul care liniștește — iar de aici omul apasă „Publică tot".
  */
  const adverts = "error" in rAdverts ? [] : rAdverts.adverts;
  const advertsTotal = "error" in rAdverts ? 0 : rAdverts.total;
  const advertsPagini = "error" in rAdverts ? 1 : rAdverts.pagini;
  const advertsDeLa = "error" in rAdverts ? 0 : rAdverts.deLa;
  const advertsError = "error" in rAdverts ? rAdverts.error : null;

  const catRows: { category: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("products").select("category").eq("business_id", businessId).not("category", "is", null)
      .order("id").range(from, from + 999);
    catRows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const categories = [...new Set(catRows.map((r) => r.category as string).filter(Boolean))].sort();

  /*
   * ⚠ Lista de anunturi pleaca NUMAI spre fila care o arata. Celelalte file primesc o lista goala: fiecare
   * fila e un ecran separat, iar cincizeci de randuri trimise de sase ori ar fi umflat raspunsul degeaba.
   */
  const ecran = (parte: ParteOlx) => (
    <OlxClient
      businessId={businessId}
      status={st}
      parte={parte}
      adverts={parte === "anunturi" ? adverts : []}
      advertsTotal={advertsTotal}
      advertsPagini={advertsPagini}
      advertsDeLa={advertsDeLa}
      advertsError={parte === "anunturi" ? advertsError : null}
      categories={parte === "categorii" ? categories : []}
    />
  );

  /* Fara file cand nu e nimic de facut in ele: neconectat (conectarea) sau integrarea nepregatita la noi. */
  if (!st?.connected || !st.configured) return ecran("prezentare");

  /*
   * ⚠ Cu sesiunea expirata raman „Prezentare” (care o spune, cu butonul de reconectare) si „Setări”:
   * celelalte ar fi pornit cereri respinse de OLX, cu erori fara legatura cu ce are omul de facut.
   */
  const merge = !st.needsReconnect;
  const nemapate = categories.filter((c) => !st.categoryMap[c]).length;

  const file: FilaMarketplace[] = [
    { id: "prezentare", titlu: "Prezentare", continut: ecran("prezentare") },
    ...(merge ? [
      { id: "anunturi", titlu: "Anunțuri", numar: advertsTotal, continut: ecran("anunturi") },
      {
        id: "categorii",
        titlu: "Categorii",
        numar: categories.length - nemapate,
        /* Punctul de atentie: un produs dintr-o categorie nelegata nu ajunge anunt. */
        atentie: nemapate > 0,
        continut: ecran("categorii"),
      },
      { id: "mesaje", titlu: "Mesaje", continut: ecran("mesaje") },
      { id: "cont", titlu: "Cont OLX", continut: ecran("cont") },
    ] : []),
    { id: "setari", titlu: "Setări", atentie: !st.ready && !st.needsReconnect, continut: ecran("setari") },
  ];

  return <FileMarketplace file={file} eticheta="Secțiunile integrării OLX" />;
}
