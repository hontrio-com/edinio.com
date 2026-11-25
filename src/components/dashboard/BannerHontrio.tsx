import { Suspense } from "react";
import Image from "next/image";
import { ArrowUpRight, EllipsisVertical, ShoppingBag, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GrilaPalpaitoare } from "@/components/dashboard/GrilaPalpaitoare";
import {
  adresaAplicatieiHontrio, adresaContNouHontrio, adresaPrezentareHontrio, CE_FACE_HONTRIO, pretCaInGoogle,
  PRODUSE_STANDARD, produseleBannerului, type ProdusDeExemplu,
} from "@/lib/parteneri/hontrio";

/*
  ═══════════════════════════════════════════════════════════════════════════
  BANNERUL HONTRIO DIN CAPUL PAGINII DE INTEGRARI                 (24.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de proprietar: un banner „in prim plan" pentru cine vrea sa-si promoveze
  magazinul, cu fundalul negru de pe site-ul Hontrio.

  ⚠ APARE LA TOATA LUMEA (25.11.2026), si la magazinele deja conectate la Hontrio.
  Prima forma il ascundea celor conectati; proprietarul: „era un banner promotional
  practic, ar trebui sa apara la toata lumea”. Celui conectat (`conectat`) butonul
  principal ii deschide aplicatia lor, „Deschide Hontrio”: are deja cont, deci
  „Creează cont” ar fi fost un indemn fals. Restul bannerului e acelasi.

  ═══ DE UNDE VINE FIECARE LUCRU ═══

  FUNDALUL e panoul de la sfarsitul paginii lor („Arată-ți produsele…",
  `components/site/cta.tsx` in proiectul Hontrio): negru `#0a0a0a`, patratele
  care palpaie, o lumina moale sus si o muchie alba subtire. Aceleasi valori.

  TEXTELE sunt ale lor, de pe site, nu scrise de mine: ce face (`CE_FACE_HONTRIO`)
  si „Cum funcționează" (numele sectiunii la care duce). Titlul e al nostru, si e
  chiar eticheta butonului din bara de sus, ca omul sa lege cele doua locuri.

  ⚠ BUTONUL PRINCIPAL NU SPUNE „Creează cont gratuit", cum spune la ei. Aici e
  panoul Edinio, unde testarea gratuita a fost scoasa (12.10.2026) si unde o
  proba (`fara-testare-gratuita.test.ts`) nu mai lasa niciun text sa promita un
  „cont gratuit". Pe buna dreptate si in cazul asta: citit in panou, „cont
  gratuit" putea fi luat drept contul Edinio. „Creează cont pe Hontrio" spune al
  cui e contul. Proba a prins prima forma; nu i s-a adaugat nicio exceptie.

  DREAPTA e o reproducere a blocului „Produse promovate" din cautarea Google, cu
  dimensiunile si culorile masurate de ei pe pagina reala (`google-sim.tsx`, tot
  la ei): card de 130 pe 304, titlu albastru `#1a0dab`, pret ingrosat. Aici e
  aratata la 88% (`text-[8.8px]`, totul in `em`), cu PRODUSELE MAGAZINULUI in ea.

  ⚠ DE CE PRODUSELE LUI, SI NU NISTE POZE DE CATALOG. Un banner cu forme abstracte
  nu spune nimic (lectia de la bannerele tbi). Cu propriile produse, omul vede
  exact ce i se propune: marfa lui, intr-o reclama de pe Google.

  ⚠ CAND N-ARE INCA TREI PRODUSE CU POZA, apar cele standard (`PRODUSE_STANDARD`),
  cerut de proprietar dupa prima versiune, care lasa atunci bannerul doar cu
  textul. Tot standard iese si cand citirea produselor cade.

  ⚠ E UN EXEMPLU, SI SCRIE CA E. Deasupra reproducerii sta „Exemplu cu produsele
  tale": fara eticheta, ar parea o captura a unor reclame care ruleaza deja. Peste
  produsele standard eticheta e „Exemplu de reclame": acelea nu sunt ale lui, si
  nu i se spune ca ar fi.

  ═══ ⚠ DE CE `Suspense`, SI DE CE PRODUSELE SE CITESC AICI, NU IN PAGINA ═══

  Pagina de Integrari e cea la care comerciantul se intoarce dupa fiecare
  integrare, iar drumurile ei catre baza au fost numarate (vezi nota de la
  `gmcAvailable`, acolo). O citire de produse pusa in corpul paginii ar fi
  intarziat TOATA pagina pentru un decor. Aici, textul bannerului pleaca odata cu
  pagina, iar produsele vin pe flux cand sunt gata.

  ⚠ CAT SE ASTEAPTA NU SE ARATA NIMIC IN LOCUL LOR, nici macar produsele standard:
  ar fi aparut o clipa si ar fi fost inlocuite cu ale lui, adica exact palpaitul
  care face o pagina sa para nesigura.

  ⚠ SI NU MISCA NIMIC CAND SOSESC: reproducerea e asezata absolut, in locul pe care
  coloana de text i-l lasa oricum liber. Inainte si dupa, inaltimea e aceeasi.

  ═══ ⚠ LATIMEA SE MASOARA PE BANNER, NU PE ECRAN ═══

  Bannerul sta in coloana paginii (`max-w-4xl`), langa bara laterala, deci
  latimea lui nu urmeaza pragurile ecranului. Masurat: la 1024 px de ecran are
  730, la 1280 are 848, iar la 900 (fara bara laterala) are 846. De aceea
  reproducerea se arata prin interogare de container (`@[52rem]`), adica de la
  832 px ai BANNERULUI. Sub atat, textului i-ar fi ramas ~260 px si titlul s-ar
  fi rupt pe trei randuri; acolo bannerul ramane doar cu textul (266 px inalt,
  fata de 299 cu reproducerea).
*/

/** Fontul rezultatelor Google. Interfata lor e in Google Sans, dar rezultatele sunt in Arial. */
const FONT_GOOGLE = { fontFamily: "Arial, Helvetica, sans-serif" } as const;

const INEL_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]";

export function BannerHontrio({ businessId, conectat = false }: {
  businessId: string | null;
  /** Magazinul e deja legat de Hontrio: butonul principal deschide aplicatia, nu formularul de cont nou. */
  conectat?: boolean;
}) {
  return (
    <section
      aria-labelledby="titlu-banner-hontrio"
      className="@container relative isolate mb-8 overflow-hidden rounded-2xl bg-[#0a0a0a] text-white"
    >
      {/*
        Masca ascunde patratelele in spatele textului (stanga) si le lasa la vedere
        spre margini, ca la ei: acolo masca e centrata, fiindca textul e la mijloc.
      */}
      <GrilaPalpaitoare
        opacitateMaxima={0.22}
        sansa={0.3}
        className="[mask-image:radial-gradient(ellipse_75%_95%_at_22%_50%,transparent_25%,black_80%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 left-0 h-56 w-[34rem] rounded-full bg-white/[0.08] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.25),inset_0_0_0_1px_rgba(255,255,255,0.06)]"
      />

      <div className="relative p-6 sm:p-7 @[52rem]:pr-[27.5rem]">
        {/* Cuvantul „HONTRIO", fisierul lor. E negru pe fond gol; `invert` il face alb, cum il arata si ei pe negru. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/integrations/hontrio-text.png"
          alt="Hontrio"
          width={772}
          height={106}
          className="h-5 w-auto invert"
        />

        <h2
          id="titlu-banner-hontrio"
          className="mt-5 text-[1.75rem] font-bold leading-[1.08] tracking-[-0.04em] text-balance"
        >
          Promovează-ți magazinul{" "}
          {/*
            A doua parte in degrade, de la alb la gri, ca titlurile lor pe fond inchis.
            Pe bannerul lat sta pe randul ei (`block`): masurat, prima parte are ~316 px
            din cei 380 ai coloanei, iar `text-balance` singur rupea dupa „Promovează-ți".
          */}
          <span className="bg-gradient-to-b from-white via-neutral-200 to-neutral-500 bg-clip-text pb-[0.08em] text-transparent @[52rem]:block">
            pe Google.
          </span>
        </h2>

        <p className="mt-3 max-w-md text-sm leading-relaxed text-pretty text-white/65">
          {CE_FACE_HONTRIO} Catalogul și comenzile le citește direct din Edinio.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <a
            href={conectat ? adresaAplicatieiHontrio("banner-integrari") : adresaContNouHontrio("banner-integrari")}
            target="_blank"
            rel="noopener noreferrer"
            className={`group relative inline-flex h-9 items-center gap-1.5 overflow-hidden rounded-full bg-white px-4 text-[13px] font-semibold text-black shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] transition-transform hover:scale-[1.02] motion-reduce:hover:scale-100 ${INEL_FOCUS}`}
          >
            {/* Lumina care trece peste buton la hover, ca la butonul lor alb. */}
            <span
              aria-hidden="true"
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/10 to-transparent transition-transform duration-700 group-hover:translate-x-full motion-reduce:hidden"
            />
            <span className="relative">{conectat ? "Deschide Hontrio" : "Creează cont pe Hontrio"}</span>
            <ArrowUpRight className="relative h-4 w-4" aria-hidden="true" />
            <span className="sr-only"> (se deschide într-o filă nouă)</span>
          </a>
          <a
            href={adresaPrezentareHontrio("banner-integrari", "how")}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex h-9 items-center rounded-full border border-white/25 bg-white/5 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/15 ${INEL_FOCUS}`}
          >
            Cum funcționează
            <span className="sr-only"> (se deschide într-o filă nouă)</span>
          </a>
        </div>
      </div>

      {businessId ? (
        <Suspense fallback={null}>
          <ReclameleMagazinului businessId={businessId} />
        </Suspense>
      ) : (
        /* Fara magazin nu e ce citi: produsele standard, pe loc. */
        <ExempluReclame produse={PRODUSE_STANDARD} aleMagazinului={false} />
      )}
    </section>
  );
}

/**
 * Citeste produsele magazinului si le arata ca reclame Google Shopping; cand n-are
 * trei cu poza, le arata pe cele standard (vezi `produseleBannerului`).
 *
 * ⚠ O CITIRE CAZUTA INSEAMNA PRODUSELE STANDARD, nu o pagina picata si nu un mesaj
 * de eroare: e un decor, iar textul si butoanele de langa el merg oricum.
 */
async function ReclameleMagazinului({ businessId }: { businessId: string }) {
  let randuri: Parameters<typeof produseleBannerului>[0] = [];
  try {
    const supabase = await createClient();
    /*
      Douasprezece, ca sa ramana trei dupa ce cad cele fara poza.

      Ordinea e cea in care isi arata el insusi marfa in magazin: intai produsele
      scoase in fata (`is_featured`), apoi asezarea lui (`sort_order`). La fel
      citesc paginile vitrinei si alegatorul de produse (`resolve-products.ts`).

      ⚠ Citirea trece prin toate produsele active ale magazinului ca sa le aseze
      (indexul e pe `business_id, is_active`, nu pe ordine). De aceea sta sub
      `Suspense`, nu in corpul paginii: la un catalog mare, pagina nu o asteapta.

      ⚠ ULTIMELE DOUA CRITERII SUNT DE DEPARTAJARE, si nu sunt de prisos. Pe magazinul
      demo, sase produse scoase in fata au toate `sort_order` 0: fara departajare,
      baza le intoarce in ce ordine vrea. Vazut pe 24.11.2026: aceeasi asezare,
      ceruta o data in SQL si o data prin API, a pus in fata alte trei produse. Un
      exemplu care isi poate schimba produsele de la o deschidere la alta pare
      stricat. Intai cele mai noi, ca in lista de produse din panou, apoi `id`, ca
      sa nu ramana nicio egalitate.
    */
    const { data } = await supabase
      .from("products")
      .select("id, name, price, compare_at_price, images")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("sort_order")
      .order("created_at", { ascending: false })
      .order("id")
      .limit(12);
    randuri = data ?? [];
  } catch {
    randuri = [];
  }
  return <ExempluReclame {...produseleBannerului(randuri)} />;
}

/**
 * Blocul „Produse promovate" din cautarea Google, cu trei produse in el.
 *
 * ⚠ ETICHETA SE ALEGE DUPA ALE CUI SUNT PRODUSELE. „Exemplu cu produsele tale" peste
 * produsele standard ar fi o minciuna mica, dar chiar pe randul care spune ca
 * reproducerea e cinstita. Acelasi lucru pentru numele citit de cititoarele de ecran.
 */
function ExempluReclame({
  produse,
  aleMagazinului,
}: {
  produse: readonly ProdusDeExemplu[];
  aleMagazinului: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={
        aleMagazinului
          ? "Exemplu: trei produse din magazinul tău, arătate ca reclame în căutarea Google."
          : "Exemplu: trei produse arătate ca reclame în căutarea Google."
      }
      className="absolute inset-y-0 right-6 hidden w-[44.2em] flex-col text-[8.8px] @[52rem]:flex"
    >
      <p aria-hidden="true" className="flex h-11 flex-shrink-0 items-center text-[11px] text-white/55">
        {aleMagazinului ? "Exemplu cu produsele tale" : "Exemplu de reclame"}
      </p>

      {/*
        Foaia alba: bucata din pagina de rezultate Google. Coboara pana in marginea
        de jos a bannerului si e taiata de ea, ca o fereastra care se continua.
      */}
      <div
        aria-hidden="true"
        style={FONT_GOOGLE}
        className="min-h-0 flex-1 overflow-hidden rounded-t-[1.4em] bg-white px-[1.6em] pt-[1.5em] text-[#202124] shadow-[0_-1.2em_4em_-1em_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-[1.2em]">
          <span className="grid size-[2.6em] flex-shrink-0 place-items-center rounded-full bg-[#f1f3f4]">
            <ShoppingBag className="size-[1.4em] text-[#5f6368]" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[1.4em] leading-[1.2] text-[#16171a]">Produse promovate</p>
            <p className="truncate text-[1.2em] leading-[1.35] text-[#4e5059]">Din magazine online sau locale</p>
          </div>
          <EllipsisVertical className="size-[1.4em] flex-shrink-0 text-[#4e5059]" />
        </div>

        <div className="mt-[1.3em] flex gap-[1em]">
          {produse.map((p) => (
            <CardReclama key={p.id} produs={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Un card din „Produse promovate", la proportiile Google (130 pe 304, la 10 px pe `em`). */
function CardReclama({ produs }: { produs: ProdusDeExemplu }) {
  const redus = produs.pretVechi !== null;
  return (
    <div className="flex h-[30.4em] w-[13em] flex-shrink-0 flex-col overflow-hidden rounded-[0.8em] border border-[#dadce0] bg-white pb-[0.6em]">
      <div className="relative h-[12.2em] w-full flex-shrink-0 overflow-hidden bg-[#f4f4f4]">
        {/*
          ⚠ 128, O LATIME DE PE SCARA CASEI (`LATIMI_MICI`), nu una „doar pentru
          locul asta": o latime noua inseamna o varianta noua de taiat pentru
          fiecare poza careia i se cere. La densitate 2, Next cere 256, tot de pe scara.
        */}
        <Image
          src={produs.imagine}
          alt=""
          width={128}
          height={128}
          className="h-full w-full object-cover"
        />
        {redus && (
          <span className="absolute left-[0.8em] top-[0.8em] rounded-[0.4em] bg-white px-[0.6em] py-[0.25em] shadow-[0_0.1em_0.2em_rgba(0,0,0,0.12)]">
            <span className="block text-[1.05em] font-bold uppercase leading-none tracking-[0.03em] text-[#16171a]">
              Reduceri
            </span>
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-[0.8em] pt-[0.9em]">
        <p className="line-clamp-2 text-[1.4em] leading-[1.571] text-[#1a0dab]">{produs.nume}</p>
        <p className="flex h-[2.2em] items-center gap-[0.4em] overflow-hidden whitespace-nowrap">
          <span className={`text-[1.4em] font-bold ${redus ? "text-[#146c2e]" : "text-[#16171a]"}`}>
            {pretCaInGoogle(produs.pret)}
          </span>
          {redus && (
            <span className="truncate text-[1.4em] text-[#656773] line-through">
              {pretCaInGoogle(produs.pretVechi as number)}
            </span>
          )}
        </p>
        <p className="flex h-[2.2em] items-center gap-[0.45em] overflow-hidden">
          <span className="grid size-[1.8em] flex-shrink-0 place-items-center rounded-full border border-black bg-black text-white">
            <Store className="size-[1.1em]" strokeWidth={2.2} />
          </span>
          <span className="truncate text-[1.4em] text-[#16171a]">Magazinul tău</span>
        </p>
      </div>
    </div>
  );
}
