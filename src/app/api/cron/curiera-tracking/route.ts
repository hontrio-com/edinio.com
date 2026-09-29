import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ASTEPTARE_MS,
  curieraGata,
  felulEroriiCuriera,
  istoricCuriera,
  partenerCuriera,
  stariCuriera,
  type CurieraConfig,
  type EvenimentCuriera,
  type StareCuriera,
} from "@/lib/curiera/client";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { cheieEveniment, eStareFinala, evenimenteDeSemnalat, statusUrmator, trebuieSemnalat } from "@/lib/curiera/statusuri";
import {
  alarmaMagazinului,
  citesteStarea,
  galeataGoala,
  semnalareCuriera,
  trebuieSpus,
  type Galeata,
} from "@/lib/curiera/urmarire";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { marcheazaLotul, scrieUrmarirea } from "@/lib/orders/urmarirea-se-scrie-pe-identitate";
import { proprietariiMagazinelor, semnaleazaExpedierea } from "@/lib/orders/semnalarea-ajunge-la-om";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea coletelor Curiera.
 *
 * ═══ ⚠ LOTUL MERGE PE `get_status`, NU PE `get_statuses` ═══
 *
 * `get_statuses`, documentat anume pentru loturi, raspunde HTTP 200 cu corp GOL si pe AWB-uri
 * reale (masurat pe 29.09.2026). `get_status` cu `awbnos=a,b,c` intoarce o intrare pe numar
 * cerut, cu `request_no`, iar 500 de numere au raspuns in jumatate de secunda. Potrivirea se
 * face pe numarul CERUT: la un AWB necunoscut `no` vine gol.
 *
 * ═══ ⚠ LOTUL DA DOAR STAREA CURENTA ═══
 *
 * Un „avizat" (livrare esuata) urmat de „in_curs" intre doua treceri nu s-ar vedea niciodata
 * (lectia Postei). De aceea, la ORICE schimbare a cheii `stare|cod`, se citeste istoricul
 * coletului si se spun toate evenimentele-problema inca nespuse, intr-o singura notificare;
 * ce s-a spus se tine minte pe comanda (`curiera_evenimente_semnalate`).
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la GLS: emailul de expediere pleaca DOAR din `updateOrder`, legat de
 * plafoanele pe `user.id`. Un cron n-are utilizator, deci le-ar ocoli.
 */

export const maxDuration = 60;

/** Cat de departe in urma se mai intreaba, dupa EMITERE. */
const ZILE = 30;

/** Comenzi pe rulare. In lot de cate o suta, inseamna cel mult sase apeluri pe magazin. */
const MAX_COMENZI = 600;

/**
 * AWB-uri pe cerere. Plafonul lor nu e documentat (500 au mers); o suta e prudent. Numerele
 * pleaca in CORPUL cererii, nu in adresa (lectia adreselor lungi de la FAN).
 */
const AWB_PE_CERERE = 100;

/**
 * Termenul rularii: trebuie sa incapa, IMPREUNA CU UN APEL INTREG (lot sau istoric, amandoua pe
 * `ASTEPTARE_MS` al clientului), in `maxDuration`. Scris din `maxDuration`, ca cele doua sa nu se
 * departeze tacut la prima marire a limitei.
 */
/* ⚠ Marja tine si prelucrarea de DUPA ultimul apel (o tranzitie si o factura automata, 2-5 s). */
const MARJA_MS = 10_000;
const BUGET_MS = maxDuration * 1000 - ASTEPTARE_MS - MARJA_MS;

/**
 * Pragurile alarmelor, pe magazin, numarate pe AWB, si NUMAI cand magazinul n-are nicio citire
 * reusita in tura (vezi `alarmaMagazinului`).
 *
 * ⚠ BAD_LOGIN si AWB-urile necunoscute alarmeaza de la PRIMUL: amandoua sunt deterministe la
 * Curiera (un singur apel acopera tot magazinul, iar un AWB e cunoscut din clipa emiterii,
 * masurat). Cu un prag de 3 sau 5, un magazin mic, cu 1-2 colete, isi pierdea urmarirea pentru
 * totdeauna fara ca nimeni sa afle. Caderile trecatoare (retea, 5xx) raman la 3.
 */
const MIN_AUTENTIFICARE_ALARMA = 1;
/* Un refuz care nu e BAD_LOGIN (alt cod in plic, 4xx) e si el determinist: de la primul. */
const MIN_REFUZ_ALARMA = 1;
const MIN_ESECURI_ALARMA = 3;
const MIN_NECUNOSCUTE_ALARMA = 1;

const ACTIUNE = "curiera-tracking";

/**
 * Cat timp dupa emitere se mai intreaba de AWB-ul partenerului (DPD etc.), daca n-a venit la
 * emitere. Masurat: la DPD vine in aceeasi secunda, deci pragul e plasa, nu calea obisnuita.
 */
const ZILE_PARTENER = 3;

function proaspatPentruPartener(awbAt: string | null): boolean {
  const t = awbAt ? Date.parse(awbAt) : NaN;
  return Number.isFinite(t) && Date.now() - t < ZILE_PARTENER * 86400000;
}

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const since = new Date(Date.now() - ZILE * 86400000).toISOString();

  const { data: comenzi, error: eComenzi } = await admin
    .from("orders")
    .select("id, business_id, status, order_number, payment_status, created_at, curiera_awb_number, curiera_awb_at, curiera_status_code, curiera_status_at, curiera_status_checked_at, curiera_evenimente_semnalate, curiera_partener_awb")
    .not("curiera_awb_number", "is", null)
    .neq("curiera_awb_number", "")
    /* ⚠ O comanda anulata isi pastreaza AWB-ul: fara filtrul pe status s-ar potrivi la nesfarsit. */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITERE, cu DOI termeni simpli: un `and(...)` imbricat gresit in
     * `or(...)` NU da eroare la PostgREST, da LISTA GOALA, adica urmarirea moare raportand
     * `ok: true`. Restul conditiei sta mai jos, in JavaScript.
     */
    .or(`curiera_awb_at.gte.${since},curiera_awb_at.is.null`)
    /* Rotatia: cele neintrebate vreodata (null) intai. */
    .order("curiera_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /* ⚠ O citire picata NU are voie sa raporteze „zero de verificat". */
  if (eComenzi) {
    await logError({
      action: ACTIUNE,
      message: `comenzile cu AWB Curiera nu s-au putut citi: ${eComenzi.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  /* Perechea conditiei de mai sus: fara ancora, raman in urmarire doar cat COMANDA e in fereastra. */
  const inFereastra = (comenzi ?? []).filter(
    (o) => o.curiera_awb_at !== null || (o.created_at ?? "") >= since,
  );
  if (inFereastra.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, mutate: 0, semnalate: 0 });
  }

  /* Pe magazin, fiindca fiecare intreaba cu cheia lui. TOATE, si cele fara configurare. */
  const peMagazin = new Map<string, typeof inFereastra>();
  for (const o of inFereastra) {
    const lista = peMagazin.get(o.business_id) ?? [];
    lista.push(o);
    peMagazin.set(o.business_id, lista);
  }
  const bizIds = [...peMagazin.keys()];

  const { data: setari, error: eCfg } = await admin
    .from("store_settings").select("business_id, curiera_config").in("business_id", bizIds);

  /* Fara configuratii, TOATE comenzile ar fi sarite: zero munca, raportata reusit. */
  if (eCfg) {
    await logError({
      action: ACTIUNE,
      message: `configuratiile Curiera nu s-au putut citi: ${eCfg.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const configuri = new Map<string, CurieraConfig | null>();
  for (const r of setari ?? []) configuri.set(r.business_id, r.curiera_config as CurieraConfig | null);

  const proprietari = await proprietariiMagazinelor(admin, bizIds);

  const termen = Date.now() + BUGET_MS;
  let verificate = 0, mutate = 0, semnalate = 0, esuate = 0, necunoscute = 0, parteneri = 0;
  let incheiate = 0, faraConfig = 0, ramase = 0, sarite = 0, istoricPicat = 0;
  let exempluIstoric = "";
  /* ⚠ Starile pe care nu le stim, stranse pe nume: din ele creste harta din `statusuri.ts`. */
  const stariNoi = new Set<string>();

  const galeti = new Map<string, Galeata>();
  const galeata = (bizId: string) => {
    let g = galeti.get(bizId);
    if (!g) { g = galeataGoala(); galeti.set(bizId, g); }
    return g;
  };

  for (const [businessId, lista] of peMagazin) {
    const cfg = configuri.get(businessId);

    /*
     * ⚠⚠ MARCAJUL SE SCRIE PE ORICE DRUM, pentru TOATE cele cerute. Sarite fara marcaj, comenzile
     * unui magazin fara configurare raman in capul cozii la fiecare rulare si, cu 600 pe tura,
     * pot bloca urmarirea intregii platforme (nu `continue` fara marcaj, ca la DPD).
     */
    if (!curieraGata(cfg)) {
      faraConfig += lista.length;
      await marcheazaLotul(admin, {
        ids: lista.map((o) => o.id), businessId,
        marcaj: { curiera_status_checked_at: new Date().toISOString() }, actiune: ACTIUNE,
      });
      continue;
    }

    /*
     * Cele incheiate nu se mai intreaba, dar se dau la RAND: un retur nu misca comanda, deci ea
     * ramane in filtru toata fereastra, si fara marcaj ar sta vesnic in fata cozii.
     */
    const incheiateAici = lista.filter((o) => eStareFinala(o.curiera_status_code));
    const deIntrebat = lista.filter((o) => !eStareFinala(o.curiera_status_code));
    if (incheiateAici.length > 0) {
      incheiate += incheiateAici.length;
      await marcheazaLotul(admin, {
        ids: incheiateAici.map((o) => o.id), businessId,
        marcaj: { curiera_status_checked_at: new Date().toISOString() }, actiune: ACTIUNE,
      });
    }

    for (let i = 0; i < deIntrebat.length; i += AWB_PE_CERERE) {
      /* Ramase fara marcaj: pastreaza locul din fata si ies primele la tura urmatoare. */
      if (Date.now() >= termen) { ramase += deIntrebat.length - i; break; }

      const felie = deIntrebat.slice(i, i + AWB_PE_CERERE);
      const ids = felie.map((o) => o.id);

      let stari: StareCuriera[];
      try {
        stari = await stariCuriera(cfg, felie.map((o) => o.curiera_awb_number!.trim()), ASTEPTARE_MS);
      } catch (e) {
        /*
         * ⚠ Galeata dupa FELUL erorii, nu dupa statusul HTTP: BAD_LOGIN vine pe 200 la ei. Vezi
         * `alarmaMagazinului`.
         */
        esuate += felie.length;
        const g = galeata(businessId);
        const fel = felulEroriiCuriera(e);
        g[fel] += felie.length;
        if (fel !== "autentificare") g.exemplu ||= (e as Error).message;
        console.error(`[${ACTIUNE}] lot`, businessId, (e as Error).message);
        await marcheazaLotul(admin, {
          ids, businessId, marcaj: { curiera_status_checked_at: new Date().toISOString() }, actiune: ACTIUNE,
        });
        continue;
      }

      /* ⚠ Marcajul pentru TOATE cele cerute, si pentru cele pe care ei nu le recunosc. */
      await marcheazaLotul(admin, {
        ids, businessId, marcaj: { curiera_status_checked_at: new Date().toISOString() }, actiune: ACTIUNE,
      });

      /* ⚠ Pe numarul CERUT (`request_no`), nu pe `no`: la necunoscut `no` vine gol. */
      const dupaCerere = new Map(stari.map((s) => [s.cerut, s]));

      for (const o of felie) {
        /*
         * ⚠ TERMENUL SE VERIFICA INAINTEA FIECAREI COMENZI, nu doar a fiecarei felii. Dupa citirea
         * lotului, o comanda poate costa o tranzitie si o factura automata (2-5 s): o felie de 100
         * de AWB-uri proaspete, fara nicio verificare, trecea de `maxDuration`, iar Vercel ucidea
         * functia in mijlocul unei facturi. Comanda lasata aici nu se atinge deloc: tura urmatoare
         * o reia, cu starea veche.
         */
        if (Date.now() >= termen) { sarite++; continue; }

        const awb = o.curiera_awb_number!.trim();
        const c = citesteStarea(dupaCerere.get(awb), o.curiera_status_code, o.curiera_status_at);

        /* ⚠ Necunoscut: se numara, nu se scrie. Tacerea lor nu e o stare. */
        if (c.fel === "necunoscut") {
          necunoscute++;
          galeata(businessId).necunoscute++;
          continue;
        }

        verificate++;
        galeata(businessId).reusite++;
        if (c.status === null) stariNoi.add(c.brut);

        /* Istoricul, doar cand cheia sau clipa starii s-a schimbat. `null` = necitit sau picat. */
        let evenimente: EvenimentCuriera[] | null = null;
        let memorie: string[] | null = null;
        let istoricPicatAici = false;
        if (c.cereIstoric) {
          /*
           * ⚠ Fara timp pentru istoric, comanda se lasa NEATINSA (fara tranzitie, fara stare):
           * cheia ramane veche, deci o tura urmatoare o reia, cu istoric cu tot. Marcajul l-a pus
           * lotul, deci ea trece la coada cozii, nu in fata.
           */
          if (Date.now() >= termen) { sarite++; continue; }
          try {
            const istoric = await istoricCuriera(cfg, awb);
            /* ⚠ Un AWB care are o stare are si istoric: lista goala nu e „nimic de spus". */
            if (istoric.length === 0) throw new Error("istoric gol");
            const r = evenimenteDeSemnalat(istoric, o.curiera_evenimente_semnalate);
            evenimente = r.noi;
            memorie = r.memorie;
          } catch (e) {
            /* Se cade pe starea curenta (`trebuieSpus`). Starea NU se scrie decat daca ea insasi
               cere atentie (vezi mai jos), ca istoricul sa se poata cere din nou. */
            istoricPicatAici = true;
            istoricPicat++;
            exempluIstoric ||= (e as Error).message;
            console.error(`[${ACTIUNE}] istoric`, awb, (e as Error).message);
          }
        }

        const tinta = statusUrmator(o.status, c.status);
        let prelucrat = true;
        if (tinta) {
          const rez = await tranzitieComandaMarketplace(admin, {
            orderId: o.id,
            businessId,
            status: tinta,
            sursa: "curiera",
            expediere: { coloana: "curiera_awb_number", valoare: o.curiera_awb_number },
          });
          /* ⚠ Verdictul e un SIR (`ok` | `reincearca` | `definitiv`), nu un obiect cu `.ok`. */
          if (rez === "ok") {
            mutate++;
            /*
             * ⚠ SE ASTEAPTA, si NU doar la `delivered`: triggerul magazinului poate fi si
             * processing/shipped, iar dispecerul e singurul care stie regula. Un `void` nu apuca
             * sa ruleze in serverless, iar comanda mutata nu mai trece a doua oara pe aici.
             */
            try {
              await maybeAutoInvoice(businessId, o.id, tinta, o.payment_status ?? "", admin as never);
            } catch (e) {
              await logError({
                action: ACTIUNE,
                message: `comanda ${o.order_number ?? o.id} a trecut pe ${tinta}, dar facturarea automata a esuat: ${(e as Error).message}`,
                details: { orderId: o.id, awb },
                businessId,
                severity: "warning",
              });
            }
          }
          /* `reincearca` = nu stim daca s-a scris: starea nu se retine, tura urmatoare reia. */
          prelucrat = rez !== "reincearca";
        }

        /*
         * ⚠ SEMNALAREA INAINTEA STARII. Scrisa intai starea, o cadere intre cele doua ar lasa cheia
         * noua pe comanda fara nicio notificare, iar o stare finala scoate coletul din urmarire.
         * Invers, cel mai rau caz e o notificare repetata.
         */
        if (trebuieSpus(c, evenimente)) {
          semnalate++;
          const { titlu, mesaj } = semnalareCuriera({
            orderNumber: o.order_number, awb, cheie: c.cheie, eticheta: c.eticheta, evenimente,
          });
          await semnaleazaExpedierea(admin, {
            userId: proprietari.get(businessId) ?? null,
            businessId,
            orderId: o.id,
            orderNumber: o.order_number,
            awb,
            tip: "curiera",
            titlu,
            mesaj,
            actiune: ACTIUNE,
            detalii: { cheie: c.cheie, evenimente: (evenimente ?? []).map(cheieEveniment) },
          });
        }

        /*
         * ⚠ Starea se scrie pe AWB-ul CITIT (intre citire si aici a trecut un apel la ei) si
         * numai dupa ce tranzitia n-a iesit `reincearca`. Fara schimbare nu e nimic de scris:
         * marcajul l-a pus deja lotul.
         */
        /* ⚠ Istoricul picat NU scrie cheia cand starea curenta nu cere atentie: scrisa, cheia n-ar
           mai diferi la tura urmatoare, istoricul nu s-ar mai cere, iar un „avizat" petrecut intre
           doua treceri s-ar pierde definitiv. Tranzitia de mai sus e idempotenta, deci ramane. */
        /* ⚠ Dar NU pe o stare FINALA: dupa `livrat` comanda iese din coada (statusul ei nu mai e
           urmarit), deci o cheie amanata n-ar mai fi scrisa niciodata, iar cardul ar ramane pe
           „In curs de livrare" la o comanda Livrata. */
        const amanaStarea = istoricPicatAici && !trebuieSemnalat(c.cheie) && !eStareFinala(c.cheie);
        if (prelucrat && !amanaStarea && (c.schimbata || memorie !== null)) {
          await scrieUrmarirea(admin, {
            orderId: o.id,
            businessId,
            identitate: { coloana: "curiera_awb_number", valoare: o.curiera_awb_number },
            stare: {
              curiera_status_code: c.cheie,
              curiera_status_label: c.eticheta,
              curiera_status_at: c.la,
              /* ⚠ Memoria e a coletului CITIT, deci sta in stare, nu in marcaj. */
              ...(memorie !== null ? { curiera_evenimente_semnalate: memorie } : {}),
            },
            marcaj: { curiera_status_checked_at: new Date().toISOString() },
            actiune: ACTIUNE,
            orderNumber: o.order_number,
          });
        }

        /*
         * AWB-ul partenerului (de ex. DPD), cand n-a venit la emitere. ⚠ Doar in primele
         * ZILE_PARTENER zile: o expediere dusa chiar de Curiera n-are partener, iar fara prag ar fi
         * intrebata la fiecare tura, pana iese din fereastra. O citire picata nu opreste nimic.
         */
        if (!o.curiera_partener_awb && proaspatPentruPartener(o.curiera_awb_at) && Date.now() < termen) {
          try {
            const p = await partenerCuriera(cfg, awb, ASTEPTARE_MS);
            if (p) {
              const { error: eP } = await admin.from("orders")
                .update({ curiera_partener: p.nume, curiera_partener_awb: p.awb })
                .eq("id", o.id).eq("business_id", businessId)
                .eq("curiera_awb_number", o.curiera_awb_number!);
              if (eP) console.error(`[${ACTIUNE}] partener`, awb, eP.message);
              else parteneri++;
            }
          } catch (e) {
            console.error(`[${ACTIUNE}] partener`, awb, (e as Error).message);
          }
        }
      }
    }
  }

  /* ⚠ Alarmele PE MAGAZIN: un magazin sanatos nu are voie sa ascunda cheia expirata a vecinului. */
  for (const [bizId, g] of galeti) {
    const alarma = alarmaMagazinului(g, {
      autentificare: MIN_AUTENTIFICARE_ALARMA, refuz: MIN_REFUZ_ALARMA, esecuri: MIN_ESECURI_ALARMA,
      necunoscute: MIN_NECUNOSCUTE_ALARMA,
    });
    if (!alarma) continue;
    await logError({
      action: ACTIUNE,
      message: alarma.mesaj,
      details: { fel: alarma.fel, autentificare: g.autentificare, indisponibil: g.indisponibil, refuz: g.refuz, necunoscute: g.necunoscute },
      businessId: bizId,
      severity: alarma.severity,
    });
  }

  /* Istoricul picat nu opreste nimic, dar evenimentele dintre treceri se pot pierde: se spune. */
  if (istoricPicat > 0) {
    await logError({
      action: ACTIUNE,
      message: `istoricul Curiera nu s-a putut citi pentru ${istoricPicat} colete; s-a semnalat doar starea lor curenta. Primul raspuns: ${exempluIstoric}`,
      details: { istoricPicat },
      severity: "warning",
    });
  }

  /* ⚠ O coada care nu se goleste e tot un defect: un retur poate astepta zile asa. */
  if (ramase + sarite > MAX_COMENZI / 3) {
    await logError({
      action: ACTIUNE,
      message: `Urmarirea Curiera n-a apucat ${ramase + sarite} din ${inFereastra.length} colete in tura asta (buget ${Math.round(BUGET_MS / 1000)}s). Coada creste, iar semnalarile intarzie.`,
      details: { ramase, sarite, verificate, esuate, incheiate },
      severity: "warning",
    });
  }

  console.log(
    `[${ACTIUNE}] verificate ${verificate}, mutate ${mutate}, semnalate ${semnalate}, esuate ${esuate}, `
    + `necunoscute ${necunoscute}, incheiate ${incheiate}, faraConfig ${faraConfig}, ramase ${ramase}, sarite ${sarite}`,
  );
  return NextResponse.json({
    ok: true, verificate, mutate, semnalate, esuate, necunoscute, incheiate, faraConfig, ramase, sarite, istoricPicat, parteneri,
    stariNoi: [...stariNoi],
  });
}
