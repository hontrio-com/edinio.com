import { cache, Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { EmagClient } from "@/components/dashboard/EmagClient";
import { EmagCategoryMapping } from "@/components/dashboard/EmagCategoryMapping";
import { EmagListings } from "@/components/dashboard/EmagListings";
import { EmagProbleme } from "@/components/dashboard/EmagProbleme";
import { EmagDePublicat } from "@/components/dashboard/EmagDePublicat";
import { EmagReturns } from "@/components/dashboard/EmagReturns";
import { EmagCampanii } from "@/components/dashboard/EmagCampanii";
import { EmagJurnal } from "@/components/dashboard/EmagJurnal";
import { EmagFacturiLor } from "@/components/dashboard/EmagFacturiLor";
import {
  AntetMarketplace, FapteMarketplace, FapteMarketplaceSchelet, VitrinaMarketplace, type FaptMarketplace,
} from "@/components/dashboard/integrare/AntetMarketplace";
import { FileMarketplace, type FilaMarketplace } from "@/components/dashboard/integrare/FileMarketplace";
import { getEmagStatus, type StareEmag } from "@/lib/actions/emag.actions";
import type { EmagTara } from "@/lib/emag/types";
import { lipsesteDinSetari } from "@/lib/emag/etichete";
import { pozeleVitrinei } from "@/lib/marketplace/vitrina";
import { acumCatTimp, pluralRo } from "@/lib/utils/format";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * ⚠ NEDECLARAT, PAGINA SE TAIA LA IMPLICIT (24.08.2026)
 *
 * Casa o declară în altă parte (`orders/page.tsx:27`), dar aici lipsea. Iar pagina asta
 * face, la o singură încărcare: starea contului, numărătoarea ofertelor pe stări, lista
 * paginată, centrul de probleme, produsele nepublicate, retururile, campaniile și
 * facturile de la ei — unele cu drum până la eMAG, prin releul de IP fix.
 *
 * ⚠ La contul măsurat, importul celor 3.754 de oferte a mers în 1,38 s, deci marja e
 * subțire, nu ruptă. Dar se subțiază cu fiecare produs adăugat, iar când se rupe, se
 * rupe la comerciantul cu cel mai mare catalog — adică exact cel căruia îi pasă cel mai
 * mult. Iar tăierea nu arată ca o eroare de cod, ci ca „panoul nu se încarcă".
 */
export const maxDuration = 300;

const TITLU = "eMAG Marketplace";
const DESCRIERE = "Vinde pe eMAG direct din Edinio: publici produsele, primești comenzile și trimiți facturile, fără să mai intri în panoul lor.";

/** Panoul de vanzator al tarii contului. Fara cont conectat, cel romanesc. */
function panouEmag(tara: EmagTara = "ro") {
  return { href: `https://marketplace.emag.${tara}/`, text: "Panoul eMAG" };
}

/**
 * O SINGURA citire a starii pe cerere. Antetul si filele o cer amandoua, fiecare din `Suspense`-ul
 * lui; fara `cache`, `getEmagStatus` (cinci numaratori in baza si o functie de numarare) ar fi
 * rulat de doua ori la fiecare deschidere a paginii.
 */
const stareaEmag = cache((businessId: string) => getEmagStatus(businessId));

/**
 * eMAG Marketplace, refacuta „premium” pe 15.11.2026 (cerut de proprietar, dupa pagina tbi):
 * antet cu sigla mare si starea contului (`AntetMarketplace`), apoi file in locul derularii lungi
 * (`FileMarketplace`).
 *
 * ⚠ ANTETUL PLEACA IMEDIAT, starea curge dupa el: schelet cu sigla, titlul si descrierea, inlocuit de
 * antetul plin cand vine starea. La eMAG conteaza mai mult decat la celelalte: pagina asta poarta
 * PRERECHIZITUL DE IP, iar daca antetul ar astepta starea, primul lucru vazut ar fi un ecran gol.
 *
 * ⚠ PE TOT ECRANUL, spre deosebire de celelalte integrari (`PaginaIntegrare` e `max-w-6xl`): tabelul
 * de oferte are zece coloane, iar stranse, randurile lui se rupeau pe doua linii.
 */
export default async function EmagPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-4 pb-16 sm:p-6 sm:pb-16">
      <Suspense fallback={<AntetEmagSchelet />}>
        <AntetEmag businessId={biz.id} />
      </Suspense>
      <Suspense fallback={<ScheletEmag />}>
        <ContinutEmag businessId={biz.id} />
      </Suspense>
    </div>
  );
}

function AntetEmagSchelet() {
  return (
    <AntetMarketplace
      id="emag"
      titlu={TITLU}
      descriere={DESCRIERE}
      panou={panouEmag()}
      stari={<Skeleton className="h-6 w-44 rounded-md" />}
      fapte={<FapteMarketplaceSchelet />}
    />
  );
}

async function AntetEmag({ businessId }: { businessId: string }) {
  const stare = await stareaEmag(businessId);

  if ("error" in stare) {
    return (
      <AntetMarketplace
        id="emag"
        titlu={TITLU}
        descriere={DESCRIERE}
        panou={panouEmag()}
        stari={<EtichetaStare ton="rau">Starea contului nu s-a putut citi</EtichetaStare>}
      />
    );
  }

  const conectat = stare.connected && !stare.needsReconnect;
  const poze = conectat ? await pozeleDePeEmag(businessId) : [];
  const ramase = stare.oferte.total - poze.length;

  return (
    <AntetMarketplace
      id="emag"
      titlu={TITLU}
      descriere={DESCRIERE}
      panou={panouEmag(stare.connected ? stare.tara : "ro")}
      stari={<StariEmag stare={stare} />}
      fapte={<FapteMarketplace fapte={fapteEmag(stare)} />}
      vitrina={
        <VitrinaMarketplace
          titlu="Pe eMAG acum"
          poze={poze}
          rest={ramase > 0 ? `și încă ${pluralRo(ramase, "ofertă", "oferte")}` : null}
          legatura={{ href: "#oferte", text: "Vezi ofertele" }}
        />
      }
    />
  );
}

/** Etichetele de sub descriere: o stare a contului, apoi ce merita stiut dintr-o privire. */
function StariEmag({ stare }: { stare: StareEmag }) {
  if (!stare.globallyEnabled) return <EtichetaStare ton="neutru">Indisponibilă momentan</EtichetaStare>;
  if (!stare.iesireConfigurata) return <EtichetaStare ton="asteptare">În pregătire</EtichetaStare>;
  if (!stare.connected) return <EtichetaStare ton="neutru">Neconectat</EtichetaStare>;
  if (stare.needsReconnect) return <EtichetaStare ton="rau">eMAG a refuzat acreditările</EtichetaStare>;
  return (
    <>
      <EtichetaStare ton="bun">Conectat</EtichetaStare>
      {/* ⚠ Ton NEUTRU: tara contului nu e o stare buna sau rea, e o identificare. */}
      <EtichetaStare ton="neutru">{stare.taraEticheta}</EtichetaStare>
      <EtichetaStare ton={stare.autoSync ? "bun" : "asteptare"}>
        {stare.autoSync ? "Sincronizare automată pornită" : "Sincronizare automată oprită"}
      </EtichetaStare>
      {stare.lipsaPentruPublicare && <EtichetaStare ton="asteptare">Publicarea nu e pregătită</EtichetaStare>}
    </>
  );
}

const NUMAR = new Intl.NumberFormat("ro-RO");

/**
 * Banda de sub antet. Conectat: contul, cand s-a citit ultima oara, comenzile instant si categoriile.
 * Neconectat: ce face integrarea, in patru randuri, ca sa stie de ce merita conectata.
 *
 * ⚠ Cifrele ofertelor NU stau aici: au cartonasele lor (`CardStatistica`) in fila „Prezentare”, cerute
 * de proprietar pe 22.09.2026 la fel ca pe Panou. Repetate in antet, ar fi fost doua randuri cu
 * aceleasi numere.
 */
function fapteEmag(stare: StareEmag): FaptMarketplace[] {
  if (!stare.connected) {
    return [
      { eticheta: "Țări", valoare: "România, Bulgaria, Ungaria", detaliu: "Câte un cont pentru fiecare." },
      { eticheta: "Comenzi", valoare: "Intră singure", detaliu: "Din minut în minut, în Comenzi." },
      { eticheta: "Stoc și preț", valoare: "Pleacă singure", detaliu: "La fiecare vânzare sau modificare." },
      { eticheta: "Facturi", valoare: "Urcate la eMAG", detaliu: "După ce le emiți în Edinio." },
    ];
  }
  return [
    {
      eticheta: "Contul",
      valoare: <span className="font-mono">{stare.username ?? "fără utilizator"}</span>,
      detaliu: `${stare.taraEticheta} · ${stare.moneda}`,
    },
    {
      eticheta: "Ultima sincronizare",
      valoare: stare.ultimaSincronizare ? acumCatTimp(stare.ultimaSincronizare) : "Încă niciodată",
      detaliu: "Comenzile se citesc din minut în minut.",
    },
    {
      eticheta: "Comenzi instant",
      valoare: stare.ultimulWebhook ? "Pornite" : "Nepornite",
      detaliu: stare.ultimulWebhook
        ? `Ultimul semnal: ${acumCatTimp(stare.ultimulWebhook)}`
        : "Opțional: comenzile vin oricum, din minut în minut.",
    },
    {
      eticheta: "Categorii legate",
      valoare: NUMAR.format(stare.categoriiMapate),
      detaliu: stare.categoriiMapate === 0 ? "Fără ele nu se publică nimic." : "Produsele din ele se pot publica.",
    },
  ];
}

/**
 * Cateva poze din ofertele care sunt pe eMAG acum, pentru banda din antet.
 *
 * ⚠ Cu clientul COMERCIANTULUI: `emag_offers` are politica de citire a proprietarului, iar
 * `business_id` tine interogarea in magazinul lui. O citire cazuta nu strica pagina: banda lipseste,
 * atat. Pozele (prima a fiecarui produs, fara dubluri) le alege `pozeleVitrinei`.
 */
async function pozeleDePeEmag(businessId: string): Promise<{ src: string; alt: string }[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("emag_offers")
      .select("product_id, products(name, images)")
      .eq("business_id", businessId)
      .eq("status", "live")
      .not("product_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(24);
    if (error) {
      console.error("[emag] pozele din antet", error.message);
      return [];
    }
    return pozeleVitrinei(data);
  } catch (e) {
    console.error("[emag] pozele din antet", (e as Error).message);
    return [];
  }
}

/**
 * ⚠ FORMA SCHELETULUI E CHIAR FORMA PAGINII: bara filelor, randul de cifre, apoi panourile. Un
 * dreptunghi oarecare tinea locul unei pagini care nu arata deloc asa, iar la asezare continutul sarea.
 */
function ScheletEmag() {
  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-border pb-3">
        {["w-24", "w-20", "w-20", "w-20", "w-20", "w-16", "w-16"].map((w, i) => <Skeleton key={i} className={`h-5 rounded-md ${w}`} />)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px] rounded-xl sm:h-[168px]" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

async function ContinutEmag({ businessId }: { businessId: string }) {
  const stare = await stareaEmag(businessId);
  const status = "error" in stare ? null : stare;

  /*
   * Fara file cand nu e nimic de facut in ele: contul neconectat (formularul de conectare, cu adresa
   * IP), integrarea oprita de noi sau releul de IP fix nepus. In ultimele doua, ecranul spune ca nu e
   * nimic de facut din contul lui; opt file care toate repeta asta ar fi parut un ecran stricat.
   */
  if (!status?.connected || !status.globallyEnabled || !status.iesireConfigurata) {
    return <EmagClient businessId={businessId} status={status} parte="prezentare" />;
  }

  /*
   * ⚠ FILELE CU DATE DE LA eMAG APAR NUMAI CU UN CONT CARE MERGE, si nu din cochetarie.
   * Ecranele lor cer nomenclatoarele de la eMAG la montare: fara acreditari bune, fiecare
   * deschidere ar fi pornit apeluri care se intorc cu 401, iar comerciantul ar fi vazut
   * ecrane care se invart si o eroare fara legatura cu ce are de facut, adica sa
   * reconecteze contul. Cu `needsReconnect` raman „Prezentare” (care o spune) si „Setări”.
   */
  const merge = !status.needsReconnect;

  const file: FilaMarketplace[] = [
    {
      id: "prezentare",
      titlu: "Prezentare",
      continut: <EmagClient businessId={businessId} status={status} parte="prezentare" />,
    },
    ...(merge ? [
      {
        id: "oferte",
        titlu: "Oferte",
        numar: status.oferte.total,
        continut: (
          <>
            {/* ⚠ Centrul de probleme DEASUPRA listei, si se ascunde singur cand nu e nimic: rostul
                lui e sa scuteasca citirea listei rand cu rand. */}
            <EmagProbleme businessId={businessId} />
            {/* ⚠ Inaintea listei, si se ascunde singur cand tot catalogul e publicat: cine intra
                prima data are catalogul intreg aici, iar lista de oferte e goala. */}
            <EmagDePublicat businessId={businessId} />
            <EmagListings businessId={businessId} />
          </>
        ),
      },
      {
        id: "categorii",
        titlu: "Categorii",
        numar: status.categoriiMapate,
        continut: <EmagCategoryMapping businessId={businessId} />,
      },
      { id: "retururi", titlu: "Retururi", continut: <EmagReturns businessId={businessId} cuGol /> },
      { id: "campanii", titlu: "Campanii", continut: <EmagCampanii businessId={businessId} /> },
      { id: "facturi", titlu: "Facturi", continut: <EmagFacturiLor businessId={businessId} /> },
    ] : []),
    {
      id: "setari",
      titlu: "Setări",
      /* Punctul de atentie: fara TVA si zilele de expediere nu se publica nimic, iar blocul e aici. */
      atentie: lipsesteDinSetari(status),
      continut: <EmagClient businessId={businessId} status={status} parte="setari" />,
    },
    /* ⚠ Ultima: nu e un ecran de zi cu zi, se deschide cand ceva pare ca n-a plecat. */
    ...(merge ? [{ id: "jurnal", titlu: "Jurnal", continut: <EmagJurnal businessId={businessId} /> }] : []),
  ];

  return <FileMarketplace file={file} eticheta="Secțiunile integrării eMAG" />;
}
