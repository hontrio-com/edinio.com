import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { finalizeazaPlataComenzii } from "@/lib/orders/finalizare-plata";
import { resolveNetopiaStatus } from "@/lib/netopia";
import { anuntaEmailIntoarcere, intoarcereDinTranzitie } from "@/lib/email-marketing/comanda";

/**
 * „Netopia spune ca plata comenzii asta e in starea X." Un singur loc, pentru toate drumurile.
 *
 * ═══ DE CE E UN MODUL, NU O BUCATA DE RUTA ═══
 *
 * Pana azi regula traia INTREAGA in `/api/netopia/notify`, fiindca exista o singura cale prin care
 * aflam ce s-a intamplat cu o plata: notificarea lor. Acum sunt doua, fiindca `/operation/status`
 * s-a dovedit ca raspunde (vezi `docs/plati/NETOPIA.md`), deci putem si INTREBA.
 *
 * Lasata in ruta, a doua cale ar fi cerut o a doua copie a regulii: verificarea sumei, tranzitia
 * comenzii, finalizarea idempotenta, urma pentru refuz. Doua copii ale unei reguli despre bani se
 * departeaza una de alta, si niciodata amandoua deodata. Vezi memoria `acelasi-lucru-in-doua-copii`,
 * unde pe 16.09 erau OPT, si o data ORIGINALUL era cel stricat.
 *
 * ⚠ CE RAMANE IN RUTA: doar ce e al HTTP-ului, adica autentificarea jetonului si traducerea
 * verdictului in `errorCode`. Acelea n-au inteles pentru un cron.
 */

export interface ComandaDeMiscat {
  id: string;
  business_id: string;
  status: string | null;
  payment_status: string | null;
  total: number | string | null;
  order_number: string | null;
}

/** Ce ne-au spus ei despre plata, oricum am aflat-o. */
export interface SpuseleLor {
  status: number;
  ntpID?: string | null;
  /** Suma incasata, in unitati MAJORE (1 = un leu). Vezi nota din `netopia.ts`. */
  incasat?: number | null;
  codLor?: string | null;
  mesajLor?: string | null;
}

export type Verdict =
  /** Comanda a devenit platita ACUM, sau era deja. */
  | { fel: "platita" }
  /** Plata a fost refuzata de banca. Comanda NU s-a miscat, dinadins. */
  | { fel: "refuzata" }
  /** Banii s-au intors. */
  | { fel: "rambursata" }
  /** Stare de asteptare pe care o cunoastem. Comanda nu s-a miscat, si asa e corect. */
  | { fel: "intermediara" }
  /** Cod pe care nu-l stim. Comanda nu s-a miscat, si s-a scris in jurnal ca harta sa creasca. */
  | { fel: "necunoscuta" }
  /**
   * N-am putut duce la capat. ⚠ Apelantul TREBUIE sa ceara o repetare (IPN) sau sa reia mai tarziu
   * (cron): o plata pierduta e mai rea decat o notificare repetata.
   */
  | { fel: "esec"; mesaj: string; suma?: true };

export async function aplicaStatusulNetopia(
  admin: SupabaseClient<Database>,
  order: ComandaDeMiscat,
  spuse: SpuseleLor,
  /** De unde am aflat. Intra in jurnal, ca sa se poata deosebi o plata reconciliata de una notificata. */
  sursa: "notify" | "reconciliere",
): Promise<Verdict> {
  const { orderStatus, paymentStatus: nou, refuzat, intermediar } = resolveNetopiaStatus(spuse.status);
  const actiune = sursa === "notify" ? "netopia/notify" : "netopia/reconciliere";

  /*
   * ═══ ⚠⚠ O PLATA REFUZATA NU ANULEAZA COMANDA ═══
   *
   * Statusul 12 e „invalid account" / „rejected" in specificatia lor, adica un refuz al bancii, nu o
   * hotarare a cumparatorului. Pana pe 16.09 il anulam, iar `/api/netopia/start` refuza sa porneasca
   * o plata pe o comanda anulata: un card refuzat omora comanda pentru totdeauna.
   *
   * ⚠ `warning`, nu `critical`: un card refuzat e o intamplare obisnuita intr-un magazin. Ridicata
   * la critical, alarma s-ar toci si n-ar mai fi citita cand chiar conteaza.
   */
  if (refuzat) {
    await logError({
      action: actiune,
      message:
        `Plata cu cardul a fost REFUZATA pentru comanda ${order.order_number ?? order.id} `
        + `(status ${spuse.status}: cont invalid / tranzactie respinsa). Comanda ramane in asteptare, `
        + "iar clientul poate reincerca plata.",
      details: { orderId: order.id, ntpID: spuse.ntpID, status: spuse.status },
      businessId: order.business_id,
      severity: "warning",
    });
    return { fel: "refuzata" };
  }

  /*
   * SUMA. Semnatura dovedeste ca notificarea vine de la Netopia si e legata de ACEASTA comanda, dar
   * nu spune nimic despre cat s-a incasat. Fara verificarea de mai jos, o plata partiala marca
   * oricum comanda „platita", declansa facturarea automata si o trecea in „confirmata":
   * comerciantul livra marfa pe bani mai putini.
   *
   * Toleranta de un ban, ca sa nu cada pe rotunjiri, si se accepta si incasarile MAI MARI (Netopia
   * poate adauga comisioane; un plus nu pagubeste comerciantul). Se refuza doar ce e sub total.
   */
  if (nou === "paid") {
    const incasat = Number(spuse.incasat);
    const datorat = Number(order.total);
    if (!Number.isFinite(incasat)) {
      console.error(`[${actiune}] plata fara suma`, { orderId: order.id, ntpID: spuse.ntpID });
      return { fel: "esec", mesaj: "Missing amount", suma: true };
    }
    if (Number.isFinite(datorat) && incasat + 0.01 < datorat) {
      console.error(`[${actiune}] suma incasata sub totalul comenzii, comanda NU se marcheaza platita`, {
        orderId: order.id, numar: order.order_number, incasat, datorat,
      });
      return { fel: "esec", mesaj: "Amount mismatch", suma: true };
    }
  }

  /*
   * ⚠ Netopia trece prin ACELEASI doua motoare ca restul platformei. Aici se scria direct in
   * `orders`, cu un rezultat neverificat, iar anularea venita de la procesator elibera cuponul dar
   * NU stocul, fiindca nu trecea prin `aplica_tranzitia_comenzii`.
   */
  if (orderStatus) {
    const { data: t, error: eT } = await admin.rpc("aplica_tranzitia_comenzii", {
      p_order_id: order.id,
      p_status: orderStatus,
      /* Plata se scrie separat, mai jos: acolo e idempotenta si tot ce urmeaza dupa plata. */
      p_payment_status: null,
      p_business_id: order.business_id,
    });
    const rez = t as { gasit?: boolean; stoc?: string } | null;
    if (eT || rez?.gasit !== true) {
      await logError({
        action: actiune,
        message: eT?.message ?? "tranzitia comenzii n-a raspuns valid",
        details: { orderId: order.id, orderStatus, raspuns: rez },
        businessId: order.business_id,
        severity: "critical",
      });
      return { fel: "esec", mesaj: "State update failed" };
    }
    if (rez.stoc === "necunoscut") {
      await logError({
        action: actiune,
        message: "Comanda e dinainte de inregistrarea stocului rezervat; stocul NU s-a dat inapoi automat.",
        details: { orderId: order.id }, businessId: order.business_id, severity: "warning",
      });
    }
    /* Anulata de la procesator: si din email marketing (`lib/email-marketing/comanda.ts`). */
    const intoarsa = intoarcereDinTranzitie({ statusNou: orderStatus, statusSchimbat: true, plataSchimbata: false });
    if (intoarsa) anuntaEmailIntoarcere(order.id, intoarsa, order.business_id);
  }

  if (nou === "paid") {
    const r = await finalizeazaPlataComenzii(admin, { id: order.id, businessId: order.business_id });
    if (r.fel === "esuat") return { fel: "esec", mesaj: "Payment update failed" };
    return { fel: "platita" };
  }

  if (nou) {
    /*
     * ⚠ AICI NU SE PUNE `.neq("payment_status", "paid")`, SI E O DECIZIE.
     *
     * Am pus-o, crezand ca apar un `paid` de un IPN de esec intarziat. Nu exista asa ceva:
     * `resolveNetopiaStatus` intoarce un `paymentStatus` in DOUA situatii, 3/5 => „paid" (tratat de
     * ramura de deasupra) si 8 => „refunded". Niciun status de esec nu produce vreun `paymentStatus`,
     * deci ramura asta se atinge EXCLUSIV pentru rambursari.
     *
     * Iar o rambursare vine INTOTDEAUNA dupa o plata reusita, deci randul e chiar `paid` in acel
     * moment: garda le-ar fi respins pe TOATE, tacut. Adica reparatia ar fi stricat singurul lucru
     * pe care il face aceasta ramura.
     */
    const { error } = await admin
      .from("orders")
      .update({ payment_status: nou, updated_at: new Date().toISOString() })
      .eq("id", order.id);
    if (error) {
      await logError({
        action: actiune, message: error.message,
        details: { orderId: order.id, nou }, businessId: order.business_id, severity: "critical",
      });
      return { fel: "esec", mesaj: "Payment update failed" };
    }
    /* Ramura asta se atinge numai pentru rambursari (vezi mai sus). */
    anuntaEmailIntoarcere(order.id, "rambursata", order.business_id);
    return { fel: "rambursata" };
  }

  if (intermediar) {
    /*
     * ⚠ O STARE PE CARE O STIM, DECI NU SE NUMESTE „NERECUNOSCUTA".
     *
     * 1 („plata pornita, se asteapta cumparatorul") si 15 („3-D Secure authentication required") sunt
     * stari intermediare din specificatia lor. Comanda nu se misca, exact ca la un cod necunoscut,
     * dar mesajul trebuie sa spuna adevarul: un jurnal care zice „nerecunoscut" despre ceva
     * documentat trimite pe cine il citeste sa „repare" o harta care e deja corecta.
     *
     * ⚠ SI TOTUSI SE SCRIE. Masurat pe 16.09: ei trimit un SINGUR IPN, la deznodamant, deci pe
     * drumul obisnuit codurile astea nu ajung niciodata aici. Daca ajung, vrem sa aflam.
     */
    await logError({
      action: actiune,
      message: `stare intermediara Netopia (${spuse.status}). Comanda nu s-a miscat, si asa e corect.`,
      details: {
        orderId: order.id, status: spuse.status, ntpID: spuse.ntpID,
        codLor: spuse.codLor ?? null, mesajLor: spuse.mesajLor ?? null,
      },
      businessId: order.business_id,
      severity: "info",
    });
    return { fel: "intermediara" };
  }

  /*
   * ═══ ⚠ HARTA DE STATUSURI CRESTE DIN TRAFIC, NU DIN PRESUPUNERI ═══
   *
   * Ajungem aici cand codul lor nu inseamna nimic pentru noi, iar comanda ramane neatinsa. Aia e
   * purtarea corecta si nu se schimba: cand de partea cealalta sunt bani, tacerea pe necunoscut e
   * mai buna decat o ghicitura.
   *
   * Dar pana pe 16.09 nici nu se AFLA. Randul asta le strange, cu tot cu mesajul lor, exact cum s-a
   * facut harta Woot si cum se strange vocabularul Cargus. ⚠ Si a lucrat: codul 8 (rambursarea) a
   * fost prins de el la mai putin de o ora dupa ce a fost pus.
   *
   * ⚠ `info`, nu alarma: nu s-a intamplat nimic rau, doar am vazut ceva ce nu stim.
   */
  await logError({
    action: actiune,
    message: `status Netopia NERECUNOSCUT: ${spuse.status}. Comanda nu s-a miscat.`,
    details: {
      orderId: order.id, status: spuse.status, ntpID: spuse.ntpID,
      codLor: spuse.codLor ?? null, mesajLor: spuse.mesajLor ?? null,
    },
    businessId: order.business_id,
    severity: "info",
  });
  return { fel: "necunoscuta" };
}
