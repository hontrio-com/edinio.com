"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureMerchantToken } from "@/lib/olx/oauth";
import { getAdvert, isOlxError, listAdverts } from "@/lib/olx/client";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { logError } from "@/lib/error-logger";
import { patchOlxConfig } from "@/lib/olx/config";
import type { OlxAdvert, OlxConfig } from "@/lib/olx/types";

/*
 * ═══ ANUNTURILE PE CARE LE AVEA INAINTE SA NE CUNOASCA ═══
 *
 * `reconciliazaAnunturile` adopta singura anunturile care poarta `external_id` = UUID-ul unui
 * produs Edinio. Cine a folosit OLX INAINTE de Edinio n-are asa ceva pe niciun anunt, deci
 * reconcilierea nu-l atinge — si bine face: contul lui de OLX e al lui, iar acolo pot sta zeci de
 * anunturi care n-au nicio treaba cu magazinul (o bicicleta, o canapea, masina cumnatului).
 *
 * Ce lipsea era o USA: un ecran in care el sa ceara scanarea, sa vada ce am gasit si sa lege el
 * fiecare pereche. Asta e fisierul acela.
 *
 * ⚠ AICI NU SE SCRIE NIMIC LA OLX. Nici `PUT`, nici comenzi, nici la scanare, nici la conectare.
 * Numai `GET`-uri, si un rand scris LA NOI cand apasa el. Motivul e simplu: pana cand omul n-a
 * confirmat perechea, nu stim ca anuntul e despre produsul acela — iar o singura scriere gresita
 * peste un anunt viu ii schimba pretul sau textul sub ochii cumparatorilor.
 *
 * ⚠ SI NU SE CONECTEAZA NIMIC AUTOMAT. O potrivire pe titlu e o presupunere, nu o dovada:
 * „Tricou negru" si „Tricou negru XL" sunt doua produse care arata aproape la fel. Propunem, si
 * spunem PE CE ne bazam; apasa el.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

interface OwnBiz { id: string }

const FEATURE_PATH = "/dashboard/features/olx";

/** Cate anunturi cere o pagina de la ei. Aceeasi marime ca la reconciliere. */
const PAGINA = 50;

/**
 * Plafonul scanarii.
 *
 * ⚠ Nu e o limita a lor, e alegerea NOASTRA: o scanare pornita dintr-un ecran nu poate tine
 * minute intregi, iar la 20 de pagini deja am cerut de o mie de ori de la ei. Cand se atinge,
 * raspunsul poarta `taiat: true` si ecranul o SPUNE — un „am gasit 1000" peste un cont cu 4000 de
 * anunturi ar fi un numar adevarat despre o lucrare pe jumatate facuta.
 */
const MAX_PAGINI = 20;

/** Cate randuri se trimit la ecran. Cele cu propunere sunt sortate primele, deci ele incap mereu. */
const MAX_RANDURI = 200;

// ── Ajutoare de casa (aceleasi tipare ca in `olx.actions.ts`) ──────────────────────

async function ownedBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<OwnBiz | null> {
  const { data } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", userId).single();
  return (data as OwnBiz) ?? null;
}

async function guard(businessId: string): Promise<{ supabase: ServerClient; userId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const biz = await ownedBusiness(supabase, businessId, user.id);
  if (!biz) return { error: "Magazin negasit" };
  return { supabase, userId: user.id };
}

/*
 * ⚠ Service role, si o citire cazuta ARUNCA. Vezi nota lunga din `olx.actions.ts`: vederea
 * decripteaza `access_token`/`refresh_token` doar pentru service role, iar un `{}` inchipuit peste
 * o citire picata ar face `ensureMerchantToken` sa creada ca nu e cont conectat.
 */
async function loadConfig(businessId: string): Promise<OlxConfig> {
  const { data, error } = await createAdminClient()
    .from("store_settings").select("olx_config").eq("business_id", businessId).maybeSingle();
  if (error) throw new Error(`Configurarea nu s-a putut citi: ${error.message}`);
  return ((data?.olx_config as OlxConfig) ?? {}) || {};
}

/** Aceeasi usa ca `withToken` din `olx.actions.ts`: proprietate dovedita, apoi jeton proaspat. */
async function cuJeton<T>(
  businessId: string, fn: (token: string) => Promise<T>,
): Promise<T | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };
  let config: OlxConfig;
  try {
    config = await loadConfig(businessId);
  } catch {
    return { error: "Nu am putut citi conexiunea OLX. Încearcă din nou." };
  }
  if (!config.connected || !config.refresh_token) return { error: "Conectează mai întâi contul OLX." };
  const tok = await ensureMerchantToken(createAdminClient(), businessId, config);
  if ("error" in tok) return { error: tok.error };
  return fn(tok.token);
}

const pauza = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Potrivirea ────────────────────────────────────────────────────────────────────

/*
 * ═══ CUM SE COMPARA DOUA TEXTE SCRISE DE OAMENI DIFERITI ═══
 *
 * ⚠ DIACRITICELE ROMANESTI AU DOUA CODIFICARI. „ș" se scrie si U+0219 (virgula dedesubt) si
 * U+015F (sedila, mostenita din Latin-2). Aceeasi litera pe ecran, doua caractere in memorie — iar
 * un `===` intre „Cămașă" scris in Edinio si „Cămaşă" scris pe OLX e FALS. Aceeasi lectie ca la
 * eColet (`cheieLocalitate`) si la Woot.
 *
 * Se descompune in NFD si se sterg DOAR semnele combinate (`\p{M}`), nu si literele: o clasa mai
 * lata ar manca „ș" cu totul in loc s-o faca „s".
 */
function faraDiacritice(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "");
}

/** Textul taiat in cuvinte: fara diacritice, fara majuscule, fara semne. */
function cuvinte(text: string): string[] {
  return faraDiacritice(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Cuvinte care NU deosebesc doua produse.
 *
 * ⚠ Lista e scurta si dinadins asa: fiecare cuvant sters de aici e un cuvant despre care spunem
 * „nu conteaza daca lipseste". „XL", „42", „500ml", „2buc" NU sunt pe lista si nu vor fi — tocmai
 * ele deosebesc doua produse care altfel arata la fel.
 */
const UMPLUTURA = new Set([
  "nou", "noua", "noi", "sigilat", "sigilata", "sigilate", "nefolosit", "nefolosita",
  "original", "originala", "originale", "oferta", "promotie", "reducere", "urgent",
  "livrare", "transport", "gratuit", "gratuita", "gratis", "rapida", "rapid",
  "garantie", "factura", "stoc", "vand", "vanzare",
  "de", "cu", "si", "la", "din", "pe", "pentru", "in", "un", "o", "sau",
]);

/** Cheia de titlu identic: aceleasi cuvinte, in aceeasi ordine. */
function cheieTitlu(text: string): string {
  return cuvinte(text).join(" ");
}

/**
 * Miezul titlului: cuvintele care chiar spun ceva, ca MULTIME sortata.
 *
 * Ordinea cade dinadins („Tricou negru" si „Negru tricou" sunt acelasi lucru), iar umplutura la
 * fel. Ce ramane trebuie sa fie IDENTIC pe amandoua partile — nu „asemanator", identic.
 */
function miezTitlu(text: string): string[] {
  return [...new Set(cuvinte(text).filter((c) => !UMPLUTURA.has(c)))].sort();
}

/** Textul unui anunt, gata de cautat: cuvinte separate prin spatiu, cu spatiu si la capete. */
function textDeCautat(text: string): string {
  return ` ${cuvinte(text).join(" ")} `;
}

/** Cel mai scurt SKU care se poate cauta intr-un titlu fara sa se loveasca de orice. */
const SKU_MIN = 4;

export type FelPotrivire = "sku" | "titlu-identic" | "titlu-asemanator";

export interface OlxPotrivire {
  productId: string;
  numeProdus: string;
  sku: string | null;
  fel: FelPotrivire;
  /** Spus omului, pe randul lui: de ce tocmai produsul asta. */
  deCe: string;
}

export interface OlxAnuntStrain {
  advertId: number;
  titlu: string;
  status: string;
  url: string | null;
  pret: number | null;
  moneda: string | null;
  /**
   * `external_id` pus de ei sau de altcineva, care NU e un produs al magazinului.
   * Se arata fiindca explica de ce anuntul a ajuns aici desi pare „legat".
   */
  externalId: string | null;
  propunere: OlxPotrivire | null;
  /** De ce n-am propus nimic. `null` cand exista propunere. */
  fara: string | null;
}

export interface OlxScanare {
  anunturi: OlxAnuntStrain[];
  /** Cate anunturi am citit de la ei in total (nu cate au ramas dupa filtrare). */
  totalCitite: number;
  /** Cate anunturi straine au iesit la filtrare, inainte de plafonul de afisare. */
  totalStraine: number;
  /** ⚠ `true` cand s-a atins plafonul de pagini: lista NU e tot contul. */
  taiat: boolean;
  /** Produsele care puteau fi propuse (cele fara rand in `olx_adverts`). */
  produseCandidate: number;
}

interface Candidat { id: string; name: string; sku: string | null }

/** Randurile deja vii la noi, dupa care se sare peste ce nu mai e de importat. */
interface Legaturi { produseLuate: Set<string>; anunturiLuate: Set<number> }

function numeScurte(lista: Candidat[]): string {
  const primele = lista.slice(0, 3).map((p) => `„${p.name}”`);
  const rest = lista.length - primele.length;
  return rest > 0 ? `${primele.join(", ")} și încă ${rest}` : primele.join(", ");
}

/**
 * Ce produs propunem pentru un anunt, si de ce.
 *
 * ═══ TREI TREPTE DE INCREDERE, IN ORDINE, PRIMA CARE RASPUNDE CASTIGA ═══
 *
 *   1. SKU  — codul produsului apare ca INTREG in titlul sau descrierea anuntului. E singurul
 *             semn pe care comerciantul l-a scris ca sa identifice produsul, nu ca sa-l vanda.
 *   2. TITLU IDENTIC — aceleasi cuvinte, in aceeasi ordine, dupa scoaterea diacriticelor si a
 *             semnelor.
 *   3. TITLU ASEMANATOR — aceleasi cuvinte cu inteles, in orice ordine, dupa scoaterea umpluturii
 *             de anunt („nou", „sigilat", „livrare gratuita").
 *
 * ⚠ NU EXISTA O TREAPTA „SEAMANA CAM 80%". Am incercat-o si am scos-o: orice masura pe caractere
 * da „Tricou negru" vs „Tricou negru XL" intre 0,80 si 0,88 — adica exact perechea periculoasa
 * trece pragul, iar la titluri mai lungi trece si mai usor („tricou bumbac organic negru barbati"
 * + „xl" = 5 cuvinte din 6 = 0,83). Un prag care sa taie perechea aia ar trebui sa fie atat de sus
 * incat n-ar mai lasa nimic sa treaca. Deci treapta 3 nu e un prag, e o REGULA: ce ramane dupa
 * umplutura trebuie sa fie identic. Un „XL", un „42" sau un „500 ml" in plus opreste potrivirea,
 * fiindca nu sunt pe lista de umplutura si nu vor fi.
 *
 * ⚠ O TREAPTA CU MAI MULTI CASTIGATORI NU COBOARA LA URMATOAREA. Daca doua produse au acelasi
 * titlu, faptul ca unul dintre ele are si SKU-ul in descriere nu e o departajare, e un al doilea
 * indiciu peste o intrebare la care raspunsul e „nu stiu". Se spune ca nu stim, si alege omul.
 */
function propune(
  advert: OlxAdvert,
  candidati: Candidat[],
  cuSku: { p: Candidat; cheie: string }[],
  dupaTitlu: Map<string, Candidat[]>,
  dupaMiez: Map<string, Candidat[]>,
): { propunere: OlxPotrivire | null; fara: string | null } {
  const titlu = (advert.title ?? "").trim();
  const textTitlu = textDeCautat(titlu);
  const textTot = textDeCautat(`${titlu} ${advert.description ?? ""}`);

  // 1. SKU-ul produsului, scris de el in anunt.
  if (cuSku.length > 0) {
    const gasite = cuSku.filter((x) => textTot.includes(x.cheie));
    if (gasite.length === 1) {
      const { p, cheie } = gasite[0];
      const inTitlu = textTitlu.includes(cheie);
      return {
        propunere: {
          productId: p.id, numeProdus: p.name, sku: p.sku, fel: "sku",
          deCe: `Codul „${p.sku}” apare în ${inTitlu ? "titlul" : "descrierea"} anunțului`,
        },
        fara: null,
      };
    }
    if (gasite.length > 1) {
      return {
        propunere: null,
        fara: `În anunț apar codurile mai multor produse: ${numeScurte(gasite.map((x) => x.p))}. Alege tu, dacă e cazul.`,
      };
    }
  }

  if (!titlu) {
    return { propunere: null, fara: "Anunțul nu are titlu, deci nu avem după ce să îl potrivim." };
  }

  // 2. Titlu identic.
  const laFel = dupaTitlu.get(cheieTitlu(titlu)) ?? [];
  if (laFel.length === 1) {
    const p = laFel[0];
    return {
      propunere: { productId: p.id, numeProdus: p.name, sku: p.sku, fel: "titlu-identic", deCe: "Titlu identic" },
      fara: null,
    };
  }
  if (laFel.length > 1) {
    return {
      propunere: null,
      fara: `Mai multe produse au exact acest titlu: ${numeScurte(laFel)}. Nu propunem niciunul.`,
    };
  }

  // 3. Aceleasi cuvinte cu inteles.
  const miez = miezTitlu(titlu);
  /*
   * ⚠ Sub doua cuvinte cu inteles nu se propune nimic. „Bicicleta noua" si „Bicicleta, transport
   * gratuit" se reduc amandoua la {bicicleta}: o potrivire pe un singur cuvant obisnuit e o
   * coincidenta imbracata in verdict.
   */
  if (miez.length >= 2) {
    const asemanatoare = dupaMiez.get(miez.join(" ")) ?? [];
    if (asemanatoare.length === 1) {
      const p = asemanatoare[0];
      return {
        propunere: {
          productId: p.id, numeProdus: p.name, sku: p.sku, fel: "titlu-asemanator",
          deCe: "Aceleași cuvinte în titlu, în altă ordine sau cu cuvinte de umplutură în plus",
        },
        fara: null,
      };
    }
    if (asemanatoare.length > 1) {
      return {
        propunere: null,
        fara: `Titlul se potrivește la fel de bine cu mai multe produse: ${numeScurte(asemanatoare)}. Nu propunem niciunul.`,
      };
    }
  }

  return {
    propunere: null,
    fara: candidati.length === 0
      ? "Toate produsele magazinului au deja un anunț legat."
      : "Niciun produs din magazin nu se potrivește cu acest titlu.",
  };
}

/** Anunturile pe care le tratam ca vii; folosit DOAR la sortarea listei, nu la filtrare. */
const STARI_VII = new Set(["active", "limited", "new", "unconfirmed", "unpaid"]);

// ── Scanarea ──────────────────────────────────────────────────────────────────────

/**
 * Citeste contul OLX si intoarce anunturile care nu sunt inca ale noastre.
 *
 * ⚠ NU SE FILTREAZA DUPA STARE. Un anunt expirat sau dezactivat de el ramane in lista, fiindca a
 * fi „stins acum" nu inseamna „nu e produsul meu" — poate fi chiar produsul pe care vrea sa-l
 * reporneasca din Edinio. Starea se ARATA pe fiecare rand, si cele vii se sorteaza primele.
 */
export async function scaneazaAnunturileOlx(businessId: string): Promise<OlxScanare | { error: string }> {
  return cuJeton(businessId, async (token): Promise<OlxScanare | { error: string }> => {
    const admin = createAdminClient();

    /*
     * ⚠ CITIRI COMPLETE, NU PRIMELE 1000. `fetchAllRowsStrict` plimba fereastra si ARUNCA daca o
     * bucata cade: aici o citire pe jumatate n-ar da o eroare, ar da un raspuns MAI PROST — produse
     * care par nelegate desi sunt, sau anunturi care par de importat desi nu mai sunt.
     */
    let produse: Candidat[];
    let legaturiRanduri: { offer_id: string; olx_advert_id: number | null }[];
    try {
      produse = await fetchAllRowsStrict<Candidat>("olx.import.produse", (from, to) =>
        admin.from("products").select("id, name, sku").eq("business_id", businessId).order("id").range(from, to));
      legaturiRanduri = await fetchAllRowsStrict<{ offer_id: string; olx_advert_id: number | null }>(
        "olx.import.legaturi", (from, to) =>
          admin.from("olx_adverts").select("offer_id, olx_advert_id").eq("business_id", businessId)
            .order("offer_id").range(from, to));
    } catch (e) {
      await logError({
        action: "olx.import.scanare", severity: "error",
        message: `citirea locala a picat: ${e instanceof Error ? e.message : String(e)}`,
        details: { businessId }, businessId,
      });
      return { error: "Nu am putut citi produsele magazinului. Încearcă din nou." };
    }

    const legaturi: Legaturi = {
      produseLuate: new Set(legaturiRanduri.map((r) => r.offer_id)),
      anunturiLuate: new Set(
        legaturiRanduri.map((r) => r.olx_advert_id).filter((x): x is number => x != null),
      ),
    };
    const totiIdProduse = new Set(produse.map((p) => p.id));

    /*
     * ⚠ UN PRODUS CARE ARE DEJA RAND IN `olx_adverts` NU SE PROPUNE. Conectarea l-ar rescrie, deci
     * o legatura buna ar fi inlocuita cu o presupunere. Randul ramane exclus indiferent de starea
     * lui: si unul sters de om, si unul respins, sunt hotarari sau fapte deja scrise despre produs.
     */
    const candidati = produse.filter((p) => !legaturi.produseLuate.has(p.id));

    /*
     * Ce a respins deja omul la o scanare de dinainte. Vezi `ignoraAnuntOlx`.
     *
     * ⚠ Se reciteste configul aici, nu se ia cel din `cuJeton`: intre pornirea scanarii si clipa
     * asta omul poate fi apasat „Ignoră" in alta fila, iar lista lui trebuie sa fie cea de acum.
     */
    const configAcum = await loadConfig(businessId);
    const ignorate = new Set(Array.isArray(configAcum.import_ignorate) ? configAcum.import_ignorate : []);

    const dupaTitlu = new Map<string, Candidat[]>();
    const dupaMiez = new Map<string, Candidat[]>();
    const cuSku: { p: Candidat; cheie: string }[] = [];
    const adauga = (harta: Map<string, Candidat[]>, cheie: string, p: Candidat) => {
      const lista = harta.get(cheie);
      if (lista) lista.push(p); else harta.set(cheie, [p]);
    };
    for (const p of candidati) {
      const t = cheieTitlu(p.name);
      if (t) adauga(dupaTitlu, t, p);
      const m = miezTitlu(p.name);
      if (m.length >= 2) adauga(dupaMiez, m.join(" "), p);
      /*
       * ⚠ SKU-urile scurte NU se cauta in text. Un cod de doua-trei semne („12", „A1") se
       * loveste de orice numar dintr-un titlu, iar propunerea ar arata la fel de sigura ca una
       * adevarata. Sub patru semne alfanumerice, treapta de SKU nu se aplica.
       */
      const bucati = cuvinte(p.sku ?? "");
      if (bucati.join("").length >= SKU_MIN) cuSku.push({ p, cheie: ` ${bucati.join(" ")} ` });
    }

    // ── Paginarea la ei ──────────────────────────────────────────────────────────
    const straine: OlxAdvert[] = [];
    const vazute = new Set<number>();
    let offset = 0;
    let totalCitite = 0;
    let taiat = true;
    for (let pagini = 0; pagini < MAX_PAGINI; pagini++) {
      const r = await listAdverts(token, { offset, limit: PAGINA });
      /*
       * ⚠ O PAGINA PICATA OPRESTE TOT. Sarita, ecranul ar spune „am găsit N anunțuri" pentru o
       * lista din care lipsesc tocmai cele necitite — iar omul ar crede ca restul nu exista si ar
       * publica din nou produsele, adica ar face al doilea anunt peste unul viu.
       */
      if (isOlxError(r)) {
        return { error: "Nu am putut citi lista de anunțuri de la OLX. Încearcă din nou peste câteva minute." };
      }
      /*
       * ⚠ CURSORUL MERGE PE CATE RANDURI AU TRIMIS EI, nu pe cate am pastrat noi. Numarat dupa
       * filtrare, un singur rand fara `id` ar face ca pagina urmatoare sa inceapa cu unul inapoi:
       * aceleasi anunturi citite din nou, la nesfarsit, si o lista plina de perechi duble.
       */
      const brut = r.data ?? [];
      offset += brut.length;
      totalCitite += brut.length;

      for (const a of brut) {
        if (!a?.id || vazute.has(a.id)) continue;
        vazute.add(a.id);
        // Deja al nostru dupa id-ul anuntului: nu e de importat, e de sincronizat.
        if (legaturi.anunturiLuate.has(a.id)) continue;
        /*
         * ⚠ RESPINS O DATA INSEAMNA RESPINS. Fara asta, un comerciant cu optzeci si patru de
         * anunturi vechi respinge saizeci si le vede pe toate din nou la scanarea urmatoare — iar
         * a doua oara nu le mai citeste una cate una, le sare pe toate, si atunci nici pe cele
         * care CHIAR erau ale lui.
         */
        if (ignorate.has(a.id)) continue;
        /*
         * Poarta `external_id` catre un produs CHIAR al magazinului: e treaba reconcilierii, care
         * il adopta singura si fara sa intrebe, fiindca acolo semnul e scris de noi.
         */
        const ext = typeof a.external_id === "string" && a.external_id.length > 0 ? a.external_id : null;
        if (ext && totiIdProduse.has(ext)) continue;
        straine.push(a);
      }

      if (brut.length < PAGINA) { taiat = false; break; }
      await pauza(250); // acelasi ritm ca la celelalte apeluri OLX din panou
    }

    const anunturi: OlxAnuntStrain[] = straine.map((a) => {
      const { propunere, fara } = propune(a, candidati, cuSku, dupaTitlu, dupaMiez);
      return {
        advertId: a.id,
        titlu: (a.title ?? "").trim(),
        status: a.status || "new",
        url: a.url ?? null,
        pret: a.price?.value ?? null,
        moneda: a.price?.currency ?? null,
        externalId: typeof a.external_id === "string" && a.external_id.length > 0 ? a.external_id : null,
        propunere,
        fara,
      };
    });

    /*
     * Randurile pe care omul poate apasa urca sus, apoi cele vii. Cu 800 de anunturi vechi in cont,
     * altfel cele 12 care conteaza ar sta pe la coada listei.
     */
    const rang = (x: OlxAnuntStrain) => (x.propunere ? 0 : 2) + (STARI_VII.has(x.status) ? 0 : 1);
    anunturi.sort((a, b) => rang(a) - rang(b) || a.titlu.localeCompare(b.titlu, "ro"));

    return {
      anunturi: anunturi.slice(0, MAX_RANDURI),
      totalCitite,
      totalStraine: anunturi.length,
      taiat,
      produseCandidate: candidati.length,
    };
  });
}

// ── Conectarea ────────────────────────────────────────────────────────────────────

/**
 * Omul a confirmat perechea: se scrie randul, si de aici incolo produsul intra in sincronizarea
 * obisnuita (pret, stoc, dezactivare la stoc zero).
 *
 * ═══ ⚠ INTRE SCANARE SI APASARE POT TRECE MINUTE ═══
 *
 * Ecranul arata o fotografie de acum cinci minute. In cele cinci minute: cronul poate fi publicat
 * produsul si l-a legat de ALT anunt; omul poate fi sters anuntul de pe telefon, din aplicatia
 * OLX; alta fila poate fi conectat deja acelasi anunt. Fiecare dintre ele face din apasarea asta
 * altceva decat ce vede el pe ecran, deci TOATE se verifica din nou, acum:
 *
 *   1. produsul e chiar al magazinului
 *   2. produsul n-a capatat intre timp un rand in `olx_adverts`
 *   3. anuntul nu e deja legat la alt produs al magazinului
 *   4. anuntul MAI EXISTA la ei, si ce poarta el acum e ce citim acum
 */
export async function conecteazaAnuntOlx(
  businessId: string, advertId: number, productId: string,
): Promise<{ success: true; status: string } | { error: string }> {
  if (!Number.isInteger(advertId) || advertId <= 0) return { error: "Anunț nevalid." };
  if (!productId) return { error: "Produs nevalid." };

  return cuJeton(businessId, async (token): Promise<{ success: true; status: string } | { error: string }> => {
    const admin = createAdminClient();

    // 1. Produsul e al magazinului. ⚠ `maybeSingle` + `error` citit: „nu exista" si „n-am putut
    //    citi" sunt doua raspunsuri diferite, iar al doilea nu are voie sa arate ca primul.
    const { data: produs, error: eProdus } = await admin
      .from("products").select("id, name").eq("id", productId).eq("business_id", businessId).maybeSingle();
    if (eProdus) return { error: "Nu am putut verifica produsul. Încearcă din nou." };
    if (!produs) return { error: "Produsul nu mai există în magazin. Reîncarcă lista." };

    // 2. Produsul n-a fost legat intre timp.
    const { data: randProdus, error: eRandProdus } = await admin
      .from("olx_adverts").select("olx_advert_id")
      .eq("business_id", businessId).eq("offer_id", productId).maybeSingle();
    if (eRandProdus) return { error: "Nu am putut verifica produsul. Încearcă din nou." };
    if (randProdus) {
      return {
        error: randProdus.olx_advert_id === advertId
          ? "Anunțul e deja legat de acest produs."
          : "Produsul a fost legat între timp de alt anunț OLX. Reîncarcă lista.",
      };
    }

    /*
     * 3. Anuntul nu e legat la alt produs.
     *
     * ⚠ `olx_adverts` n-are unicitate pe `olx_advert_id` — numai pe `(business_id, offer_id)`. Deci
     * baza NU ne opreste sa legam acelasi anunt de doua produse, iar rezultatul ar fi doua produse
     * care isi scriu pe rand pretul peste acelasi anunt viu. Verificarea asta e singura plasa.
     */
    const { data: randAnunt, error: eRandAnunt } = await admin
      .from("olx_adverts").select("offer_id")
      .eq("business_id", businessId).eq("olx_advert_id", advertId).limit(1).maybeSingle();
    if (eRandAnunt) return { error: "Nu am putut verifica anunțul. Încearcă din nou." };
    if (randAnunt) return { error: "Anunțul e deja legat de alt produs. Reîncarcă lista." };

    /*
     * 4. Mai exista la ei? ⚠ CITIRE, atat: niciun `PUT`, nicio comanda. Ce scriem in rand
     * (`status`, `olx_url`) vine din raspunsul de ACUM, nu din fotografia de la scanare.
     */
    const lor = await getAdvert(token, advertId);
    if (isOlxError(lor)) {
      return { error: "Anunțul nu mai există pe OLX sau nu l-am putut verifica. Reîncarcă lista." };
    }
    const advert = lor.data;
    if (!advert?.id) return { error: "Anunțul nu mai există pe OLX. Reîncarcă lista." };

    /*
     * ⚠ Daca intre timp a capatat `external_id` catre ALT produs al magazinului, nu e al nostru de
     * legat: reconcilierea il va adopta acolo unde arata el, si am face un al doilea stapan.
     */
    const ext = typeof advert.external_id === "string" && advert.external_id.length > 0 ? advert.external_id : null;
    if (ext && ext !== productId) {
      const { data: altul, error: eAltul } = await admin
        .from("products").select("id").eq("id", ext).eq("business_id", businessId).maybeSingle();
      if (eAltul) return { error: "Nu am putut verifica anunțul. Încearcă din nou." };
      if (altul) return { error: "Anunțul aparține între timp altui produs din magazin. Reîncarcă lista." };
    }

    /*
     * ⚠ `last_status_at` RAMANE GOL DINADINS. Indexul de sondare e `(last_status_at NULLS FIRST)`,
     * deci randul nou e primul la rand la urmatoarea sondare — si de acolo isi ia `valid_to`,
     * moderarea si statisticile, de la ei, fara sa le ghicim noi acum.
     */
    const acum = new Date().toISOString();
    const { error: eScris } = await admin.from("olx_adverts").insert({
      business_id: businessId,
      offer_id: productId,
      product_id: productId,
      olx_advert_id: advert.id,
      status: advert.status || "new",
      olx_url: advert.url ?? null,
      last_synced_at: acum,
    } as never);
    if (eScris) {
      /* 23505 = unicitate: alta fila a legat produsul intre citirea de la pasul 2 si scrierea asta. */
      if (eScris.code === "23505") {
        return { error: "Produsul tocmai a fost legat de alt anunț. Reîncarcă lista." };
      }
      await logError({
        action: "olx.import.conectare", severity: "error",
        message: `randul n-a putut fi scris: ${eScris.message}`,
        details: { businessId, advertId, productId }, businessId,
      });
      return { error: "Nu am putut salva legătura. Încearcă din nou." };
    }

    revalidatePath(FEATURE_PATH);
    return { success: true, status: advert.status || "new" };
  });
}

/**
 * Tine minte ca omul a respins un anunt la import.
 *
 * ═══ „IGNORĂ" TREBUIE SA TINA MINTE (01.09.2026) ═══
 *
 * Fara asta, butonul scotea randul doar din lista de ACUM. Un comerciant cu optzeci si patru de
 * anunturi vechi respinge saizeci si le vede pe toate din nou la scanarea urmatoare — iar a doua
 * oara nu le mai citeste una cate una, le sare pe toate, si atunci nici pe cele care chiar erau
 * ale lui.
 *
 * ⚠ Se scrie prin peticul atomic, ca orice altceva din config: citit si scris intreg, ar fi putut
 * calca un token reimprospatat intre timp.
 *
 * ⚠ Si NU se atinge nimic la OLX. „Respins la import" inseamna „nu e produsul meu din Edinio", nu
 * „sterge-l" — anuntul lui ramane exact cum era.
 */
export async function ignoraAnuntOlx(
  businessId: string, advertId: number,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const { data: ss, error: eConfig } = await admin
    .from("store_settings").select("olx_config").eq("business_id", businessId).single();
  /* ⚠ Citirea picata NU se ia drept „lista goala": am uita tot ce respinsese pana acum. */
  if (eConfig) return { error: "Nu am putut salva alegerea. Încearcă din nou." };
  const config = (ss?.olx_config as OlxConfig) ?? {};
  const deja = Array.isArray(config.import_ignorate) ? config.import_ignorate : [];
  if (deja.includes(advertId)) return { success: true };
  try {
    await patchOlxConfig(admin, businessId, { import_ignorate: [...deja, advertId].slice(-500) });
  } catch {
    return { error: "Nu am putut salva alegerea. Încearcă din nou." };
  }
  return { success: true };
}
