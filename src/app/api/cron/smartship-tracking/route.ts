import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { smartshipGata, urmareste, type SmartshipConfig } from "@/lib/smartship/client";
import {
  descriereStatus, eStareFinala, esteRetur, statusUrmator, trebuieSemnalat,
} from "@/lib/smartship/statusuri";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea expedierilor SmartShip.
 *
 * ═══ ⚠ AICI CRONUL E SINGURA CALE, NU PLASA DE SIGURANTA ═══
 *
 * La Innoship urmarirea vine din webhook si cronul culege doar ce a scapat. La
 * SmartShip nu exista asa ceva: documentatia lor n-are niciun webhook, niciun
 * „push", nicio notificare. Deci daca ruleaza prost, nimeni nu afla ca un colet a
 * fost livrat, refuzat sau returnat.
 *
 * ═══ ⚠ FIECARE EXPEDIERE E UN APEL SEPARAT ═══
 *
 * `GET /awb/status/{awb}` primeste un singur AWB. Exista si `/awbs`, paginat, dar
 * el nu poate fi interogat pe o LISTA de numere (filtrele lui sunt data, status,
 * curier si un singur `order_id`) si nu intoarce istoricul — deci pentru un
 * magazin cu multe expedieri ar insemna sa citim tot contul la fiecare rulare.
 *
 * De aia sunt patru paze, ca la GLS, Posta si Packeta: plafon pe rulare, termen
 * verificat intre felii, patru apeluri deodata, si o asteptare proprie mult mai
 * scurta decat rularea.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la ceilalti: emailul de expediere pleaca DOAR din
 * `updateOrder`, care e legata de plafoanele de instiintare ale contului. Un cron
 * n-are utilizator, deci ar ocoli plafoanele.
 *
 * ═══ ⚠ ZERO E UN STATUS, NU O LIPSA ═══
 *
 * `0 = emis (neridicat)`. Toate comparatiile de mai jos se fac cu `!== null`,
 * niciodata cu `||` sau cu adevar-fals: `codNou || o.smartship_status_code` ar
 * pierde chiar prima treapta a fiecarei expedieri.
 */

export const maxDuration = 60;

/**
 * Cat de departe in urma ne uitam.
 *
 * 30 de zile: la SmartShip coletul e dus de un curier obisnuit (Cargus, SameDay,
 * DPD, FedEx), deci ciclul e cel al curierilor, nu al punctelor de ridicare. Dar
 * returul dupa un refuz mai adauga o saptamana bunicica peste cele 21 de zile de
 * la GLS — iar refuzul (5) e chiar statusul pe care nu vrem sa-l pierdem.
 */
const ZILE = 30;

/** ⚠ Sunt N apeluri HTTP. Rotatia dupa `smartship_status_checked_at` face plafonul cinstit. */
const MAX_COMENZI = 120;

/**
 * ⚠ TREBUIE SA FIE ASTEPTAREA REALA A APELULUI, nu una dorita.
 *
 * `urmareste` foloseste asteptarea implicita a clientului (20s). Scrisa mai mica
 * aici, bugetul ar iesi prea mare: ultima felie ar putea porni la timp si tot sa
 * depaseasca `maxDuration`, iar Vercel taie functia INAINTE de marcaj — deci
 * expedierile acelea ar ramane in capul cozii la fiecare rulare.
 *
 * (Defectul a fost prins la Packeta, unde bugetul se calcula cu 12s pentru un
 * apel care astepta 20.)
 */
const ASTEPTARE_MS = 20_000;

const MARJA_MS = 5_000;
const BUGET_MS = maxDuration * 1000 - ASTEPTARE_MS - MARJA_MS;
const DEODATA = 4;

/** ⚠ Cate esecuri pe magazin inainte de alarma. Un AWB proaspat pe care ei inca
    nu-l cunosc e purtare normala; o cheie schimbata e altceva. */
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
    .select("id, business_id, status, order_number, payment_status, smartship_awb_number, smartship_awb_at, smartship_status_code, smartship_status_checked_at")
    .not("smartship_awb_number", "is", null)
    .neq("smartship_awb_number", "")
    /* ⚠ Comenzile incheiate isi pastreaza numarul AWB, deci s-ar potrivi la nesfarsit. */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITERE, nu pe data comenzii: altfel o comanda
     * veche careia i se emite AWB-ul abia acum n-ar fi interogata niciodata.
     * Si e scrisa cu DOI termeni simpli — o sintaxa imbricata gresita nu da
     * eroare, da LISTA GOALA, adica urmarirea moare raportand vesel `ok: true`.
     */
    .or(`smartship_awb_at.gte.${since},smartship_awb_at.is.null`)
    .order("smartship_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /* ⚠ O CITIRE PICATA NU ARE VOIE SA RAPORTEZE „ZERO DE VERIFICAT". */
  if (eOrders) {
    await logError({
      action: "smartship-tracking",
      message: `citirea comenzilor a esuat: ${eOrders.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citirea comenzilor a esuat" }, { status: 500 });
  }

  const lista = orders ?? [];
  if (lista.length === 0) return NextResponse.json({ ok: true, verificate: 0 });

  const businessIds = [...new Set(lista.map((o) => o.business_id))];
  const [{ data: setari }, { data: afaceri }] = await Promise.all([
    admin.from("store_settings").select("business_id, smartship_config").in("business_id", businessIds),
    admin.from("businesses").select("id, user_id").in("id", businessIds),
  ]);
  const configuri = new Map<string, SmartshipConfig | null>(
    (setari ?? []).map((s) => [s.business_id as string, (s.smartship_config ?? null) as SmartshipConfig | null]),
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
       * „Am ajuns la expedierea asta."
       *
       * ⚠ SE SCRIE PE FIECARE DRUM DE IESIRE, INCLUSIV PE CELE PROASTE. Marcajul e
       * singurul lucru care face rotatia sa inainteze; sarit pe ramura de esec, o
       * expediere care pica de fiecare data ar ramane cu marcajul NULL, deci ar iesi
       * PRIMA la fiecare rulare, la nesfarsit — si o suta douazeci de astfel de
       * comenzi ar bloca urmarirea intregii platforme, fara nicio eroare.
       *
       * ⚠ `codNou ?? o.smartship_status_code`, nu `||`: zero e un status valid.
       */
      const marcheazaVerificat = async (codNou: number | null) => {
        const { error } = await admin
          .from("orders")
          .update({
            smartship_status_code: codNou ?? o.smartship_status_code,
            smartship_status_checked_at: new Date().toISOString(),
          })
          .eq("id", o.id)
          .eq("business_id", o.business_id);
        if (error) {
          await logError({
            action: "smartship-tracking",
            message: `marcajul de verificare nu s-a scris pentru comanda ${o.order_number ?? o.id}: ${error.message}. Expedierea ramane in capul cozii.`,
            details: { orderId: o.id, awb: o.smartship_awb_number },
            businessId: o.business_id,
            severity: "warning",
          });
        }
      };

      /*
       * ⚠ Expedierile incheiate NU se scot din interogare, se dau la RAND.
       *
       * Un retur (6) sau o anulare (10) nu misca statusul comenzii — decizia e a
       * comerciantului — deci comanda ramane „expediata" si se potriveste
       * filtrului toate cele 30 de zile. Sarita fara sa i se atinga marcajul,
       * si-ar pastra locul in fata.
       *
       * Si filtrarea se face AICI, nu in SQL: un `not in (…)` pe o coloana care
       * poate fi `NULL` da `NULL`, adica ar arunca afara chiar expedierile
       * neverificate inca — exact cele pentru care exista cronul.
       */
      if (eStareFinala(o.smartship_status_code)) {
        incheiate++;
        await marcheazaVerificat(null);
        return;
      }

      const config = configuri.get(o.business_id);
      if (!smartshipGata(config)) {
        faraConfig++;
        await marcheazaVerificat(null);
        return;
      }

      /* ⚠ Termenul se verifica si aici: al patrulea apel al unei felii poate porni
         dupa ce primele trei au consumat aproape tot. */
      if (Date.now() >= termen) { sarite++; return; }

      let u;
      try {
        u = await urmareste(config, o.smartship_awb_number!, ASTEPTARE_MS);
      } catch (e) {
        esuate++;
        const g = galeata(o.business_id);
        g.esecuri++;
        g.exemplu ||= (e as Error).message;
        console.error("[smartship-tracking] AWB", o.smartship_awb_number, (e as Error).message);
        await marcheazaVerificat(null);
        return;
      }

      verificate++;
      galeata(o.business_id).reusite++;

      const codNou = u.status;
      /* Un AWB inregistrat, dar fara status inca: nu e defect. */
      if (codNou === null) { await marcheazaVerificat(null); return; }

      /*
       * ⚠ Statusul se ia din `awb_status`, NU din ultimul eveniment.
       *
       * La GLS am invatat ca ultima stare din istoric nu e de ajuns: intre doua
       * treceri pot intra mai multe evenimente, iar ultimul poate fi
       * administrativ. Aici capcana NU se aplica, si merita spus de ce:
       * `awb_status` e starea EXPEDIERII, un rezumat pe care il tin ei, nu o
       * intrare din jurnal. Iar `tracking[].event_id` — singurul lucru pe care
       * s-ar putea face o clasificare a istoricului — n-are niciun nomenclator
       * publicat, deci o traducere a lui ar fi fost curata inventie.
       */
      const tinta = statusUrmator(o.status, codNou);
      let prelucrat = true;
      if (tinta) {
        const rez = await tranzitieComandaMarketplace(admin, {
          orderId: o.id,
          businessId: o.business_id,
          status: tinta,
          sursa: "smartship",
        });
        if (rez === "ok") {
          mutate++;
          /* ⚠ SE ASTEAPTA, nu `void`: intr-o functie serverless nu exista „mai
             tarziu". Si nu exista a doua trecere — comanda e deja pe `delivered`. */
          try {
            await maybeAutoInvoice(o.business_id, o.id, tinta, o.payment_status ?? "", admin as never);
          } catch (e) {
            await logError({
              action: "smartship-tracking",
              message: `comanda ${o.order_number ?? o.id} a trecut pe ${tinta}, dar facturarea automata a esuat: ${(e as Error).message}`,
              details: { orderId: o.id, awb: o.smartship_awb_number },
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
       * cu codul retinut si fara notificare — iar daca acel cod e final,
       * expedierea iese pe loc din urmarire si nicio rulare viitoare nu mai repara
       * nimic.
       *
       * ⚠ Comparatia se face pe `null`, nu pe adevar-fals: `0 !== null` e chiar
       * prima treapta, si `codNou !== (o.smartship_status_code || null)` ar fi
       * transformat un 0 salvat in `null` si ar fi resemnalat la fiecare rulare.
       */
      const vechi = o.smartship_status_code === null || o.smartship_status_code === undefined
        ? null
        : Number(o.smartship_status_code);
      const schimbat = codNou !== vechi;
      if (schimbat && trebuieSemnalat(codNou)) {
        semnalate++;
        await semnaleaza(admin, {
          userId: proprietari.get(o.business_id) ?? null,
          businessId: o.business_id,
          orderId: o.id,
          orderNumber: o.order_number,
          awb: o.smartship_awb_number!,
          cod: codNou,
          descriere: descriereStatus(codNou, u.descriere),
        });
      }

      /*
       * ⚠ Codul se retine ABIA dupa ce tranzitia a reusit: scris inainte, un cod
       * FINAL ar fi ramas pe comanda chiar daca tranzitia a picat, iar
       * `eStareFinala` ar fi scos expedierea din urmarire pentru totdeauna.
       */
      await marcheazaVerificat(prelucrat ? codNou : null);
    }));
  }

  /*
   * ⚠ Alarma se ridica PE MAGAZIN. Pe intreaga platforma, un magazin cu cheia
   * schimbata ar fi fost acoperit de altul sanatos, iar urmarirea lui ar fi murit
   * in tacere.
   */
  for (const [bizId, g] of galeti) {
    if (g.esecuri >= MIN_ESECURI_ALARMA && g.reusite === 0) {
      await logError({
        action: "smartship-tracking",
        message: `urmarirea SmartShip a esuat pentru toate cele ${g.esecuri} expedieri verificate ale magazinului: ${g.exemplu}. Verifica cheia de API din configurare.`,
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
 * ⚠ Textul spune si CE INSEAMNA, nu doar ce s-a intamplat: „status 5" nu inseamna
 * nimic pentru cineva care n-a citit nomenclatorul lor, iar o notificare pe care
 * omul n-o intelege se inchide fara sa faca nimic.
 */
async function semnaleaza(
  admin: ReturnType<typeof createClient<Database>>,
  p: {
    userId: string | null;
    businessId: string;
    orderId: string;
    orderNumber: string | null;
    awb: string;
    cod: number;
    descriere: string;
  },
): Promise<void> {
  const retur = esteRetur(p.cod);
  const anulat = p.cod === 10;
  const comanda = p.orderNumber ? `Comanda ${p.orderNumber}` : "O comanda";
  const titlu = retur ? "Colet SmartShip returnat" : anulat ? "AWB SmartShip anulat" : "Expediere SmartShip care cere atentie";
  const spune = p.descriere || `status SmartShip ${p.cod}`;

  const mesaj = retur
    ? `${comanda}: coletul ${p.awb} se intoarce la tine (${spune}). Marfa vine inapoi, iar rambursul NU s-a incasat — anularea comenzii si returul banilor raman decizia ta.`
    : anulat
      /* ⚠ Anularea vazuta de cron s-a facut in ALTA parte decat panoul nostru:
         al nostru scoate numarul de pe comanda, deci coletul ar fi iesit din
         interogare. Comanda poarta un AWB mort — omul trebuie sa afle. */
      ? `${comanda}: AWB-ul ${p.awb} figureaza ANULAT la SmartShip, dar comanda il poarta in continuare. Daca anularea a fost intentionata, sterge AWB-ul din pagina comenzii; altfel emite unul nou.`
      : `${comanda}: expedierea ${p.awb} are un eveniment care cere o decizie: ${spune}. Deschide comanda pentru istoricul complet.`;

  if (p.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: p.userId,
      type: "smartship",
      title: titlu,
      message: mesaj,
    });
    if (error) console.error("[smartship-tracking] notificarea nu s-a scris:", error.message);
  }

  await logError({
    action: "smartship-tracking",
    message: `${titlu}: ${mesaj}`,
    details: { orderId: p.orderId, awb: p.awb, cod: p.cod },
    businessId: p.businessId,
    severity: retur || anulat ? "warning" : "info",
  });
}
