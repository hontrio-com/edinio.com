import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ASTEPTARE_MS,
  NUME_CURIER_EPACKET,
  eAwbNegasit,
  felulEroriiEpacket,
  stareEpacket,
  type EpacketConfig,
} from "@/lib/epacket/client";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { statusUrmator, trebuieSemnalat } from "@/lib/epacket/statusuri";
import { alarmaMagazinului, citesteStarea, galeataGoala, semnalareEpacket, type Galeata } from "@/lib/epacket/urmarire";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { marcheazaLotul, scrieUrmarirea } from "@/lib/orders/urmarirea-se-scrie-pe-identitate";
import { proprietariiMagazinelor, semnaleazaExpedierea } from "@/lib/orders/semnalarea-ajunge-la-om";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import type { Database } from "@/types/database.types";

/**
 * Urmarirea coletelor e-packet.
 *
 * ═══ ⚠ UN AWB PE CERERE, 60 DE CERERI PE MINUT PE CHEIE ═══
 *
 * `GET /status` ia un singur AWB, iar plafonul lor e pe CHEIE, „toate adresele la un loc" (peste
 * el: 429, nimic stricat). Deci magazinele merg IN PARALEL (fiecare cu cheia lui) si in fiecare
 * magazin pe rand, cu pauza care tine sub plafon. Ei nu reintreaba curierul mai des de 30 de
 * minute, deci o trecere la doua ore nu pierde nimic din ce stiu ei.
 *
 * ═══ ⚠ NU EXISTA ISTORIC ═══
 *
 * Se vede doar starea curenta: un „avizat" urmat de „in_livrare" intre doua treceri nu se afla.
 * Nu se poate repara de la noi; e scris in `docs/curieri/EPACKET.md`.
 *
 * ═══ ⚠ NU TRIMITE NIMIC CLIENTULUI ═══
 *
 * Aceeasi hotarare ca la GLS si Curiera: emailul de expediere pleaca DOAR din `updateOrder`.
 */

export const maxDuration = 60;

/** Cat de departe in urma se mai intreaba, dupa EMITERE. */
const ZILE = 30;

/** Comenzi pe rulare, peste toate magazinele. */
const MAX_COMENZI = 600;

/** Cate magazine se intreaba deodata (fiecare cu cheia si plafonul lui). */
const MAGAZINE_IN_PARALEL = 6;

/**
 * Pauza intre doua cereri ale ACELUIASI magazin: 60 pe minut e plafonul lor, iar 1,1 s lasa loc
 * si cererilor din panoul comerciantului (eticheta, fereastra), care merg pe aceeasi cheie.
 */
const PAUZA_MS = 1_100;

/** Termenul rularii: incape, impreuna cu un apel intreg si prelucrarea de dupa, in `maxDuration`. */
const MARJA_MS = 10_000;
const BUGET_MS = maxDuration * 1000 - ASTEPTARE_MS - MARJA_MS;

/**
 * Pragurile alarmelor, pe magazin, numai fara nicio citire reusita in tura. Cheia respinsa, un
 * refuz si AWB-urile negasite sunt deterministe: de la PRIMUL (un magazin mic, cu 1-2 colete, nu
 * are voie sa taca pentru totdeauna). Caderile trecatoare raman la 3.
 */
const PRAGURI = { autentificare: 1, refuz: 1, esecuri: 3, negasite: 1 };

const ACTIUNE = "epacket-tracking";

const pauza = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    .select("id, business_id, status, order_number, payment_status, created_at, epacket_awb_number, epacket_awb_at, epacket_curier, epacket_status_code, epacket_status_checked_at")
    .not("epacket_awb_number", "is", null)
    .neq("epacket_awb_number", "")
    /* ⚠ O comanda anulata isi pastreaza AWB-ul: fara filtrul pe status s-ar potrivi la nesfarsit. */
    .in("status", ["pending", "confirmed", "processing", "shipped"])
    /*
     * ⚠ Fereastra se ancoreaza pe EMITERE, cu DOI termeni simpli: un `and(...)` imbricat gresit in
     * `or(...)` NU da eroare la PostgREST, da LISTA GOALA. Restul conditiei sta mai jos.
     */
    .or(`epacket_awb_at.gte.${since},epacket_awb_at.is.null`)
    /* Rotatia: cele neintrebate vreodata (null) intai. */
    .order("epacket_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_COMENZI);

  /* ⚠ O citire picata NU are voie sa raporteze „zero de verificat". */
  if (eComenzi) {
    await logError({ action: ACTIUNE, message: `comenzile cu AWB e-packet nu s-au putut citi: ${eComenzi.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const inFereastra = (comenzi ?? []).filter((o) => o.epacket_awb_at !== null || (o.created_at ?? "") >= since);
  if (inFereastra.length === 0) return NextResponse.json({ ok: true, verificate: 0, mutate: 0, semnalate: 0 });

  const peMagazin = new Map<string, typeof inFereastra>();
  for (const o of inFereastra) {
    const lista = peMagazin.get(o.business_id) ?? [];
    lista.push(o);
    peMagazin.set(o.business_id, lista);
  }
  const bizIds = [...peMagazin.keys()];

  const { data: setari, error: eCfg } = await admin
    .from("store_settings").select("business_id, epacket_config").in("business_id", bizIds);
  if (eCfg) {
    await logError({ action: ACTIUNE, message: `configuratiile e-packet nu s-au putut citi: ${eCfg.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }
  const configuri = new Map<string, EpacketConfig | null>();
  for (const r of setari ?? []) configuri.set(r.business_id, r.epacket_config as EpacketConfig | null);

  const proprietari = await proprietariiMagazinelor(admin, bizIds);
  const termen = Date.now() + BUGET_MS;
  const s = { verificate: 0, mutate: 0, semnalate: 0, esuate: 0, negasite: 0, incheiate: 0, faraConfig: 0, ramase: 0 };
  const stariNoi = new Set<string>();
  const galeti = new Map<string, Galeata>();

  async function magazin(businessId: string, lista: typeof inFereastra): Promise<void> {
    const cfg = configuri.get(businessId);
    const g = galeataGoala();
    galeti.set(businessId, g);
    const marcheaza = (ids: string[]) => marcheazaLotul(admin, {
      ids, businessId, marcaj: { epacket_status_checked_at: new Date().toISOString() }, actiune: ACTIUNE,
    });

    /*
     * ⚠⚠ MARCAJUL SE SCRIE PE ORICE DRUM. Sarite fara marcaj, comenzile unui magazin fara
     * configurare raman in capul cozii la fiecare rulare si infometeaza urmarirea platformei.
     * Urmarirea cere doar CHEIA (nu adresa de ridicare): `epacketGata` ar fi oprit-o la un
     * magazin care doar si-a schimbat adresa.
     */
    if (!cfg || !(cfg.api_key ?? "").trim()) {
      s.faraConfig += lista.length;
      await marcheaza(lista.map((o) => o.id));
      return;
    }

    for (let i = 0; i < lista.length; i++) {
      const o = lista[i];
      /* Ramase fara marcaj: pastreaza locul din fata si ies primele la tura urmatoare. */
      if (Date.now() >= termen) { s.ramase += lista.length - i; return; }
      if (i > 0) await pauza(PAUZA_MS);

      const awb = o.epacket_awb_number!.trim();
      let stare;
      try {
        stare = await stareEpacket(cfg, awb, ASTEPTARE_MS);
      } catch (e) {
        await marcheaza([o.id]);
        if (eAwbNegasit(e)) { s.negasite++; g.negasite++; continue; }
        s.esuate++;
        const fel = felulEroriiEpacket(e);
        g[fel]++;
        if (fel !== "autentificare") g.exemplu ||= (e as Error).message;
        console.error(`[${ACTIUNE}]`, businessId, awb, (e as Error).message);
        /* ⚠ Cheia respinsa nu se mai incearca pe celelalte colete ale magazinului: ar fi doar 401. */
        if (fel === "autentificare") {
          await marcheaza(lista.slice(i + 1).map((x) => x.id));
          g.autentificare += lista.length - i - 1;
          return;
        }
        continue;
      }

      s.verificate++;
      g.reusite++;
      const c = citesteStarea(stare, o.epacket_status_code);
      if (c.status === null) stariNoi.add(c.brut);

      const tinta = statusUrmator(o.status, c.status);
      let prelucrat = true;
      if (tinta) {
        const rez = await tranzitieComandaMarketplace(admin, {
          orderId: o.id, businessId, status: tinta, sursa: "epacket",
          expediere: { coloana: "epacket_awb_number", valoare: o.epacket_awb_number },
        });
        if (rez === "ok") {
          s.mutate++;
          /* ⚠ SE ASTEAPTA: un `void` nu apuca sa ruleze in serverless, iar comanda mutata nu mai
             trece a doua oara pe aici. */
          try {
            await maybeAutoInvoice(businessId, o.id, tinta, o.payment_status ?? "", admin as never);
          } catch (e) {
            await logError({
              action: ACTIUNE,
              message: `comanda ${o.order_number ?? o.id} a trecut pe ${tinta}, dar facturarea automata a esuat: ${(e as Error).message}`,
              details: { orderId: o.id, awb }, businessId, severity: "warning",
            });
          }
        }
        prelucrat = rez !== "reincearca";
      }

      /* ⚠ SEMNALAREA INAINTEA STARII: invers, o cadere intre ele ar lasa cheia noua fara notificare. */
      if (prelucrat && c.schimbata && trebuieSemnalat(c.cheie)) {
        s.semnalate++;
        const curier = NUME_CURIER_EPACKET[(o.epacket_curier ?? stare.curier) as keyof typeof NUME_CURIER_EPACKET] ?? "";
        const { titlu, mesaj } = semnalareEpacket({ orderNumber: o.order_number, awb, curier, cheie: c.cheie, eticheta: c.eticheta });
        await semnaleazaExpedierea(admin, {
          userId: proprietari.get(businessId) ?? null, businessId, orderId: o.id, orderNumber: o.order_number,
          awb, tip: "epacket", titlu, mesaj, actiune: ACTIUNE, detalii: { cheie: c.cheie },
        });
      }

      /* ⚠ Starea se scrie pe AWB-ul CITIT, si numai dupa ce tranzitia n-a iesit `reincearca`. */
      if (prelucrat) {
        if (c.finala) s.incheiate++;
        await scrieUrmarirea(admin, {
          orderId: o.id, businessId,
          identitate: { coloana: "epacket_awb_number", valoare: o.epacket_awb_number },
          stare: c.schimbata
            ? { epacket_status_code: c.cheie, epacket_status_label: c.eticheta, epacket_status_at: c.la }
            : {},
          marcaj: { epacket_status_checked_at: new Date().toISOString() },
          actiune: ACTIUNE, orderNumber: o.order_number,
        });
      } else {
        await marcheaza([o.id]);
      }
    }
  }

  /* Magazinele in paralel, cate `MAGAZINE_IN_PARALEL` deodata. */
  const coada = [...peMagazin.entries()];
  await Promise.all(Array.from({ length: Math.min(MAGAZINE_IN_PARALEL, coada.length) }, async () => {
    for (let x = coada.shift(); x; x = coada.shift()) {
      try {
        await magazin(x[0], x[1]);
      } catch (e) {
        /* Un magazin cazut nu opreste urmarirea celorlalti. */
        await logError({ action: ACTIUNE, message: `urmarirea magazinului a cazut: ${(e as Error).message}`, businessId: x[0], severity: "warning" });
      }
    }
  }));

  /* ⚠ Alarmele PE MAGAZIN: un magazin sanatos nu are voie sa ascunda cheia expirata a vecinului. */
  for (const [bizId, g] of galeti) {
    const alarma = alarmaMagazinului(g, PRAGURI);
    if (!alarma) continue;
    await logError({
      action: ACTIUNE, message: alarma.mesaj,
      details: { fel: alarma.fel, autentificare: g.autentificare, credit: g.credit, indisponibil: g.indisponibil, refuz: g.refuz, negasite: g.negasite },
      businessId: bizId, severity: alarma.severity,
    });
  }

  /* ⚠ O coada care nu se goleste e tot un defect: un retur poate astepta zile asa. */
  if (s.ramase > MAX_COMENZI / 3) {
    await logError({
      action: ACTIUNE,
      message: `Urmarirea e-packet n-a apucat ${s.ramase} din ${inFereastra.length} colete in tura asta (buget ${Math.round(BUGET_MS / 1000)}s, un AWB pe cerere). Coada creste, iar semnalarile intarzie.`,
      details: s, severity: "warning",
    });
  }

  console.log(`[${ACTIUNE}]`, JSON.stringify(s));
  return NextResponse.json({ ok: true, ...s, stariNoi: [...stariNoi] });
}
