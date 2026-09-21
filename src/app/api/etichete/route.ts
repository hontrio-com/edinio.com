import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { poartaEtichetei } from "@/lib/orders/poarta-eticheta";
import { COLOANA_EXPEDIERII, numeleDocumentului } from "@/lib/orders/etichete-lot";
import { adunaEtichete, type ComandaDeAdunat } from "@/lib/orders/etichete-adunate";
import { etichetaComenzii, setarileCurierilor } from "@/lib/orders/eticheta-sursa";
import { lipesteDocumente } from "@/lib/orders/lipeste-pdf";
import { logError } from "@/lib/error-logger";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ETICHETELE MAI MULTOR COMENZI, INTR-UN SINGUR PDF             (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut prin suport de magazinul care face intre 4 si 18 AWB-uri pe zi si le
 * descarca una cate una, deschizand o fereastra pe comanda.
 *
 * ⚠ POST, NU GET, si nu din gust: pana la cincizeci de identificatori intr-o adresa
 * ar fi insemnat vreo doua mii de semne, adica un URL taiat de vreun intermediar si
 * un lot care pierde comenzi fara sa spuna. Pe langa asta, adresa ar fi ramas in
 * istoricul browserului cu tot cu ce s-a descarcat.
 *
 * ⚠ RASPUNSUL PLEACA IN FLUX. Vercel refuza corpurile peste 4,5 MB; optsprezece
 * etichete A4 trec de prag fara efort, iar cincizeci il trec sigur. Aceeasi hotarare
 * ca la feedurile Pepita (vezi `lib/pepita/feed.ts`).
 *
 * ⚠ CE S-A SARIT NU SE PIERDE. Raspunsul e un fisier, deci nu poate purta si o lista
 * de mesaje in corp: ele pleaca intr-un antet, iar ecranul le arata. Fara asta,
 * comerciantul ar fi primit un document cu cincisprezece pagini dintr-o selectie de
 * optsprezece si n-ar fi avut de unde sti care trei lipsesc.
 *
 * ⚠ POARTA. Aducerea unei etichete NU creeaza nimic la curier, dar cheama API-ul
 * comerciantului pe integrarea platita prin platforma, exact ca rutele de eticheta pe
 * bucata. Deci aceeasi poarta de abonament, dupa dovedirea proprietatii. Plasa din
 * `poarta-eticheta.test.ts` o cere si aici.
 */

export const runtime = "nodejs";
/*
 * Cincizeci de citiri la curieri, patru deodata. Bugetul propriu al adunarii
 * (`BUGET_ETICHETE_MS`) se opreste inaintea acestui termen si intoarce ce a adunat,
 * ca functia sa nu fie taiata fara sa raspunda nimic.
 */
export const maxDuration = 300;

/** Pagina de comenzi arata cel mult 50, deci selectia e marginita oricum. */
const MAX_ETICHETE = 50;

export async function POST(req: NextRequest) {
  let corp: { businessId?: unknown; orderIds?: unknown; format?: unknown };
  try {
    corp = await req.json();
  } catch {
    return NextResponse.json({ error: "Cerere fara corp JSON." }, { status: 400 });
  }

  const businessId = typeof corp.businessId === "string" ? corp.businessId : "";
  const format = corp.format === "A6" ? "A6" : "A4";
  const ceruteBrut = Array.isArray(corp.orderIds) ? corp.orderIds : [];
  const cerute = [...new Set(ceruteBrut.filter((x): x is string => typeof x === "string" && !!x))];

  if (!businessId || cerute.length === 0) {
    return NextResponse.json({ error: "Parametri lipsa." }, { status: 400 });
  }
  /* ⚠ Plafonul se SPUNE, nu se taie in tacere. Aceeasi regula ca la `cleanIds`. */
  if (cerute.length > MAX_ETICHETE) {
    return NextResponse.json(
      { error: `Un lot poate avea cel mult ${MAX_ETICHETE} de comenzi, iar aici sunt ${cerute.length}.` },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return NextResponse.json({ error: "Acces interzis" }, { status: 403 });

  /* ⚠ SI STAREA CONTULUI, dupa dovedirea proprietatii. Vezi `poarta-eticheta.ts`. */
  const oprit = await poartaEtichetei(businessId);
  if (oprit) return oprit;

  const admin = createAdminClient();
  /*
   * ⚠ TOATE coloanele de expediere se cer aici. Ce nu se selecteaza vine `undefined`,
   * iar `curierulEtichetei` ar raspunde cinstit „comanda n-are eticheta" despre un
   * colet care exista. Lista se scoate din `COLOANA_EXPEDIERII`, nu se scrie de mana:
   * un curier adaugat acolo si uitat aici ar fi disparut tacut din loturi.
   */
  const coloane = ["id", "order_number", ...Object.values(COLOANA_EXPEDIERII), "fan_courier_awb_client_id"];
  const { data: dateBrute, error: eCitire } = await admin
    .from("orders").select(coloane.join(", "))
    .eq("business_id", businessId).in("id", cerute);
  if (eCitire) {
    return NextResponse.json({ error: `Nu am putut citi comenzile: ${eCitire.message}` }, { status: 500 });
  }
  /*
   * ⚠ Lista de coloane se compune la RULARE (din `COLOANA_EXPEDIERII`), deci clientul
   * tipat n-are de unde sa deduca forma randului si il da ca „sir generic". Conversia
   * e aici, o singura data, si dupa ea nimic nu mai citeste campuri la intamplare:
   * `curierulEtichetei` stie exact ce cauta.
   */
  const randuri = (dateBrute ?? []) as unknown as Record<string, unknown>[];

  /*
   * ⚠ ORDINEA E CEA A SELECTIEI, nu cea in care le-a intors baza. Eticheta de pe
   * pagina N se lipeste pe coletul N; o alta ordine inseamna colete schimbate intre
   * ele, si se afla de la clienti.
   */
  const dupaId = new Map(randuri.map((r) => [String(r.id), r]));
  const comenzi: ComandaDeAdunat[] = cerute
    .map((id) => dupaId.get(id))
    .filter((r): r is Record<string, unknown> => !!r)
    .map((rand) => ({
      id: String(rand.id),
      order_number: String(rand.order_number ?? ""),
      rand,
    }));

  if (comenzi.length === 0) {
    return NextResponse.json({ error: "Niciuna dintre comenzile alese nu e a magazinului." }, { status: 404 });
  }

  const setari = await setarileCurierilor(businessId);

  const rezultat = await adunaEtichete(
    comenzi,
    (comanda, curier) => etichetaComenzii(businessId, comanda.rand, curier, format, setari),
    lipesteDocumente,
  );

  /*
   * ⚠ ANTETUL ARE O LIMITA, si nu e una a noastra: intermediarii taie antetele peste
   * vreo opt kiloocteti, iar cincizeci de motive scrise pe larg trec de prag. Taiat de
   * altcineva, antetul ar fi ajuns un JSON rupt, iar ecranul n-ar fi aratat NICIUN
   * motiv — tocmai cand sunt cele mai multe. Deci se taie aici, si se SPUNE cate au
   * mai ramas.
   */
  const IN_ANTET = 12;
  const rezumat = {
    incluse: rezultat.incluse.length,
    sarite: rezultat.sarite.slice(0, IN_ANTET),
    /* Cate n-au incaput. Lipsa cand au incaput toate. */
    inPlus: rezultat.sarite.length > IN_ANTET ? rezultat.sarite.length - IN_ANTET : undefined,
    oprit: rezultat.oprit || undefined,
  };

  logError({
    action: "etichete.lot",
    message: `format=${format} cerute=${comenzi.length} incluse=${rezultat.incluse.length} sarite=${rezultat.sarite.length}`,
    details: { businessId },
    businessId, userId: user.id, severity: "info",
  });

  if (!rezultat.pdf) {
    /* Niciuna n-a putut fi adusa: atunci raspunsul e mesajul, nu un fisier gol. */
    return NextResponse.json(
      { error: "Nicio etichetă nu a putut fi adusă.", ...rezumat },
      { status: 404 },
    );
  }

  const octeti = rezultat.pdf;
  /*
   * ⚠ In flux, nu dintr-un corp intreg: vezi nota din capul fisierului. Bucati de
   * 64 KB, ca sa nu se ceara o alocare noua pentru fiecare octet.
   */
  const BUCATA = 64 * 1024;
  let pozitie = 0;
  const flux = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pozitie >= octeti.byteLength) { controller.close(); return; }
      controller.enqueue(octeti.subarray(pozitie, Math.min(pozitie + BUCATA, octeti.byteLength)));
      pozitie += BUCATA;
    },
  });

  return new Response(flux, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${numeleDocumentului(rezultat.incluse.length, new Date())}"`,
      /* ⚠ Eticheta poarta numele, adresa si telefonul cumparatorului. */
      "Cache-Control": "private, no-store",
      /*
       * ⚠ Antetul poarta DOAR cifre si mesaje ale noastre, niciodata numele sau
       * adresa cuiva: antetele se scriu in jurnalele intermediarilor. Numerele de
       * comanda sunt ale comerciantului, nu date personale ale cumparatorului.
       *
       * ⚠ Codat, fiindca mesajele au diacritice, iar antetele HTTP sunt latin-1:
       * un „ă" nekodat rupe raspunsul.
       */
      "X-Etichete": encodeURIComponent(JSON.stringify(rezumat)),
    },
  });
}
