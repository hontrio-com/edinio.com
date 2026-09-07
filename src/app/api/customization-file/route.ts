import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { citestePrivat } from "@/lib/r2";
import { rateLimit } from "@/lib/utils/rate-limit";
import { areFormaCheii } from "@/lib/customization/fisiere-private";
import { terminatia } from "@/lib/customization/adresa";

export const runtime = "nodejs";

/**
 * Fisierul incarcat de un CUMPARATOR, servit comerciantului care are comanda.
 *
 * ═══ ⚠ A DOUA PAZA ═══
 *
 * Prima e cheia, care nu se poate compune fara secretul serverului (vezi `fisiere-private.ts`).
 * Asta e a doua, si e independenta: sesiune, proprietatea magazinului, si cheia sa fie CHIAR pe o
 * comanda a lui.
 *
 * ⚠ AL TREILEA PAS NU E DECOR. Fara el, orice comerciant autentificat ar fi putut cere orice
 * cheie a magazinului SAU — si magazinele au angajati, iar cheile trec prin emailuri. Legatura cu
 * comanda face ca dreptul sa fie pe FISIER, nu pe magazin.
 *
 * ⚠ SI SE CERE COMANDA, NU SE CAUTA. Prima scriere intreba „exista cheia undeva in comenzile
 * lui?” cu `.like("items", "%cheie%")`. `items` e `jsonb`, iar in Postgres `jsonb LIKE text`
 * NU EXISTA: masurat prin clientul real, iese `42883 operator does not exist: jsonb ~~ unknown`,
 * si nici castul `items::text` nu trece — PostgREST il lasa deoparte in filtre. Adica ruta ar fi
 * raspuns 503 la FIECARE cerere, iar comerciantul nu si-ar mai fi vazut niciun fisier.
 *
 * Cine cere fisierul stie oricum din ce comanda il cere — panoul e singurul apelant, de cand
 * emailul nu mai poarta legaturi. Deci se citeste UN rand si se cauta cheia in el: exact, ieftin,
 * si dreptul iese legat de comanda anume, nu de vreo comanda oarecare a magazinului.
 *
 * ⚠ `Cache-Control: private, no-store`, ca la etichetele AWB: altfel un intermediar sau CDN-ul ar
 * putea tine poza de familie a unui cumparator.
 *
 * ═══ ⚠ AICI SE VERIFICA FORMA CHEII, NU SEMNATURA EI — SI E DINADINS ═══
 *
 * Semnatura se recalculeaza din secretul de ACUM, dar cheia a fost scrisa in comanda o data
 * pentru totdeauna. Cele doua nu au acelasi ceas: secretul se poate roti (butonul de service role
 * din Supabase, sau simpla ADAUGARE a lui `SHIPPING_QUOTE_SECRET`, pe care mesajul de eroare al
 * etichetelor GLS chiar o cere). Din clipa aia, o verificare de semnatura ar fi raspuns „fisier
 * negasit” pentru fiecare fisier al fiecarei comenzi vechi — pe comenzi INCASATE, cu octetii
 * nevatamati in depozit si fara nicio cale de intoarcere din interfata.
 *
 * Dreptul nu are nevoie de semnatura ca sa fie dovedit aici: sesiune + proprietatea magazinului +
 * cheia sa fie CHIAR pe comanda ceruta. O cheie inventata cu forma buna nu e pe nicio comanda,
 * deci nu se serveste. Ce ramane din poarta intai — `areFormaCheii` — apara altceva: prefixul
 * magazinului si absenta lui `/`, adica traversarea catre alt dosar, si o face fara sa atinga baza.
 *
 * ⚠ LA INTRARE (poarta comenzii, `comanda.ts`) SEMNATURA RAMANE. Acolo se semneaza si se verifica
 * in aceeasi clipa, si tocmai ea opreste pe cineva sa scrie in comanda o cheie compusa de mana.
 */

const TIP_DUPA_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", heic: "image/heic", heif: "image/heic", pdf: "application/pdf",
};

/**
 * ⚠ CE INTRA IN `.eq()` PE O COLOANA `uuid` SE VERIFICA INTAI.
 *
 * Un `id` care nu e UUID nu iese ca „negasit”, ci ca eroare de baza (`22P02`) — deci ar fi
 * plecat un 503, adica „mai incearca”, pentru o cerere care n-avea cum sa reuseasca vreodata.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ⚠ CATE FISIERE POATE CERE O SESIUNE INTR-UN MINUT.
 *
 * Ruta citeste obiectul INTREG in memorie si il mai copiaza o data la iesire; pentru un PDF de
 * tipar plafonul de intrare e 40 MB. Iar `no-store` inseamna ca nici CDN-ul nu absoarbe nimic:
 * fiecare miniatura din panou e o citire noua din R2, cu egress platit.
 *
 * Plafonul e larg dinadins: o comanda cu 20 de poze inseamna 20 de cereri la fiecare deschidere
 * de pagina, si comerciantul are voie sa reincarce. 120 lasa loc pentru sase deschideri pe minut
 * si opreste o bucla.
 */
const PLAFON_PE_MINUT = 120;

/**
 * Numele sub care se salveaza fisierul.
 *
 * ⚠ TOATE ERAU „fisier.jpg”. Comerciantul care deschidea sase fisiere ale aceleiasi comenzi le
 * primea in dosarul de descarcari ca `fisier.jpg`, `fisier(1).jpg`… — iar la tipar nu mai stia
 * care merge pe fata si care pe spate. Numele de aici e singurul semn care ramane pe fisier dupa
 * ce a plecat din panou.
 *
 * ⚠ SI SE COMPUNE NUMAI DIN CE STIE SERVERUL. Numele trimis de browser nu se scrie niciodata pe
 * disc (vezi ruta de incarcare), deci nu exista de unde sa vina un nume al omului; iar orice
 * bucata luata din date se curata la `[a-z0-9-]`, ca un antet sa nu poata fi rupt cu ghilimele
 * sau cu un rand nou.
 */
function curataBucata(s: string): string {
  return s
    .normalize("NFD")
    /* Numai semnele combinate: taiat pe alte clase, s-ul si t-ul cu virgula dispareau cu totul. */
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
}

/**
 * Unde sta cheia asta in comanda: eticheta campului si a cata valoare e.
 *
 * ⚠ AICI E VOIE SA PRESUPUNEM FORMA LUI `items`, fiindca raspunsul e doar un NUME. Dreptul s-a
 * hotarat deja, pe instantaneul intreg (vezi mai jos); daca forma se schimba, se pierde eticheta
 * din nume, nu fisierul.
 */
function locul(items: unknown, cheie: string): { eticheta: string; pozitie: number } | null {
  if (!Array.isArray(items)) return null;
  for (const rand of items) {
    const pers = (rand as { customization?: unknown } | null)?.customization;
    if (!pers || typeof pers !== "object") continue;
    for (const [id, camp] of Object.entries(pers as Record<string, unknown>)) {
      const c = camp as { label?: unknown; value?: unknown } | null;
      if (!c || typeof c !== "object" || !Array.isArray(c.value)) continue;
      const i = c.value.indexOf(cheie);
      if (i === -1) continue;
      const eticheta = typeof c.label === "string" && c.label.trim() !== "" ? c.label : id;
      return { eticheta, pozitie: i + 1 };
    }
  }
  return null;
}

function numeDescarcare(numar: string, items: unknown, cheie: string, ext: string): string {
  const bucati = [curataBucata(numar)];
  const loc = locul(items, cheie);
  if (loc) {
    bucati.push(curataBucata(loc.eticheta), String(loc.pozitie));
  } else {
    /* Fara eticheta, macar sa nu iasa doua fisiere cu acelasi nume: inceputul cheii le desparte. */
    bucati.push(curataBucata(cheie.slice(cheie.lastIndexOf("/") + 1).slice(0, 8)));
  }
  const nume = bucati.filter(Boolean).join("-");
  return `${nume || "fisier"}.${ext}`;
}

export async function GET(req: NextRequest) {
  const cauta = new URL(req.url).searchParams;
  const cheie = cauta.get("cheie");
  const businessId = cauta.get("businessId");
  const comandaId = cauta.get("comanda");
  if (!cheie || !businessId || !comandaId) {
    return NextResponse.json({ error: "Parametri lipsa" }, { status: 400 });
  }
  if (!UUID_RE.test(businessId) || !UUID_RE.test(comandaId)) {
    return NextResponse.json({ error: "Fisier negasit" }, { status: 404 });
  }

  /*
   * ⚠ Forma cheii se verifica INAINTE de orice atingere a bazei: o cheie care arata catre alt
   * magazin sau catre alt dosar nu merita nici macar o interogare, iar asa capatul nu poate fi
   * folosit ca sonda de existenta. (De ce forma si nu semnatura — vezi antetul fisierului.)
   */
  if (!areFormaCheii(cheie, businessId)) {
    return NextResponse.json({ error: "Fisier negasit" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  /*
   * ⚠ FRANA E PE SESIUNE, si vine dupa ea.
   *
   * Surorile care ating depozitul au si ele frana: `/api/img` 240/minut, `/api/upload-customization`
   * 20/minut, amandoua pe IP fiindca sunt publice. Aici cheia e UTILIZATORUL: pe IP, un birou cu
   * mai multi angajati pe aceeasi iesire NAT si-ar fi taiat singur miniaturile.
   *
   * E cea din memorie, nu `consumaLimita`: capatul e autentificat si mai are trei porti dupa el,
   * asa ca ce se poate risipi sunt fisierele PROPRII ale celui conectat. Daca vreodata se vede
   * abuz real, stratul durabil din Postgres e pasul urmator.
   */
  if (!rateLimit(`customization-file:${user.id}`, PLAFON_PE_MINUT, 60_000)) {
    return NextResponse.json(
      { error: "Prea multe fisiere cerute. Asteapta un minut." },
      { status: 429 },
    );
  }

  /*
   * ⚠ SI AICI O CITIRE CAZUTA NU E „N-ARE DREPTUL”.
   *
   * Cu `.single()` si eroarea aruncata, `data` iesea `null` si cand randul lipsea, si cand baza
   * clipea — deci amandoua ieseau 403 „Acces interzis”. Comerciantul citea ca nu mai are voie la
   * comanda LUI si scria la suport, in loc sa reincarce pagina. Acelasi rationament e scris mai
   * jos, la comanda; nu era aplicat si la magazin.
   */
  const { data: biz, error: eroareMagazin } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (eroareMagazin) {
    return NextResponse.json(
      { error: "Nu am putut verifica fisierul. Incearca din nou." },
      { status: 503 },
    );
  }
  if (!biz) return NextResponse.json({ error: "Acces interzis" }, { status: 403 });

  /*
   * ⚠ CHEIA TREBUIE SA FIE CHIAR PE COMANDA CERUTA, si comanda sa fie a magazinului.
   *
   * `business_id` se pune in filtru desi randul se cere dupa `id`: altfel un `comanda` luat de
   * la alt magazin ar fi trecut de aici pe seama lui RLS, iar poarta asta n-ar mai fi aparat ea
   * nimic. Filtrul E si autorizare — vezi `tranzitie-comanda-atomica`.
   *
   * `order_number` se cere pentru NUMELE fisierului salvat, nu pentru drept.
   */
  const { data: comanda, error } = await supabase
    .from("orders")
    .select("items, order_number")
    .eq("id", comandaId)
    .eq("business_id", businessId)
    .maybeSingle();

  /*
   * ⚠ O citire cazuta NU e „n-are dreptul”: ar fi ascuns fisierul unui comerciant care il are.
   * Dar nici nu se serveste pe o presupunere — se spune ca n-am putut verifica.
   */
  if (error) {
    return NextResponse.json(
      { error: "Nu am putut verifica fisierul. Incearca din nou." },
      { status: 503 },
    );
  }
  if (!comanda) return NextResponse.json({ error: "Fisier negasit" }, { status: 404 });

  /*
   * ⚠ CAUTAREA SE FACE PE INSTANTANEU INTREG, nu pe o cale anume in el.
   *
   * `items` e jsonb vechi de luni si rescris deja o data; o cautare care presupune
   * `items[].customization[camp].value[]` s-ar rupe tacut la urmatoarea schimbare de forma, si
   * s-ar rupe INCHIZAND fisiere pe care comerciantul are dreptul sa le vada.
   *
   * Cheile noastre sunt `products/customizations/<uuid>/<uuid>-<hex>.<ext>` — numai caractere pe
   * care `JSON.stringify` le lasa neatinse — deci potrivirea pe text e sigura aici.
   */
  if (!JSON.stringify(comanda.items ?? null).includes(cheie)) {
    return NextResponse.json({ error: "Fisier negasit" }, { status: 404 });
  }

  /*
   * ⚠ DEPOZITUL CAZUT NU E „FISIER NEGASIT”.
   *
   * `getFromR2` intoarce `null` si pentru lipsa, si pentru un incident R2 sau o credentiala
   * schimbata. Tradus in 404, comerciantul afla ca macheta „s-a pierdut” si ii cerea clientului sa
   * o trimita din nou — cand trebuia doar sa mai incerce peste zece minute. Deci se cere citirea
   * care DEOSEBESTE (`citesteDinR2`), si esecul iese cu acelasi 503 ca o baza cazuta.
   */
  const citire = await citestePrivat(cheie);
  if (citire.fel === "eroare") {
    console.error("[customization-file] depozitul nu a putut fi citit", { motiv: citire.motiv });
    return NextResponse.json(
      { error: "Nu am putut verifica fisierul. Incearca din nou." },
      { status: 503 },
    );
  }
  if (citire.fel === "lipsa") {
    return NextResponse.json({ error: "Fisier negasit" }, { status: 404 });
  }

  /*
   * ⚠ `"bin"` NU E O RAMURA MOARTA, desi cheia a trecut deja de `areFormaCheii`.
   *
   * Forma cere doar `<ceva>-<24hex>.<ext>` fara `/`, iar `<ceva>` are voie sa poarte `?` sau `#` —
   * si `terminatia` taie chiar acolo (sir de interogare, ancora), deci intoarce `null`. Masurat:
   * pentru `.../x?y-<24hex>.jpg` forma trece si terminatia iese `null`.
   *
   * Pe drumul umblat nu se ajunge aici, fiindca cheile le scrie `cheieIncarcare`. Dar raspunsul se
   * compune din `items`, adica din date vechi de luni; iar cand terminatia nu se poate citi, octeti
   * anonimi si `.bin` sunt raspunsul cinstit, nu un `Content-Type` ghicit.
   */
  const ext = terminatia(cheie) ?? "bin";
  return new NextResponse(new Uint8Array(citire.octeti), {
    headers: {
      "Content-Type": TIP_DUPA_EXT[ext] ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      /* ⚠ Numele vine din comanda si din cheie, deci din datele noastre — nu de la client. */
      "Content-Disposition":
        `inline; filename="${numeDescarcare(comanda.order_number, comanda.items, cheie, ext)}"`,
    },
  });
}
