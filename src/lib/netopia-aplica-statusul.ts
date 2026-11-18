import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { finalizeazaPlataComenzii } from "@/lib/orders/finalizare-plata";
import { resolveNetopiaStatus } from "@/lib/netopia";

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
  /**
   * Mediul pe care am INTREBAT (doar la reconciliere). Intra in mesajul despre o tranzactie pe care ei
   * n-o gasesc, fiindca de obicei asta e cauza: plata a fost pornita pe celalalt mediu.
   */
  mediu?: "test" | "real";
}

/** Ce a spus Netopia ULTIMA OARA despre plata unei comenzi: randul ei din `netopia_stari`. */
export interface StareaStiuta {
  cod: string;
  ntp_id: string | null;
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
  /**
   * Netopia nu gaseste tranzactia (`status 0`, „Invalid ntpID”) pe mediul si contul pe care am
   * intrebat. Nu e o stare a platii, ci lipsa ei acolo. Comanda nu s-a miscat.
   */
  | { fel: "negasita" }
  /** Cod pe care nu-l stim. Comanda nu s-a miscat, si s-a scris in jurnal ca harta sa creasca. */
  | { fel: "necunoscuta" }
  /**
   * N-am putut duce la capat. ⚠ Apelantul TREBUIE sa ceara o repetare (IPN) sau sa reia mai tarziu
   * (cron): o plata pierduta e mai rea decat o notificare repetata.
   */
  | { fel: "esec"; mesaj: string; suma?: true };

/**
 * ═══ ⚠ JURNALUL SCRIE DOAR CAND SE SCHIMBA CEVA (18.11.2026) ═══
 *
 * Cronul intreaba din ora in ora despre fiecare plata nedecisa din ultimele 14 zile, si pana azi
 * scria raspunsul lor in jurnal de FIECARE data. Masurat in productie, la un singur magazin: 335 de
 * avertismente „REFUZATA” pentru O comanda, si 380 de „NERECUNOSCUT: 0” in patru zile, pentru patru
 * comenzi. Un jurnal care repeta acelasi rand de sute de ori ascunde tocmai randul care conteaza.
 *
 * Acum se tine minte ce au spus ultima oara (`netopia_stari`), iar reconcilierea scrie in jurnal doar
 * cand raspunsul e ALTUL. IPN-ul scrie mereu, fiindca fiecare notificare e o intamplare noua (cinci
 * refuzuri la rand sunt cinci incercari ale cumparatorului), dar tine si el minte starea, ca cronul
 * sa nu repete un refuz pe care notificarea l-a spus deja.
 *
 * ⚠ STAREA NU STA PE `orders`, SI E DINADINS. Orice scriere acolo muta `updated_at`, iar
 * `plati-neconfirmate` tine minte prin `updated_at` cui a spus deja „Marfa expediata, plata
 * neconfirmata”. Pe o comanda expediata si neplatita, scrierea starii ar fi re-trimis clopotelul
 * comerciantului (masurat: `#0281` l-a primit patru zile la rand).
 *
 * `stiuta`: ce stim deja, citit de cron o data pentru toate comenzile. Lipsa ei (IPN-ul nu citeste)
 * inseamna „nu stim nimic”, deci se scrie in jurnal, ca pana acum.
 */
export async function aplicaStatusulNetopia(
  admin: SupabaseClient<Database>,
  order: ComandaDeMiscat,
  spuse: SpuseleLor,
  /** De unde am aflat. Intra in jurnal, ca sa se poata deosebi o plata reconciliata de una notificata. */
  sursa: "notify" | "reconciliere",
  stiuta?: StareaStiuta | null,
): Promise<Verdict> {
  const cod = String(spuse.status);
  const ntp = String(spuse.ntpID ?? "").trim() || null;
  const neschimbata = !!stiuta && stiuta.cod === cod && (stiuta.ntp_id ?? null) === ntp;

  const verdict = await hotaraste(admin, order, spuse, sursa, sursa === "reconciliere" && neschimbata);

  /*
   * ⚠ ESECUL NU SE TINE MINTE. Un esec (suma care nu se potriveste, o scriere picata) se reia la
   * rularea urmatoare si TREBUIE sa se vada din nou: tinut minte, ar fi tacut ca un raspuns stiut.
   *
   * Si o scriere picata aici nu e despre bani: cel mult, acelasi raspuns se mai scrie o data in jurnal
   * la rularea urmatoare. De aceea nu schimba verdictul si nu urca in `error_logs`.
   */
  if (verdict.fel !== "esec" && !neschimbata) {
    const { error } = await admin.from("netopia_stari").upsert(
      { order_id: order.id, cod, ntp_id: ntp, schimbata_la: new Date().toISOString() },
      { onConflict: "order_id" },
    );
    if (error) {
      console.error("[netopia] starea platii nu s-a putut tine minte:", { orderId: order.id, cod, err: error.message });
    }
  }

  return verdict;
}

async function hotaraste(
  admin: SupabaseClient<Database>,
  order: ComandaDeMiscat,
  spuse: SpuseleLor,
  sursa: "notify" | "reconciliere",
  /** Reconcilierea a primit ACELASI raspuns ca data trecuta: comanda nu se misca, si nici nu se spune iar. */
  tace: boolean,
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
    if (!tace) {
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
    }
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
     * drumul obisnuit codurile astea nu ajung niciodata aici. Daca ajung, vrem sa aflam. O data:
     * reconcilierea o vede apoi in fiecare ora cat timp cumparatorul n-a terminat.
     */
    if (!tace) {
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
    }
    return { fel: "intermediara" };
  }

  /*
   * ═══ „NU STIU DE TRANZACTIA ASTA”: STATUSUL 0 CU „Invalid ntpID” ═══
   *
   * 0 nu e o stare a platii. In specificatia lor nu are niciun inteles, apare doar ca valoare de
   * exemplu (citita pe 18.11.2026). E campul gol al unui raspuns care spune, de fapt, ca tranzactia
   * nu exista ACOLO unde am intrebat.
   *
   * Masurat in productie, 14-18.11.2026, la `caian-textile`: 380 de raspunsuri de la
   * `/operation/status`, toate `status 0` cu `99 Invalid ntpID`, pentru patru plati pornite cand
   * magazinul era pe modul de TEST si intrebate dupa ce a trecut pe plati REALE. Cheile de Live nu
   * vad tranzactiile din Sandbox (si nici pe ale altui cont Netopia), deci intrebarea nu are raspuns.
   * Pana azi ajungeau la ramura de mai jos si se scriau „NERECUNOSCUT: 0”, in fiecare ora.
   *
   * ⚠ SE RECUNOASTE DUPA MESAJUL LOR, NU DOAR DUPA 0. Numai perechea asta am masurat-o: un 0 cu alt
   * mesaj ramane necunoscut si se scrie ca atare, ca harta sa creasca din trafic, nu din presupuneri.
   */
  if (spuse.status === 0 && /\bntpid\b/i.test(spuse.mesajLor ?? "")) {
    if (!tace) {
      const mediu = spuse.mediu === "test" ? " pe modul de TEST configurat acum"
        : spuse.mediu === "real" ? " pe platile REALE configurate acum" : "";
      await logError({
        action: actiune,
        message:
          `Netopia nu gaseste tranzactia ${spuse.ntpID ?? "?"} a comenzii ${order.order_number ?? order.id}${mediu} `
          + `(raspunsul lor: ${[spuse.codLor, spuse.mesajLor].filter(Boolean).join(" ")}). De obicei plata a fost `
          + "pornita pe celalalt mediu (test sau real) ori cu alt cont Netopia, deci nu se poate verifica de "
          + "aici. Comanda nu s-a miscat.",
        details: {
          orderId: order.id, status: spuse.status, ntpID: spuse.ntpID, mediu: spuse.mediu ?? null,
          codLor: spuse.codLor ?? null, mesajLor: spuse.mesajLor ?? null,
        },
        businessId: order.business_id,
        severity: "info",
      });
    }
    return { fel: "negasita" };
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
   * ⚠ `info`, nu alarma: nu s-a intamplat nimic rau, doar am vazut ceva ce nu stim. Si o data pe
   * raspuns: harta creste din primul rand, iar al trei-suta-optzecilea nu mai spune nimic nou.
   */
  if (!tace) {
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
  }
  return { fel: "necunoscuta" };
}
