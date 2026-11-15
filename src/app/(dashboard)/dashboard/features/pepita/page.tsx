import { cache, Suspense } from "react";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Callout } from "@/components/ui/callout";
import { Skeleton } from "@/components/ui/skeleton";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { PepitaClient, type PartePepita } from "@/components/dashboard/PepitaClient";
import {
  AntetMarketplace, FapteMarketplace, FapteMarketplaceSchelet, VitrinaMarketplace, type FaptMarketplace,
} from "@/components/dashboard/integrare/AntetMarketplace";
import { FileMarketplace, type FilaMarketplace } from "@/components/dashboard/integrare/FileMarketplace";
import { getStarePepita, type StarePepita } from "@/lib/actions/pepita.actions";
import { PIETE, type PiataPepita } from "@/lib/pepita/types";
import { pozeleVitrinei } from "@/lib/marketplace/vitrina";
import { acumCatTimp, formatDateShort, pluralRo } from "@/lib/utils/format";

/**
 * Pepita, refacuta „premium” pe 15.11.2026 ca eMAG (cerut de proprietar: „fa si la restul”): antet cu sigla
 * mare si starea legaturii (`AntetMarketplace`), apoi file (`FileMarketplace`): Prezentare, Produse, Comenzi,
 * Feeduri, Setări.
 *
 * ⚠ PEPITA N-ARE CONT CU PAROLA: legatura e un feed pe care il citesc ei. Antetul spune deci numai ce STIM
 * (feedul a fost citit, adresele sunt trimise), niciodata „conectat la Pepita”: n-avem nicio cale prin care
 * sa aflam ca au acceptat legatura. Aceeasi regula ca in ecran (`poarta-si-panou.test.ts`).
 */

const TITLU = "Pepita";
const DESCRIERE = "Trimite produsele și stocul către marketplace-ul Pepita și primește comenzile automat în Edinio.";

const starea = cache((businessId: string) => getStarePepita(businessId));

export default async function PepitaPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  /*
   * ⚠ O CITIRE CAZUTA NU E „n-ai magazin". Citita numai `data`, o pana de baza ar
   * trimite comerciantul inapoi in `/dashboard` fara niciun cuvant, adica exact ce
   * se intampla daca magazinul chiar nu exista. `maybeSingle`, fiindca `single`
   * face din zero randuri o eroare.
   */
  const { data: biz, error } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).maybeSingle();
  if (error) throw new Error("Nu am putut citi magazinul. Încearcă din nou peste câteva momente.");
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-4 pb-16 sm:p-6 sm:pb-16">
      <Suspense fallback={<AntetPepitaSchelet />}>
        <AntetPepita businessId={biz.id} />
      </Suspense>
      <Suspense fallback={<ScheletPepita />}>
        <ContinutPepita businessId={biz.id} />
      </Suspense>
    </div>
  );
}

function AntetPepitaSchelet() {
  return (
    <AntetMarketplace
      id="pepita"
      titlu={TITLU}
      descriere={DESCRIERE}
      stari={<Skeleton className="h-6 w-44 rounded-md" />}
      fapte={<FapteMarketplaceSchelet />}
    />
  );
}

/** Pietele pornite, in ordinea din `PIETE`. */
function pieteActive(stare: StarePepita): PiataPepita[] {
  return (Object.keys(PIETE) as PiataPepita[]).filter((p) => stare.config.piete?.[p]?.activa);
}

async function AntetPepita({ businessId }: { businessId: string }) {
  const stare = await starea(businessId);
  if ("error" in stare) {
    return (
      <AntetMarketplace
        id="pepita"
        titlu={TITLU}
        descriere={DESCRIERE}
        stari={<EtichetaStare ton="rau">Starea legăturii nu s-a putut citi</EtichetaStare>}
      />
    );
  }
  const poze = stare.config.activ ? await pozeleDinFeed(businessId, stare.config.mod_includere) : [];
  const ramase = (stare.produseAlese ?? 0) - poze.length;
  return (
    <AntetMarketplace
      id="pepita"
      titlu={TITLU}
      descriere={DESCRIERE}
      stari={<StariPepita stare={stare} />}
      fapte={<FapteMarketplace fapte={faptePepita(stare)} />}
      vitrina={
        <VitrinaMarketplace
          titlu="În feedul Pepita"
          poze={poze}
          rest={ramase > 0 ? `și încă ${pluralRo(ramase, "produs", "produse")}` : null}
          legatura={{ href: "#produse", text: "Vezi produsele" }}
        />
      }
    />
  );
}

/** ⚠ Numai ce stim: citirea feedului e un fapt, „conectat” ar fi o presupunere. */
function StariPepita({ stare }: { stare: StarePepita }) {
  const c = stare.config;
  if (!c.activ) return <EtichetaStare ton="neutru">Oprită</EtichetaStare>;
  const gata = c.areFeedToken && c.areOrderKey;
  return (
    <>
      {!gata
        ? <EtichetaStare ton="asteptare">Adresele nu sunt gata</EtichetaStare>
        : stare.produseAlese === 0
          ? <EtichetaStare ton="rau">Feed gol</EtichetaStare>
          : stare.ultimaCitire
            ? <EtichetaStare ton="bun">Pepita citește feedul</EtichetaStare>
            : <EtichetaStare ton="asteptare">Configurat în Edinio</EtichetaStare>}
      <EtichetaStare ton={c.trimis_la ? "neutru" : "asteptare"}>
        {c.trimis_la ? "Adrese trimise la Pepita" : "Adrese netrimise"}
      </EtichetaStare>
    </>
  );
}

/**
 * Banda de sub antet. Pornita: feedul, tarile, ce produse pleaca si adresele. Oprita: ce face integrarea.
 * ⚠ Cifrele (produse in feed, comenzi) raman in cartonasele din fila „Prezentare” (`CardStatistica`).
 */
function faptePepita(stare: StarePepita): FaptMarketplace[] {
  const c = stare.config;
  if (!c.activ) {
    return [
      { eticheta: "Legătura", valoare: "Prin feed", detaliu: "Pepita citește produsele de la noi." },
      { eticheta: "Țări", valoare: pluralRo(Object.keys(PIETE).length, "piață", "piețe"), detaliu: "Câte un feed pe țară." },
      { eticheta: "Stoc", valoare: "Citit des", detaliu: "De obicei o dată pe oră." },
      { eticheta: "Comenzi", valoare: "Intră singure", detaliu: "Confirmarea se face în Pepita Admin." },
    ];
  }
  const piete = pieteActive(stare);
  return [
    {
      eticheta: "Feedul",
      valoare: stare.ultimaCitire ? `Citit ${acumCatTimp(stare.ultimaCitire)}` : "Încă necitit",
      detaliu: "Frecvența o stabilește Pepita.",
    },
    {
      eticheta: "Țări",
      valoare: piete.length > 0 ? pluralRo(piete.length, "țară", "țări") : "Niciuna pornită",
      detaliu: piete.length > 0 ? piete.map((p) => PIETE[p].eticheta).join(", ") : "Se pornesc în fila Feeduri.",
    },
    {
      eticheta: "Ce pleacă",
      valoare: c.mod_includere === "toate" ? "Toate produsele active" : "Doar cele alese",
      detaliu: c.mod_includere === "toate" ? "În afară de cele scoase de tine." : "Le bifezi în fila Produse.",
    },
    {
      eticheta: "Adresele",
      valoare: c.trimis_la ? "Trimise la Pepita" : "Netrimise",
      detaliu: c.trimis_la ? `Pe ${formatDateShort(c.trimis_la)}.` : "Le găsești în fila Feeduri.",
    },
  ];
}

/**
 * Cateva poze din produsele care pleaca in feed, pentru banda din antet, dupa alegerea din „Ce produse
 * pleacă pe Pepita”: pe „toate”, produsele active fara cele scoase; pe „selectate”, cele bifate. O citire
 * cazuta nu strica pagina.
 */
async function pozeleDinFeed(businessId: string, mod: "toate" | "selectate"): Promise<{ src: string; alt: string }[]> {
  try {
    const supabase = await createClient();
    if (mod === "selectate") {
      const { data, error } = await supabase
        .from("pepita_listari")
        .select("product_id, products!inner(name, images, is_active)")
        .eq("business_id", businessId)
        .eq("inclus", true)
        .eq("products.is_active", true)
        .limit(24);
      if (error) {
        console.error("[pepita] pozele din antet", error.message);
        return [];
      }
      return pozeleVitrinei(data);
    }
    const [scoase, produse] = await Promise.all([
      supabase.from("pepita_listari").select("product_id").eq("business_id", businessId).eq("inclus", false).limit(1000),
      supabase.from("products").select("id, name, images")
        .eq("business_id", businessId).eq("is_active", true)
        .order("updated_at", { ascending: false }).limit(40),
    ]);
    if (scoase.error || produse.error) {
      console.error("[pepita] pozele din antet", (scoase.error ?? produse.error)?.message);
      return [];
    }
    const afara = new Set((scoase.data ?? []).map((r) => r.product_id));
    return pozeleVitrinei(
      (produse.data ?? [])
        .filter((p) => !afara.has(p.id))
        .map((p) => ({ product_id: p.id, products: { name: p.name, images: p.images } })),
    );
  } catch (e) {
    console.error("[pepita] pozele din antet", (e as Error).message);
    return [];
  }
}

/** ⚠ Forma scheletului e chiar forma paginii: bara filelor, randul de cifre, apoi panourile. */
function ScheletPepita() {
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

async function ContinutPepita({ businessId }: { businessId: string }) {
  const stare = await starea(businessId);

  if ("error" in stare) {
    /*
     * ⚠ SE SPUNE, nu se arata un panou gol. Un ecran fara nimic pe el se citeste
     * „integrarea nu e pornita", iar comerciantul ar apasa „Pornește" peste o
     * integrare care poate exista deja.
     */
    return (
      <Callout variant="danger" icon={AlertTriangle}>
        {stare.error} Reîncarcă pagina peste câteva momente.
      </Callout>
    );
  }

  const ecran = (parte: PartePepita) => <PepitaClient businessId={businessId} stare={stare} parte={parte} />;

  /* Integrarea oprita: cerintele si pornirea, fara file. */
  if (!stare.config.activ) return ecran("prezentare");

  const file: FilaMarketplace[] = [
    { id: "prezentare", titlu: "Prezentare", continut: ecran("prezentare") },
    {
      id: "produse",
      titlu: "Produse",
      numar: stare.produseAlese,
      /* Feedul gol: nimic nu pleaca, iar fila Produse e locul unde se alege. */
      atentie: stare.produseAlese === 0,
      continut: ecran("produse"),
    },
    {
      id: "comenzi",
      titlu: "Comenzi",
      numar: stare.comenziTotal,
      atentie: (stare.comenziCarantina ?? 0) > 0,
      continut: ecran("comenzi"),
    },
    {
      id: "feeduri",
      titlu: "Feeduri",
      atentie: !stare.config.trimis_la,
      continut: ecran("feeduri"),
    },
    { id: "setari", titlu: "Setări", continut: ecran("setari") },
  ];

  return <FileMarketplace file={file} eticheta="Secțiunile integrării Pepita" />;
}
