import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { readSignatureHeader, verifyAboutYouSignature } from "@/lib/aboutyou/webhooks";
import { amanareInbox, prelucreazaEveniment } from "@/lib/aboutyou/inbox";
import { EroareTrecatoare } from "@/lib/aboutyou/erori";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import { logError } from "@/lib/error-logger";
import type { AboutYouConfig } from "@/lib/aboutyou/types";

/**
 * About You signed webhook. Registered per merchant with `?businessId=…`, so we
 * load the right signing secret. The HMAC signature is verified over the exact raw
 * body BEFORE any DB write; unverified events are logged and ignored. Always
 * answers 200 so About You does not retry-storm (it retries hourly for up to 2
 * days). Order events are handled starting in Faza 3.
 */
/*
 * ⚠ FEREASTRA DE EXECUTIE, DECLARATA (26.08.2026).
 *
 * Ruta face apel EXTERN inauntrul cererii lor: `prelucreazaEveniment` cheama `ingestOrderByNumber`,
 * care intreaba About You, apoi scrie comanda, retururile si consuma stocul — tot sincron. Fara
 * `maxDuration`, cadea pe limita implicita a platformei, iar o taiere la mijloc ar fi lasat
 * ingestia pe jumatate.
 *
 * ⚠ Acum e mai putin grav decat era: evenimentul e deja scris in inbox inainte de prelucrare, deci
 * o taiere nu-l mai pierde — cronul il reia. Dar tot n-are rost sa fie taiat.
 */
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const ok = () => NextResponse.json({ received: true });
  const businessId = request.nextUrl.searchParams.get("businessId");
  const rawBody = await request.text();
  if (!businessId) return ok();

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  /*
   * ═══ ⚠ O PANA A BAZEI RASPUNDEA `200`, INAINTE DE ORICE SCRIERE (27.08.2026) ═══
   *
   * Eroarea citirii se inghitea, `cfg` iesea `null`, si codul cadea pe ramura „magazinul n-are
   * secret de webhook" — care raspunde `200` DINADINS, fiindca acolo reincercarea lor n-ar ajuta
   * cu nimic. Numai ca aici ar fi ajutat: evenimentul nici nu apucase sa ajunga in inbox, deci
   * `200` il pierdea definitiv. Sondarea nu-l recupereaza: filtreaza dupa data CREARII comenzii.
   *
   * Cele patru raspunsuri, si nu se mai confunda intre ele:
   *   citirea a picat   → 503, ca ei sa reincerce
   *   config lipsa      → 200, hotarare veche si buna
   *   autentificare rea → 200, o reincercare n-ar schimba nimic
   *   scris in inbox    → 200
   */
  const { data: settings, error: eSettings } = await admin
    .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
  if (eSettings && eSettings.code !== "PGRST116") {
    console.error("[aboutyou/webhook] configul nu s-a putut citi", businessId, eSettings.message);
    return NextResponse.json({ error: "configurare indisponibila" }, { status: 503 });
  }
  const cfg = settings?.aboutyou_config as AboutYouConfig | null;
  if (!cfg?.webhook_secret) {
    /*
     * Ieșirea asta stingea webhookul COMPLET, inaintea oricarui log: un secret
     * pierdut la o resalvare de config facea ca fiecare eveniment sa fie inghitit
     * cu 200, iar la noi nu rămânea nicio urma.
     *
     * ⚠ LOGUL E STRANS DIN DOUA MOTIVE, nu din delicatete. Ruta e publica si
     * scutita de poarta, iar `businessId` vine din URL: fara conditia de mai jos,
     * oricine putea umple `error_logs` cu un uuid inventat, o cerere = un rand.
     * Iar About You reincearca din ora in ora doua zile, deci un singur abonament
     * rupt ar scrie sute de intrari identice — zgomot care ingroapa alarmele reale.
     * Deci: doar magazine CONECTATE, si cel mult o data la sase ore.
     */
    if (cfg?.connected && deSemnalat(businessId)) {
      await logError({
        action: "aboutyou/webhook",
        message: "Eveniment ignorat: magazinul nu are secret de webhook salvat. Reactivează notificările About You.",
        details: { businessId }, businessId, severity: "warning",
      });
    }
    return ok();
  }

  /*
   * DOUA INCUIETORI, pentru ca prima nu e sigura.
   *
   * Schema de semnatura a lui About You nu e publicata nicaieri: antetul si
   * algoritmul din `verifyAboutYouSignature` sunt DEDUSE. Daca sunt gresite,
   * verificarea pica mereu si ruta nu ar avea nicio aparare reala — sau, mai rau,
   * cineva ar putea fi tentat sa o scoata ca „sa mearga".
   *
   * De aceea adaugam un secret propriu in chiar URL-ul cu care ne abonam
   * (`?token=`). El nu depinde de nimic ce trebuie ghicit: doar About You il
   * cunoaste, pentru ca doar lui i l-am dat. Cand tokenul e prezent si corect,
   * evenimentul e autentic chiar daca semnatura nu se poate verifica.
   */
  const token = request.nextUrl.searchParams.get("token");
  const tokenOk = !!cfg.webhook_token && !!token && egalConstant(token, cfg.webhook_token);
  const semnaturaOk = verifyAboutYouSignature(cfg.webhook_secret, readSignatureHeader(request.headers), rawBody);
  if (!tokenOk && !semnaturaOk) {
    console.error("[aboutyou/webhook] eveniment neautentificat", { businessId, areToken: !!token });
    return ok();
  }

  let event: { id?: unknown; event?: string; type?: string; data?: unknown; message?: unknown };
  try { event = JSON.parse(rawBody); } catch { return ok(); }
  const name = event.event ?? event.type;

  /*
   * ═══ ⚠ SE SCRIE INTAI, SE PRELUCREAZA PE URMA (26.08.2026) ═══
   *
   * About You reincearca livrarea vreo doua zile daca nu primeste un raspuns bun. Ruta raspundea
   * insa `200` pe TOATE caile, inclusiv cand ingestia pica — o pana de baza, o exceptie, o comanda
   * pe care n-o gasim. Pentru ei, evenimentul era livrat: nu-l mai reincercau. Iar sondarea nu-l
   * poate recupera, fiindca filtreaza dupa data CREARII comenzii.
   *
   * ⚠ CELE TREI `200` DE LA AUTENTIFICARE RAMAN, si sunt o hotarare buna: un eveniment fara secret
   * sau cu semnatura gresita n-are cum sa devina bun daca il mai trimit o data. Acolo reincercarea
   * e zgomot curat. Se schimba numai calea de DUPA autentificare.
   *
   * ⚠ SI CALEA RAPIDA RAMANE. Scris in inbox, evenimentul e in siguranta — dar prelucrarea nu
   * asteapta cronul: se incearca pe loc, iar daca pica, randul ramane neprelucrat si cronul il
   * reia. Fara asta, fiecare expediere ar intarzia pana la un minut degeaba.
   */
  const eventId = idEvenimentului(event, rawBody);
  const { error: eInbox } = await admin.from("aboutyou_webhook_inbox").upsert(
    {
      business_id: businessId, event_id: eventId, event_name: name ?? null,
      payload: event as never,
    },
    { onConflict: "business_id,event_id", ignoreDuplicates: true },
  );
  if (eInbox) {
    /*
     * ⚠ SINGURUL LOC UNDE RASPUNDEM CU ESEC, si singurul unde reincercarea lor chiar ajuta: n-am
     * pastrat evenimentul, deci daca ne oprim aici e pierdut definitiv.
     */
    await logError({
      action: "aboutyou/webhook", severity: "critical",
      message: `evenimentul n-a putut fi scris in inbox: ${eInbox.message}`,
      details: { businessId, eventId, name }, businessId,
    });
    return NextResponse.json({ error: "inbox indisponibil" }, { status: 503 });
  }

  /* ⚠ De-aici incolo, un esec nu mai pierde nimic: randul ramane neprelucrat si cronul il reia. */
  try {
    await prelucreazaEveniment(admin, businessId, cfg, event);
    /*
     * ═══ ⚠ REUSITA NU SE MARCA, DECI CRONUL REFACEA TOT (27.08.2026) ═══
     *
     * Calea rapida prelucra evenimentul si il lasa neatins in inbox. Randul ramanea `prelucrat_la`
     * null, deci cronul il lua de la capat la minutul urmator — fiecare eveniment prelucrat de
     * DOUA ori. Ingestul e idempotent, deci nu se pierdea nimic; se cheltuiau insa o recitire a
     * comenzii de la ei si un loc din cele douazeci pe trecere, degeaba.
     *
     * ⚠ SE MARCHEAZA DUPA ce prelucrarea a mers, nu inainte: invers, un esec ar fi inchis randul
     * definitiv, adica exact pierderea pe care inbox-ul o inlatura.
     */
    await admin.from("aboutyou_webhook_inbox")
      .update({ prelucrat_la: new Date().toISOString(), last_error: null } as never)
      .eq("business_id", businessId).eq("event_id", eventId);
  } catch (e) {
    /*
     * ═══ ⚠ SI CALEA RAPIDA DEOSEBESTE CAUZELE (27.08.2026, tarziu) ═══
     *
     * Scria `incercari: 1` pentru ORICE exceptie, inclusiv o pana a bazei — deci prima incercare
     * era arsa chiar de indisponibilitatea care n-are nicio legatura cu evenimentul. Acum
     * trecatoarele lasa contorul pe zero, ca in cron.
     */
    const trecator = e instanceof EroareTrecatoare || e instanceof EroareCitireBaza;
    await admin.from("aboutyou_webhook_inbox")
      .update({
        incercari: trecator ? 0 : 1,
        last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        /* ⚠ Si amanarea porneste de aici: fara ea, cronul ar relua imediat exact ce tocmai a picat. */
        urmatoarea_incercare: new Date(Date.now() + amanareInbox(1)).toISOString(),
      } as never)
      .eq("business_id", businessId).eq("event_id", eventId);
  }

  return ok();
}

/**
 * Cheia dupa care acelasi eveniment livrat de doua ori nu face doua randuri.
 *
 * ⚠ `id`-ul din plicul lor e cheia adevarata. Cand lipseste, se face o amprenta din corp — ca
 * aceeasi livrare sa nimereasca acelasi rand, nu unul nou la fiecare reincercare.
 */
function idEvenimentului(event: { id?: unknown }, rawBody: string): string {
  if (typeof event.id === "string" && event.id.trim()) return event.id.trim();
  if (typeof event.id === "number") return String(event.id);
  return `amprenta:${createHash("sha256").update(rawBody).digest("hex").slice(0, 32)}`;
}


// Comparatie in timp constant: o comparatie obisnuita se opreste la prima
// diferenta, deci scurgerea de timp lasa tokenul sa fie ghicit caracter cu caracter.
function egalConstant(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  try { return timingSafeEqual(x, y); } catch { return false; }
}

/*
 * Strangulator de alarme, pe proces.
 *
 * Nu e o solutie perfecta — pe mai multe instante se scrie de mai multe ori — dar
 * taie exact tiparul care conteaza: acelasi abonament rupt care reincearca din ora
 * in ora, doua zile.
 */
const semnalatLa = new Map<string, number>();
const SASE_ORE = 6 * 60 * 60 * 1000;
function deSemnalat(cheie: string): boolean {
  const acum = Date.now();
  const ultim = semnalatLa.get(cheie);
  if (ultim != null && acum - ultim < SASE_ORE) return false;
  semnalatLa.set(cheie, acum);
  return true;
}
