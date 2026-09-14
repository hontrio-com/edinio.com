import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { aplicaUrmarire, type ComandaDeUrmarit } from "@/lib/innoship/aplica-urmarire";
import type { UrmarireInnoship } from "@/lib/innoship/client";

/**
 * „Track push" — statusurile impinse de Innoship.
 *
 * ═══ CUM E APARAT ═══
 *
 * ⚠ Innoship NU semneaza nimic. Documentatia lor spune, cuvant cu cuvant, ca
 * „your endpoint may use any authentication method" — deci nu exista nici HMAC,
 * nici cheie a lor, nici antet de verificat. Tot ce ne apara e secretul din ADRESA,
 * pe care il generam noi si pe care comerciantul il lipeste in portalul lor.
 *
 * Acelasi tipar ca la notice.ro. Si aceleasi doua reguli:
 *   1. fara secret, nu se face nimic — fail-closed;
 *   2. secretul identifica MAGAZINUL, iar fiecare comanda din lot se potriveste
 *      apoi pe magazinul acela. Un lot nu poate atinge comenzile altcuiva nici
 *      daca ar contine referinte straine.
 *
 * ═══ ⚠ CE POATE FACE CINE ARE ADRESA, SI DE CE CONTEAZA (14.09.2026) ═══
 *
 * Adresa nu e doar o cheie de citire. Cu ea singura, cineva poate trimite un istoric
 * FABRICAT pentru orice `order_number` al magazinului si poate impinge comanda in
 * „livrata", ceea ce declanseaza mai departe emiterea facturii (`maybeAutoInvoice`).
 * De aceea intarirea de mai jos e despre TRANSPORT, nu despre reluare: cine tine
 * secretul poate oricum sa trimita ceva plauzibil o singura data.
 *
 * ⚠ SI DE CE NU SE CERE O SEMNATURA. Ar fi reparatia evidenta si ar opri TACIT
 * urmarirea la toti comerciantii de azi: Innoship nu semneaza nimic, iar
 * comerciantul doar lipeste o adresa in portalul lor. Nu exista nicio parghie prin
 * care sa ceri un antet de la ei. Totul aici e ADITIV: formele vechi raman valabile.
 *
 * ⚠ SI DE CE NU EXISTA REGISTRU DE RELUARE. `aplicaUrmarire` compara deja starea
 * (`codNou !== comanda.innoship_status_code`), deci un lot identic retrimis e inert.
 * Dedublarea n-ar apara impotriva falsificarii, care e riscul adevarat, si ar aduce
 * un tabel in plus pentru un castig mic. `correlationId` exista in raspunsul lor daca
 * se reia vreodata hotararea asta.
 *
 * ═══ ⚠ DE CE SE RASPUNDE MEREU 200 ═══
 *
 * Un webhook care raspunde cu eroare invita furnizorul sa reincerce — iar
 * politica lor de reincercare nu e documentata. La un lot de zeci de comenzi din
 * care una singura are o problema, reincercarea ar reface TOT lotul, la nesfarsit.
 *
 * Deci: ce se poate prelucra, se prelucreaza; ce nu, se scrie in loguri. Singura
 * cale prin care o comanda ramane in urma e sa fie ratata si de push, si de cron —
 * iar cronul exista tocmai pentru asta.
 */

export const dynamic = "force-dynamic";

/**
 * ⚠ PLAFON PE CORP, verificat INAINTE de citire.
 *
 * Ruta e publica prin definitie, iar `req.json()` pe un corp urias ar tine memoria
 * functiei pana la capat. Un lot de urmariri cinstit are cateva zeci de kiloocteti;
 * un megaoctet lasa loc cu prisosinta si ramane departe de cei 4,5 MB la care taie
 * Vercel: acolo cererea moare INAINTE de codul nostru, deci n-am avea nici macar un
 * rand in jurnal. Acelasi tipar ca la `pepita/ruta-comenzi.ts`.
 */
const MAX_OCTETI = 1024 * 1024;

/**
 * ⚠ SI PLAFON PE NUMARUL DE ELEMENTE, fiindca octetii nu sunt singurul cost.
 *
 * Fiecare element se prelucreaza serial, cu `await`, si fiecare face cateva
 * dus-intorsuri in baza. Un corp mic cu zece mii de elemente minuscule ar tine
 * functia ocupata mult mai mult decat unul mare cu zece. Cronul citeste 600 de
 * comenzi pe rulare, deci 500 intr-un singur push e peste orice lot real.
 */
const MAX_ELEMENTE = 500;

/** ⚠ Corpul e o LISTA de obiecte, nu unul singur. Asa il trimit ei. */
function listaDinCorp(brut: unknown): UrmarireInnoship[] {
  if (Array.isArray(brut)) return brut.filter((x): x is UrmarireInnoship => !!x && typeof x === "object");
  /* Un singur obiect nu e forma documentata, dar nu costa nimic sa-l acceptam. */
  if (brut && typeof brut === "object") return [brut as UrmarireInnoship];
  return [];
}

/** Raspuns unic, ca sa nu existe doua feluri de a spune „am primit". */
function ok(prelucrate = 0): NextResponse {
  return NextResponse.json({ ok: true, prelucrate });
}

/**
 * Secretul, din oricare dintre formele pe care le acceptam.
 *
 * ⚠ INTEROGAREA RAMANE VALABILA PENTRU TOTDEAUNA. Adresa cu `?secret=` e deja lipita
 * in portalul Innoship al fiecarui comerciant care foloseste push azi. Scoasa, s-ar
 * fi oprit urmarirea la toti, si TACUT: ruta raspunde oricum 200, deci nimeni n-ar fi
 * vazut nimic pana cand o comanda n-ar mai fi avansat.
 *
 * Antetul se adauga fiindca sirurile de interogare ajung in jurnale de server si in
 * unelte de urmarire mai usor decat antetele. Aceeasi judecata ca la Pepita, care
 * accepta cheia si din cale, si din interogare.
 *
 * ⚠ Calea NU e printre forme, si nu din scapare: ar fi cerut o ruta noua
 * (`track/[...secret]`), adica o schimbare de rutare, pentru un castig pe care
 * antetul il da deja.
 */
function secretulCererii(req: NextRequest): string {
  const dinAntet = req.headers.get("x-edinio-secret");
  if (dinAntet && dinAntet.trim()) return dinAntet.trim();
  return new URL(req.url).searchParams.get("secret")?.trim() ?? "";
}

/** Comparatie in timp constant, cu paza de lungime. Acelasi tipar ca `verificaCron`. */
function secreteEgale(primit: string, asteptat: string): boolean {
  const a = Buffer.from(primit);
  const b = Buffer.from(asteptat);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = secretulCererii(req);
  /* Fail-closed: fara secret nu se citeste nici macar corpul. */
  if (!secret) return ok();

  const admin = createAdminClient();
  const magazinCerut = new URL(req.url).searchParams.get("business")?.trim() ?? "";

  /*
   * ⚠ DOUA DRUMURI CATRE MAGAZIN, SI CEL VECHI RAMANE.
   *
   * Filtrul pe `innoship_config->>webhook_secret` sta pe o coloana CALCULATA a vederii
   * care decripteaza, deci niciun index nu-l poate servi: fiecare cerere venita de
   * oriunde decripteaza configul FIECARUI magazin si compara. E o cerere publica,
   * deci munca aia e platita de noi la fiecare apel.
   *
   * Cu selectorul de magazin din adresa (care NU e secret, e chiar `businessId`, cum fac
   * si Trendyol, si Revolut) se citeste un singur rand, dupa cheie, iar secretul se
   * compara in JS, in timp constant.
   *
   * ⚠ Drumul vechi ramane pentru adresele deja lipite in portalul lor. Se sting singure
   * pe masura ce comerciantii copiaza adresa noua din panou; pana atunci, nimeni nu
   * pierde urmarirea.
   */
  let businessId: string | undefined;

  if (magazinCerut) {
    const { data: rand } = await admin
      .from("store_settings")
      .select("business_id, innoship_config")
      .eq("business_id", magazinCerut)
      .maybeSingle();
    const asteptat = ((rand?.innoship_config as { webhook_secret?: unknown } | null)?.webhook_secret ?? "") as string;
    if (typeof asteptat === "string" && asteptat && secreteEgale(secret, asteptat)) {
      businessId = rand?.business_id as string;
    }
  } else {
    /*
     * ⚠ Secretul se cauta pe valoarea DECRIPTATA: vederea `store_settings`
     * decripteaza pentru `service_role`, iar in tabelul privat sta cifrat. Cautat pe
     * cel cifrat, n-ar potrivi niciodata nimic, si webhookul ar tacea la nesfarsit,
     * fara nicio eroare. Vezi `notice_config->>webhook_secret`.
     */
    const { data: setari } = await admin
      .from("store_settings")
      .select("business_id")
      .eq("innoship_config->>webhook_secret" as never, secret)
      .limit(1);
    businessId = (setari?.[0] as { business_id: string } | undefined)?.business_id;
  }

  if (!businessId) return ok();

  /*
   * ⚠ MARIMEA SE VERIFICA INAINTE DE CITIRE, si apoi inca o data pe octeti: antetul
   * poate lipsi sau minti, iar `text.length` numara CARACTERE, nu octeti.
   */
  const lungime = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(lungime) && lungime > MAX_OCTETI) {
    await logError({
      action: "innoship-push",
      message: `lot respins: corp de ${lungime} octeti, peste plafonul de ${MAX_OCTETI}`,
      businessId,
      severity: "warning",
    });
    return ok();
  }

  let brut: unknown;
  try {
    const corp = await req.text();
    if (Buffer.byteLength(corp, "utf8") > MAX_OCTETI) {
      await logError({
        action: "innoship-push",
        message: "lot respins: corp peste plafon (masurat in octeti, dupa citire)",
        businessId,
        severity: "warning",
      });
      return ok();
    }
    brut = JSON.parse(corp);
  } catch {
    return ok();
  }

  const urmariri = listaDinCorp(brut);
  if (urmariri.length === 0) return ok();

  /*
   * ⚠ SE TAIE, NU SE REFUZA. Un lot peste plafon e aproape sigur o greseala sau un
   * abuz, dar refuzat intreg ar pierde si urmaririle bune din el. Ce ramane pe dinafara
   * se scrie in jurnal, ca taierea sa nu fie tacuta, si oricum vine si cronul dupa.
   */
  const deLucru = urmariri.slice(0, MAX_ELEMENTE);
  if (urmariri.length > MAX_ELEMENTE) {
    await logError({
      action: "innoship-push",
      message: `lot de ${urmariri.length} elemente, taiat la ${MAX_ELEMENTE}; restul raman pe seama cronului`,
      businessId,
      severity: "warning",
    });
  }

  /*
   * Comenzile se cauta o singura data, dupa referintele din lot. `externalOrderId`
   * e chiar `order_number`-ul nostru — vezi `referintaComenzii`.
   */
  const referinte = [...new Set(
    deLucru.map((u) => (u.externalOrderId ?? "").trim()).filter(Boolean),
  )];
  if (referinte.length === 0) return ok();

  /*
   * ⚠ SI DUPA `id`, NU DOAR DUPA `order_number`.
   *
   * `referintaComenzii` trimite `order_number ?? id`, iar `order_number` e anulabil. O
   * comanda fara numar a plecat deci la ei cu UUID-ul nostru, si cautata numai pe
   * `order_number` n-ar fi fost gasita NICIODATA prin push. Cronul face caderea asta
   * (`String(o.order_number ?? o.id)`); webhookul nu o facea.
   *
   * ⚠ Se cauta cu `.or(...)`, dar tot sub `.eq("business_id")`: filtrul pe magazin nu e
   * de prisos, e AUTORIZARE. Fara el, un lot cu referinte straine ar atinge comenzile
   * altui comerciant.
   */
  /*
   * ⚠ DOUA INTEROGARI SIMPLE, NU UN `.or(...)` DESTEPT.
   *
   * Un `.or()` cu `in.(...)` inauntru e usor de scris gresit, iar o gresala de sintaxa
   * NU da eroare: da LISTA GOALA. Aici asta ar insemna ca push-ul nu mai potriveste
   * nicio comanda, tacut, si nimeni n-ar afla pana cand o comanda n-ar mai avansa.
   * Aceeasi lectie ca la fereastra cronului Sameday, scrisa acolo pe larg.
   *
   * A doua interogare pleaca doar cand chiar exista referinte in forma de UUID, adica
   * aproape niciodata: numai comenzile fara `order_number`.
   */
  const COLOANE = "id, business_id, status, order_number, payment_status, innoship_awb_number, innoship_status_code, innoship_cod_status_code";
  const caUuid = referinte.filter((r) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r));

  const { data: dupaNumar, error } = await admin
    .from("orders").select(COLOANE)
    .eq("business_id", businessId)
    .in("order_number", referinte);

  const { data: dupaId } = caUuid.length > 0
    ? await admin.from("orders").select(COLOANE)
      .eq("business_id", businessId)
      .in("id", caUuid)
    : { data: [] as typeof dupaNumar };

  const comenzi = [...(dupaNumar ?? []), ...(dupaId ?? [])];

  if (error) {
    await logError({
      action: "innoship-push",
      message: `comenzile din lotul de push nu s-au putut citi: ${error.message}`,
      details: { businessId, referinte: referinte.length },
      businessId,
      severity: "warning",
    });
    return ok();
  }

  /* ⚠ Indexata pe AMANDOUA cheile, ca potrivirea de mai jos sa le gaseasca pe oricare. */
  const dupaReferinta = new Map<string, ComandaDeUrmarit>();
  for (const o of comenzi ?? []) {
    const c = o as ComandaDeUrmarit;
    if (o.order_number) dupaReferinta.set(String(o.order_number), c);
    dupaReferinta.set(String(o.id), c);
  }

  const { data: firma } = await admin
    .from("businesses").select("user_id").eq("id", businessId).single();
  const userId = (firma?.user_id as string | null) ?? null;

  let prelucrate = 0;
  for (const u of deLucru) {
    const comanda = dupaReferinta.get((u.externalOrderId ?? "").trim());
    /* O referinta pe care n-o cunoastem nu e o eroare: poate fi o comanda a lui
       facuta in alta parte, sau una stearsa. Se trece mai departe. */
    if (!comanda) continue;

    try {
      await aplicaUrmarire(admin, { comanda, urmarire: u, userId, sursa: "push" });
      prelucrate++;
    } catch (e) {
      /*
       * ⚠ Prins PER COMANDA. O singura comanda care crapa n-are voie sa opreasca
       * lotul: restul sunt bune, iar reincercarea intregului lot n-o repara oricum.
       */
      await logError({
        action: "innoship-push",
        message: `urmarirea n-a putut fi aplicata pe comanda ${comanda.order_number ?? comanda.id}: ${(e as Error).message}`,
        details: { orderId: comanda.id },
        businessId,
        severity: "warning",
      });
    }
  }

  return ok(prelucrate);
}
