/*
 * FARA "use server" AICI, INTENTIONAT. Nu-l readauga.
 *
 * Acelasi motiv ca la `registru.ts`: intr-un modul „use server" fiecare export
 * devine un endpoint HTTP in manifestul global. Functia de mai jos MUTA comenzi si
 * scrie notificari, cu clientul de SISTEM — expusa ca actiune, ar fi lasat pe
 * oricine sa mute orice comanda, alegandu-si singur datele.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import {
  codNumeric,
  descriereRamburs,
  descriereStatus,
  esteRetur,
  rambursTrebuieSemnalat,
  statusFinalDinStari,
  trebuieSemnalat,
  ultimaStare,
} from "./statusuri";
import type { UrmarireInnoship } from "./client";

/**
 * Ce facem cu o urmarire Innoship, indiferent de unde a venit.
 *
 * ═══ ⚠ UN SINGUR DRUM DE INTERPRETARE, PENTRU AMANDOUA CAILE ═══
 *
 * Urmarirea Innoship soseste pe doua cai: „Track push" (webhookul lor, calea
 * principala) si cronul de siguranta, care culege ce a ratat pushul. Obiectul e
 * IDENTIC — documentatia lor spune limpede ca ce se trimite in push e acelasi
 * lucru cu ce intoarce serviciul Track.
 *
 * Daca fiecare cale si-ar avea propria interpretare, cele doua s-ar departa la
 * prima corectura: aceeasi comanda ar fi mutata altfel dupa cum a sosit vestea.
 * De aia exista functia asta, si de aia amandoua o cheama.
 *
 * ⚠ Ce NU face: nu trimite nimic clientului. Emailul de expediere pleaca DOAR din
 * `updateOrder`, legat de plafoanele de instiintare ale contului — iar nici cronul,
 * nici webhookul n-au utilizator, deci ar ocoli plafoanele.
 */

export type ComandaDeUrmarit = {
  id: string;
  business_id: string;
  status: string;
  order_number: string | null;
  payment_status: string | null;
  innoship_awb_number: string | null;
  innoship_status_code: string | null;
  innoship_cod_status_code: string | null;
};

export type RezultatUrmarire = {
  mutata: boolean;
  semnalata: boolean;
  /** Codul retinut, ca apelantul sa stie ce s-a scris. */
  codNou: string | null;
};

type Admin = SupabaseClient<Database>;

export async function aplicaUrmarire(
  admin: Admin,
  p: {
    comanda: ComandaDeUrmarit;
    urmarire: UrmarireInnoship;
    /** Proprietarul magazinului, pentru clopotel. `null` = doar in loguri. */
    userId: string | null;
    /** De unde a venit vestea, pentru loguri: „push" sau „cron". */
    sursa: "push" | "cron";
  },
): Promise<RezultatUrmarire> {
  const { comanda, urmarire, userId, sursa } = p;
  const actiune = `innoship-${sursa}`;

  const istoric = urmarire.history ?? [];
  const ultima = ultimaStare(istoric);
  const codNou = codNumeric(ultima?.clientStatusId) !== null
    ? String(codNumeric(ultima?.clientStatusId))
    : null;

  /*
   * ⚠ Statusul se calculeaza din TOT istoricul, nu doar din ultima stare.
   *
   * Lectia GLS: intre doua vesti pot intra mai multe evenimente, iar ultimul poate
   * fi administrativ („Eroare de scanare", „Redirectionat"). Citind doar pe el,
   * livrarea petrecuta intre timp n-ar mai fi vazuta niciodata — iar la o comanda
   * cu plata la livrare asta inseamna bani neinregistrati.
   */
  const tinta = statusFinalDinStari(comanda.status, istoric);
  let mutata = false;
  let prelucrat = true;

  if (tinta) {
    const rez = await tranzitieComandaMarketplace(admin, {
      orderId: comanda.id,
      businessId: comanda.business_id,
      status: tinta,
      sursa: "innoship",
    });
    if (rez === "ok") {
      mutata = true;
      /*
       * ⚠ SE ASTEAPTA, nu `void`: intr-o functie serverless nu exista „mai
       * tarziu". Si nu exista a doua trecere — comanda e deja pe `delivered`,
       * deci rularea urmatoare n-o mai factureaza niciodata.
       */
      try {
        await maybeAutoInvoice(
          comanda.business_id, comanda.id, tinta, comanda.payment_status ?? "", admin as never,
        );
      } catch (e) {
        await logError({
          action: actiune,
          message: `comanda ${comanda.order_number ?? comanda.id} a trecut pe ${tinta}, dar facturarea automata a esuat: ${(e as Error).message}`,
          details: { orderId: comanda.id, awb: comanda.innoship_awb_number },
          businessId: comanda.business_id,
          severity: "warning",
        });
      }
    }
    /* „reincearca" = nu STIM daca s-a scris: n-avem voie sa retinem codul. */
    prelucrat = rez !== "reincearca";
  }

  // ── Semnalarea ────────────────────────────────────────────────────────────
  /*
   * ⚠ SE SEMNALEAZA DOAR SCHIMBAREA. Memoria e un singur cod, deci regula e
   * simpla: se striga numai daca ULTIMUL cod cere atentie SI e altul decat cel
   * retinut. Asa aceeasi incercare de livrare nu se repeta la fiecare veste — iar
   * cu webhookul, vestile vin des.
   */
  let semnalata = false;
  const schimbat = codNou !== null && codNou !== (comanda.innoship_status_code ?? null);
  if (schimbat && trebuieSemnalat(codNou)) {
    semnalata = true;
    await semnaleaza(admin, {
      userId,
      businessId: comanda.business_id,
      orderId: comanda.id,
      orderNumber: comanda.order_number,
      awb: comanda.innoship_awb_number ?? urmarire.shipmentAwb ?? "",
      titlu: esteRetur(codNou) ? "Expediere Innoship returnata" : "Expediere Innoship care cere atentie",
      text: descriereStatus(codNou, ultima?.clientStatusDescription),
      retur: esteRetur(codNou),
      actiune,
    });
  }

  // ── Statusul rambursului ──────────────────────────────────────────────────
  /*
   * ⚠ SE PASTREAZA SI SE SEMNALEAZA, DAR NU MISCA `payment_status`.
   *
   * Innoship e singurul care ne da statusul BANILOR separat de al coletului, si
   * tentatia e sa marcam automat comanda platita cand vine „3 Paid". Nu in faza
   * asta: cronul de reconciliere care INCASA pe comenzi anulate a fost un P0
   * produs chiar de o reparatie, iar la statusul 71 al Postei am refuzat acelasi
   * lucru. Se muta abia dupa ce s-a vazut pe date reale ce inseamna.
   */
  const ultimaRamburs = ultimaStare(urmarire.cashOnDeliveryHistory ?? []);
  const codRamburs = codNumeric(ultimaRamburs?.clientStatusId) !== null
    ? String(codNumeric(ultimaRamburs?.clientStatusId))
    : null;

  if (codRamburs !== null && codRamburs !== (comanda.innoship_cod_status_code ?? null)
      && rambursTrebuieSemnalat(codRamburs)) {
    semnalata = true;
    await semnaleaza(admin, {
      userId,
      businessId: comanda.business_id,
      orderId: comanda.id,
      orderNumber: comanda.order_number,
      awb: comanda.innoship_awb_number ?? "",
      titlu: "Ramburs Innoship",
      text: descriereRamburs(codRamburs, ultimaRamburs?.clientStatusDescription),
      retur: false,
      actiune,
    });
  }

  // ── Marcajul ──────────────────────────────────────────────────────────────
  /*
   * ⚠ CODUL SE RETINE ABIA DUPA CE TRANZITIA A REUSIT. Scris inainte, un cod FINAL
   * ar fi ramas pe comanda chiar daca tranzitia a picat — iar `eStareFinala` scoate
   * pe loc expedierea din urmarire, deci comanda ar fi ramas „expediata" PENTRU
   * TOTDEAUNA, fara ca nimic sa semnaleze.
   *
   * ⚠ Si marcajul de verificare se scrie SI de webhook: o comanda care primeste
   * push nu mai are de ce sa consume un loc in cron.
   */
  const { error } = await admin
    .from("orders")
    .update({
      innoship_status_code: prelucrat ? (codNou ?? comanda.innoship_status_code) : comanda.innoship_status_code,
      innoship_cod_status_code: codRamburs ?? comanda.innoship_cod_status_code,
      innoship_status_checked_at: new Date().toISOString(),
      ...(urmarire.trackUrl ? { innoship_track_url: urmarire.trackUrl } : {}),
    })
    .eq("id", comanda.id)
    .eq("business_id", comanda.business_id);

  if (error) {
    await logError({
      action: actiune,
      message: `marcajul de urmarire nu s-a scris pentru comanda ${comanda.order_number ?? comanda.id}: ${error.message}. Expedierea ramane in capul cozii cronului.`,
      details: { orderId: comanda.id, awb: comanda.innoship_awb_number, code: error.code },
      businessId: comanda.business_id,
      severity: "warning",
    });
  }

  return { mutata, semnalata, codNou: prelucrat ? codNou : null };
}

/**
 * Notificarea catre comerciant.
 *
 * ⚠ Textul spune si CE INSEAMNA, nu doar ce s-a intamplat: „cod 104" nu inseamna
 * nimic pentru cineva care n-a citit tabelul lor, iar o notificare pe care omul
 * n-o intelege se inchide fara sa faca nimic.
 */
async function semnaleaza(
  admin: Admin,
  p: {
    userId: string | null;
    businessId: string;
    orderId: string;
    orderNumber: string | null;
    awb: string;
    titlu: string;
    text: string;
    retur: boolean;
    actiune: string;
  },
): Promise<void> {
  const comanda = p.orderNumber ? `Comanda ${p.orderNumber}` : "O comanda";
  const mesaj = p.retur
    ? `${comanda}: expedierea ${p.awb} se intoarce la tine (${p.text}). Marfa vine inapoi, iar rambursul NU s-a incasat — anularea comenzii si returul banilor raman decizia ta.`
    : `${comanda}: expedierea ${p.awb} — ${p.text}. Deschide comanda pentru istoricul complet.`;

  if (p.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: p.userId,
      type: "innoship",
      title: p.titlu,
      message: mesaj,
    });
    if (error) console.error("[innoship] notificarea nu s-a scris:", error.message);
  }

  await logError({
    action: p.actiune,
    message: `${p.titlu}: ${mesaj}`,
    details: { orderId: p.orderId, awb: p.awb },
    businessId: p.businessId,
    severity: p.retur ? "warning" : "info",
  });
}
