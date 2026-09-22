"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { ChevronLeft, Layers, Loader2, Package, Plus, Save, Search, ShoppingCart, Sparkles, Tag, Trash2, X } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { createOffer, updateOffer, type OfferFormData, type OfferRow } from "@/lib/actions/offer.actions";
import {
  OFFER_DEFAULT_MAX_PRODUCTS, OFFER_MAX_CANTITATE, OFFER_MAX_PRODUCTS,
  METODE_RECOMANDARE, DESPRE_METODA, metodaRecomandarii, seAcceptaInFormular,
  type OfferType, type OfferScope, type OfferDiscountMode, type MetodaRecomandare,
} from "@/lib/offers/offer.types";
import { descriePerioada, perioadaOfertei, ziuaClipei } from "@/lib/zi-romaneasca";
import { TIPURI_DE_ALES, metaTip, type MetaTip } from "@/components/dashboard/oferte/tipuri-ui";
import { DESPRE_PORTI } from "@/lib/offers/porti";
import { AMPLASARI, DESPRE_AMPLASARE, type AmplasareSet } from "@/lib/offers/amplasare";
import type { ProdusPentruOferta } from "@/lib/offers/produse-pentru-formular";

/* ⚠ Chiar forma intoarsa de `produsePentruOferte`. Scrisa camp cu camp aici, s-ar
   fi putut desincroniza tacut de cea adevarata. */
type PickerProduct = ProdusPentruOferta;

const inputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * ⚠⚠ TIPURILE NU MAI SUNT SCRISE AICI. Erau patru, cu etichete, descrieri si
 * steaguri — a patra copie a aceleiasi liste, pe langa `OFFER_TYPES`,
 * `PHASE1_OFFER_TYPES` si `OFFER_TYPES_IMPLEMENTATE` (care n-avea niciun
 * cititor). Acum vin din tabelul comun, prin `tipuri-ui.ts`, care adauga doar
 * iconita.
 *
 * ⚠ `metaFor` cade pe `cross_sell` cand tipul nu e de ales: un rand vechi cu un
 * tip inca nefacut trebuie sa se poata deschide, nu sa rupa formularul.
 */
function metaFor(type: OfferType): MetaTip {
  return TIPURI_DE_ALES.find((p) => p.type === type) ?? metaTip("cross_sell");
}

export function OfferForm({ businessId, products, categories, offer }: {
  businessId: string;
  products: PickerProduct[];
  categories: { id: string; name: string }[];
  offer?: OfferRow;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const isEdit = !!offer;

  const [type, setType] = useState<OfferType>(offer?.type ?? "frequently_bought");
  const meta = metaFor(type);

  const [name, setName] = useState(offer?.name ?? "");
  const [scope, setScope] = useState<OfferScope>(offer?.trigger.scope ?? "products");
  const [triggerIds, setTriggerIds] = useState<string[]>(offer?.trigger.productIds ?? []);
  const [triggerCats, setTriggerCats] = useState<string[]>(offer?.trigger.categories ?? []);

  const [offeredIds, setOfferedIds] = useState<string[]>(offer?.config.productIds ?? []);
  /*
    ⚠⚠ METODA SE DERIVA din ce exista, nu se citeste crud: un rand vechi n-are
    campul, dar are `autoByCategory`. Vezi `metodaRecomandarii` — scrisa
    o singura data, chemata si de formular, si de vitrina.

    ⚠ `autoByCategory` RAMANE si se scrie din metoda: orice cod care inca il
    citeste primeste acelasi raspuns.
  */
  const [metoda, setMetoda] = useState<MetodaRecomandare>(
    offer ? metodaRecomandarii(offer.config) : "manual",
  );
  const autoByCategory = metoda !== "manual";
  const [excludeFaraStoc, setExcludeFaraStoc] = useState(offer?.config.excludeFaraStoc === true);
  const [maxProduse, setMaxProduse] = useState(offer?.config.maxProducts ?? OFFER_DEFAULT_MAX_PRODUCTS);

  const [discountMode, setDiscountMode] = useState<OfferDiscountMode>(
    offer?.config.discountMode ?? (offer ? "none" : "percent"),
  );
  const [discountPercent, setDiscountPercent] = useState(offer?.config.discountPercent != null ? String(offer.config.discountPercent) : "10");
  const [discountAmount, setDiscountAmount] = useState(offer?.config.discountAmount != null ? String(offer.config.discountAmount) : "");
  const [fixedPrice, setFixedPrice] = useState(offer?.config.fixedPrice != null ? String(offer.config.fixedPrice) : "");

  /* Pragurile de cantitate. Se tin ca text cat timp omul scrie: un `number`
     ar fi facut campul sa sara la 0 la prima stergere a cifrei. */
  const [praguri, setPraguri] = useState<{ min_qty: string; percent: string }[]>(
    offer?.config.praguri?.map((x) => ({ min_qty: String(x.min_qty), percent: String(x.percent) }))
      ?? [{ min_qty: "5", percent: "3" }, { min_qty: "10", percent: "10" }],
  );

  const [title, setTitle] = useState(offer?.config.title ?? "");
  const [isActive, setIsActive] = useState(offer?.is_active ?? true);

  /*
    ⚠⚠ PERIOADA LIPSEA CU TOTUL. Coloanele `starts_at` si `ends_at` existau in
    baza de la inceput, iar `loadActiveOffers` chiar le citea — dar formularul
    trimitea `starts_at: null, ends_at: null` scrise in cod. Deci nicio oferta
    nu se putea programa, si orice perioada pusa de mana in baza era stearsa la
    prima salvare din panou. Masurat pe productie la 22.09.2026: zero din 13
    oferte aveau perioada — nu fiindca nimeni n-ar fi vrut, ci fiindca nu se
    putea.

    ⚠ `ziuaClipei`, NU `slice(0, 10)` — aceeasi capcana ca la coduri: o oferta
    care porneste pe 1 octombrie se tine ca `2026-09-30T21:00:00Z`, iar taiata
    cu `slice` ar fi aratat „30 septembrie” si s-ar fi mutat cu o zi inapoi la
    FIECARE deschidere a editarii.
  */
  const [incepeIn, setIncepeIn] = useState<string | null>(ziuaClipei(offer?.starts_at));
  const [seIncheieIn, setSeIncheieIn] = useState<string | null>(ziuaClipei(offer?.ends_at));
  const [eroarePerioada, setEroarePerioada] = useState<string | null>(null);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  /*
    ⚠ Configuratia stricata se ARATA, nu se corecteaza in tacere. Aceeasi
    doctrina ca la upsell-ul de pe produs: serverul refuza oricum salvarea, dar
    comerciantul trebuie sa vada DE CE, nu doar ca „n-a mers".
  */
  const problemaPraguri = useMemo(() => {
    if (!metaFor(type).cuPraguri) return null;
    const curate = praguri
      .map((x) => ({ q: Math.floor(Number(x.min_qty) || 0), p: Number(x.percent) || 0 }))
      .filter((x) => x.q > 0 || x.p > 0);
    if (curate.length === 0) return "Adauga cel putin un prag.";
    for (const x of curate) {
      if (x.q < 2) return "Pragul porneste de la cel putin 2 bucati: la una nu e o reducere de cantitate.";
      if (x.p <= 0 || x.p >= 100) return "Reducerea trebuie sa fie intre 0 si 100 la suta.";
    }
    const dupaCantitate = [...curate].sort((a, b) => a.q - b.q);
    if (new Set(dupaCantitate.map((x) => x.q)).size !== dupaCantitate.length) {
      return "Doua praguri pornesc de la aceeasi cantitate. Sterge-l pe unul.";
    }
    for (let i = 1; i < dupaCantitate.length; i++) {
      if (dupaCantitate[i].p < dupaCantitate[i - 1].p) {
        return `Pragul de la ${dupaCantitate[i].q} bucati da ${dupaCantitate[i].p}%, mai putin decat `
          + `cel de la ${dupaCantitate[i - 1].q} (${dupaCantitate[i - 1].p}%). Cine cumpara mai mult ar `
          + "plati mai mult pe bucata.";
      }
    }
    return null;
  }, [type, praguri]);

  /*
    ═══ PORȚILE OFERTEI ═══

    „Se arată DOAR dacă…”. Patru, toate opționale, și nimic bifat înseamnă „se
    arată mereu” — adică exact ce fac azi cele 13 oferte de pe producție
    (măsurat: ZERO au porți puse).

    ⚠ Se țin ca `null` / listă goală, nu ca zero: „coșul trece de 0 lei” ar fi o
    poartă care trece mereu, dar TOT o poartă. Lipsa cheii e singurul fel de a
    spune „nu se cere nimic”. Vezi `lib/offers/porti.ts`.
  */
  const conditiiInitiale = offer?.trigger.conditions;
  const [poartaLei, setPoartaLei] = useState<number | null>(conditiiInitiale?.minValue ?? null);
  const [poartaBucati, setPoartaBucati] = useState<number | null>(conditiiInitiale?.minQty ?? null);
  const [poartaContine, setPoartaContine] = useState<string[]>(conditiiInitiale?.requiredProductIds ?? []);
  const [poartaNuContine, setPoartaNuContine] = useState<string[]>(conditiiInitiale?.excludedProductIds ?? []);
  /*
    ⚠ Secțiunea se arată doar la oferta de checkout, unde a cerut-o el. Regula
    din `porti.ts` se judecă însă pentru ORICE tip — un rând care ar avea porți
    puse de mână trebuie să le și primească, nu să le vadă ignorate în tăcere.
  */
  /*
    ⚠ PORȚILE SE ARATĂ LA TOATE CELE PATRU OFERTE DIN FORMULAR, nu doar la bump.
    Erau numai acolo fiindcă doar bump-ul exista; regula din `porti.ts` le-a
    judecat dintotdeauna pentru orice tip. Iar la cadou ele sunt CHIAR oferta:
    „peste 300 de lei, primești produsul X” se scrie ca o poartă pe lei.
  */
  const arataPorti = seAcceptaInFormular(type);

  /*
    ⚠ ASEZAREA SETULUI, ceruta de el. Implicita ramane cea de azi
    („sub_produs”), deci oferta care exista pe productie nu se muta de unde e.
    Se arata doar la tipurile care chiar pot sta langa pret — aceeasi regula
    o tine si parserul, ca un rand scris de mana sa nu bage o grila de carduri
    in caseta de cumparare.
  */
  const [amplasare, setAmplasare] = useState<AmplasareSet>(offer?.display.amplasare ?? "sub_produs");
  const arataAmplasarea = !!meta.sePoateAsezaLangaPret;

  /*
    ⚠ CANTITATILE DIN SET. Se tin doar pentru produsele care chiar sunt in set,
    si numai ce e mai mare decat unu pleaca la server: un set cu toate produsele
    intr-o bucata trimite acelasi jsonb ca pana azi.
  */
  const [cantitati, setCantitati] = useState<Record<string, number>>(offer?.config.cantitati ?? {});
  const arataCantitati = !!meta.cuCantitatiPeProdus;

  /*
    ═══ CELE TREI TIPURI NOI ═══

    ⚠ Toate trei se bifează în formularul de comandă, ca bump-ul, deci toate
    primesc și porțile. Erau arătate doar la bump fiindcă doar el exista; regula
    din `porti.ts` le-a judecat dintotdeauna pentru orice tip.
  */
  /** `upgrade`: produsul de pe care se face schimbul iese din comandă. */
  const [inlocuieste, setInlocuite] = useState(offer ? offer.config.inlocuieste !== false : true);
  /** `bogo`: câte bucăți se cumpără și câte se primesc. Text cât timp omul scrie. */
  const [cumperiBucati, setCumperiBucati] = useState(String(offer?.config.cumperiBucati ?? 2));
  const [primestiBucati, setPrimestiBucati] = useState(String(offer?.config.primestiBucati ?? 1));
  /** `gift`: cumpărătorul alege cadoul dintre produsele din listă. */
  const [cadouLaAlegere, setCadouLaAlegere] = useState(offer?.config.cadouLaAlegere === true);

  // Switch type (create mode only): reset the discount to the new type's default.
  function chooseType(t: OfferType) {
    const m = metaFor(t);
    setType(t);
    setDiscountMode(m.reducereImplicita);
    /*
      ⚠ „Gratuit" e preț fix ZERO, iar câmpul pornește gol. Fără rândul ăsta, un
      cadou nou se deschidea pe „Preț fix" cu câmpul necompletat, iar salvarea
      cădea cu „Seteaza un pret fix valid" pentru chiar implicita tipului.
    */
    if (m.cuGratuit && m.reducereImplicita === "fixed_price") setFixedPrice("0");
    if (m.unProdus) setOfferedIds((prev) => prev.slice(0, 1));
    if (!m.automatDinCategorie) setMetoda("manual");
  }

  /*
    ⚠⚠ DE CE NU POATE FI OFERIT PRODUSUL ASTA. `null` inseamna ca poate.

    Tipurile care se iau DINTR-O APASARE (setul, bump-ul, upgrade-ul, „cumperi X
    primesti Y", cadoul) n-au unde sa intrebe ce marime sau ce text de gravat, iar
    vitrina le arunca oricum (`needsChoice`). Alese aici, ar fi fost o promisiune
    care nu se vede nicaieri in magazin.

    ⚠ La RECOMANDARI intoarce mereu `null`: cardul duce pe pagina produsului, deci
    un produs cu marimi e perfect bun acolo. Si declansatorul („Cand apare") nu
    cheama functia asta deloc — acolo produsul spune doar PE CE PAGINA se vede
    oferta.
  */
  function motivPentruProdusulOferit(p: PickerProduct): string | null {
    if (!meta.cereProduseGataDeAdaugat || !p.cereAlegere) return null;
    return "Are variante sau cere personalizare — nu poate fi adăugat dintr-o apăsare.";
  }

  function addOffered(id: string) {
    setOfferedIds((prev) => (meta.unProdus ? [id] : prev.includes(id) ? prev : [...prev, id]));
  }

  // Order-bump preview: exact special price for the single offered product.
  const bumpPreview = useMemo(() => {
    if (!meta.unProdus) return null;
    const p = offeredIds[0] ? byId.get(offeredIds[0]) : null;
    if (!p) return null;
    let price = p.price;
    if (discountMode === "percent") price = p.price * (1 - (Number(discountPercent) || 0) / 100);
    else if (discountMode === "amount") price = p.price - (Number(discountAmount) || 0);
    else if (discountMode === "fixed_price") price = Number(fixedPrice) || 0;
    return { was: p.price, now: Math.max(0, Math.round(price * 100) / 100) };
  }, [meta.unProdus, offeredIds, byId, discountMode, discountPercent, discountAmount, fixedPrice]);

  /*
    ═══ BENEFICIUL, CA PATRU BUTOANE ═══

    ⚠ „Gratuit" e o SCURTĂTURĂ către preț fix zero, nu un al cincilea mod. Cele
    patru moduri din schemă îl exprimă deja exact, iar unul nou ar fi cerut un
    rând în parser, în `modBundle` și în fiecare loc care ramifică pe mod.
  */
  const beneficii = [
    ...(meta.cuGratuit ? [{ cheie: "gratuit" as const, label: "Gratuit" }] : []),
    { cheie: "percent" as const, label: "Reducere %" },
    { cheie: "amount" as const, label: "Reducere sumă" },
    { cheie: "fixed_price" as const, label: meta.unProdus ? "Preț fix" : "Preț fix set" },
  ];
  const beneficiuAles: "gratuit" | OfferDiscountMode =
    meta.cuGratuit && discountMode === "fixed_price" && Number(fixedPrice) === 0 ? "gratuit" : discountMode;
  function alegeBeneficiul(c: (typeof beneficii)[number]["cheie"]) {
    if (c === "gratuit") { setDiscountMode("fixed_price"); setFixedPrice("0"); return; }
    /* ⚠ Se golește zeroul lăsat de „Gratuit", altfel „Preț fix" s-ar fi deschis
       pe un câmp care arată 0 și pare completat. */
    if (c === "fixed_price" && Number(fixedPrice) === 0) setFixedPrice("");
    setDiscountMode(c);
  }

  function save() {
    if (!name.trim()) { toast.error("Oferta are nevoie de un nume."); return; }
    if (scope === "products" && triggerIds.length === 0) { toast.error("Alege cel puțin un produs pe care să apară oferta."); return; }
    if (scope === "categories" && triggerCats.length === 0) { toast.error("Alege cel puțin o categorie."); return; }
    /* ⚠ Oferta de cantitate nu OFERA produse: sare peste verificarea de mai
       jos, altfel n-ar putea fi salvata niciodata. In schimb ii cere praguri. */
    if (meta.cuPraguri) {
      if (problemaPraguri) { toast.error(problemaPraguri); return; }
    } else {
      const usesAuto = meta.automatDinCategorie && autoByCategory;
      if (!usesAuto && offeredIds.length === 0) { toast.error("Alege cel puțin un produs de oferit."); return; }
    }
    /*
      ⚠ ZERO E UN PREȚ VALID la ofertele care pot da gratuit. „Gratuit" se scrie
      chiar ca preț fix zero (vezi `cuGratuit`), iar verificarea de dinainte,
      scrisă pe vremea când doar bump-ul avea preț fix, ar fi refuzat salvarea
      fiecărui cadou din platformă cu „Seteaza un pret fix valid".
    */
    if (meta.areReducere && discountMode === "fixed_price"
        && !(meta.cuGratuit ? Number(fixedPrice) >= 0 : Number(fixedPrice) > 0)) {
      toast.error("Setează un preț fix valid."); return;
    }
    if (meta.cuBucatiXY) {
      const x = Math.floor(Number(cumperiBucati) || 0);
      const y = Math.floor(Number(primestiBucati) || 0);
      if (x < 1 || y < 1) { toast.error("Scrie câte bucăți se cumpără și câte se primesc."); return; }
      if (x > OFFER_MAX_CANTITATE || y > OFFER_MAX_CANTITATE) {
        toast.error(`Cel mult ${OFFER_MAX_CANTITATE} bucăți de fiecare parte.`); return;
      }
      /*
        ⚠⚠ ACELAȘI PRODUS DE AMÂNDOUĂ PĂRȚILE NU POATE MERGE, și se spune aici,
        nu se lasă să se salveze o ofertă care n-ar apărea niciodată.

        Oferta ADAUGĂ produsul primit ca linie nouă, iar produsul care e deja în
        coș nu se mai poate oferi (s-ar fi redus de două ori aceeași linie). Deci
        „cumperi 2 becuri, primești 1 bec" n-ar avea ce să arate.

        ⚠ Pentru chiar cazul ăsta există „Reducere cantitate": „de la 3 bucăți,
        −33%" e același lucru, și e scris pe produs, deci merge pe toate căile —
        și în coș, și în comanda directă, și la marketplace.
      */
      if (scope === "products" && offeredIds.some((id) => triggerIds.includes(id))) {
        toast.error(
          "Produsul primit e chiar unul dintre cele cumpărate. Pentru „cumperi 2, primești 1” din "
          + "ACELAȘI produs, folosește „Reducere cantitate”: acolo prețul scade pe bucată și merge peste tot.",
          { duration: 12000 },
        );
        return;
      }
    }

    /*
      ⚠ ACEEASI REGULA CA PE SERVER, chemata — nu scrisa a doua oara. Serverul
      refuza oricum o perioada intoarsa; aici se spune INAINTE, ca omul sa vada
      greseala langa campul in care a facut-o.
    */
    const perioada = perioadaOfertei(incepeIn, seIncheieIn);
    if ("error" in perioada) { setEroarePerioada(perioada.error); toast.error(perioada.error); return; }
    setEroarePerioada(null);

    const payload: OfferFormData = {
      type,
      name,
      is_active: isActive,
      priority: offer?.priority ?? 0,
      trigger: {
        scope,
        productIds: scope === "products" ? triggerIds : [],
        categories: scope === "categories" ? triggerCats : [],
        /*
          ⚠⚠ PORȚILE. Ce nu e bifat NU SE TRIMITE DELOC, nu se trimite ca zero:
          `minValue: 0` ar fi o poartă care trece mereu, dar tot o poartă — iar
          `arePorti` ar spune „da” și ecranul ar scrie că oferta are condiții.
          Lipsa cheii e singurul fel de a spune „nu se cere nimic”.
        */
        conditions: arataPorti
          ? {
              ...(poartaLei !== null ? { minValue: poartaLei } : {}),
              ...(poartaBucati !== null ? { minQty: poartaBucati } : {}),
              ...(poartaContine.length ? { requiredProductIds: poartaContine } : {}),
              ...(poartaNuContine.length ? { excludedProductIds: poartaNuContine } : {}),
            }
          : undefined,
      },
      config: {
        productIds: meta.automatDinCategorie && autoByCategory ? [] : offeredIds,
        /* ⚠ Se scrie din METODA, ca sa nu se poata desparti de ea. */
        autoByCategory: meta.automatDinCategorie && autoByCategory,
        metodaRecomandare: meta.automatDinCategorie ? metoda : undefined,
        excludeFaraStoc: meta.automatDinCategorie ? excludeFaraStoc : undefined,
        /* ⚠ Era CABLAT la 4, desi campul exista si era respectat de vitrina.
           Comerciantul il poate scrie acum. */
        maxProducts: maxProduse,
        discountMode: meta.areReducere ? discountMode : "none",
        discountPercent: meta.areReducere && discountMode === "percent" ? Number(discountPercent) || 0 : undefined,
        discountAmount: meta.areReducere && discountMode === "amount" ? Number(discountAmount) || 0 : undefined,
        fixedPrice: meta.areReducere && discountMode === "fixed_price" ? Number(fixedPrice) || 0 : undefined,
        title: title.trim() || undefined,
        /* ⚠ Numai ce trece de o bucata, si numai pentru produsele din set. */
        cantitati: arataCantitati
          ? Object.fromEntries(offeredIds.map((id) => [id, cantitati[id] ?? 1]).filter(([, n]) => (n as number) > 1))
          : undefined,
        praguri: meta.cuPraguri
          ? praguri
              .map((x) => ({ min_qty: Math.floor(Number(x.min_qty) || 0), percent: Number(x.percent) || 0 }))
              .filter((x) => x.min_qty >= 2 && x.percent > 0 && x.percent < 100)
          : undefined,
        /*
          ⚠ Cele trei câmpuri noi pleacă DOAR de la tipul care le folosește.
          Trimise de peste tot, parserul le-ar fi scris pe rândurile tuturor
          ofertelor, iar cele 13 de pe producție ar fi căpătat câmpuri noi la
          prima salvare — fără ca nimic să se schimbe pentru ele.
        */
        inlocuieste: meta.cuSchimb ? inlocuieste : undefined,
        cumperiBucati: meta.cuBucatiXY ? Math.max(1, Math.floor(Number(cumperiBucati) || 1)) : undefined,
        primestiBucati: meta.cuBucatiXY ? Math.max(1, Math.floor(Number(primestiBucati) || 1)) : undefined,
        cadouLaAlegere: meta.cuCadouLaAlegere ? cadouLaAlegere : undefined,
      },
      /* ⚠ `display` nu mai pleaca gol: poarta asezarea. Restul campurilor lui
         (suprafete, stil) se completeaza tot pe server, ca pana acum. */
      display: { amplasare: arataAmplasarea ? amplasare : "sub_produs" },
      /* Zile romanesti; serverul le preface in clipe, intr-un singur loc. */
      incepe_in: incepeIn,
      se_incheie_in: seIncheieIn,
    };

    startSave(async () => {
      let res: Awaited<ReturnType<typeof updateOffer>> | Awaited<ReturnType<typeof createOffer>>;
      try {
        res = offer ? await updateOffer(offer.id, businessId, payload) : await createOffer(businessId, payload);
      } catch {
        /* ⚠ Acelasi ternar, dar scris pe un singur rand. Mesajul se desparte la fel. */
        toast.error(
          offer
            ? "Nu am primit raspuns de la server, deci nu stim daca modificarile ofertei s-au salvat. Apasa din nou pe "
              + "salvare: trimitem toata oferta, deci a doua apasare nu strica nimic."
            : "Nu am primit raspuns de la server, deci nu stim daca oferta s-a creat. Uita-te intai in lista de oferte, "
              + "ca sa nu iasa doua.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(offer ? "Ofertă actualizată." : "Ofertă creată.");
      router.push("/dashboard/offers");
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/dashboard/offers")}
          className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-bold text-foreground">{isEdit ? "Editeaza oferta" : "Oferta noua"}</h1>
        {isEdit && <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">{meta.eticheta}</span>}
      </div>

      {/* Type picker (create only) */}
      {!isEdit && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TIPURI_DE_ALES.map((t) => {
            const Icon = t.icon;
            const active = type === t.type;
            return (
              <button key={t.type} type="button" onClick={() => chooseType(t.type)}
                className={`text-left rounded-2xl border p-4 transition-all ${active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card hover:border-primary/40"}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${active ? "bg-primary text-white" : "bg-primary/10 text-primary"}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-foreground">{t.eticheta}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t.explicatie}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Name */}
      <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Nume ofertă (intern)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Accesorii recomandate" className={inputCls} />
          <p className="text-xs text-muted-foreground mt-1">Numele îl vezi doar tu, în listă. Clienții văd titlul de mai jos.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Titlu afișat clienților (opțional)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={meta.eticheta} className={inputCls} />
        </div>
      </div>

      {/* CÂND APARE — trigger */}
      <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Tag className="h-4 w-4 text-primary" /> Când apare</h2>
          {/*
            ⚠ Textul spune CE ÎNSEAMNĂ declanșatorul la tipul ales. Era scris
            după `unProdus`, care acum e adevărat și la upgrade, și fals la
            cadou — deci cadoul ar fi scris „apare pe pagina produsului”, unde
            nu apare niciodată.
          */}
          <p className="text-xs text-muted-foreground mt-0.5">
            {type === "bogo"
              ? "Se numără bucățile din coș din:"
              : type === "upgrade"
                ? "Oferta apare în formularul de comandă, pentru produsul de schimbat:"
                : seAcceptaInFormular(type)
                  ? "Oferta apare în formularul de comandă când coșul conține:"
                  : "Oferta apare pe pagina produsului pentru:"}
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          {([
            { v: "products", label: "Anumite produse" },
            { v: "categories", label: "O categorie" },
            { v: "all", label: "Toate produsele" },
          ] as const).map((s) => (
            <button key={s.v} type="button" onClick={() => setScope(s.v)}
              className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors ${scope === s.v ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
              {s.label}
            </button>
          ))}
        </div>

        {scope === "products" && (
          <ProductPicker products={products} selectedIds={triggerIds} byId={byId}
            onAdd={(id) => setTriggerIds((p) => p.includes(id) ? p : [...p, id])}
            onRemove={(id) => setTriggerIds((p) => p.filter((x) => x !== id))}
            placeholder="Caută produsul pe pagina căruia apare oferta..." />
        )}
        {scope === "categories" && (
          categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nu ai categorii încă.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = triggerCats.includes(c.name);
                return (
                  <button key={c.id} type="button"
                    onClick={() => setTriggerCats((p) => on ? p.filter((x) => x !== c.name) : [...p, c.name])}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${on ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* PRAGURILE — doar la „Reducere cantitate" */}
      {meta.cuPraguri && (
        <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" /> Pragurile de cantitate
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              De la cate bucati in sus scade pretul, si cu cat la suta. Reducerea se aplica pe
              TOATA cantitatea, nu doar pe bucatile peste prag.
            </p>
          </div>

          <div className="space-y-2">
            {praguri.map((pr, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs text-muted-foreground">De la</span>
                <input
                  value={pr.min_qty} inputMode="numeric"
                  onChange={(e) => setPraguri((v) => v.map((x, k) => (k === i ? { ...x, min_qty: e.target.value } : x)))}
                  className={inputCls + " max-w-[90px]"} placeholder="5"
                />
                <span className="shrink-0 text-xs text-muted-foreground">buc &rarr;</span>
                <input
                  value={pr.percent} inputMode="decimal"
                  onChange={(e) => setPraguri((v) => v.map((x, k) => (k === i ? { ...x, percent: e.target.value } : x)))}
                  className={inputCls + " max-w-[90px]"} placeholder="3"
                />
                <span className="shrink-0 text-xs text-muted-foreground">% reducere</span>
                <button
                  type="button" aria-label="Sterge pragul"
                  onClick={() => setPraguri((v) => v.filter((_, k) => k !== i))}
                  className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setPraguri((v) => [...v, { min_qty: "", percent: "" }])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Mai adauga un prag
            </button>
          </div>

          {problemaPraguri && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-xs text-foreground">{problemaPraguri}</p>
            </div>
          )}

          {/*
            ⚠ Se spune pe fata ca pragurile se SCRIU pe produse. Altfel,
            comerciantul care schimba un prag si nu vede nimic pe produsele
            unde oferta nu mai ajunge ar crede ca ecranul minte.
          */}
          <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
            La salvare, pragurile se scriu pe produsele alese mai sus si apar ca tabel pe pagina
            fiecaruia. Produsele care au deja un upsell pus de tine pe fisa lor NU se ating.
          </p>
        </div>
      )}

      {/* CE OFER — products */}
      {!meta.cuPraguri && (
      <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Package className="h-4 w-4 text-primary" /> Ce ofer</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.numeleProduselorOferite}</p>
        </div>

        {meta.automatDinCategorie && (
          <>
            {/*
              ⚠ TREI CARTONASE, nu un comutator: alegerea nu mai e „automat sau
              nu", ci DE UNDE se iau produsele. Sub fiecare scrie ce face.
            */}
            <div className="grid gap-2 sm:grid-cols-3">
              {METODE_RECOMANDARE.map((m) => (
                <button key={m} type="button" onClick={() => setMetoda(m)} aria-pressed={metoda === m}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    metoda === m ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}>
                  <p className="text-sm font-semibold text-foreground">{DESPRE_METODA[m].eticheta}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{DESPRE_METODA[m].explicatie}</p>
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">Arată cel mult</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    Câte produse intră în raft. Pe telefon încap patru pe ecran.
                  </span>
                </span>
                <input type="number" min={1} max={OFFER_MAX_PRODUCTS} value={maxProduse}
                  onChange={(e) => setMaxProduse(Math.min(OFFER_MAX_PRODUCTS, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
                  className="w-20 shrink-0 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring" />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">Nu arăta produsele fără stoc</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    ⚠ Nebifat, pe pagina produsului se văd cu eticheta „Epuizat”, iar în coș sunt oricum
                    ascunse. Așa se poartă azi.
                  </span>
                </span>
                <Switch checked={excludeFaraStoc} onCheckedChange={setExcludeFaraStoc} />
              </label>
            </div>
          </>
        )}

        {!(meta.automatDinCategorie && autoByCategory) && (
          <ProductPicker products={products} selectedIds={offeredIds} byId={byId} single={meta.unProdus}
            onAdd={addOffered}
            onRemove={(id) => setOfferedIds((p) => p.filter((x) => x !== id))}
            placeholder={meta.unProdus ? "Caută produsul oferit..." : "Caută produse de oferit..."}
            cantitati={arataCantitati ? cantitati : undefined}
            onCantitate={arataCantitati ? (id, n) => setCantitati((c) => ({ ...c, [id]: n })) : undefined}
            motivNepotrivit={motivPentruProdusulOferit} />
        )}
      </div>
      )}

      {/*
        ═══ REGULILE CELOR TREI TIPURI NOI ═══

        ⚠ O SINGURĂ CASETĂ, cu bucăți care se aprind după tip. Trei casete
        separate ar fi arătat la fel și ar fi cerut trei locuri de ținut minte;
        aici se vede dintr-o privire că e „regula ofertei”, oricare ar fi ea.
      */}
      {(meta.cuBucatiXY || meta.cuSchimb || meta.cuCadouLaAlegere) && (
        <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" /> Regula ofertei
          </h2>

          {meta.cuBucatiXY && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                <span>Cumpără</span>
                <input value={cumperiBucati} inputMode="numeric"
                  onChange={(e) => setCumperiBucati(e.target.value)}
                  className={inputCls + " max-w-[80px]"} placeholder="2" />
                <span>bucăți &rarr; primește</span>
                <input value={primestiBucati} inputMode="numeric"
                  onChange={(e) => setPrimestiBucati(e.target.value)}
                  className={inputCls + " max-w-[80px]"} placeholder="1" />
                <span>bucăți din produsul de mai sus.</span>
              </div>
              {/*
                ⚠⚠ SE SPUNE CE SE NUMĂRĂ ȘI CE NU. Fără rândul ăsta, un
                comerciant cu declanșator „toate produsele” ar fi crezut că
                „cumperi 2” înseamnă „două produse deosebite”, când înseamnă
                două BUCĂȚI — iar produsul dăruit nu intră în numărătoare, ca
                oferta să nu se hrănească singură.
              */}
              <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
                Se adună BUCĂȚILE din coș, din produsele alese la „Când apare”. Produsul primit
                NU se numără. Numărul se pune din nou la trimiterea comenzii, pe liniile adevărate.
              </p>
              {/*
                ⚠⚠ SE SPUNE ÎNAINTE SĂ ÎNCERCE. Oferta adaugă produsul primit ca
                linie nouă, deci produsul primit trebuie să fie ALTUL decât cel
                cumpărat. Pentru „2 la preț de 1” din același produs unealta
                potrivită există deja și merge pe toate căile.
              */}
              <p className="rounded-lg border border-border p-2.5 text-xs text-muted-foreground">
                Produsul primit trebuie să fie <strong className="text-foreground">altul</strong> decât cel
                cumpărat. Pentru „2 la preț de 1” din <strong className="text-foreground">același</strong> produs,
                folosește „Reducere cantitate”: acolo prețul scade pe bucată și se aplică peste tot,
                nu doar în formularul de comandă.
              </p>
            </>
          )}

          {meta.cuSchimb && (
            <>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">Scoate din comandă produsul schimbat</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    Așa înseamnă „treci la”: produsul mic iese, cel mare îi ia locul. Oprit, oferta
                    devine o simplă adăugare, ca oferta de checkout.
                  </span>
                </span>
                <Switch checked={inlocuieste} onCheckedChange={setInlocuite} />
              </label>
              {/*
                ⚠⚠ SE SPUNE PE FAȚĂ CE COSTĂ SCHIMBUL. La schimb, produsul care
                aprinde oferta nu mai e în comandă — chiar oferta l-a scos — deci
                declanșatorul nu se mai poate cere la plasare. Nescris aici,
                comerciantul ar fi crezut că prețul de schimb e păzit de
                declanșator, când el e păzit doar de porți.
              */}
              {inlocuieste && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-foreground">
                  ⚠ La schimb, produsul mic iese din comandă, deci la trimitere nu se mai poate
                  verifica că a fost vreodată acolo. Prețul de schimb îl poate primi orice comandă
                  care conține produsul mare, o singură bucată. Dacă vrei să-l strângi, folosește
                  porțile de mai jos („în coș se află…”).
                </p>
              )}
            </>
          )}

          {meta.cuCadouLaAlegere && (
            <>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">Clientul alege cadoul</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    Se arată toate produsele de mai sus, iar cumpărătorul apasă pe unul. Oprit, se
                    dă primul care se poate da.
                  </span>
                </span>
                <Switch checked={cadouLaAlegere} onCheckedChange={setCadouLaAlegere} />
              </label>
              {cadouLaAlegere && (
                <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">Arată cel mult</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                      Câte cadouri intră în rând. Trei încap fără derulare pe telefon.
                    </span>
                  </span>
                  <input type="number" min={1} max={OFFER_MAX_PRODUCTS} value={maxProduse}
                    onChange={(e) => setMaxProduse(Math.min(OFFER_MAX_PRODUCTS, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
                    className="w-20 shrink-0 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring" />
                </label>
              )}
              <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
                Cadoul se dă când trec porțile de mai jos. Fără nicio poartă, îl primește oricine
                comandă — de obicei se pune „Coșul trece de …”.
              </p>
            </>
          )}
        </div>
      )}

      {/* CÂT REDUC — discount (hidden for cross_sell) */}
      {meta.areReducere && (
        <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Cât reduc</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {meta.unProdus ? "Reducerea aplicată produsului oferit." : "Reducerea aplicată setului cumpărat împreună."}
            </p>
          </div>
          {/*
            ⚠ „GRATUIT" NU E UN MOD NOU DE REDUCERE, ci preț fix ZERO. Un al
            cincilea mod ar fi cerut un rând nou în parser, în `modBundle` și în
            fiecare loc care ramifică pe mod — pentru o valoare pe care cele
            patru de acum o exprimă deja exact. Butonul e doar o scurtătură care
            scrie același lucru.
          */}
          <div className={`grid gap-2 ${meta.cuGratuit ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            {beneficii.map((o) => (
              <button key={o.cheie} type="button" onClick={() => alegeBeneficiul(o.cheie)}
                className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors ${beneficiuAles === o.cheie ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {beneficiuAles === "gratuit" && (
              <p className="text-sm text-muted-foreground">
                Produsul intră în comandă la 0 lei. Se vede scris „Gratuit”, nu „0,00 lei”.
              </p>
            )}
            {discountMode === "percent" && (
              <><input type="number" min="0" max="100" step="1" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="ex: 10" className={`${inputCls} w-40`} /><span className="text-sm text-muted-foreground">% reducere</span></>
            )}
            {discountMode === "amount" && (
              <><input type="number" min="0" step="1" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="ex: 50" className={`${inputCls} w-40`} /><span className="text-sm text-muted-foreground">lei reducere</span></>
            )}
            {discountMode === "fixed_price" && beneficiuAles !== "gratuit" && (
              <><input type="number" min="0" step="0.01" value={fixedPrice} onChange={(e) => setFixedPrice(e.target.value)} placeholder="ex: 99" className={`${inputCls} w-40`} /><span className="text-sm text-muted-foreground">lei</span></>
            )}
          </div>
          {bumpPreview && (
            <div className="rounded-xl bg-primary/5 border border-primary/15 p-4 flex items-center gap-2 text-sm text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Preț special: <span className="text-lg font-bold text-primary">{formatPrice(bumpPreview.now)}</span>
              {bumpPreview.was > bumpPreview.now && <span className="text-xs text-muted-foreground line-through">{formatPrice(bumpPreview.was)}</span>}
            </div>
          )}
        </div>
      )}

      {/*
        ═══ PORȚILE ═══

        ⚠⚠ PROPOZIȚII, NU NUME DE CÂMPURI. „Coșul trece de 200 lei” se citește;
        „Valoare minimă coș: 200” trebuie tălmăcit. De-aia eticheta e o bucată de
        frază, iar unitatea stă după câmp.

        ⚠ Fiecare poartă se APRINDE cu o bifă. Fără bifă, câmpul nici nu se vede
        și cheia nu pleacă la server — „coșul trece de 0 lei” ar fi o poartă care
        trece mereu, dar tot o poartă.

        ⚠⚠ Sub ele se spune ce NU pot: ce vine din browser hotărăște doar ce se
        ARATĂ, iar la trimiterea comenzii poarta se pune din nou, pe prețurile
        chiar plătite. Nescris, comerciantul ar fi crezut că poarta e o pază de
        bani, când ea e și o pază, și o alegere de afișare.
      */}
      {/*
        ⚠ DOUA CARTONASE, nu un meniu: alegerea se vede toata dintr-o privire,
        iar sub fiecare scrie ce castigi si ce pierzi. Intr-un `<select>`,
        explicatia n-ar fi incaput nicaieri.
      */}
      {arataAmplasarea && (
        <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unde se vede setul</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {AMPLASARI.map((a) => (
              <button key={a} type="button" onClick={() => setAmplasare(a)}
                aria-pressed={amplasare === a}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  amplasare === a ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}>
                <p className="text-sm font-semibold text-foreground">{DESPRE_AMPLASARE[a].eticheta}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{DESPRE_AMPLASARE[a].explicatie}</p>
              </button>
            ))}
          </div>
          {amplasare === "langa_pret" && (
            <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
              ⚠ Cifra „Afișări” urcă după mutare, fiindcă setul se vede fără să mai deruleze nimeni.
              Nu e o creștere de interes: e altă definiție a lui „văzut”.
            </p>
          )}
        </div>
      )}

      {arataPorti && (
        <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Se arată doar dacă… (opțional)
          </p>

          <PoartaCuNumar
            id="poarta-lei"
            eticheta={DESPRE_PORTI.minValue.eticheta}
            unitate={DESPRE_PORTI.minValue.unitate}
            explicatie={DESPRE_PORTI.minValue.explicatie}
            valoare={poartaLei}
            implicit={200}
            pas="0.01"
            onChange={setPoartaLei}
          />
          <PoartaCuNumar
            id="poarta-bucati"
            eticheta={DESPRE_PORTI.minQty.eticheta}
            unitate={DESPRE_PORTI.minQty.unitate}
            explicatie={DESPRE_PORTI.minQty.explicatie}
            valoare={poartaBucati}
            implicit={2}
            pas="1"
            onChange={setPoartaBucati}
          />
          <PoartaCuProduse
            eticheta={DESPRE_PORTI.requiredProductIds.eticheta}
            explicatie={DESPRE_PORTI.requiredProductIds.explicatie}
            products={products}
            byId={byId}
            ids={poartaContine}
            onChange={setPoartaContine}
            placeholder="Caută produsul care aprinde oferta..."
          />
          <PoartaCuProduse
            eticheta={DESPRE_PORTI.excludedProductIds.eticheta}
            explicatie={DESPRE_PORTI.excludedProductIds.explicatie}
            products={products}
            byId={byId}
            ids={poartaNuContine}
            onChange={setPoartaNuContine}
            placeholder="Caută produsul care oprește oferta..."
          />

          {(poartaLei !== null || poartaBucati !== null) && (
            <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
              ⚠ Suma și bucățile se socotesc și la trimiterea comenzii, pe prețurile chiar plătite.
              Dacă atunci coșul nu mai trece, comanda e oprită și cumpărătorul e rugat să scoată oferta.
            </p>
          )}
        </div>
      )}

      {/*
        ⚠⚠ O PERIOADA, NU DOUA CAMPURI RAZLETE — aceeasi asezare ca la coduri,
        fiindca acelasi comerciant vede amandoua ecranele. Sub ele se scrie in
        cuvinte ce inseamna, fiindca „de la 1 octombrie” nu spune de la ce ORA.
      */}
      <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cât ține oferta (opțional)</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="oferta-de-cand" className="block text-[11px] text-muted-foreground mb-1">De când</label>
            <input id="oferta-de-cand" type="date" lang="ro" value={incepeIn ?? ""}
              onChange={(e) => { setIncepeIn(e.target.value || null); setEroarePerioada(null); }}
              className={`${inputCls}${eroarePerioada ? " border-destructive" : ""}`} />
          </div>
          <div>
            <label htmlFor="oferta-pana-cand" className="block text-[11px] text-muted-foreground mb-1">Până când</label>
            {/*
              ⚠ `min` doar pe capatul de sus. Pus si pe „De când”, ar fi oprit
              editarea unei campanii deja pornite: comerciantul ar fi deschis
              formularul ca sa schimbe procentul si n-ar fi putut salva.
            */}
            <input id="oferta-pana-cand" type="date" lang="ro" value={seIncheieIn ?? ""} min={incepeIn ?? undefined}
              onChange={(e) => { setSeIncheieIn(e.target.value || null); setEroarePerioada(null); }}
              className={`${inputCls}${eroarePerioada ? " border-destructive" : ""}`} />
          </div>
        </div>
        {eroarePerioada
          ? <p className="text-xs text-destructive">{eroarePerioada}</p>
          : <p className="text-[11px] text-muted-foreground">{descriePerioada(incepeIn, seIncheieIn)}</p>}
      </div>

      {/* Active */}
      <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">Activă (vizibilă în magazin)</span>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="lg" onClick={() => router.push("/dashboard/offers")}>Anulează</Button>
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <><Loader2 className="animate-spin" /> Se salvează...</> : <><Save /> {isEdit ? "Salvează" : "Creează oferta"}</>}
        </Button>
      </div>
    </div>
  );
}

/* ─── Reusable product search + selected chips ────────────────────────────── */

function ProductPicker({ products, selectedIds, byId, onAdd, onRemove, single, placeholder, cantitati, onCantitate, motivNepotrivit }: {
  products: PickerProduct[];
  selectedIds: string[];
  byId: Map<string, PickerProduct>;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  single?: boolean;
  placeholder: string;
  /**
   * De ce NU poate fi ales produsul asta, sau `null` daca poate.
   *
   * ⚠⚠ SE ARATA, NU SE ASCUNDE. Pana azi lista venea din filtrul de PACHETE, care
   * scotea tacut produsele cu variante, pe cele cu personalizare si pe cele
   * inactive. Masurat pe productie: patru magazine nu puteau alege NICIUN produs,
   * iar eSAFE avea 3.047 din 3.351 invizibile — comerciantul isi cauta produsul,
   * nu-l gasea, si nimic nu-i spunea de ce. Ce nu poate aparea in lista e taiat
   * pentru totdeauna, tacut; asa macar afla.
   */
  motivNepotrivit?: (p: PickerProduct) => string | null;
  /**
   * Cate bucati din fiecare produs. Lipsa lui inseamna ca tipul asta de oferta
   * nu cere cantitati, si atunci nu se deseneaza niciun buton in plus.
   */
  cantitati?: Record<string, number>;
  onCantitate?: (id: string, n: number) => void;
}) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    return products
      .filter((p) => !selectedIds.includes(p.id))
      .filter((p) => !query || p.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [products, selectedIds, q]);
  const selected = selectedIds.map((id) => byId.get(id)).filter((p): p is PickerProduct => !!p);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={`${inputCls} pl-9`} />
        {q.trim() && (
          <div className="absolute z-10 mt-1 w-full rounded-xl ring-1 ring-foreground/10 bg-card shadow-lg max-h-64 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Niciun produs găsit.</p>
            ) : results.map((p) => {
              const motiv = motivNepotrivit?.(p) ?? null;
              return (
              <button key={p.id} type="button" disabled={!!motiv}
                onClick={() => { if (!motiv) { onAdd(p.id); setQ(""); } }}
                title={motiv ?? undefined}
                className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
                  motiv ? "cursor-not-allowed opacity-60" : "hover:bg-muted"}`}>
                <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
                  {p.image_url ? <Image src={p.image_url} alt={p.name} fill sizes="36px" className="object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{p.name}</span>
                  {/* ⚠ MOTIVUL, nu doar stingerea randului: „de ce nu pot alege produsul asta" e
                      chiar intrebarea pe care si-o pune omul in clipa aia. */}
                  {motiv && <span className="block truncate text-[11px] text-muted-foreground">{motiv}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatPrice(p.price)}</span>
                {!motiv && <Plus className="h-4 w-4 shrink-0 text-primary" />}
              </button>
              );
            })}
          </div>
        )}
      </div>

      {selected.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-xl">
          {single ? "Niciun produs ales." : "Niciun produs adăugat."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selected.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg border border-border bg-muted/40">
              <span className="relative w-7 h-7 rounded-md overflow-hidden bg-muted border border-border shrink-0">
                {p.image_url ? <Image src={p.image_url} alt={p.name} fill sizes="28px" className="object-cover" /> : <span className="w-full h-full flex items-center justify-center"><Package className="h-3.5 w-3.5 text-muted-foreground" /></span>}
              </span>
              <span className="text-xs font-medium text-foreground max-w-[160px] truncate">{p.name}</span>
              {onCantitate && (
                /*
                  ⚠ Cantitatea sta PE ETICHETA produsului, nu intr-o coloana
                  alaturi: asa „2 x bec" se citeste ca un lucru, iar un set cu
                  patru produse nu devine un tabel.
                */
                <span className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background">
                  <button type="button" aria-label={`Mai putine ${p.name}`}
                    onClick={() => onCantitate(p.id, Math.max(1, (cantitati?.[p.id] ?? 1) - 1))}
                    className="px-1.5 text-muted-foreground hover:text-foreground">−</button>
                  <span className="min-w-[1.25rem] text-center text-xs font-semibold tabular-nums text-foreground">
                    {cantitati?.[p.id] ?? 1}
                  </span>
                  <button type="button" aria-label={`Mai multe ${p.name}`}
                    onClick={() => onCantitate(p.id, Math.min(OFFER_MAX_CANTITATE, (cantitati?.[p.id] ?? 1) + 1))}
                    className="px-1.5 text-muted-foreground hover:text-foreground">+</button>
                </span>
              )}
              <button type="button" onClick={() => onRemove(p.id)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * O poarta cu numar: bifa care o aprinde, campul, si unitatea dupa el.
 *
 * ⚠ BIFA SI VALOAREA SUNT ACELASI LUCRU, nu doua stari. `null` inseamna
 * „nebifat"; bifarea pune implicitul. Tinute separat, o poarta bifata cu campul
 * golit ar fi trimis `minValue: 0` — o poarta care trece mereu, dar tot o
 * poarta, si ecranul ar fi scris ca oferta are conditii.
 */
function PoartaCuNumar({
  id, eticheta, unitate, explicatie, valoare, implicit, pas, onChange,
}: {
  id: string;
  eticheta: string;
  unitate: string;
  explicatie: string;
  valoare: number | null;
  implicit: number;
  pas: string;
  onChange: (v: number | null) => void;
}) {
  const bifat = valoare !== null;
  return (
    <div className="rounded-xl border border-border p-3">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={bifat}
          onChange={(e) => onChange(e.target.checked ? implicit : null)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            {eticheta}
            {bifat && (
              <>
                <input
                  id={id}
                  type="number"
                  min={0}
                  step={pas}
                  value={valoare}
                  onChange={(e) => {
                    /* ⚠ Campul golit NU stinge bifa: omul sterge ca sa scrie
                       altceva. Ramane zero pana scrie, si bifa e cea care spune
                       daca poarta exista. */
                    const n = Number(e.target.value);
                    onChange(Number.isFinite(n) ? Math.max(0, n) : 0);
                  }}
                  onClick={(e) => e.preventDefault()}
                  className="w-24 rounded-lg border border-input bg-transparent px-2 py-1 text-sm text-foreground outline-none focus-visible:border-ring"
                />
                {unitate && <span className="text-sm text-muted-foreground">{unitate}</span>}
              </>
            )}
          </span>
          <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{explicatie}</span>
        </span>
      </label>
    </div>
  );
}

/**
 * O poarta cu produse: bifa, apoi cautarea si etichetele alese.
 *
 * ⚠ Lista goala inseamna „nebifat", din acelasi motiv ca `null` la cea cu numar:
 * o lista goala trimisa ca `requiredProductIds: []` ar fi o cerinta care nu cere
 * nimic, si parserul oricum n-o scrie. Aici se hotaraste o data.
 */
function PoartaCuProduse({
  eticheta, explicatie, products, byId, ids, onChange, placeholder,
}: {
  eticheta: string;
  explicatie: string;
  products: PickerProduct[];
  byId: Map<string, PickerProduct>;
  ids: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}) {
  const bifat = ids.length > 0;
  const [deschis, setDeschis] = useState(false);
  const arata = bifat || deschis;
  return (
    <div className="rounded-xl border border-border p-3">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={arata}
          onChange={(e) => { setDeschis(e.target.checked); if (!e.target.checked) onChange([]); }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-foreground">{eticheta}</span>
          <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{explicatie}</span>
        </span>
      </label>
      {arata && (
        <div className="mt-2.5">
          <ProductPicker
            products={products}
            selectedIds={ids}
            byId={byId}
            onAdd={(id) => onChange(ids.includes(id) ? ids : [...ids, id])}
            onRemove={(id) => onChange(ids.filter((x) => x !== id))}
            placeholder={placeholder}
          />
        </div>
      )}
    </div>
  );
}
