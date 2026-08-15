import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { istoricColet, packetaGata, type PacketaConfig } from "@/lib/packeta/client";
import {
  descriereStatus, eStareFinala, esteRetur, statusFinalDinStari, trebuieSemnalat, ultimaStare,
} from "@/lib/packeta/statusuri";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea coletelor Packeta.
 *
 * ═══ ⚠ AICI CRONUL E SINGURA CALE, NU PLASA DE SIGURANTA ═══
 *
 * La Innoship urmarirea vine din webhook si cronul culege doar ce a scapat. La
 * Packeta nu exista asa ceva: documentatia lor publica nu descrie niciun webhook.
 * („push tracking" apare in sitemapul site-ului lor, dar fisierul nu e sincronizat
 * in depozitul public, deci nu stim nici daca exista, nici ce forma are.)
 *
 * Deci daca ruleaza prost, nimeni nu afla ca un colet a fost livrat.
 *
 * ═══ ⚠ FIECARE COLET E UN APEL SEPARAT ═══
 *
 * `packetTracking()` primeste un singur `packetId`. Ca la GLS, Pall-Ex si Posta.
 * De aia sunt patru paze: plafon pe rulare, termen verificat intre felii, patru
 * apeluri deodata, si o asteptare proprie mult mai scurta decat rularea.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la ceilalti: emailul de expediere pleaca DOAR din
 * `updateOrder`, care e legata de plafoanele de instiintare ale contului. Un cron
 * n-are utilizator, deci ar ocoli plafoanele.
 */

export const maxDuration = 60;

/**
 * Cat de departe in urma ne uitam.
 *
 * 45 de zile, ca la Posta si nu 21 ca la curieri: la Packeta coletul asteapta in
 * punctul de ridicare pana vine clientul, iar termenul de pastrare se masoara in
 * saptamani. Cu fereastra curierilor, exact coletele care se termina prost — cele
 * care stau si apoi se intorc — ar iesi din urmarire chiar inainte de deznodamant.
 */
const ZILE = 45;

/** ⚠ Sunt N apeluri HTTP. Rotatia dupa `packeta_status_checked_at` face plafonul cinstit. */
const MAX_COMENZI = 120;

/**
 * ⚠ TREBUIE SA FIE ASTEPTAREA REALA A APELULUI, nu una dorita.
 *
 * `istoricColet` foloseste asteptarea implicita a clientului (20s). Scris 12s aici,
 * bugetul iesea cu 8 secunde prea mare: ultima felie putea porni la timp si tot sa
 * depaseasca `maxDuration`, iar Vercel taie functia INAINTE de marcaj — deci
 * coletele acelea ramaneau in capul cozii la fiecare rulare.
 *
 * Aici nu e nicio primejdie in a renunta devreme: `packetTracking` doar CITESTE.
 */
const ASTEPTARE_MS = 20_000;

const MARJA_MS = 5_000;
const BUGET_MS = maxDuration * 1000 - ASTEPTARE_MS - MARJA_MS;
const DEODATA = 4;

/** ⚠ Cate esecuri pe magazin inainte de alarma. Un colet proaspat care inca nu e
    cunoscut e purtare normala; o parola schimbata e altceva. */
const MIN_ESECURI_ALARMA = 3;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const termen = Date.now() + BUGET_MS;
  const since = new Date(Date.now() - ZILE * 86400000).toISOString();

  const { data: orders, error: eOrders } = await admin
    .from("orders")
    .select("id, business_id, status, order_number, payment_status, packeta_packet_id, packeta_awb_at, packeta_status_code, packeta_status_checked_at")
    .not("packeta_packet_id", "is", null)
    .neq("packeta_packet_id", "")
    /* ⚠ Comenzile incheiate isi pastreaza id-ul coletului, deci s-ar potrivi la nesfarsit. */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITERE, nu pe data comenzii: altfel o comanda
     * veche careia i se creeaza coletul abia acum n-ar fi interogata niciodata.
     * Si e scrisa cu DOI termeni simpli — sintaxa imbricata gresita nu da eroare,
     * da LISTA GOALA, adica urmarirea moare raportand vesel `ok: true`.
     */
    .or(`packeta_awb_at.gte.${since},packeta_awb_at.is.null`)
    .order("packeta_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /* ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT". */
  if (eOrders) {
    await logError({
      action: "packeta-tracking",
      message: `citirea comenzilor a esuat: ${eOrders.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citirea comenzilor a esuat" }, { status: 500 });
  }

  const lista = orders ?? [];
  if (lista.length === 0) return NextResponse.json({ ok: true, verificate: 0 });

  const businessIds = [...new Set(lista.map((o) => o.business_id))];
  const [{ data: setari }, { data: afaceri }] = await Promise.all([
    admin.from("store_settings").select("business_id, packeta_config").in("business_id", businessIds),
    admin.from("businesses").select("id, user_id").in("id", businessIds),
  ]);
  const configuri = new Map<string, PacketaConfig | null>(
    (setari ?? []).map((s) => [s.business_id as string, (s.packeta_config ?? null) as PacketaConfig | null]),
  );
  const proprietari = new Map<string, string | null>(
    (afaceri ?? []).map((b) => [b.id as string, (b.user_id ?? null) as string | null]),
  );

  let verificate = 0, mutate = 0, semnalate = 0, esuate = 0;
  let ramase = 0, sarite = 0, incheiate = 0, faraConfig = 0;

  const galeti = new Map<string, { esecuri: number; reusite: number; exemplu: string }>();
  const galeata = (bizId: string) => {
    let g = galeti.get(bizId);
    if (!g) { g = { esecuri: 0, reusite: 0, exemplu: "" }; galeti.set(bizId, g); }
    return g;
  };

  for (let i = 0; i < lista.length; i += DEODATA) {
    if (Date.now() >= termen) { ramase = lista.length - i; break; }

    await Promise.all(lista.slice(i, i + DEODATA).map(async (o) => {
      /**
       * „Am ajuns la coletul asta."
       *
       * ⚠ SE SCRIE PE FIECARE DRUM DE IESIRE, INCLUSIV PE CELE PROASTE. Marcajul e
       * singurul lucru care face rotatia sa inainteze; sarit pe ramura de esec, un
       * colet care pica de fiecare data ar ramane cu marcajul NULL, deci ar iesi
       * PRIMUL la fiecare rulare, la nesfarsit — si o suta douazeci de astfel de
       * comenzi ar bloca urmarirea intregii platforme, fara nicio eroare.
       */
      const marcheazaVerificat = async (codNou: number | null) => {
        const { error } = await admin
          .from("orders")
          .update({
            packeta_status_code: codNou ?? o.packeta_status_code,
            packeta_status_checked_at: new Date().toISOString(),
          })
          .eq("id", o.id)
          .eq("business_id", o.business_id);
        if (error) {
          await logError({
            action: "packeta-tracking",
            message: `marcajul de verificare nu s-a scris pentru comanda ${o.order_number ?? o.id}: ${error.message}. Coletul ramane in capul cozii.`,
            details: { orderId: o.id, packetId: o.packeta_packet_id },
            businessId: o.business_id,
            severity: "warning",
          });
        }
      };

      /*
       * ⚠ Coletele incheiate NU se scot din interogare, se dau la RAND.
       *
       * Un retur (10) nu misca statusul comenzii — decizia e a comerciantului —
       * deci comanda ramane „expediata" si se potriveste filtrului toate cele 45
       * de zile. Sarita fara sa i se atinga marcajul, si-ar pastra locul in fata.
       *
       * Si filtrarea se face AICI, nu in SQL: un `not in (…)` pe o coloana care
       * poate fi `NULL` da `NULL`, adica ar arunca afara chiar coletele
       * neverificate inca — exact cele pentru care exista cronul.
       */
      if (eStareFinala(o.packeta_status_code)) {
        incheiate++;
        await marcheazaVerificat(null);
        return;
      }

      const config = configuri.get(o.business_id);
      if (!packetaGata(config)) {
        faraConfig++;
        await marcheazaVerificat(null);
        return;
      }

      /* ⚠ Termenul se verifica si aici: al patrulea apel al unei felii poate porni
         dupa ce primele trei au consumat aproape tot. */
      if (Date.now() >= termen) { sarite++; return; }

      let stari;
      try {
        stari = await istoricColet(config, o.packeta_packet_id!);
      } catch (e) {
        esuate++;
        const g = galeata(o.business_id);
        g.esecuri++;
        g.exemplu ||= (e as Error).message;
        console.error("[packeta-tracking] coletul", o.packeta_packet_id, (e as Error).message);
        await marcheazaVerificat(null);
        return;
      }

      verificate++;
      galeata(o.business_id).reusite++;

      /* Un colet inregistrat, dar fara evenimente inca: nu e defect. */
      if (stari.length === 0) { await marcheazaVerificat(null); return; }

      const ultima = ultimaStare(stari);
      const codNou = ultima?.cod ?? null;
      /*
       * ⚠ `externalTrackingCode` apare la statusul 6 („handed to carrier") si e
       * numarul cu care CLIENTUL urmareste la curierul real. Fara randul asta,
       * coloana ramanea vesnic goala si modalul arata un camp mort.
       */
      const codExtern = stari.map((s) => s.codExtern).filter(Boolean).pop() ?? null;
      if (codExtern) {
        await admin.from("orders")
          .update({ packeta_external_tracking: codExtern })
          .eq("id", o.id).eq("business_id", o.business_id);
      }

      /*
       * ⚠ Statusul se calculeaza din TOT istoricul, nu doar din ultima stare.
       * Lectia GLS: intre doua treceri pot intra mai multe evenimente, iar ultimul
       * poate fi administrativ — la ramburs, o livrare ratata inseamna bani
       * neinregistrati.
       */
      const tinta = statusFinalDinStari(o.status, stari);
      let prelucrat = true;
      if (tinta) {
        const rez = await tranzitieComandaMarketplace(admin, {
          orderId: o.id,
          businessId: o.business_id,
          status: tinta,
          sursa: "packeta",
        });
        if (rez === "ok") {
          mutate++;
          /* ⚠ SE ASTEAPTA, nu `void`: intr-o functie serverless nu exista „mai
             tarziu". Si nu exista a doua trecere — comanda e deja pe `delivered`. */
          try {
            await maybeAutoInvoice(o.business_id, o.id, tinta, o.payment_status ?? "", admin as never);
          } catch (e) {
            await logError({
              action: "packeta-tracking",
              message: `comanda ${o.order_number ?? o.id} a trecut pe ${tinta}, dar facturarea automata a esuat: ${(e as Error).message}`,
              details: { orderId: o.id, packetId: o.packeta_packet_id },
              businessId: o.business_id,
              severity: "warning",
            });
          }
        }
        prelucrat = rez !== "reincearca";
      }

      /*
       * ⚠ SE SEMNALEAZA DOAR SCHIMBAREA, si INAINTE de marcaj.
       *
       * Scris intai marcajul, o cadere a functiei intre cele doua ar lasa comanda
       * cu codul retinut si fara notificare — iar daca acel cod e final, coletul
       * iese pe loc din urmarire si nicio rulare viitoare nu mai repara nimic.
       */
      const schimbat = codNou !== null && codNou !== (o.packeta_status_code ?? null);
      if (schimbat && trebuieSemnalat(codNou)) {
        semnalate++;
        await semnaleaza(admin, {
          userId: proprietari.get(o.business_id) ?? null,
          businessId: o.business_id,
          orderId: o.id,
          orderNumber: o.order_number,
          packetId: o.packeta_packet_id!,
          cod: codNou,
          descriere: descriereStatus(codNou, ultima?.nume ?? null),
        });
      }

      /*
       * ⚠ Codul se retine ABIA dupa ce tranzitia a reusit: scris inainte, un cod
       * FINAL ar fi ramas pe comanda chiar daca tranzitia a picat, iar
       * `eStareFinala` ar fi scos coletul din urmarire pentru totdeauna.
       */
      await marcheazaVerificat(prelucrat ? codNou : null);
    }));
  }

  /*
   * ⚠ Alarma se ridica PE MAGAZIN. Pe intreaga platforma, un magazin cu
   * credentiale schimbate ar fi fost acoperit de altul sanatos, iar urmarirea lui
   * ar fi murit in tacere.
   */
  for (const [bizId, g] of galeti) {
    if (g.esecuri >= MIN_ESECURI_ALARMA && g.reusite === 0) {
      await logError({
        action: "packeta-tracking",
        message: `urmarirea Packeta a esuat pentru toate cele ${g.esecuri} colete verificate ale magazinului: ${g.exemplu}. Verifica parola API din configurare.`,
        details: { businessId: bizId, esecuri: g.esecuri },
        businessId: bizId,
        severity: "critical",
      });
    }
  }

  return NextResponse.json({
    ok: true, verificate, mutate, semnalate, esuate, ramase, sarite, incheiate, faraConfig,
  });
}

/**
 * Notificarea catre comerciant.
 *
 * ⚠ Textul spune si CE INSEAMNA, nu doar ce s-a intamplat: „cod 10" nu inseamna
 * nimic pentru cineva care n-a citit nomenclatorul lor, iar o notificare pe care
 * omul n-o intelege se inchide fara sa faca nimic.
 *
 * ⚠ Si spune raspicat ce NU putem face: la Packeta anularea nu exista in API.
 */
async function semnaleaza(
  admin: ReturnType<typeof createClient<Database>>,
  p: {
    userId: string | null;
    businessId: string;
    orderId: string;
    orderNumber: string | null;
    packetId: string;
    cod: number;
    descriere: string;
  },
): Promise<void> {
  const retur = esteRetur(p.cod);
  const comanda = p.orderNumber ? `Comanda ${p.orderNumber}` : "O comanda";
  const titlu = retur ? "Colet Packeta returnat" : "Colet Packeta care cere atentie";
  const spune = p.descriere || `status Packeta ${p.cod}`;
  const mesaj = retur
    ? `${comanda}: coletul ${p.packetId} se intoarce la tine (${spune}). Marfa vine inapoi, iar rambursul NU s-a incasat — anularea comenzii si returul banilor raman decizia ta.`
    : `${comanda}: coletul ${p.packetId} are un eveniment care cere o decizie: ${spune}. Deschide comanda pentru istoricul complet.`;

  if (p.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: p.userId,
      type: "packeta",
      title: titlu,
      message: mesaj,
    });
    if (error) console.error("[packeta-tracking] notificarea nu s-a scris:", error.message);
  }

  await logError({
    action: "packeta-tracking",
    message: `${titlu}: ${mesaj}`,
    details: { orderId: p.orderId, packetId: p.packetId, cod: p.cod },
    businessId: p.businessId,
    severity: retur ? "warning" : "info",
  });
}
