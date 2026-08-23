/**
 * AWB-urile eMAG: expedierea catre client si ridicarea de la el.
 *
 * ═══ ⚠ ID-UL PRIMIT LA EMITERE SE SCRIE IMEDIAT, ALTFEL SE PIERDE PE VECI ═══
 *
 * Nu e o precautie generala. `/awb/read` primeste, dupa chiar schema lor, EXACT doua
 * filtre: `emag_id` si `reservation_id`. Nu exista niciun filtru pe comanda.
 *
 * Deci daca id-ul intors de `/awb/save` nu se scrie la noi in aceeasi clipa, nu mai
 * exista NICIO cale de a regasi acel AWB prin API: nici dupa comanda, nici dupa
 * numar, nici dupa data. Coletul pleaca, dar Edinio nu mai stie nimic despre el —
 * nici statusul, nici PDF-ul, nici daca s-a livrat. Iar comerciantul vede o comanda
 * expediata fara numar de urmarire, si nu are ce sa faca decat sa emita alt AWB.
 *
 * De aceea scrierea se face INAINTE de orice altceva, si o scriere cazuta e
 * `critical` in jurnal.
 *
 * ═══ ⚠ DOUA FELURI DE AWB, DOUA CHEI DE REGISTRU ═══
 *
 * `awb_type: 1` = livrare catre client, `2` = ridicare de la el (retur). Aceeasi
 * comanda are nevoie de amandoua, la momente diferite. Cu o singura cheie in
 * registru, AWB-ul de retur ar fi primit `deja` din cauza celui de livrare emis cu o
 * saptamana inainte — si n-ar fi fost emis niciodata, iar marfa ar fi ramas la client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { cuRegistru } from "@/lib/operatii/registru";
import { ziuaInTara } from "./auth";
import { citesteAwb, isEmagError, salveazaAwb } from "./client";
import type { ContextEmag } from "./sync";
import type { EmagAwb, EmagContCurier } from "./types";

/* Reexport, ca apelantii de server sa nu trebuiasca sa stie de doua fisiere. */
export { coleteDeTrimis, type ColetCm } from "./colete";

type Db = SupabaseClient<Database>;

/** 1 = livrare catre client · 2 = ridicare de la client (retur). */
export type FelAwb = 1 | 2;

/**
 * Ce cont de curier se poate folosi.
 *
 * ═══ ⚠ O LISTA GOALA SI UNA LIPSA NU INSEAMNA ACELASI LUCRU ═══
 *
 * `enforced_vendor_courier_accounts` din comanda:
 *
 *   `null` sau lipsa  -> oricare cont al vanzatorului
 *   lista NE-GOALA    -> NUMAI conturile din ea. eMAG refuza restul.
 *   lista GOALA       -> ⚠ niciun cont ingaduit. NU se poate emite AWB de marketplace.
 *
 * Al treilea caz e cel care se citeste gresit. Tratat ca „oricare", am fi trimis un
 * cont si am fi primit un refuz pe care nimeni nu l-ar fi legat de cauza; tratat ca
 * „lista ne-goala", am fi ales din nimic. Aici se spune limpede ce e.
 */
export type AlegereCurier =
  | { fel: "oricare" }
  | { fel: "din_lista"; conturi: number[] }
  | { fel: "imposibil" };

export function alegereaCurierului(impuse: number[] | null | undefined): AlegereCurier {
  if (impuse == null) return { fel: "oricare" };
  if (impuse.length === 0) return { fel: "imposibil" };
  return { fel: "din_lista", conturi: impuse };
}

/**
 * Contul de curier de folosit, dintre cele disponibile.
 *
 * ⚠ SE FILTREAZA SI DUPA `courier_account_type`. Documentatia lor: 1 = RMA, 2 =
 * Order, 3 = amandoua, 4 = non-marketplace. Un cont de tip 1 trimis pentru livrarea
 * unei comenzi e refuzat — iar mesajul lor vorbeste despre cont, nu despre tip, deci
 * comerciantul ar fi cautat greseala in alta parte.
 *
 * ⚠ Si dupa `status`: un cont inactiv arata la fel ca unul activ in lista.
 */
export function contPotrivit(
  conturi: EmagContCurier[],
  fel: FelAwb,
  alegere: AlegereCurier,
  preferat?: number | null,
): number | null {
  if (alegere.fel === "imposibil") return null;

  const potrivit = (c: EmagContCurier) => {
    if (c.status !== 1) return false;
    const tip = c.courier_account_type;
    if (tip == null) return true;
    if (fel === 2) return tip === 1 || tip === 3;
    return tip === 2 || tip === 3;
  };

  const ingaduit = (id: number | undefined) =>
    alegere.fel === "oricare" || (id != null && alegere.conturi.includes(id));

  const bune = conturi.filter((c) => potrivit(c) && ingaduit(c.account_id));
  if (bune.length === 0) return null;

  if (preferat != null && bune.some((c) => c.account_id === preferat)) return preferat;
  return bune[0].account_id ?? null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   EMITEREA
   ═══════════════════════════════════════════════════════════════════════════ */

export type RezultatAwb =
  | { fel: "emis"; emagId: number; numar: string | null }
  | { fel: "deja"; emagId: number | null; numar: string | null }
  | { fel: "esec"; mesaj: string };

/**
 * Emite un AWB si scrie imediat ce a raspuns eMAG.
 *
 * ⚠ `date` E OBLIGATORIU LA AWB-URILE DE RETUR (`awb_type: 2`). Fara el, eMAG
 * raspunde cu un refuz care nu spune care camp lipseste — si e usor de ratat,
 * fiindca la AWB-ul de livrare acelasi camp e optional. Se pune aici, o data.
 */
export async function emiteAwb(
  admin: Db,
  ctx: ContextEmag,
  p: {
    orderId: string;
    /** Id-ul comenzii la eMAG, sau al returului. Unul dintre ele, nu amandoua. */
    emagOrderId?: number;
    emagRmaId?: number;
    fel: FelAwb;
    awb: Omit<EmagAwb, "order_id" | "rma_id">;
  },
): Promise<RezultatAwb> {
  const cerere: EmagAwb = {
    ...p.awb,
    ...(p.emagOrderId != null ? { order_id: p.emagOrderId } : {}),
    ...(p.emagRmaId != null ? { rma_id: p.emagRmaId } : {}),
    /*
     * ⚠ La retur, `date` e obligatoriu. Se pune ziua de azi cand apelantul n-a dat
     * alta: un AWB de ridicare fara data e refuzat, iar mesajul lor nu spune de ce.
     *
     * ⚠ SI SE IA ZIUA DIN TARA CONTULUI, NU DIN UTC. Prima forma scria
     * `new Date().toISOString().slice(0, 10)`. Masurat: la 00:30 ora Romaniei iese
     * ZIUA DE IERI, fiindca in UTC e inca 21:30. Un curier chemat sa ridice marfa
     * intre miezul noptii si ora trei ar fi primit o data de ridicare IN TRECUT, iar
     * mesajul de refuz al eMAG vorbeste despre un camp, nu despre ceas — comerciantul
     * ar fi vazut ca „uneori nu merge noaptea" si n-ar fi avut ce sa raporteze.
     */
    ...(p.fel === 2 && !p.awb.date ? { date: ziuaInTara(ctx.auth.tara) } : {}),
  };

  const rez = await cuRegistru(
    admin,
    {
      businessId: ctx.businessId,
      orderId: p.orderId,
      fel: "awb",
      furnizor: "emag",
      /*
       * ⚠ FELUL INTRA IN CHEIE. Aceeasi comanda are nevoie si de AWB de livrare, si
       * de unul de ridicare la retur. Cu o cheie comuna, al doilea ar fi primit
       * `deja` din cauza primului si n-ar fi fost emis niciodata — marfa ar fi ramas
       * la client, iar comerciantul ar fi vazut „AWB emis" si un colet care nu vine.
       */
      cheie: `emag-awb-${p.fel}-${p.orderId}`,
    },
    async () => {
      const r = await salveazaAwb(ctx.auth, [cerere]);
      if (isEmagError(r)) throw new Error(r.error);

      const primit = primulAwb(r.data);
      if (primit.emagId == null) {
        /*
         * ⚠ Raspuns fara id = NU stim daca s-a emis. Aruncat drept „necunoscut" mai
         * jos, registrul blocheaza in loc sa reincerce — fiindca o reincercare ar
         * putea emite AL DOILEA AWB pentru acelasi colet, iar curierul ar veni de
         * doua ori si comerciantul ar plati de doua ori.
         */
        throw new Error("eMAG a raspuns fara id de AWB");
      }

      /* ═══ SCRIEREA CARE NU ARE VOIE SA LIPSEASCA ═══ */
      const { error } = await admin.from("emag_awb").insert({
        business_id: ctx.businessId,
        order_id: p.orderId,
        emag_id: primit.emagId,
        awb_number: primit.numar,
        courier_account_id: cerere.courier_account_id ?? null,
        cash_on_delivery: cerere.cod ?? null,
        status: { awb_type: p.fel } as never,
      });
      if (error) {
        /*
         * AWB-ul EXISTA la ei, dar nu l-am putut scrie. `/awb/read` nu are filtru pe
         * comanda, deci de acum inainte nu-l mai putem regasi prin API — vezi antetul
         * fisierului. Se striga tare, fiindca reparatia cere om.
         */
        await logError({
          action: "emag/awb",
          message: `AWB emis la eMAG dar NEscris la noi: ${error.message}`,
          details: { orderId: p.orderId, emagId: primit.emagId, numar: primit.numar },
          businessId: ctx.businessId,
          severity: "critical",
        });
      }

      return {
        referinta: String(primit.emagId),
        detalii: { awb_number: primit.numar, awb_type: p.fel },
        valoare: primit,
      };
    },
    (e) => {
      /*
       * ⚠ IMPLICITUL E „NU STIM". Un AWB emis de doua ori inseamna doua transporturi
       * platite si un curier care vine de doua ori. Numai refuzurile LIMPEZI ies
       * `esuat`; restul blocheaza si cer o privire de om. Aceeasi alegere ca in
       * `eroare-furnizor.ts`.
       */
      const m = (e instanceof Error ? e.message : "").toLowerCase();
      if (m.includes("invalid") || m.includes("not allowed") || m.includes("not found")) return "esuat";
      return "necunoscut";
    },
  );

  if (rez.fel === "facut") {
    const v = rez.valoare as { emagId: number; numar: string | null };
    return { fel: "emis", emagId: v.emagId, numar: v.numar };
  }
  if (rez.fel === "deja") {
    const d = rez.detalii as { awb_number?: string } | null;
    return { fel: "deja", emagId: rez.referinta ? Number(rez.referinta) : null, numar: d?.awb_number ?? null };
  }
  return { fel: "esec", mesaj: rez.mesaj };
}

/**
 * Id-ul si numarul din raspunsul lor.
 *
 * ⚠ Forma nu e descrisa in schema, doar in proza: „an `awb` array (with `emag_id`,
 * `awb_number`, `awb_barcode`)". Deci se citeste aparat, si ce nu se recunoaste
 * intoarce `null` — niciodata o valoare inventata.
 */
export function primulAwb(brut: unknown): { emagId: number | null; numar: string | null } {
  const cauta = (x: unknown): { emagId: number | null; numar: string | null } | null => {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    const id = o.emag_id;
    const numar = o.awb_number ?? o.awb_barcode;
    if (typeof id === "number" && Number.isFinite(id)) {
      return { emagId: id, numar: typeof numar === "string" ? numar : null };
    }
    if (Array.isArray(o.awb)) {
      for (const el of o.awb) {
        const g = cauta(el);
        if (g) return g;
      }
    }
    return null;
  };

  const lista = Array.isArray(brut) ? brut : [brut];
  for (const el of lista) {
    const g = cauta(el);
    if (g) return g;
  }
  return { emagId: null, numar: null };
}

/**
 * Statusul unui AWB, adus de la ei.
 *
 * ⚠ SE CERE DUPA `emag_id`, fiindca alt filtru NU EXISTA. De aceea id-ul se scrie la
 * emitere; fara el, functia asta n-ar avea ce sa intrebe.
 */
export async function statusAwb(ctx: ContextEmag, emagId: number): Promise<unknown | { error: string }> {
  const r = await citesteAwb(ctx.auth, { emag_id: emagId });
  if (isEmagError(r)) return { error: r.error };
  return r.data;
}
