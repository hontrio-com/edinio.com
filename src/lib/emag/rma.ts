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
 * ═══ ⚠ UN RETUR NU E O COMANDA INTOARSA ═══
 *
 * `rma.products[].product_id` e id-ul NOSTRU de oferta, ca la comenzi. Dar
 * cantitatea returnata poate fi mai mica decat cea cumparata, si pot fi returnate
 * doar unele linii. Stocul se pune inapoi DOAR pentru ce s-a primit cu adevarat
 * (status 6 = „Primit"), nu la deschiderea cererii — altfel un retur anuntat si
 * neexpediat niciodata ar fi umflat stocul cu marfa care n-a venit.
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
    .select("request_status").eq("business_id", ctx.businessId).eq("emag_rma_id", emagRmaId).maybeSingle();

  const acum = (data as { request_status: number | null } | null)?.request_status ?? null;
  if (!trecerePermisa(acum, inStare)) {
    return {
      fel: "esec",
      mesaj: `Returul nu poate trece direct în starea cerută. Din starea curentă se poate merge doar în: ${
        treceriPosibile(acum).join(", ") || "niciuna"
      }.`,
    };
  }

  const r = await salveazaRetururi(ctx.auth, [{ emag_id: emagRmaId, request_status: inStare } as EmagRetur]);
  if (isEmagError(r)) return { fel: "esec", mesaj: r.error };

  await admin.from("emag_rma")
    .update({ request_status: inStare, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.businessId).eq("emag_rma_id", emagRmaId);

  return { fel: "schimbat" };
}
