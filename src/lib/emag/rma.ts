/**
 * Retururile eMAG.
 *
 * ═══ ⚠ TRECERILE DE STARE SUNT UN TABEL, NU O INSIRUIRE DE `if`-URI ═══
 *
 * Documentatia lor da un tabel de treceri ingaduite, si spune ceva ce se sare usor:
 * „Some statuses were left out by design; these should not be used in any seller
 * implementation." Adica lista NU e completa cu toate numerele — e o lista alba.
 *
 * `EMAG_TRECERI_RETUR` din `types.ts` o tine ca date. Rostul: butonul care n-ar
 * trebui sa existe nu ajunge sub degetul comerciantului. Fara verificare, el ar
 * apasa „Respinge" pe un retur nou, eMAG ar refuza, iar mesajul lor n-ar spune
 * „intai confirma-l" — ar spune ceva despre un status invalid.
 *
 * ═══ ⚠ STOCUL NU SE PUNE INAPOI AUTOMAT. NICIODATA, DEOCAMDATA ═══
 *
 * Prima forma a acestui antet scria ca „stocul se pune inapoi doar pentru ce s-a
 * primit cu adevarat (status 6)". NU EXISTA niciun cod care sa faca asta. Era un
 * comentariu care descria o purtare inexistenta — chiar felul de minciuna impotriva
 * caruia e scris tot restul fisierului. Sters, si scris ce e adevarat:
 *
 * Marfa returnata NU intra singura inapoi in stoc. Comerciantul o adauga de mana,
 * dupa ce se uita la ea.
 *
 * Si e o alegere, nu o scapare: marfa intoarsa nu e mereu vandabila. Vine desfacuta,
 * zgariata, incompleta, sau pur si simplu alta decat cea trimisa. Un retur „Primit"
 * inseamna ca a ajuns coletul, nu ca produsul e bun de pus la loc pe raft. Pus
 * automat, magazinul ar fi vandut a doua oara ceva ce nu se mai poate vinde — iar al
 * doilea cumparator ar fi primit marfa stricata, ceea ce e mult mai rau decat un
 * stoc cu unu mai mic.
 *
 * ⚠ Cine schimba asta trebuie sa stie ce lipseste ca s-o poata face bine:
 * `rma.products[].quantity` poate fi mai mic decat cantitatea cumparata, si pot fi
 * returnate doar unele linii; iar `consuma_stoc_comanda_marketplace` n-are inca o
 * pereche care sa puna inapoi o cantitate PARTIALA cu marcaj de idempotenta.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { citesteRetururi, isEmagError, salveazaRetururi } from "./client";
import type { ContextEmag } from "./sync";
import { EMAG_TRECERI_RETUR, type EmagRetur } from "./types";

type Db = SupabaseClient<Database>;

/* ═══════════════════════════════════════════════════════════════════════════
   TRECERILE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Se poate trece de la starea asta la aia?
 *
 * ⚠ PUR SI PROBAT. O trecere nepermisa nu strica nimic la ei — o refuza — dar strica
 * increderea comerciantului in panou: apasa un buton, primeste o eroare in engleza
 * despre un camp, si nu intelege ca pur si simplu nu era randul acelei actiuni.
 *
 * ⚠ O stare NECUNOSCUTA nu ingaduie nimic. Documentatia spune ca unele statusuri au
 * fost lasate dinadins pe dinafara si nu trebuie folosite; presupuse permisive, am
 * fi construit butoane pentru stari despre care ei ne-au spus sa nu ne atingem.
 */
export function trecerePermisa(dinStare: number | null | undefined, inStare: number): boolean {
  if (dinStare == null) return false;
  const permise = EMAG_TRECERI_RETUR[dinStare];
  if (!permise) return false;
  return permise.includes(inStare);
}

/** Ce se poate face acum cu returul, ca sa se stie ce butoane se arata. */
export function treceriPosibile(dinStare: number | null | undefined): number[] {
  if (dinStare == null) return [];
  return [...(EMAG_TRECERI_RETUR[dinStare] ?? [])].filter((s) => s !== dinStare);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADUCEREA
   ═══════════════════════════════════════════════════════════════════════════ */

/** ⚠ Maximul lor la citire. */
const PE_PAGINA = 100;
const PAGINI_PE_STARE = 3;

/**
 * Starile din care un retur INCA se poate schimba.
 *
 * ⚠ 4 (Respins), 5 (Anulat) si 7 (Finalizat) sunt TERMINALE dupa chiar tabelul lor
 * de treceri: din ele nu se mai merge nicaieri. Recitite la fiecare sfert de ora,
 * ar fi mancat degeaba din cele 3 cereri pe secunda ale magazinului, iar la un
 * comerciant vechi ar fi fost cele mai multe.
 *
 * 1 (Incomplet) intra la citire ca sa SE VADA, desi din el nu se ofera nicio
 * trecere: documentatia spune ca unele statusuri sunt lasate dinadins pe dinafara
 * si nu trebuie folosite de vanzator. Se arata, nu se atinge.
 */
const STARI_VII: readonly number[] = [1, 2, 3, 6];

export interface RezultatRetururi {
  /** ⚠ `false` inseamna ca nu s-a citit tot. Vezi nota din `aduRetururile`. */
  ok: boolean;
  scrise: number;
}

/**
 * Retururile care se mai pot schimba.
 *
 * ═══ ⚠ NU EXISTA FEREASTRA DE MODIFICARE LA RETURURI. ASTA SCHIMBA TOT ═══
 *
 * Prima forma trimitea `modifiedAfter`, ca la comenzi. Verificat in schema lor
 * (`RMAReadFilter`): filtrul acela NU EXISTA. `/rma/read` primeste `date_start` si
 * `date_end`, iar documentatia le descrie limpede — „Only returns PLACED starting
 * with the mentioned date": data DESCHIDERII cererii, nu a ultimei modificari.
 *
 * Doua rele ieseau din asta, si niciunul n-ar fi dat vreo eroare:
 *
 *   1. Un filtru pe care ei nu-l cunosc e IGNORAT — chiar capcana scrisa in
 *      documentatia lor pentru oferte, unde un filtru pus gresit intoarce TOT.
 *      Deci fiecare trecere ar fi adus tot istoricul de retururi al magazinului.
 *
 *   2. Chiar daca ar fi mers, o fereastra pe data DESCHIDERII nu prinde niciodata
 *      un retur vechi caruia i s-a schimbat starea azi. Un retur deschis acum trei
 *      saptamani si primit in depozit astazi ar fi ramas „Nou" in Edinio pe veci,
 *      iar comerciantul n-ar fi stiut ca are marfa de procesat.
 *
 * Deci nu se citeste dupa timp, ci dupa STARE: numai retururile din care se mai
 * poate merge undeva. Multimea e mica prin natura ei — un magazin are cateva
 * retururi deschise, nu mii — si acopera si pe cele noi, fiindca un retur nou e in
 * starea 2.
 */
export async function aduRetururile(admin: Db, ctx: ContextEmag): Promise<RezultatRetururi> {
  const r: RezultatRetururi = { ok: true, scrise: 0 };

  for (const stare of STARI_VII) {
    for (let pagina = 1; pagina <= PAGINI_PE_STARE; pagina++) {
      const raspuns = await citesteRetururi(ctx.auth, {
        request_status: stare,
        currentPage: pagina,
        itemsPerPage: PE_PAGINA,
      });
      if (isEmagError(raspuns)) {
        r.ok = false;
        break;
      }

      const retururi = (Array.isArray(raspuns.data) ? raspuns.data : []) as EmagRetur[];
      for (const ret of retururi) {
        if (!Number.isFinite(ret?.emag_id)) continue;
        const scris = await scrieReturul(admin, ctx, ret);
        if (scris) r.scrise++;
        else r.ok = false;
      }

      if (retururi.length < PE_PAGINA) break;
      if (pagina === PAGINI_PE_STARE) r.ok = false;
    }
  }

  return r;
}

/**
 * Un retur, scris la noi.
 *
 * ⚠ SE LEAGA DE COMANDA PRIN `emag_orders`, nu prin `orders`. Comanda poate lipsi de
 * la noi (retur pentru o vanzare dinainte de integrare), si atunci returul se scrie
 * oricum, fara legatura — se vede si se poate lucra la el. Sarit, comerciantul ar fi
 * primit marfa inapoi fara nicio urma in Edinio.
 */
async function scrieReturul(admin: Db, ctx: ContextEmag, ret: EmagRetur): Promise<boolean> {
  let orderId: string | null = null;
  if (Number.isFinite(ret.order_id)) {
    const { data } = await admin.from("emag_orders")
      .select("order_id").eq("business_id", ctx.businessId).eq("emag_order_id", ret.order_id).maybeSingle();
    orderId = (data as { order_id: string | null } | null)?.order_id ?? null;
  }

  const { error } = await admin.from("emag_rma").upsert({
    business_id: ctx.businessId,
    emag_rma_id: ret.emag_id,
    order_id: orderId,
    /* ⚠ Se scrie SI id-ul comenzii LOR, nu doar legatura la comanda noastra. Un
       retur pentru o vanzare dinainte de integrare n-are `order_id`, iar fara asta
       n-ar mai fi ramas nicio urma despre ce comanda a fost — nici macar la ei. */
    emag_order_id: Number.isFinite(ret.order_id) ? ret.order_id : null,
    request_status: ret.request_status ?? null,
    return_type: ret.return_type ?? null,
    return_reason: ret.return_reason ?? null,
    products: (ret.products ?? []) as never,
    awbs: (ret.awbs ?? []) as never,
    raw: ret as never,
    updated_at: new Date().toISOString(),
  } as never, { onConflict: "business_id,emag_rma_id" });

  if (error) {
    await logError({
      action: "emag/rma",
      message: `returul nu s-a putut scrie: ${error.message}`,
      details: { emagRmaId: ret.emag_id },
      businessId: ctx.businessId,
      severity: "warning",
    });
    return false;
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCHIMBAREA STARII
   ═══════════════════════════════════════════════════════════════════════════ */

export type RezultatRetur = { fel: "schimbat" } | { fel: "esec"; mesaj: string };

/**
 * Campurile pe care `rma/save` le cere OBLIGATORIU, citate din schema lor.
 *
 * ⚠ Sunt zece. Pana pe 24.08.2026 trimiteam doua.
 */
export const CAMPURI_CERUTE_LA_RETUR = [
  "emag_id", "order_id", "type", "customer_name", "customer_phone",
  "pickup_locality_id", "pickup_method", "return_type", "return_reason", "date",
] as const;

/**
 * Incarcatura pentru `rma/save`, facuta din returul asa cum ni l-au dat ei.
 *
 * ═══ ⚠ SE TRIMITE TOT, NU DOAR CE SE SCHIMBA (audit 24.08.2026) ═══
 *
 * Forma dinainte trimitea `{ emag_id, request_status }` si atat. Dar `RMASave` cere
 * ZECE campuri obligatorii: `order_id`, `type`, `customer_name`, `customer_phone`,
 * `pickup_locality_id`, `pickup_method`, `return_type`, `return_reason`, `date`.
 *
 * Deci fiecare apasare de „Acceptă returul" sau „Refuză returul" pleca incompleta.
 * Comerciantul vedea starea schimbata la NOI — o scriem local imediat dupa — si
 * nimic schimbat la ei. Adica exact tiparul care ne-a costat cel mai mult azi.
 *
 * ⚠ Regula era deja scrisa in casa, la `salveazaComenzi`: „Se trimit TOATE campurile
 * citite initial, nu doar cele schimbate." Nu fusese urmata si la retururi.
 *
 * ⚠ Se refuza INAINTE de a chema eMAG cand lipseste ceva. Trimisa oricum, cererea
 * s-ar fi intors cu un mesaj despre un camp, iar comerciantul n-avea de unde sa stie
 * ca lipsa vine din ce ne-au trimis EI la citire.
 */
export function incarcaturaRetur(
  raw: unknown, inStare: number,
): { fel: "gata"; date: Record<string, unknown> } | { fel: "lipsesc"; campuri: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const lipsesc = CAMPURI_CERUTE_LA_RETUR.filter((c) => {
    const v = r[c];
    return v === undefined || v === null || v === "";
  });
  if (lipsesc.length > 0) return { fel: "lipsesc", campuri: [...lipsesc] };
  return { fel: "gata", date: { ...r, request_status: inStare } };
}

/**
 * Trece returul intr-o alta stare.
 *
 * ⚠ SE VERIFICA INTAI CE STIM NOI, si abia apoi se cheama eMAG. Doua motive: nu
 * cheltuim o cerere din cele 3 pe secunda pe ceva sigur refuzat, si mesajul de refuz
 * e al nostru, in romana, si spune ce se poate face in schimb.
 */
export async function schimbaStareaReturului(
  admin: Db, ctx: ContextEmag, emagRmaId: number, inStare: number,
): Promise<RezultatRetur> {
  const { data } = await admin.from("emag_rma")
    .select("request_status, raw").eq("business_id", ctx.businessId).eq("emag_rma_id", emagRmaId).maybeSingle();

  const rand = data as { request_status: number | null; raw: unknown } | null;
  const acum = rand?.request_status ?? null;
  if (!trecerePermisa(acum, inStare)) {
    return {
      fel: "esec",
      mesaj: `Returul nu poate trece direct în starea cerută. Din starea curentă se poate merge doar în: ${
        treceriPosibile(acum).join(", ") || "niciuna"
      }.`,
    };
  }

  /* ⚠ Tot returul, nu doar starea. Vezi `incarcaturaRetur`. */
  const incarcatura = incarcaturaRetur(rand?.raw, inStare);
  if (incarcatura.fel === "lipsesc") {
    return {
      fel: "esec",
      mesaj:
        "Returul nu se poate trimite înapoi la eMAG: din ce ne-au trimis ei lipsesc " +
        `${incarcatura.campuri.join(", ")}. Reîmprospătează lista de retururi și încearcă din nou.`,
    };
  }

  const r = await salveazaRetururi(ctx.auth, [incarcatura.date as unknown as EmagRetur]);
  if (isEmagError(r)) return { fel: "esec", mesaj: r.error };

  await admin.from("emag_rma")
    .update({ request_status: inStare, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.businessId).eq("emag_rma_id", emagRmaId);

  return { fel: "schimbat" };
}

/* ═══════════════════════════════════════════════════════════════════════════
   AWB-UL DE RIDICARE LA RETUR (§53)
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cine ridică marfa înapoi. ⚠ Numai `2` e treaba comerciantului. */
export const PICKUP_CURIER_EMAG = 1;
export const PICKUP_CURIER_PROPRIU = 2;
export const PICKUP_TRIMIS_DE_CLIENT = 3;

export type PoateAwbRetur =
  | { se_poate: true; emagOrderId: number }
  | { se_poate: false; motiv: string };

/**
 * Se poate emite AWB de ridicare pentru returul ăsta?
 *
 * ═══ ⚠ FIECARE „NU" DE AICI ESTE BANI ═══
 *
 * Un AWB emis cheamă curierul și se plătește. Butonul arătat unde nu trebuie nu
 * greșește un ecran — greșește o factură.
 *
 * Funcție curată, ca să se poată proba întreagă fără rețea și fără bază de date.
 */
export function poateAwbRetur(p: {
  /** `pickup_method` din retur: 1 = curier eMAG · 2 = curierul tău · 3 = trimis de client. */
  pickupMethod: number | null | undefined;
  /** `request_status`: 2 nou · 3 confirmat · 4 respins · 5 anulat · 6 primit · 7 finalizat. */
  stare: number | null | undefined;
  /** AWB-uri deja emise pentru returul ăsta. */
  awbs: unknown;
  /** Comanda eMAG de care ține returul. */
  emagOrderId: number | null | undefined;
  /** Localitatea de ridicare cerută de client, și cea a comenzii. */
  pickupLocalityId: number | null | undefined;
  localitateComanda: number | null | undefined;
  /** Are comanda o stradă în adresa de livrare? */
  areStrada: boolean;
}): PoateAwbRetur {
  /*
   * ⚠ CEA MAI SCUMPĂ VERIFICARE DIN TOATĂ FUNCȚIA.
   *
   * `1` înseamnă că vine curierul eMAG; `3`, că trimite clientul singur. În amândouă
   * cazurile transportul e deja rezolvat — un AWB emis de noi ar fi un AL DOILEA
   * curier, plătit degeaba, trimis să ridice un colet care nu mai e acolo.
   */
  if (p.pickupMethod === PICKUP_CURIER_EMAG) {
    return { se_poate: false, motiv: "Ridicarea o face curierul eMAG. Nu emite tu AWB." };
  }
  if (p.pickupMethod === PICKUP_TRIMIS_DE_CLIENT) {
    return { se_poate: false, motiv: "Clientul trimite el coletul. Nu e nevoie de AWB." };
  }
  if (p.pickupMethod !== PICKUP_CURIER_PROPRIU) {
    /* ⚠ Necunoscut NU înseamnă „mergi înainte". eMAG poate adăuga metode; presupusă
       permisivă, prima metodă nouă ar fi însemnat curieri plătiți degeaba. */
    return { se_poate: false, motiv: "Nu se știe cine ridică marfa. Verifică returul în panoul eMAG." };
  }

  /* ⚠ Un AWB emis deja nu se emite a doua oară: al doilea curier vine și se plătește.
     `cuRegistru` apără și el, dar acolo apără DUPĂ apăsare — aici nici nu se oferă. */
  if (Array.isArray(p.awbs) && p.awbs.length > 0) {
    return { se_poate: false, motiv: "Există deja un AWB de ridicare pentru returul ăsta." };
  }

  /*
   * ⚠ Numai din „Confirmat". Din tabelul lor de treceri, drumul e
   * Nou (2) → Confirmat (3) → Primit (6). Un curier chemat pe un retur încă
   * neconfirmat pleacă după marfă pe care poate nici n-o accepți; pe unul deja primit,
   * pleacă după un colet care e la tine în depozit.
   */
  if (p.stare !== 3) {
    return {
      se_poate: false,
      motiv: p.stare === 2
        ? "Confirmă întâi returul, apoi cheamă curierul."
        : "Returul nu mai e în starea în care se cheamă un curier.",
    };
  }

  if (!p.emagOrderId || !Number.isFinite(p.emagOrderId)) {
    /* `AWBSave` cere `order_id` chiar și la retururi — e în lista lor de câmpuri
       obligatorii. Fără comanda legată n-avem ce trimite. */
    return { se_poate: false, motiv: "Returul nu e legat de o comandă eMAG cunoscută." };
  }

  if (!p.areStrada) {
    return { se_poate: false, motiv: "Nu avem adresa clientului. Emite AWB-ul din panoul eMAG." };
  }

  /*
   * ═══ ⚠ ADRESA DE RIDICARE POATE FI ALTA DECÂT CEA DE LIVRARE ═══
   *
   * Returul poartă `pickup_locality_id` — localitatea de unde cere clientul să fie
   * ridicat coletul. Strada, în schimb, nu e nicăieri în retur: singura pe care o avem
   * e cea din comandă.
   *
   * Când localitățile diferă, clientul a cerut ridicarea din altă parte. Lipite,
   * strada din orașul A cu localitatea B fac o adresă care nu există — iar curierul
   * pleacă acolo și se plătește oricum.
   */
  if (
    p.pickupLocalityId != null && p.localitateComanda != null
    && Number(p.pickupLocalityId) !== Number(p.localitateComanda)
  ) {
    return {
      se_poate: false,
      motiv: "Clientul cere ridicarea din altă localitate decât cea de livrare. Emite AWB-ul din panoul eMAG.",
    };
  }

  return { se_poate: true, emagOrderId: Number(p.emagOrderId) };
}
