import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { PLATFORM_ORIGIN, storeBaseUrl } from "@/lib/seo";
import { isSubscriptionInactive } from "@/lib/subscription";
import { NON_STORE_SEGMENTS, primulSegment } from "@/lib/segmente-rezervate";
import { ANTET_ROBOTS } from "@/lib/storefront/indexare-pe-platforma";
import { parseStoreModeFromSettings } from "@/lib/storefront/store-mode";
import { caiInterziseStraine } from "@/app/robots";

/**
 * SANTINELA: cere paginile importante si verifica CE CONTIN, nu doar ca raspund.
 *
 * ═══ DE CE ═══
 *
 * Intr-o singura zi au iesit la iveala patru defecte cu exact aceeasi semnatura:
 *
 *   * sitemap-ul platformei n-avea niciun produs, din doua saptamani
 *     (embed ambiguu dupa ce `catalog_produs` a adaugat chei straine)
 *   * controalele catalogului erau inerte pe palierul server: paginarea si
 *     cautarea scriau in bara de adrese si nu schimbau nimic
 *   * indexul de cautare nu se mai reconstruia din cron, din patru zile
 *     (`DELETE` fara `WHERE`, respins de paza rolului `service_role`)
 *   * stocul nu se elibera niciodata la anulare
 *   * o marime cu o bucata se putea vinde de doua ori, iar plafonarea la zero
 *     facea ca baza sa NU ramana negativa — deci nu ramanea nici urma
 *
 * TOATE au raspuns 200. Niciunul n-a fost prins de `tsc`, de teste, de build sau
 * de un audit extern care a citit chiar fisierele cu pricina. Trei din patru au
 * fost gasite doar fiindca cineva a NUMARAT ce iese.
 *
 * Asta face fisierul asta, si nimic mai mult: cere, numara, si tipa cand numarul
 * e zero. Nu inlocuieste testele — le completeaza exact acolo unde ele sunt
 * oarbe, fiindca testele judeca functii, iar asta judeca productia.
 *
 * ═══ CELE DOUA REGULI CARE FAC SANTINELA UTILA ═══
 *
 * 1. FIECARE PROBA TREBUIE SA POATA ESUA. O proba care verifica doar codul HTTP
 *    e chiar greseala care a lasat cele patru defecte in viata: toate raspundeau
 *    200.
 *
 * 2. FIECARE PROBA TREBUIE SA POATA TRECE. Asta a fost invatata scump, pe
 *    16.08.2026: santinela sunase de 88 de ori, si NICIUNA din cele trei probe
 *    care cadeau n-avea dreptate.
 *
 *      * „cautarea intoarce rezultate" — 85 de alarme. Termenul se lua din
 *        vocabularul TUTUROR celor cinci magazine candidate, iar magazinul chiar
 *        probat era altul: se cauta „protectie" (cuvantul lui eSAFE, echipamente
 *        de protectia muncii) intr-un magazin de haine outlet. Zero rezultate era
 *        raspunsul CORECT, in fiecare din cele 85 de dati.
 *      * „datele structurate poarta ce s-a completat in panou" — 28 de alarme, pe
 *        magazinul `fortis`, al carui plan expirase pe 01.07: pagina lui nu e
 *        vitrina, ci `<SuspendedStorePage>`. N-avea de unde sa aiba JSON-LD.
 *      * „feedul Facebook al magazinului are produse" — 9 alarme, TOATE din
 *        ramura al carei propriu mesaj spune „de rezolvat de comerciant, nu din
 *        cod". Santinela cerea socoteala unor comercianti pentru datele lor.
 *
 *    O singura proba avusese vreodata dreptate: „paginarea da ALTE produse", de
 *    trei ori pe 09.08, si defectul ei a fost reparat in aceeasi zi (`46bc616`).
 *
 *    Paguba nu sunt cele trei probe. Paguba e ca dupa 88 de alarme critice
 *    ignorate nu mai apara nimic nici celelalte unsprezece.
 *
 * ═══ CE URMEAZA DIN REGULA A DOUA ═══
 *
 * O proba nu-si alege tinta pe „is_published". Alegerea trece prin `magazineVii`,
 * si nimic nu se probeaza in afara ei.
 */

/** Cat asteptam o pagina. Peste atat, e o defectiune indiferent de continut. */
const TIMP_MAX_MS = 20_000;

/** Uuid care nu exista, pentru un `.in()` care altfel ar ramane fara argumente. */
const NICIUN_ID = "00000000-0000-0000-0000-000000000000";

const ANTET = { "user-agent": "edinio-santinela" } as const;

type Admin = SupabaseClient<Database>;

interface Proba {
  nume: string;
  /** `null` = a trecut. Un sir = ce anume nu e in regula, in cuvinte. */
  ruleaza: () => Promise<string | null>;
}

interface Raspuns {
  cod: number;
  text: string;
  /** Adresa la care s-a ajuns CHIAR, dupa redirectari. Vezi `ia`. */
  url: string;
}

/**
 * Cere o pagina.
 *
 * ⚠ `url` se intoarce fiindca `fetch` urmeaza redirectarile in tacere, iar asta a
 * facut trei probe sa masoare alta pagina decat cea din numele lor: `/{slug}/magazin`
 * raspunde 307 catre radacina magazinului la orice magazin care n-are pagina de
 * catalog separata, deci „catalogul randeaza carduri" numara de fapt grila de pe
 * pagina principala. Cine citea alarma deschidea `pagina-magazin.tsx`, unde nu
 * rulase nimic din ce se masurase.
 */
async function ia(url: string): Promise<Raspuns> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMP_MAX_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: ANTET, cache: "no-store" });
    return { cod: r.status, text: await r.text(), url: r.url || url };
  } catch (e) {
    return { cod: 0, text: e instanceof Error ? e.message : "cerere esuata", url };
  } finally {
    clearTimeout(t);
  }
}

const numara = (text: string, tipar: RegExp) => (text.match(tipar) ?? []).length;

/** Cate ori apare `sir` in `text`, fara suprapuneri. */
function numaraSir(text: string, sir: string): number {
  let n = 0;
  for (let i = text.indexOf(sir); i !== -1; i = text.indexOf(sir, i + sir.length)) n++;
  return n;
}

/**
 * Cere o adresa si NUMARA un sir FARA sa tina tot corpul in memorie.
 *
 * ⚠ Feedurile nu sunt „cateva sute de kiloocteti". Masurat pe 16.08.2026:
 * `esafe.ro/facebook-catalog.xml` are **93 MB** si 37.025 de articole (comentariul
 * de dinainte spunea 3 MB — cifra aia era a lui vetdepo, de 30 de ori mai mica).
 * `await r.text()` pe asa ceva materializeaza tot sirul in memoria functiei, doar
 * ca sa numere `<item>`. Aici se citeste in bucati si se tine doar coada.
 *
 * ⚠ `sir` trebuie sa fie un sir FIX care nu se poate suprapune cu el insusi
 * (`<item>`, `<sitemap>`, `/product/`). Coada pastrata are exact `sir.length - 1`
 * caractere: destul cat o potrivire taiata de granita bucatii sa fie prinsa, si
 * prea scurta cat una intreaga sa incapa in ea si sa fie numarata de doua ori.
 */
async function iaSiNumara(url: string, sir: string): Promise<{ cod: number; cate: number; url: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMP_MAX_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: ANTET, cache: "no-store" });
    if (r.status !== 200 || !r.body) {
      /*
       * Corpul se ANULEAZA, nu se abandoneaza. `ia()` il golea oricum prin
       * `r.text()`; aici, un `return` sec ar lasa socketul tinut pana la colectarea
       * gunoiului, de pana la zece ori pe rulare cand feedurile dau 404.
       */
      await r.body?.cancel().catch(() => {});
      return { cod: r.status, cate: 0, url: r.url || url };
    }
    const cititor = r.body.getReader();
    const decodor = new TextDecoder();
    let coada = "";
    let cate = 0;
    for (;;) {
      const { done, value } = await cititor.read();
      if (done) break;
      const bucata = coada + decodor.decode(value, { stream: true });
      cate += numaraSir(bucata, sir);
      /*
       * ⚠ `sir.length - 1`, dar niciodata `slice(-0)`: pentru un sir de un singur
       * caracter, `-0` e `0`, iar `slice(0)` intoarce BUCATA INTREAGA — coada ar
       * creste cat tot corpul (adica exact ce evitam) si fiecare potrivire ar fi
       * numarata de doua ori. Un sir de un caracter n-are oricum nevoie de coada.
       */
      coada = sir.length > 1 ? bucata.slice(-(sir.length - 1)) : "";
    }
    return { cod: 200, cate, url: r.url || url };
  } catch {
    /* Flux intrerupt, TLS, DNS, timeout: `cod: 0`, si NICIODATA un numar partial. */
    return { cod: 0, cate: 0, url };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Codul si UN antet al raspunsului, fara sa citeasca corpul.
 *
 * Pentru probele care judeca ANTETUL, nu continutul — `X-Robots-Tag`, pus de
 * proxy pe vitrinele servite pe platforma, si `cache-control`.
 *
 * ⚠ `redirect: "manual"`, spre deosebire de `ia()`: un 307 catre domeniul
 * propriu e un raspuns in sine, iar aici trebuie sa vedem codul CHIAR al
 * adresei cerute, nu pe al paginii la care ar fi dus.
 */
async function iaAntet(url: string, antet: string): Promise<{ cod: number; valoare: string | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMP_MAX_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: ANTET, cache: "no-store", redirect: "manual" });
    await r.body?.cancel().catch(() => {});
    return { cod: r.status, valoare: r.headers.get(antet) };
  } catch {
    return { cod: 0, valoare: null };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Toate nodurile de date structurate dintr-o pagina, cu `@graph` desfacut.
 *
 * ⚠ `@graph` NU e un amanunt de forma. O pagina poate purta mai multe noduri
 * intr-un singur `<script>` — pagina, firimiturile, intrebarile — si atunci
 * obiectul de la varf n-are deloc `@type`. Cine cauta `d["@type"] === "Store"`
 * direct pe el nu gaseste nimic si raporteaza „lipseste", desi totul e la locul
 * lui: o alarma falsa, adica exact felul de alarma pe care cineva o opreste.
 *
 * `[\s\S]` in loc de steagul `s`: tinta de compilare a proiectului nu-l accepta.
 */
function noduriJsonLd(text: string): Record<string, unknown>[] {
  const blocuri = text.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) ?? [];
  const out: Record<string, unknown>[] = [];
  for (const b of blocuri) {
    const brut = b.replace(/^[^>]*>/, "").replace(/<\/script>$/, "");
    let parsat: unknown;
    try { parsat = JSON.parse(brut); } catch { continue; }
    if (!parsat || typeof parsat !== "object") continue;
    const nod = parsat as Record<string, unknown>;
    if (Array.isArray(nod["@graph"])) {
      for (const n of nod["@graph"] as unknown[]) {
        if (n && typeof n === "object") out.push(n as Record<string, unknown>);
      }
    } else {
      out.push(nod);
    }
  }
  return out;
}

/** Pagina poarta macar un nod de unul dintre tipurile cerute? */
function areTip(noduri: Record<string, unknown>[], ...tipuri: string[]): boolean {
  return noduri.some((n) => typeof n["@type"] === "string" && tipuri.includes(n["@type"] as string));
}

/** Slugurile de produs dintr-o pagina, o singura data fiecare. */
function produseDinPagina(text: string): string[] {
  const gasite = [...text.matchAll(/href="[^"]*\/product\/([^"?#]+)"/g)].map((m) => m[1]);
  return [...new Set(gasite)].sort();
}

const primulNegol = (...v: (string | null | undefined)[]) =>
  v.map((x) => (x ?? "").trim()).find(Boolean) ?? "";

/* ═══════════════════════════════════════════════════════════════════════════
 * MAGAZINELE VII
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Un magazin pe care santinela are voie sa-l probeze. */
interface MagazinViu {
  id: string;
  slug: string;
  /** Adresa publica: domeniul propriu cand exista, altfel calea de pe platforma. */
  baza: string;
  /**
   * Domeniul propriu, cand exista. De pe 03.09.2026 e si linia de despartire
   * SEO: numai magazinele cu domeniu au sitemap si se indexeaza; pe platforma,
   * vitrina poarta `X-Robots-Tag: noindex`. Probele care cer un sitemap sau
   * judeca antetul aleg dupa el.
   */
  domeniuPropriu: string | null;
  /** Sanatatea domeniului, cum a masurat-o cronul: `null` = inca neverificat. */
  domeniuSanatos: boolean | null;
  /**
   * Magazin cu un singur produs (One Product Store): sitemapul lui NU anunta
   * `/product/*` dinadins, deci nu poate fi tinta probei „sitemapul are produse".
   */
  unSingurProdus: boolean;
}

/**
 * Un magazin PUBLICAT, indiferent de abonament.
 *
 * Antetul `X-Robots-Tag` de pe platforma si 410-ul lui `/{slug}/sitemap.xml`
 * depind numai de `is_published` (proxy-ul nu se uita la abonament, iar pagina
 * suspendata raspunde 200), deci probele care le masoara isi pot lua tinta si
 * dintr-un magazin cu abonamentul stins — si e bine s-o faca: magazinele vii
 * fara domeniu sunt putine si volatile (cinci din 55 pe 04.09.2026, trei deja
 * in dunning), iar fara tinta proba invariantei ar fi trecut in tacere.
 */
interface MagazinPublicat {
  slug: string;
}

/**
 * Magazinele care CHIAR randeaza o vitrina unui vizitator.
 *
 * ⚠ `is_published = true` NU inseamna asta. Cand abonamentul s-a stins,
 * `[slug]/page.tsx` randeaza `<SuspendedStorePage>`: cod 200, un titlu, „Magazinul
 * este momentan indisponibil" — si nimic altceva. Fara grila, fara carduri, fara
 * JSON-LD, dar CU sitemap si CU feed Facebook, fiindca rutele alea nu se uita la
 * abonament. De aici tabloul care insala: „sitemapul are produse" trece in timp ce
 * „catalogul randeaza carduri" cade, si arata leit cu o defectiune de randare.
 *
 * ⚠ Masurat pe productie la 16.08.2026: din 70 de magazine publicate, 53 sunt
 * suspendate. Trei sferturi. O proba care isi alege tinta doar dupa `is_published`
 * are trei sanse din patru sa nimereasca o pagina care N-ARE ce sa contina — si
 * asa au iesit cele 28 de alarme cu `fortis`.
 *
 * ⚠ Si nu e o poveste incheiata: chiar magazinul probat pana acum,
 * `nordic-outlet-bucovina`, are `plan_expires_at` trecut de 14 zile si
 * `payment_failed_at` scris pe 16.08 — e in reincercarile Stripe chiar acum. Cand
 * gratia se termina, patru probe ar fi inceput sa acuze catalogul pentru o stare de
 * abonament, fara nicio schimbare de cod.
 *
 * Regula se ia din `isSubscriptionInactive`, nu se rescrie aici. ⚠ Dar nu e chiar
 * regula storefront-ului: storefront-ul o are scrisa DE MANA, in trei locuri
 * ((public)/[slug]/page.tsx, [slug]/[pageSlug]/page.tsx, catalog/pagina-magazin.tsx),
 * si niciunul dintre ele nu importa functia. Fata de ele, `isSubscriptionInactive`
 * are in plus plasa de 45 de zile pentru abonamentele platite pierdute, iar noi mai
 * sarim si magazinele fara profil.
 *
 * Abaterea e deci un SUPRASET: tot ce iese din `vii` aici ar putea inca sa randeze
 * vitrina. Directia conteaza si e aleasa dinadins — costa acoperire (un magazin
 * neprobat), NICIODATA o alarma falsa, care e greseala pe care fisierul asta o
 * plateste acum. Ziua in care cele patru copii se unifica, randul asta ramane bun.
 */
async function magazineVii(admin: Admin): Promise<{
  vii: MagazinViu[];
  /** Publicate si fara domeniu propriu, cu sau fara abonament. Ordonate dupa slug, ca tinta sa fie stabila. */
  publicateFaraDomeniu: MagazinPublicat[];
  /**
   * Cate magazine publicate AU domeniu propriu, indiferent de abonament sau de
   * sanatatea domeniului. Cand e mai mare ca zero si totusi niciun magazin viu cu
   * domeniu nu ramane in `vii`, probele de sitemap nu trebuie sa taca: fie toate
   * au abonamentul stins, fie cronul de domenii le-a marcat pe toate cazute dupa
   * o pana — si atunci chiar niciun sitemap de magazin nu se mai serveste.
   */
  publicateCuDomeniu: number;
  eroare: string | null;
}> {
  const { data: mag, error } = await admin
    .from("businesses")
    // `page_content` doar pentru modul magazinului (un singur produs sau catalog).
    .select("id, slug, user_id, suspended_until, custom_domain, custom_domain_healthy, store_settings(page_content)")
    .eq("is_published", true)
    .not("slug", "is", null);
  if (error) return { vii: [], publicateFaraDomeniu: [], publicateCuDomeniu: 0, eroare: `citirea magazinelor a esuat: ${error.message}` };

  const publicateFaraDomeniu: MagazinPublicat[] = (mag ?? [])
    .filter((b) => !(b.custom_domain ?? "").trim())
    .map((b) => ({ slug: b.slug }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const publicateCuDomeniu = (mag ?? []).length - publicateFaraDomeniu.length;

  const idUtilizatori = [...new Set((mag ?? []).map((b) => b.user_id))];
  const { data: profiluri, error: eProfil } = await admin
    .from("users_profile")
    .select("id, plan, plan_expires_at")
    .in("id", idUtilizatori.length ? idUtilizatori : [NICIUN_ID]);
  if (eProfil) return { vii: [], publicateFaraDomeniu, publicateCuDomeniu, eroare: `citirea planurilor a esuat: ${eProfil.message}` };
  const planDupaUtilizator = new Map((profiluri ?? []).map((p) => [p.id, p]));

  const vii: MagazinViu[] = [];
  for (const b of mag ?? []) {
    const p = planDupaUtilizator.get(b.user_id);
    /*
     * Fara profil nu putem sti daca abonamentul mai tine. Santinela nu proba ce nu
     * poate confirma: mai bine o tinta in minus decat o alarma pe care n-o poate
     * explica nimeni.
     */
    if (!p) continue;
    if (isSubscriptionInactive({
      plan: p.plan,
      planExpiresAt: p.plan_expires_at,
      suspendedUntils: [b.suspended_until],
    })) continue;
    const domeniu = (b.custom_domain ?? "").trim();
    /*
     * Domeniu dovedit stricat: defectul e cunoscut, are alt proprietar, si o alarma
     * din doua in doua ore despre acelasi certificat expirat e chiar felul in care
     * o alarma ajunge sa fie ignorata.
     */
    if (domeniu && b.custom_domain_healthy === false) continue;
    vii.push({
      id: b.id,
      slug: b.slug,
      baza: storeBaseUrl({ slug: b.slug, custom_domain: domeniu || null }),
      domeniuPropriu: domeniu || null,
      domeniuSanatos: domeniu ? b.custom_domain_healthy : null,
      unSingurProdus: parseStoreModeFromSettings(b.store_settings).mode === "one_product",
    });
  }
  return { vii, publicateFaraDomeniu, publicateCuDomeniu, eroare: null };
}

/** Magazinul de proba, impreuna cu ce s-a aflat cerandu-i pagina de catalog. */
interface MagazinProba extends MagazinViu {
  total: number;
  /** Adresa la care traieste CHIAR grila de produse. */
  catalog: string;
  /** `false` cand `/magazin` duce inapoi la radacina: grila e pe pagina principala. */
  paginaCatalogSeparata: boolean;
  /** Raspunsul deja primit pentru `catalog`, ca sa nu fie cerut de doua ori. */
  primaPagina: Raspuns;
}

const acelasiLoc = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/* ═══════════════════════════════════════════════════════════════════════════ */

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  /*
   * ⚠ `<Database>` nu e decorativ. Fara generic, `.from()` accepta ORICE nume de
   * tabela si `.rpc()` orice argumente — verificat: un nume de functie inexistent
   * si un parametru gresit trec amandoua nevazute. Santinela e chiar locul unde
   * o proba care nu poate esua nu apara pe nimeni.
   */
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { vii, publicateFaraDomeniu, publicateCuDomeniu, eroare: eroareMagazine } = await magazineVii(admin);
  const viuDupaId = new Map(vii.map((m) => [m.id, m]));

  /*
   * ═══ MAGAZINUL DE PROBA ═══
   *
   * Se ALEGE din baza, nu se scrie in cod. Un slug fixat aici ar fi facut santinela
   * sa tipe in ziua in care magazinul ala isi conecteaza un domeniu sau se
   * depublica — adica alarma falsa.
   *
   * ⚠ Se cer TOATE rezumatele si se incruciseaza cu magazinele vii, nu invers.
   * Forma dinainte lua `.limit(5)` din clasament si abia APOI filtra: cele cinci
   * locuri erau ocupate de esafe.ro, vetdepo.ro, bricosmart.ro si insulabucuriei.ro,
   * deci ramanea EXACT un candidat folosibil. In ziua in care si acela isi conecta
   * un domeniu, sase probe ar fi raportat „niciun magazin de proba" la fiecare
   * rulare — o alarma pe care nimeni n-o poate stinge din panou.
   *
   * ⚠ Magazinele cu domeniu propriu NU mai sunt excluse. Filtrul acela parea sa
   * tina masuratoarea „pe platforma", dar `proxy.ts` raspunde oricum cu 307 catre
   * domeniul propriu, deci cererea ajungea acolo prin doua salturi. Ce facea cu
   * adevarat era sa taie din alegere exact magazinele mari — singurele care au
   * palier server, pagina de catalog si categorii.
   */
  const { data: rezumate, error: eRezumate } = await admin
    .from("catalog_rezumat")
    .select("business_id, total")
    .eq("fara_imagini", false).eq("fara_stoc_ascuns", false)
    .gt("total", 0)
    .order("total", { ascending: false })
    .limit(200);

  const clasament = ((rezumate ?? []) as { business_id: string; total: number }[])
    .map((r) => {
      const m = viuDupaId.get(r.business_id);
      return m ? { ...m, total: r.total } : null;
    })
    .filter((x): x is MagazinViu & { total: number } => x !== null);

  /*
   * ═══ CARE MAGAZIN, SI DE CE SE INTREABA PRODUCTIA, NU BAZA ═══
   *
   * Probele de catalog, de paginare si de cautare au sens doar pe un magazin care
   * ARE pagina de catalog. La celelalte, `/{slug}/magazin` raspunde 307 catre
   * radacina, iar probele masurau — in tacere — grila de pe pagina principala:
   * treceau mereu, si `pagina-magazin.tsx` (702 de linii, filtre, feliere,
   * categorii, canonical) nu era ceruta de nimeni.
   *
   * Care magazin are pagina separata se AFLA cerand-o, nu deducand-o din
   * `storefront_design`. O a doua copie a regulii aici ar fi inceput sa se abata de
   * la storefront din prima zi in care storefront-ul se schimba — si santinela ar
   * fi ajuns sa masoare propria ei parere.
   *
   * Se incearca in ordinea marimii, cel mult cateva: prima care raspunde 200 fara
   * sa fie dusa inapoi la radacina castiga. Daca niciuna n-are, se probeaza pagina
   * principala a celui mai mare — dar atunci mesajele o SPUN, ca sa nu mai trimita
   * pe nimeni in fisierul gresit.
   *
   * ⚠ UN CANDIDAT SARIT NU SE UITA. Prima forma a buclei facea `continue` pe orice
   * cod diferit de 200 si arunca codul odata cu el: daca pagina de catalog a celui
   * mai mare magazin incepea sa dea 500, santinela trecea tacut la urmatorul, il
   * gasea sanatos, si raporta VERDE — adica exact clasa de defect pentru care exista
   * proba. Codurile se strang si le raporteaza proba de catalog.
   */
  const MAX_INCERCARI = 4;
  let magazin: MagazinProba | null = null;
  let rezerva: MagazinProba | null = null;
  const incercariCazute: string[] = [];
  for (const c of clasament.slice(0, MAX_INCERCARI)) {
    const r = await ia(`${c.baza}/magazin`);
    if (r.cod !== 200) {
      incercariCazute.push(`${c.baza}/magazin raspunde cu ${r.cod}`);
      continue;
    }
    if (!acelasiLoc(r.url, c.baza)) {
      magazin = { ...c, catalog: `${c.baza}/magazin`, paginaCatalogSeparata: true, primaPagina: r };
      break;
    }
    rezerva ??= { ...c, catalog: c.baza, paginaCatalogSeparata: false, primaPagina: r };
  }
  /*
   * `const`, ca sa se poata ingusta inauntrul probelor: TypeScript nu duce
   * ingustarea unui `let` din afara intr-o functie imbricata.
   */
  const magazinProba: MagazinProba | null = magazin ?? rezerva;

  /*
   * ═══ MAGAZINUL CU SITEMAP ═══
   *
   * De pe 03.09.2026 sitemap au NUMAI magazinele cu domeniu propriu, servit la
   * radacina domeniului lor; pe platforma, `/{slug}/sitemap.xml` raspunde 410 si
   * vitrina poarta `noindex`. Deci probele care citesc un sitemap de magazin nu
   * pot folosi `magazinProba` la intamplare: daca el e pe platforma, ar cere o
   * adresa retrasa si ar suna la fiecare doua ore pentru un 410 corect.
   *
   * Se prefera chiar magazinul de proba, cand are domeniu (ca probele sa
   * vorbeasca despre acelasi magazin); altfel cel mai mare magazin viu cu
   * domeniu si produse. Fara niciunul, probele de sitemap n-au ce masura si tac
   * — nu e un defect, e o platforma fara magazine pe domeniu propriu.
   *
   * ⚠ NU un magazin cu un singur produs: sitemapul lui nu anunta `/product/*`
   * dinadins, si proba „are produse" l-ar fi acuzat la fiecare doua ore. Si de
   * preferat un domeniu DOVEDIT sanatos: unul neverificat inca poate sa nu
   * raspunda deloc, iar „cod 0" nu e un defect al sitemapului.
   */
  const poateAveaSitemap = (m: MagazinViu) => !!m.domeniuPropriu && !m.unSingurProdus;
  const magazinCuSitemap: (MagazinViu & { total: number }) | null =
    magazinProba && poateAveaSitemap(magazinProba)
      ? magazinProba
      : (clasament.find((c) => poateAveaSitemap(c) && c.domeniuSanatos === true)
        ?? clasament.find(poateAveaSitemap)
        ?? null);
  /**
   * De ce n-avem niciun magazin cu sitemap — cand exista totusi magazine cu
   * domeniu. Probele de sitemap SPUN asta in loc sa treaca verde: dupa o pana
   * Vercel/DNS, cronul de domenii le poate marca pe toate cazute, `magazineVii`
   * le scoate, si tocmai atunci niciun sitemap de magazin nu se mai serveste.
   * Doar cand nu exista deloc magazine publicate cu domeniu e o liniste adevarata.
   */
  const motivFaraSitemap: string | null = magazinCuSitemap
    ? null
    : publicateCuDomeniu === 0
      ? null
      : `niciun magazin viu cu domeniu propriu si catalog: ${publicateCuDomeniu} publicate cu domeniu, dar toate suspendate,`
        + ` cu domeniul marcat cazut, fara produse sau cu un singur produs — sitemapul de magazin n-a putut fi masurat`;

  /**
   * O vitrina servita CHIAR pe platforma, pentru probele de `noindex` si 410.
   *
   * ⚠ Din TOATE magazinele publicate fara domeniu, nu doar din cele vii: antetul
   * si 410-ul nu depind de abonament (vezi `MagazinPublicat`). Se prefera totusi
   * un magazin viu cu produse, ca proba sa masoare o vitrina intreaga.
   */
  const vitrinaPePlatforma: MagazinPublicat | null =
    clasament.find((c) => !c.domeniuPropriu)
    ?? vii.find((m) => !m.domeniuPropriu)
    ?? publicateFaraDomeniu[0]
    ?? null;

  /*
   * ⚠ `error` verificat si aici, nu doar `data`. Fara asta, o citire picata dadea
   * lista goala, `slug` devenea `null`, si sase probe raportau „niciun magazin de
   * proba" — mesaj din care nu se reconstituie daca lipsea magazinul sau lipsea baza
   * de date.
   *
   * ⚠ Si motivul trebuie sa fie CEL ADEVARAT. O forma care spunea mereu „toate
   * suspendate sau cu domeniul stricat" ar fi mintit chiar in cazul cel mai probabil:
   * o livrare care rupe `pagina-magazin.tsx` face 500 pe toate cele patru candidate
   * deodata (sunt servite de acelasi cod), iar cine citeste alarma ar pleca in panoul
   * de abonamente in loc sa se uite la deploy.
   */
  const motivFaraMagazin =
    eroareMagazine
    ?? (eRezumate ? `citirea rezumatelor a esuat: ${eRezumate.message}` : null)
    ?? (incercariCazute.length
      ? `niciun magazin de proba: ${clasament.length} magazine vii cu produse, dar paginile lor nu raspund`
        + ` (${incercariCazute.join(", ")})`
      : "niciun magazin viu cu produse (toate suspendate, nepublicate, sau cu domeniul stricat)");

  const slug = magazinProba?.slug ?? null;
  /** Cum se numeste, in mesaje, pagina pe care s-a masurat CHIAR. */
  const numeleCatalogului = magazinProba?.paginaCatalogSeparata
    ? "pagina de catalog"
    : "grila de pe pagina principala (magazinul n-are pagina de catalog separata)";

  const probe: Proba[] = [
    /*
     * ═══ INVARIANTA SEO (03.09.2026), MASURATA PE PRODUCTIE ═══
     *
     * Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
     * sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.
     *
     * Probele de cod (`proxy.test.ts`, `sitemap.test.ts`, `robots.test.ts`) o
     * verifica pe cod. Cele trei de mai jos o verifica pe CE SERVESTE CHIAR
     * productia: un antet care se pierde pe drum (CDN, o schimbare in Next, un
     * `headers()` din next.config care il suprascrie) nu s-ar vedea in nicio
     * proba de cod, si nici in vreun jurnal — Google ar indexa in liniste vitrine
     * pe www.edinio.com, sau ar scoate din index site-ul platformei.
     *
     * Fiecare poate esua si fiecare poate trece: se cer adrese care exista, si
     * se judeca un antet care ori e, ori nu e.
     */
    {
      nume: "vitrinele de pe platforma sunt noindex, site-ul platformei nu",
      ruleaza: async () => {
        if (eroareMagazine) return eroareMagazine;
        const cazute: string[] = [];

        // 1) Site-ul platformei: FARA antet. Un `noindex` ratacit aici e cel mai
        //    scump defect posibil: scoate din Google chiar paginile care aduc clienti.
        for (const cale of ["/", "/blog", "/preturi"]) {
          const r = await iaAntet(`${PLATFORM_ORIGIN}${cale}`, ANTET_ROBOTS);
          if (r.cod !== 200) { cazute.push(`${cale} raspunde cu ${r.cod}`); continue; }
          if (r.valoare && /noindex/i.test(r.valoare)) {
            cazute.push(`pagina platformei ${cale} poarta X-Robots-Tag: ${r.valoare} — ar iesi din Google`);
          }
        }

        // 2) O vitrina servita CHIAR pe platforma: CU antet. Fara nicio tinta, proba
        //    SPUNE ca n-a putut masura, nu trece in tacere: e chiar proba care apara
        //    invarianta noua, iar un verde fara masuratoare e purtarea pe care
        //    fisierul si-o interzice.
        if (!vitrinaPePlatforma) {
          cazute.push("niciun magazin publicat fara domeniu propriu: antetul noindex de pe platforma n-a putut fi masurat pe nicio vitrina");
        } else {
          const r = await iaAntet(`${PLATFORM_ORIGIN}/${vitrinaPePlatforma.slug}`, ANTET_ROBOTS);
          if (r.cod !== 200) cazute.push(`vitrina ${vitrinaPePlatforma.slug} raspunde cu ${r.cod} pe platforma`);
          else if (!r.valoare || !/noindex/i.test(r.valoare)) {
            cazute.push(`vitrina ${vitrinaPePlatforma.slug} e servita pe www.edinio.com FARA X-Robots-Tag: noindex`
              + ` (are: ${r.valoare ?? "nimic"}) — Google ar indexa un magazin pe domeniul platformei`);
          }
        }

        // 3) O vitrina pe domeniu propriu: FARA antet pus de platforma. Un cod
        //    diferit de 200 nu e treaba probei asteia: sanatatea domeniilor are
        //    cronul si proprietarul ei.
        const peDomeniu = clasament.find((c) => c.domeniuPropriu) ?? vii.find((m) => m.domeniuPropriu) ?? null;
        if (peDomeniu) {
          const r = await iaAntet(peDomeniu.baza, ANTET_ROBOTS);
          if (r.cod === 200 && r.valoare && /noindex/i.test(r.valoare)) {
            cazute.push(`${peDomeniu.baza} poarta X-Robots-Tag: ${r.valoare} pe domeniul propriu — magazinul ar iesi din Google`);
          }
        } else if (publicateCuDomeniu > 0) {
          cazute.push(`niciun magazin viu cu domeniu propriu (${publicateCuDomeniu} publicate cu domeniu, toate suspendate sau cu domeniul marcat cazut):`
            + " partea de domeniu propriu n-a putut fi masurata");
        }
        return cazute.length ? cazute.join(" | ") : null;
      },
    },
    {
      nume: "sitemapul platformei anunta doar paginile platformei",
      ruleaza: async () => {
        /*
         * Sitemapul platformei e mic (pagini scrise in cod plus blogul), deci se
         * citeste intreg. Fiecare adresa trebuie sa inceapa cu un segment REZERVAT
         * platformei (`NON_STORE_SEGMENTS`) — un slug de magazin nu poate fi
         * niciodata unul dintre ele, deci orice adresa care nu incepe asa e o
         * vitrina sau o pagina de magazin strecurata inapoi.
         */
        const { cod, text } = await ia(`${PLATFORM_ORIGIN}/sitemap.xml`);
        if (cod !== 200) return `cod ${cod}`;
        const locuri = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
        if (locuri.length === 0) return "sitemapul platformei e GOL";

        const straine = locuri.filter((u) => u !== PLATFORM_ORIGIN && !u.startsWith(`${PLATFORM_ORIGIN}/`));
        const vitrine = locuri.filter((u) => {
          if (!u.startsWith(`${PLATFORM_ORIGIN}/`)) return false;
          const seg = primulSegment(u.slice(PLATFORM_ORIGIN.length));
          return !!seg && !NON_STORE_SEGMENTS.has(seg);
        });
        const parti: string[] = [];
        if (straine.length) parti.push(`${straine.length} adrese de pe alte gazde (ex. ${straine[0]})`);
        if (vitrine.length) {
          parti.push(`${vitrine.length} adrese care nu incep cu un segment al platformei, adica vitrine sau pagini de`
            + ` magazin (ex. ${vitrine.slice(0, 3).join(", ")})`);
        }
        return parti.length ? `sitemapul platformei anunta ${parti.join(" si ")}` : null;
      },
    },
    {
      nume: "sitemapurile de magazin de pe platforma raman retrase (410)",
      ruleaza: async () => {
        /*
         * `sitemap-magazine.xml` (indexul) si `/{slug}/sitemap.xml` raspund 410 si
         * NU se reintroduc. Un 200 aici inseamna ca cineva a pus la loc un sitemap
         * de magazin pe www.edinio.com — adica a contrazis invarianta si trimite
         * Google catre adrese `noindex`.
         */
        const cazute: string[] = [];
        const index = await iaAntet(`${PLATFORM_ORIGIN}/sitemap-magazine.xml`, "cache-control");
        if (index.cod !== 410) {
          cazute.push(`sitemap-magazine.xml raspunde cu ${index.cod}, nu 410`
            + (index.cod === 200 ? " — cineva a reintrodus indexul de magazine pe www.edinio.com" : ""));
        }
        if (!vitrinaPePlatforma) {
          cazute.push("niciun magazin publicat fara domeniu propriu: 410-ul lui /{slug}/sitemap.xml n-a putut fi masurat");
        } else {
          const r = await iaAntet(`${PLATFORM_ORIGIN}/${vitrinaPePlatforma.slug}/sitemap.xml`, "cache-control");
          if (r.cod !== 410) {
            cazute.push(`${vitrinaPePlatforma.slug}/sitemap.xml raspunde cu ${r.cod} pe platforma, nu 410`
              + (r.cod === 200 ? " — un magazin fara domeniu are din nou sitemap pe www.edinio.com" : ""));
          }
        }

        /*
         * Si robots.txt, care e locul de unde afla crawlerul ce sitemapuri exista:
         * pe platforma trebuie sa anunte sitemapul platformei si NUMAI pe el (nu
         * si indexul retras), iar pe domeniul propriu — sitemapul acelui domeniu.
         * Pana la livrarea din 04.09.2026, productia anunta inca
         * `sitemap-magazine.xml`, adica o adresa care raspunde 410.
         */
        const robots = await ia(`${PLATFORM_ORIGIN}/robots.txt`);
        if (robots.cod !== 200) cazute.push(`robots.txt al platformei raspunde cu ${robots.cod}`);
        else {
          if (/sitemap-magazine/i.test(robots.text)) cazute.push("robots.txt al platformei anunta inca sitemap-magazine.xml, adresa retrasa");
          if (!robots.text.includes(`${PLATFORM_ORIGIN}/sitemap.xml`)) cazute.push("robots.txt al platformei nu anunta sitemap.xml");
          /*
           * Fiecare `Disallow` se judeca impotriva ACELEIASI liste care scrie
           * fisierul (`CAI_INTERZISE`), nu a unei copii in regex: prima forma a
           * probei acuza chiar `/login` si `/register`, la fiecare rulare.
           */
          const straine = caiInterziseStraine(robots.text);
          if (straine.length) {
            cazute.push(`robots.txt al platformei interzice cai care nu sunt ale aplicatiei (${straine.join(", ")})`
              + " — un Disallow pe o vitrina ar ascunde noindex-ul de Googlebot");
          }
        }
        if (magazinCuSitemap) {
          const al = await ia(`${magazinCuSitemap.baza}/robots.txt`);
          if (al.cod === 200 && !al.text.includes(`${magazinCuSitemap.baza}/sitemap.xml`)) {
            cazute.push(`robots.txt de pe ${magazinCuSitemap.baza} nu anunta sitemapul propriu`);
          }
        }
        return cazute.length ? cazute.join(" | ") : null;
      },
    },
    {
      nume: "sitemapul magazinului pe domeniu propriu are produse",
      ruleaza: async () => {
        if (eroareMagazine) return eroareMagazine;
        /* Fara niciun magazin publicat cu domeniu nu exista sitemap de masurat si
           e liniste adevarata; cu magazine cu domeniu, dar niciunul folosibil,
           proba SPUNE de ce — vezi `motivFaraSitemap`. */
        if (!magazinCuSitemap) return motivFaraSitemap;
        const { cod, cate } = await iaSiNumara(`${magazinCuSitemap.baza}/sitemap.xml`, "/product/");
        if (cod !== 200) return `sitemapul ${magazinCuSitemap.baza}/sitemap.xml raspunde cu ${cod}`;
        return cate === 0 ? `sitemapul magazinului ${magazinCuSitemap.slug} n-are niciun produs` : null;
      },
    },
    {
      nume: "catalogul randeaza carduri",
      ruleaza: async () => {
        if (!magazinProba) return motivFaraMagazin;
        const { text, url } = magazinProba.primaPagina;
        const n = numara(text, /href="[^"]*\/product\//g);
        // Exact defectul „0 din 1049 produse": pagina raspunde, contorul arata
        // numarul intreg, si grila e goala.
        //
        // Mesajul spune ADRESA MASURATA, nu numele rutei cerute. Cand cele doua
        // difera (redirect catre radacina), cine citea alarma deschidea pagina de
        // catalog si nu gasea nimic din ce se masurase.
        const cazute = n === 0 ? [`${numeleCatalogului} (${url}) n-a randat niciun card`] : [];
        /*
         * ⚠ Si magazinele SARITE la alegere. Fara randul asta, un catalog rupt la
         * primul magazin din clasament nu producea nicio alarma: alegerea trecea la
         * urmatorul, il gasea sanatos, si proba raporta verde despre ALT magazin.
         * Aici e singurul loc care stie ca s-a intamplat.
         */
        if (incercariCazute.length) {
          cazute.push(`am sarit magazine cu pagina de catalog cazuta: ${incercariCazute.join(", ")}`);
        }
        return cazute.length ? cazute.join(" | ") : null;
      },
    },
    {
      nume: "paginarea da ALTE produse",
      ruleaza: async () => {
        if (!magazinProba) return motivFaraMagazin;
        const unu = magazinProba.primaPagina;
        const doi = await ia(`${magazinProba.catalog}?page=2`);
        if (doi.cod !== 200) return `pagina 2 (${doi.url}) raspunde cu ${doi.cod}`;
        const a = produseDinPagina(unu.text);
        const b = produseDinPagina(doi.text);
        /* Fiecare mesaj poarta adresa CHIAR MASURATA de el, nu pe a paginii vecine. */
        if (a.length === 0) return `pagina 1 (${unu.url}) e goala`;
        if (b.length === 0) return `pagina 2 (${doi.url}) e goala`;
        /*
         * Doua pagini cu ACELEASI produse inseamna ca felierea nu se aplica —
         * chiar defectul din A3, unde `?page=2` randa neschimbat primele 20.
         * Contoarele aratau corect si atunci.
         */
        return JSON.stringify(a) === JSON.stringify(b)
          ? `pagina 2 arata aceleasi produse ca pagina 1, pe ${doi.url}`
          : null;
      },
    },
    {
      nume: "cautarea intoarce rezultate",
      ruleaza: async () => {
        if (!magazinProba) return motivFaraMagazin;
        /*
         * ⚠ TERMENUL SE IA DIN VOCABULARUL MAGAZINULUI PROBAT. Nu al altuia.
         *
         * Asta a fost defectul care a produs 85 din cele 88 de alarme: interogarea
         * filtra pe `idCandidati`, adica pe TOATE cele cinci magazine din clasament,
         * si intorcea cuvantul cel mai frecvent DINTRE ELE — „protectie", cu 2034 de
         * produse la eSAFE. Magazinul chiar cerut era insa nordic-outlet-bucovina,
         * un outlet de haine, unde „protectie" nu apare nicaieri. Zero rezultate era
         * raspunsul corect, si santinela l-a raportat ca defect din doua in doua ore,
         * o saptamana intreaga.
         *
         * Un termen scris de mana ar avea acelasi neajuns dintr-o alta directie:
         * putea sa nu existe in catalog, si atunci „zero rezultate" ar fi fost tot
         * raspunsul corect.
         */
        const { data: cuv, error: eCuv } = await admin
          .from("catalog_cuvant").select("cuvant, cate")
          .eq("business_id", magazinProba.id)
          .order("cate", { ascending: false }).limit(5);
        if (eCuv) return `citirea vocabularului a esuat: ${eCuv.message}`;
        const vocabular = (cuv ?? []) as { cuvant: string; cate: number }[];
        /*
         * ⚠ VOCABULAR GOL E O ALARMA, nu un motiv de tacere.
         *
         * Un magazin cu produse si fara niciun cuvant in index inseamna ca indexul
         * de cautare nu s-a mai reconstruit — chiar al treilea dintre cele patru
         * defecte pentru care exista fisierul asta (`DELETE` fara `WHERE`, respins de
         * paza rolului, patru zile in care nimeni n-a cautat nimic cu folos). O
         * versiune a probei care iesea tacut aici ar fi fost oarba fix la defectul
         * care a nascut-o.
         */
        if (vocabular.length === 0) {
          return `magazinul ${magazinProba.slug} are ${magazinProba.total} produse, dar ZERO cuvinte in`
            + ` indexul de cautare (catalog_cuvant) — indexul nu se mai reconstruieste`;
        }
        /*
         * ⚠ TERMENUL NU SE IA DIN `catalog_cuvant`, DESI E ACOLO — si asta e a doua
         * jumatate a lectiei, gasita la a doua trecere peste chiar reparatia asta.
         *
         * Vocabularul se construieste peste TOATE randurile din `catalog_produs`
         * (`catalog_reface_cuvinte`: `where c.business_id = p_business`, si atat), pe
         * cand cautarea raspunde doar din produsele VIZIBILE (`catalog_candidati`:
         * `c.category <> all (f.ascunse)`), iar `catalog_rezumat.total` la fel. Deci
         * un cuvant care traieste numai in produsele dintr-o categorie stinsa de
         * comerciant e „cuvant al magazinului" dupa index si intoarce corect ZERO
         * rezultate in vitrina. Adica fix familia celor 85 de alarme false, doar ca
         * dintr-un alt unghi — si o forma care compara `cate` cu `total` compara doua
         * numere din universuri diferite.
         *
         * Se ia deci un cuvant dintr-un produs care E CHIAR PE PAGINA masurata mai
         * sus: vizibil prin constructie, fara nicio presupunere despre index.
         */
        const nefiltrat = produseDinPagina(magazinProba.primaPagina.text);
        const cuvantDinSlug = (s: string) =>
          s.split("-").filter((w) => /^[a-z]{4,}$/.test(w)).sort((a, b) => b.length - a.length)[0];
        const tinta = nefiltrat.find((s) => cuvantDinSlug(s));
        /* Niciun slug cu un cuvant folosibil (doar coduri de produs): n-avem ce cauta. */
        if (!tinta) return null;
        const termen = cuvantDinSlug(tinta);

        const r = await ia(`${magazinProba.catalog}?q=${encodeURIComponent(termen)}`);
        if (r.cod !== 200) return `cautarea raspunde cu ${r.cod} pe ${r.url}`;
        const gasite = produseDinPagina(r.text);
        if (gasite.length === 0) {
          return `cautarea dupa „${termen}" n-a gasit nimic pe ${r.url}, desi cuvantul vine chiar din`
            + ` produsul „${tinta}", afisat acum pe ${magazinProba.primaPagina.url}`;
        }
        /*
         * Produsul din care a venit cuvantul TREBUIE sa fie printre rezultate. E o
         * aserttiune mai stransa decat „macar un card" si, spre deosebire de ea, nu
         * poate da alarma falsa: produsul e vizibil, iar cuvantul e din numele lui.
         */
        if (!gasite.includes(tinta)) {
          return `cautarea dupa „${termen}" a dat ${gasite.length} rezultate, dar NU si produsul`
            + ` „${tinta}", din al carui nume vine chiar cuvantul cautat`;
        }
        /*
         * ⚠ „Macar un card" NU e destul. Catalogul NEFILTRAT da si el carduri, deci
         * daca `?q=` ar inceta sa se aplice — chiar defectul A3 din antetul
         * fisierului, „cautarea scria in bara de adrese si nu schimba nimic" — pagina
         * ar randa catalogul implicit si proba ar raporta „cautarea intoarce
         * rezultate". Se cere de aceea si un termen care nu poate exista: zero
         * rezultate acolo e singura dovada ca filtrul chiar se aplica, si niciun
         * catalog adevarat nu poate contrazice asta.
         */
        const inexistent = await ia(`${magazinProba.catalog}?q=zzqqxxwv9`);
        if (inexistent.cod !== 200) return `cautarea raspunde cu ${inexistent.cod} pe ${inexistent.url}`;
        const peNimic = produseDinPagina(inexistent.text);
        return peNimic.length > 0
          ? `cautarea dupa un termen inexistent a intors ${peNimic.length} produse pe ${inexistent.url}:`
            + ` filtrul „q" nu se aplica deloc`
          : null;
      },
    },
    {
      nume: "ciclul stocului si cursa pe marime",
      ruleaza: async () => {
        /*
         * Singura proba care VERIFICA O SCRIERE, nu o citire.
         *
         * Celelalte cer pagini si numara ce iese. Asta cheama `proba_stoc()`, care
         * isi face un produs cu doua marimi si o comanda, le trece prin tot ciclul —
         * revendicare, refuz pe marimea epuizata, anulare, reactivare — si ANULEAZA
         * TRANZACTIA la final. Nimic nu ramane in baza; verificat.
         *
         * De ce pe date sintetice: proba scade si pune inapoi stoc. Pe marfa reala,
         * o rulare intrerupta la mijloc ar lasa stocul gresit — santinela ar deveni
         * ea cauza defectului pe care il cauta.
         *
         * De ce DOUA marimi: cu una singura, stocul produsului (care e SUMA) ajunge
         * la zero odata cu ea, refuza verificarea de PRODUS, si proba ar trece
         * printr-un drum pe care defectul n-a existat niciodata. Prima forma a
         * probei chiar a cazut asa.
         *
         * Dovedit ca poate ESUA: rulata peste purtarea de dinainte de 18.08
         * (verificare doar pe produs, scadere plafonata la zero pe marime), a doua
         * bucata primea `{"ok": true}` si proba o prindea.
         *
         * ⚠ Numele spune „cursa", dar cele doua revendicari se fac SECVENTIAL, in
         * aceeasi tranzactie: o tranzactie nu se blocheaza pe propriile lacate, deci
         * `for update` din `revendica_stoc_complet` n-are ce apara aici. Ce verifica
         * proba cu adevarat — si e chiar defectul din 18.08 — e ca refuzul se face PE
         * MARIME si intoarce numele ei. Concurenta ramane neacoperita; de stiut cand
         * cineva se bazeaza pe raportul verde.
         */
        const { data, error } = await admin.rpc("proba_stoc", {});
        if (error) return `proba n-a putut rula: ${error.message}`;
        const r = data as unknown as
          { ok?: boolean; motiv?: string; pasi?: { pas: string; ok: boolean; detaliu?: string }[] } | null;
        if (!r) return "proba n-a raspuns";
        if (r.ok === true) return null;
        const cazuti = (r.pasi ?? []).filter((p) => !p.ok);
        return cazuti.length
          ? cazuti.map((p) => `${p.pas}: ${p.detaliu ?? "a picat"}`).join(" | ")
          : (r.motiv ?? "proba a picat fara detalii");
      },
    },
    {
      nume: "cozile se golesc",
      ruleaza: async () => {
        /*
         * ⚠ SE MASOARA VECHIMEA, NU MARIMEA. Forma dinainte se uita la numarul de
         * randuri, cu praguri care nu puteau fi atinse NICIODATA:
         *
         *   `catalog_rezumat_murdar` si `catalog_cuvinte_murdar` au amandoua
         *   PRIMARY KEY (business_id), deci cel mult un rand pe magazin: 127 de
         *   randuri cu totul, la un prag de 200. `catalog_murdar` are PK pe
         *   product_id, deci cel mult 8094, la un prag de 5000 — adica ar fi cerut ca
         *   62% din TOATE produsele platformei sa fie murdare deodata, cand cel mai
         *   mare reimport posibil marcheaza 3351.
         *
         * Deci proba scrisa ANUME pentru vocabularul care esua tacut de patru zile
         * n-ar fi prins nici acel incident. In cele 88 de alarme din istoric, numele
         * ei apare de ZERO ori — nu fiindca era liniste, ci fiindca nu putea suna.
         *
         * Ce conteaza chiar e daca un rand STA. `catalog-proiector` ruleaza la
         * fiecare minut si goleste 1000 de randuri pe rulare, in ordinea lui
         * `marcat_la` (cel mai vechi intai), deci pana si o reproiectare a intregii
         * platforme se scurge in vreo noua minute. Un rand mai vechi de o jumatate de
         * ora inseamna un lucrator oprit — si asta e adevarat si cand coada are un
         * singur rand, adica exact cazul pe care marimea nu-l vedea.
         */
        const PRAG_MINUTE = 30;
        const prag = new Date(Date.now() - PRAG_MINUTE * 60_000).toISOString();

        /*
         * Cele trei citiri se scriu pe rand, nu dintr-o bucla peste numele tabelelor:
         * cu numele venit dintr-o variabila, `.from()` nu mai poate fi verificat de
         * `<Database>`, si atunci un tabel redenumit ar trece nevazut — chiar felul de
         * proba care nu poate esua.
         */
        const [pr, rez, cuv] = await Promise.all([
          admin.from("catalog_murdar").select("marcat_la", { count: "exact", head: true }).lt("marcat_la", prag),
          admin.from("catalog_rezumat_murdar").select("marcat_la", { count: "exact", head: true }).lt("marcat_la", prag),
          admin.from("catalog_cuvinte_murdar").select("marcat_la", { count: "exact", head: true }).lt("marcat_la", prag),
        ]);

        const blocate: string[] = [];
        for (const [nume, r] of [["proiectie", pr], ["rezumat", rez], ["vocabular", cuv]] as const) {
          /*
           * `error` VERIFICAT, nu doar numarul.
           *
           * La o citire picata, `count` e `null`, iar `?? 0` il preface in zero —
           * adica „coada e goala", adica sanatos. Santinela ar fi raportat verde
           * tocmai cand baza nu raspunde. O santinela trebuie sa fie mai stricta
           * decat sistemul pe care il verifica, nu mai iertatoare.
           */
          if (r.error) return `citirea cozii ${nume} a esuat: ${r.error.message}`;
          const cate = r.count ?? 0;
          if (cate > 0) blocate.push(`${nume}: ${cate} randuri nescurse de peste ${PRAG_MINUTE} de minute`);
        }
        return blocate.length
          ? `cozi blocate (un lucrator nu-si mai face treaba): ${blocate.join(", ")}`
          : null;
      },
    },
    {
      nume: "nicio operatie externa atarnata de mult",
      ruleaza: async () => {
        /*
         * O operatie ramasa `in_curs` sau `necunoscut` inseamna ca un AWB sau un
         * document fiscal S-AR PUTEA sa existe la furnizor fara ca noi sa stim — si
         * ca butonul care ar reface-o e blocat pana cand se uita un om.
         *
         * Panoul din pagina comenzii o arata comerciantului, dar numai daca acesta
         * deschide chiar acea comanda. Santinela e singurul loc care se uita peste
         * TOATE magazinele.
         *
         * ⚠ Pragul e de o ORA, mult peste cel de 3 minute din panou: aici nu ne
         * intereseaza ce e in zbor sau ce tocmai s-a blocat si va fi rezolvat azi,
         * ci ce a ramas uitat. O alarma la fiecare timeout ar fi zgomot.
         */
        const acumOOra = new Date(Date.now() - 3600_000).toISOString();
        /*
         * `count: "exact"` PE LANGA randuri, nu in locul lor.
         *
         * Prima forma numara `data.length` dupa `.limit(20)` — deci raporta „20
         * operatii atarnate" si cand erau 500, adica exact cifra dupa care cineva ar
         * judeca gravitatea. Plafonul ramane (nu vrem sa caram sute de randuri), dar
         * numarul care ajunge in mesaj e cel adevarat.
         */
        const r = await admin
          .from("operatii_externe")
          .select("fel, furnizor, order_number, creat_la", { count: "exact" })
          .in("stare", ["in_curs", "necunoscut"])
          .lt("creat_la", acumOOra)
          .order("creat_la", { ascending: true })
          .limit(5);

        // `error` verificat, nu doar lungimea: o citire picata ar da lista goala,
        // adica „totul e in regula" tocmai cand nu putem sti.
        if (r.error) return `citirea operatiilor externe a esuat: ${r.error.message}`;
        const cate = r.count ?? 0;
        if (cate === 0) return null;

        const rezumat = (r.data ?? [])
          .map((o) => `${o.fel}/${o.furnizor}${o.order_number ? ` pe ${o.order_number}` : " (platforma)"}`)
          .join(", ");
        /*
         * Alarma se stinge cand cineva deblocheaza operatia — din pagina comenzii
         * (comerciantul) sau din /admin/operatii (administratorul, si singurul drum
         * pentru cele fara comanda). De aceea mesajul spune UNDE se rezolva: o alarma
         * care nu se poate stinge devine zgomot in doua zile.
         */
        return `${cate} operatii externe atarnate de peste o ora (${rezumat}${cate > 5 ? " …" : ""}). Se rezolva din /admin/operatii.`;
      },
    },
    {
      nume: "feedul Facebook al magazinului are produse",
      ruleaza: async () => {
        /*
         * ⚠ ASTA E ADRESA PE CARE O LIPESTE FIECARE COMERCIANT in Commerce Manager.
         *
         * Feedul intreg poate iesi gol fara sa cada nimic: `buildCatalogItems` sare
         * peste produsele fara imagine, deci o migrare de imagini care goleste
         * `images`, sau o regresie in maparea variantelor, da RSS valid, cod 200 si
         * zero articole. Meta raspunde „furnizeaza cel putin 5 produse", reclamele
         * dinamice se opresc, si comerciantul afla din factura de reclama.
         */
        /*
         * ⚠ Garda peste `magazineVii`. Proba asta nu foloseste `magazinProba`, deci
         * fara randul de mai jos o citire picata a magazinelor ii lasa lista de tinte goala
         * si o face sa iasa pe `return null` — adica sa RAPORTEZE TRECUT tocmai cand nu
         * poate sti nimic. E chiar purtarea pe care fisierul si-o interzice in alte trei
         * locuri („o santinela n-are voie sa devina mai iertatoare cand vede mai putin").
         */
        if (eroareMagazine) return eroareMagazine;
        const { data: rez, error: eRez } = await admin
          .from("catalog_rezumat")
          .select("business_id")
          .eq("fara_imagini", false).eq("fara_stoc_ascuns", false)
          .gt("total", 0);
        if (eRez) return `citirea rezumatelor a esuat: ${eRez.message}`;

        /*
         * ⚠ Doar magazinele VII. Masurat: din cele 41 de tinte de dinainte, 24 erau
         * suspendate — 58% din bugetul rotatiei se ducea pe vitrine deja stinse, si
         * toate cele 9 alarme ale probei au venit de la cinci dintre ele.
         */
        const tinte = (rez ?? [])
          .map((r) => viuDupaId.get(r.business_id as string))
          .filter((m): m is MagazinViu => m !== undefined)
          .sort((a, b) => a.slug.localeCompare(b.slug));
        if (tinte.length === 0) return null;

        /*
         * TREI pe rulare, si se rotesc. Un feed intreg poate avea zeci de megaocteti
         * (masurat: eSAFE are 93 MB si 37.025 de articole), iar santinela are memorie
         * si timp marginite. La 12 rulari pe zi, magazinele sunt acoperite in cateva
         * zile — mai bine decat un plafon fix, care ar fi lasat mereu aceleasi
         * magazine neverificate. Corpul se numara in flux (`iaSiNumara`), deci
         * marimea nu mai intra in memorie.
         */
        const PE_RULARE = 3;
        const start = (Math.floor(Date.now() / 7_200_000) * PE_RULARE) % tinte.length;
        const fereastra = Array.from(
          { length: Math.min(PE_RULARE, tinte.length) },
          (_, i) => tinte[(start + i) % tinte.length],
        );

        const defecte: string[] = [];
        const nuRaspund: string[] = [];
        /** Cate produse cu imagine are TOATA platforma. Cerut o data, doar la nevoie. */
        let pozePePlatforma: number | null = null;

        for (const t of fereastra) {
          const { cod, cate } = await iaSiNumara(`${t.baza}/facebook-catalog.xml`, "<item>");
          if (cod !== 200) { nuRaspund.push(`${t.slug}: cod ${cod}`); continue; }
          if (cate > 0) continue;

          /*
           * Feedul e gol. A cui e problema?
           *
           * Constructorul sare peste produsele fara nicio imagine, deci un magazin
           * care n-are nicio poza da corect zero articole.
           *
           * ⚠ ASTA NU E O ALARMA. Toate cele 9 alarme ale probei au fost exact aici
           * — cinci comercianti care nu si-au pus poze — si fiecare purta chiar
           * mesajul „de rezolvat de comerciant, nu din cod". O santinela care tipa
           * `critical` din doua in doua ore pentru ceva ce ea insasi declara ca nu e
           * defectul nostru isi cheltuie singura increderea: dupa destule, nimeni nu
           * mai citeste nici alarmele adevarate.
           *
           * ⚠ Se cere un NUMAR (`head: true`), nu randuri. O citire de randuri s-ar
           * fi lovit de plafonul PostgREST de 1000: pe platforma sunt 7684 de randuri
           * cu imagine, deci un magazin aflat dincolo de fereastra ar fi fost
           * clasificat drept „fara poze" si alarma ar fi dat vina pe comerciant
           * pentru un defect al nostru. Vezi [[postgrest-1000-row-cap]].
           */
          const r = await admin
            .from("catalog_produs")
            .select("product_id", { count: "exact", head: true })
            .eq("business_id", t.id)
            .eq("are_imagine", true);
          if (r.error) { nuRaspund.push(`${t.slug}: nu am putut numara imaginile (${r.error.message})`); continue; }
          if ((r.count ?? 0) > 0) { defecte.push(t.slug); continue; }

          /*
           * ⚠ „Magazinul n-are poze" se crede doar cat timp proiectia mai stie ce e o
           * poza. Daca `are_imagine` s-ar strica si ar raporta zero peste tot, un feed
           * chiar rupt ar fi clasificat drept problema a comerciantului si aruncat in
           * tacere — adica proba ar redeveni una care nu poate esua. Intrebarea se
           * pune o singura data pe rulare, si numai cand chiar am nimerit un magazin
           * fara poze, adica aproape niciodata.
           */
          if (pozePePlatforma === null) {
            const g = await admin
              .from("catalog_produs")
              .select("product_id", { count: "exact", head: true })
              .eq("are_imagine", true);
            if (g.error) {
              nuRaspund.push(`${t.slug}: feed gol, si n-am putut confirma proiectia (${g.error.message})`);
              continue;
            }
            pozePePlatforma = g.count ?? 0;
          }
          if (pozePePlatforma === 0) {
            defecte.push(`${t.slug} (si NICIUN produs de pe platforma n-are imagine in proiectie — s-a rupt `
              + `\`are_imagine\`, nu magazinul)`);
          }
          /* altfel: comerciantul chiar n-are poze. Nu e defectul nostru, deci nu suna. */
        }

        const parti: string[] = [];
        if (defecte.length) {
          parti.push(`feedul Facebook e GOL desi magazinul are produse CU IMAGINI: ${defecte.join(", ")}`
            + ` — Meta opreste reclamele dinamice, si asta e o defectiune la noi.`);
        }
        if (nuRaspund.length) parti.push(`feeduri care nu raspund: ${nuRaspund.join(", ")}`);
        return parti.length ? parti.join(" | ") : null;
      },
    },
    {
      nume: "pagina de produs poarta datele structurate",
      ruleaza: async () => {
        /*
         * Blocul `Product`/`offers` alimenteaza rezultatele imbogatite din Google si
         * listarile gratuite din Merchant. Proba „datele structurate…" de mai jos
         * cere DOAR pagina principala si se uita doar dupa blocul `Store`, deci
         * disparitia celui de produs ar fi trecut neobservata luni de zile:
         * pagina raspunde 200 si arata normal pentru un om, iar comerciantul vede
         * doar ca ii scade traficul organic.
         *
         * Se compara si PRETUL cu cel din baza, nu doar existenta blocului: un
         * `offers` cu pretul gol sau vechi e la fel de rau ca unul lipsa, si e chiar
         * felul de defect pe care „campuri scrise dar necitite" il produce.
         */
        if (!magazinProba) return motivFaraMagazin;
        const { data: prod, error: eProd } = await admin
          .from("catalog_produs")
          .select("slug, price_min, name")
          .eq("business_id", magazinProba.id)
          .not("slug", "is", null)
          .gt("price_min", 0)
          .order("slug", { ascending: true })
          .limit(1);
        if (eProd) return `citirea produsului de proba a esuat: ${eProd.message}`;
        const p = (prod ?? [])[0] as { slug: string; price_min: number; name: string } | undefined;
        if (!p) return null; // magazinul n-are produse cu pret: n-avem ce compara

        const { cod, text } = await ia(`${magazinProba.baza}/product/${p.slug}`);
        if (cod !== 200) return `pagina produsului ${p.slug} raspunde cu ${cod}`;

        const dateStructurate = noduriJsonLd(text);
        const produs = dateStructurate.find((d) => d["@type"] === "Product" || d["@type"] === "ProductGroup");
        if (!produs) return `pagina ${p.slug} n-are bloc JSON-LD de tip Product`;

        const preturi = preturiDinProdus(produs);
        if (preturi.length === 0) return `pagina ${p.slug} are bloc Product, dar fara niciun pret`;

        /*
         * Pretul din pagina trebuie sa fie chiar cel din proiectie. Toleranta e de
         * un ban: proiectia si randarea rotunjesc pe drumuri diferite.
         */
        const asteptat = Number(p.price_min);
        return preturi.some((x) => Math.abs(x - asteptat) < 0.011)
          ? null
          : `pagina ${p.slug} anunta in JSON-LD ${preturi.join("/")} lei, iar in catalog pretul e ${asteptat}`;
      },
    },
    {
      nume: "feedurile de stoc chiar potrivesc randuri",
      ruleaza: async () => {
        /*
         * Cronul de stocuri citeste orar fisierele furnizorilor. Daca un furnizor
         * schimba antetul unei coloane sau formatul fisierului, potrivirea da ZERO
         * randuri si rularea se incheie ca REUSITA — fara log si fara status de
         * eroare. Stocul ingheata pe valorile vechi, iar magazinul vinde marfa care
         * nu mai exista: supravanzare, comenzi anulate de mana, retururi.
         *
         * ⚠ Pe productie `stock_feed_sources` e GOALA la 16.08.2026, deci proba iese
         * pe `return null` la fiecare rulare. Nu e un defect de logica — e acelasi
         * tipar „n-avem ce compara, si nu inventam" — dar de stiut cand se citeste
         * raportul: „14 probe trecute" inseamna azi 13 rulate si una fara subiect.
         */
        const { data: surse, error } = await admin
          .from("stock_feed_sources")
          .select("name, last_status, last_run_at, last_totals")
          .eq("enabled", true)
          .not("last_run_at", "is", null);
        if (error) return `citirea surselor de stoc a esuat: ${error.message}`;
        if ((surse ?? []).length === 0) return null; // niciun feed configurat

        const mute: string[] = [];
        for (const s of surse ?? []) {
          /*
           * ⚠ DOUA capcane, amandoua prinse la verificare, amandoua facand proba
           * incapabila sa esueze — adica exact ce interzice regula fisierului.
           *
           * 1. Starea de reusita se scrie `"ok"`, nu `"success"` (`sources.ts`:
           *    `"ok" | "error" | null`). Comparata cu `"success"`, conditia n-ar fi
           *    fost adevarata NICIODATA.
           * 2. `total` sunt randurile CITITE din fisier, nu cele POTRIVITE cu
           *    produse (`matcher.ts`: `totalRows: rows.length`). Scenariul din chiar
           *    comentariul probei — furnizorul redenumeste o coloana — da un fisier
           *    plin de randuri care nu se mai potrivesc cu nimic: `total` ramane
           *    500, iar `not_found` devine 500. Proba s-ar fi uitat fix la numarul
           *    care NU se schimba.
           *
           * Ce conteaza e cate randuri au ATINS un produs: scrise plus nemodificate.
           * Zero acolo, cu fisierul necitibil sau cu potrivirea rupta, inseamna stoc
           * inghetat pe valorile vechi — si magazinul vinde marfa care nu mai exista.
           */
          const t = (s.last_totals ?? null) as
            { total?: number; written?: number; unchanged?: number } | null;
          if (s.last_status !== "ok") continue;
          const citite = Number(t?.total ?? 0);
          const atinse = Number(t?.written ?? 0) + Number(t?.unchanged ?? 0);
          if (citite === 0) mute.push(`„${s.name}" (fisierul n-a avut niciun rand)`);
          else if (atinse === 0) mute.push(`„${s.name}" (${citite} randuri citite, niciunul potrivit cu vreun produs)`);
        }
        return mute.length
          ? `feeduri de stoc care nu mai actualizeaza nimic: ${mute.join(", ")}`
            + ` — stocul ramane inghetat pe valorile vechi. Verifica antetele fisierului furnizorului.`
          : null;
      },
    },
    {
      nume: "feedurile Facebook segmentate au produse",
      ruleaza: async () => {
        /*
         * ⚠ PROBA SCRISA DUPA UN DEFECT CARE A TINUT DE LA LIVRARE.
         *
         * Feedurile segmentate (`?feed=<cheie>`) au iesit GOALE de cand au fost
         * livrate, la TOATE magazinele: `Number(null)` e ZERO, deci „fara limita
         * de pret" se citea ca „cel mult 0 lei" si taia orice produs cu pretul
         * peste zero. Raspunsul era RSS valid, cod 200, zero articole — adica
         * exact semnatura pentru care exista fisierul asta.
         *
         * S-a aflat abia cand un comerciant a incercat sa lege catalogul si Meta
         * i-a raspuns „furnizeaza cel putin 5 produse". Pana atunci, nimic: nici
         * `tsc`, nici probele (treceau doar numere adevarate, niciodata `null`),
         * nici build-ul, nici santinela — care cerea pagini, dar niciun feed.
         *
         * ⚠ Alarma se da doar cand feedul INTREG al aceluiasi magazin ARE produse.
         * Altfel un magazin fara marfa vandabila ar suna alarma la fiecare doua
         * ore pentru ceva ce nu e defect. „Segmentat gol, dar intreg plin" e chiar
         * semnatura defectului de mai sus.
         */
        /*
         * ⚠ Garda peste `magazineVii`. Proba asta nu foloseste `magazinProba`, deci
         * fara randul de mai jos o citire picata a magazinelor ii lasa lista de tinte goala
         * si o face sa iasa pe `return null` — adica sa RAPORTEZE TRECUT tocmai cand nu
         * poate sti nimic. E chiar purtarea pe care fisierul si-o interzice in alte trei
         * locuri („o santinela n-are voie sa devina mai iertatoare cand vede mai putin").
         */
        if (eroareMagazine) return eroareMagazine;
        const { data: setari, error: eSetari } = await admin
          .from("store_settings")
          .select("business_id, facebook_feeds")
          .not("facebook_feeds", "is", null);
        if (eSetari) return `citirea feedurilor a esuat: ${eSetari.message}`;

        const cuFeeduri = (setari ?? []).filter(
          (s) => Array.isArray(s.facebook_feeds) && s.facebook_feeds.length > 0,
        );
        /* Niciun feed configurat: n-avem ce verifica, si nu inventam. */
        if (cuFeeduri.length === 0) return null;

        /*
         * ⚠ Adresa se compune pe domeniul CANONIC al magazinului (`magazineVii`), nu
         * pe `edinio.com/{slug}`: `proxy.ts` raspunde oricum cu 307 catre domeniul
         * propriu, iar `.xml` nu e scutita. Si e bine sa fie asa — adresa canonica e
         * chiar cea pe care comerciantul o lipeste in Commerce Manager.
         *
         * Magazinele suspendate sau cu domeniul dovedit stricat nu intra deloc:
         * acolo defectul e cunoscut si are alt proprietar.
         */
        const deProbat: { slug: string; baza: string; cheie: string }[] = [];
        for (const s of cuFeeduri) {
          const m = viuDupaId.get(s.business_id as string);
          if (!m) continue;
          for (const f of s.facebook_feeds as { cheie?: unknown }[]) {
            const cheie = typeof f?.cheie === "string" ? f.cheie.trim() : "";
            if (cheie) deProbat.push({ slug: m.slug, baza: m.baza, cheie });
          }
        }
        if (deProbat.length === 0) return null;

        /*
         * Se probeaza cel mult cateva pe rulare, si se ROTESC. Fereastra se muta cu
         * fiecare rulare (la doua ore), deci peste zi le acopera pe toate. Ordinea e
         * stabila, ca fereastra sa inainteze cu adevarat.
         */
        deProbat.sort((a, b) => a.slug.localeCompare(b.slug) || a.cheie.localeCompare(b.cheie));
        const PE_RULARE = 6;
        const start = (Math.floor(Date.now() / 7_200_000) * PE_RULARE) % deProbat.length;
        const fereastra = Array.from(
          { length: Math.min(PE_RULARE, deProbat.length) },
          (_, i) => deProbat[(start + i) % deProbat.length],
        );

        /*
         * TREI cosuri, nu unul, si fiecare cu mesajul lui.
         *
         * Prima forma le amesteca, iar mesajul final spunea despre toate „feed
         * gol, desi catalogul intreg are produse" — inclusiv despre cele la care
         * catalogul intreg nu fusese cerut NICIODATA. Adica santinela, facuta
         * impotriva raspunsurilor care mint, mintea la randul ei si trimitea omul
         * sa caute in regulile feedului o pana de retea.
         */
        const goale: string[] = [];      // 200 cu zero articole, iar catalogul intreg ARE produse
        const nuRaspund: string[] = [];  // n-am primit 200: retea, domeniu, ruta
        const neverificate: string[] = []; // segmentat gol, dar martorul n-a putut fi citit

        /** Martorul: are magazinul produse in feedul INTREG? Cerut o data, la nevoie. */
        const martor = new Map<string, { cod: number; areProduse: boolean }>();

        for (const { slug: s, baza: b, cheie } of fereastra) {
          const { cod, cate } = await iaSiNumara(`${b}/facebook-catalog.xml?feed=${encodeURIComponent(cheie)}`, "<item>");
          /*
           * 404 ar insemna „cheia nu mai exista", desi tocmai am citit-o din baza:
           * o nepotrivire intre ce arata panoul si ce serveste ruta. 5xx sau 0
           * (timeout, TLS, DNS) sunt pene, nu feeduri goale. Toate merg in cosul
           * lor, cu codul in clar.
           */
          if (cod !== 200) { nuRaspund.push(`${s}/${cheie}: cod ${cod}`); continue; }
          if (cate > 0) continue;

          if (!martor.has(s)) {
            const intreg = await iaSiNumara(`${b}/facebook-catalog.xml`, "<item>");
            martor.set(s, { cod: intreg.cod, areProduse: intreg.cod === 200 && intreg.cate > 0 });
          }
          const m = martor.get(s)!;
          /*
           * ⚠ Martorul care NU raspunde nu inseamna „e in regula".
           *
           * Prima forma il trata la fel ca pe „magazin fara marfa" si arunca
           * tacut constatarea — deci un feed chiar gol trecea neobservat tocmai
           * cand magazinul avea si el o problema. O santinela n-are voie sa
           * devina mai iertatoare cand vede mai putin.
           */
          if (m.cod !== 200) neverificate.push(`${s}/${cheie} (martorul a dat ${m.cod})`);
          else if (m.areProduse) goale.push(`${s}/${cheie}`);
          /* altfel: magazinul chiar n-are produse vandabile — nu e defect de feed */
        }

        const parti: string[] = [];
        if (goale.length) {
          parti.push(
            `feeduri segmentate GOALE, desi catalogul intreg al magazinului are produse: ${goale.join(", ")}`
            + ` — Meta raspunde „furnizeaza cel putin 5 produse". Verifica regulile feedului in Integrari > Meta Catalog.`,
          );
        }
        if (nuRaspund.length) parti.push(`feeduri care nu raspund: ${nuRaspund.join(", ")}`);
        if (neverificate.length) parti.push(`feeduri goale pe care nu le-am putut confirma: ${neverificate.join(", ")}`);
        return parti.length ? parti.join(" | ") : null;
      },
    },
    {
      nume: "datele structurate poarta ce s-a completat in panou",
      ruleaza: async () => {
        /*
         * ⚠ PROBA PENTRU O CLASA INTREAGA DE DEFECT, nu pentru un camp anume.
         *
         * Tiparul: comerciantul completeaza un camp in panou, campul se salveaza
         * corect, si apoi NU ajunge nicaieri. Nimic nu cade, nimic nu se
         * logheaza — omul se uita pe pagina lui si vede ca lipseste, fara sa afle
         * de ce. Asa a fost cu EAN-ul care nu intra in feed, si asa a fost cu
         * adresa: blocul `Store` citea adresa DOAR din `businesses.store_city`,
         * desi ecranul „Datele magazinului" scrie in `address`/`city`/`county`.
         *
         * ⚠ CANDIDATUL SE IA DIN `magazineVii`. Cele 28 de alarme ale probei au
         * venit toate de la `fortis`, un magazin cu abonamentul stins: pagina lui
         * nu e vitrina, ci `<SuspendedStorePage>`, si n-are de unde sa aiba JSON-LD.
         * Filtrul de dinainte era doar `is_published`, iar 53 din 70 de magazine
         * publicate sunt suspendate.
         *
         * ⚠ Ordinea e FIXATA. Fara `.order()`, PostgREST intoarce ordinea de scanare
         * a tabelei, care se muta la orice `UPDATE`: tinta se plimba singura, si o
         * data cu ea si ce anume poate proba sa prinda, fiindca magazinele au
         * completate familii diferite de coloane.
         */
        /*
         * ⚠ Garda peste `magazineVii`. Proba asta nu foloseste `magazinProba`, deci
         * fara randul de mai jos o citire picata a magazinelor ii lasa lista de tinte goala
         * si o face sa iasa pe `return null` — adica sa RAPORTEZE TRECUT tocmai cand nu
         * poate sti nimic. E chiar purtarea pe care fisierul si-o interzice in alte trei
         * locuri („o santinela n-are voie sa devina mai iertatoare cand vede mai putin").
         */
        if (eroareMagazine) return eroareMagazine;
        const { data: cuAdresa, error } = await admin
          .from("businesses")
          .select("id, slug, store_address, store_city, store_county, address, city, county, email, phone")
          .eq("is_published", true)
          .not("slug", "is", null)
          .order("slug", { ascending: true })
          .limit(500);
        if (error) return `citirea magazinelor a esuat: ${error.message}`;

        const candidat = (cuAdresa ?? []).find(
          (b) => viuDupaId.has(b.id)
            && primulNegol(b.store_city, b.city)
            && primulNegol(b.store_address, b.address),
        );
        /* Niciun magazin viu cu adresa completata: n-avem ce compara, si nu inventam. */
        if (!candidat) return null;
        const m = viuDupaId.get(candidat.id)!;

        const { cod, text } = await ia(m.baza);
        if (cod !== 200) return `magazinul ${candidat.slug} raspunde cu ${cod}`;

        /*
         * `Store` SAU `OnlineStore`: tipul se alege dupa adresa. Candidatul de mai
         * sus are adresa completata, deci va fi `Store` — dar proba nu are de ce
         * sa depinda de asta, iar un magazin fara vitrina fizica e `OnlineStore`
         * si e la fel de corect. Vezi `magazinJsonLd`.
         */
        const store = noduriJsonLd(text)
          .find((d) => d["@type"] === "Store" || d["@type"] === "OnlineStore");
        if (!store) return `magazinul ${candidat.slug} n-are bloc JSON-LD de tip Store`;

        /*
         * ⚠ Se compara VALOAREA, nu doar prezenta cheii, si se acopera TOATE cele
         * cinci campuri pe care `identitate-publica.ts` le emite din panou.
         *
         * Forma dinainte cerea doar ca `addressLocality` sa fie adevarat, si nu se
         * uita deloc la judet si la telefon — desi amandoua se emit, si amandoua vin
         * din aceeasi pereche de familii de coloane. Chiar regresia din care s-a
         * nascut proba („se citea DOAR `businesses.store_city`"), aplicata judetului
         * in loc de orasului, ar fi trecut verde. Iar pe date reale familiile chiar
         * diverg: `sibiu` are `store_city='SIBIU'` si `city='Sat şElimbăR'`.
         *
         * Precedenta e aceeasi cu a lui `adresaPublica`: `primul(store_X, X)`.
         */
        const adresa = (store.address ?? {}) as Record<string, unknown>;
        const asteptate: { eticheta: string; vrem: string; avem: unknown }[] = [
          { eticheta: "strada", vrem: primulNegol(candidat.store_address, candidat.address), avem: adresa.streetAddress },
          { eticheta: "orasul", vrem: primulNegol(candidat.store_city, candidat.city), avem: adresa.addressLocality },
          { eticheta: "judetul", vrem: primulNegol(candidat.store_county, candidat.county), avem: adresa.addressRegion },
          { eticheta: "emailul", vrem: (candidat.email ?? "").trim(), avem: store.email },
          { eticheta: "telefonul", vrem: (candidat.phone ?? "").trim(), avem: store.telephone },
        ];

        const lipsa: string[] = [];
        const gresite: string[] = [];
        for (const c of asteptate) {
          if (!c.vrem) continue; // necompletat in panou: n-avem ce cere paginii
          const avem = typeof c.avem === "string" ? c.avem.trim() : "";
          if (!avem) lipsa.push(c.eticheta);
          else if (avem !== c.vrem) gresite.push(`${c.eticheta} („${avem}" in pagina, „${c.vrem}" in panou)`);
        }

        const parti: string[] = [];
        if (lipsa.length) parti.push(`lipsesc: ${lipsa.join(", ")}`);
        if (gresite.length) parti.push(`nu se potrivesc: ${gresite.join(", ")}`);
        return parti.length
          ? `magazinul ${candidat.slug} are datele completate in panou, dar in JSON-LD ${parti.join(" | ")}`
          : null;
      },
    },
    {
      nume: "fiecare fel de pagina publica poarta date structurate",
      ruleaza: async () => {
        /*
         * ⚠ PROBA PENTRU O CLASA INTREAGA, nu pentru o pagina anume.
         *
         * Pana la 15.08.2026, JSON-LD se emitea in TREI fisiere din toata
         * aplicatia. Paginile de categorie, catalogul, paginile proprii ale
         * comerciantilor (deci si blogurile si articolele lor) si paginile de
         * politici raspundeau 200 cu ZERO date structurate — desi toate au titlu
         * propriu, canonical propriu si intrare in sitemap, adica sunt trimise
         * ANUME la indexat.
         *
         * ═══ ADRESELE SE IAU DIN SITEMAP, NU SE SCRIU IN COD ═══
         *
         * Sitemapul magazinului listeaza exact adresele pe care le declaram
         * indexabile — si le filtreaza deja pe cele `noindex`. Deci ce apare
         * acolo TREBUIE sa poarte date structurate, iar proba nu se poate lega de
         * un slug care maine se schimba.
         *
         * ⚠ Ramurile „catalog" si „categorie" erau MOARTE. Magazinul de proba se
         * alegea dintre cele fara domeniu propriu, iar toate cele sapte magazine cu
         * pagina de catalog au domeniu propriu — deci sitemapul cerut n-avea nici
         * `/magazin`, nici vreo categorie, si cele doua verificari nu se executau
         * niciodata. Fix pe felurile de pagina din care s-a nascut proba. Alegerea
         * de mai sus prefera acum un magazin care CHIAR are pagina de catalog.
         *
         * ⚠ De pe 03.09.2026 sitemapul se cere de la `magazinCuSitemap`: doar
         * magazinele cu domeniu propriu mai au unul (pe platforma raspunde 410).
         * Fara niciun asemenea magazin, adresele din sitemap lipsesc, dar pagina
         * proprie de mai jos se verifica in continuare.
         */
        if (!magazinProba) return motivFaraMagazin;
        let locuri: string[] = [];
        let bazaSitemap = "";
        if (magazinCuSitemap) {
          const { cod, text } = await ia(`${magazinCuSitemap.baza}/sitemap.xml`);
          if (cod !== 200) return `sitemapul magazinului ${magazinCuSitemap.slug} (${magazinCuSitemap.baza}/sitemap.xml) raspunde cu ${cod}`;
          locuri = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
          bazaSitemap = magazinCuSitemap.baza;
        }

        const cale = (u: string) => u.slice(bazaSitemap.length);
        const categorie = locuri.find((u) => /^\/magazin\/[^/]+$/.test(cale(u)));
        const catalog = locuri.find((u) => cale(u) === "/magazin");
        const politica = locuri.find((u) => cale(u).startsWith("/politici/"));

        /*
         * Pagina proprie: se cauta in TOATA platforma, nu doar la magazinul de
         * proba — acela poate sa n-aiba niciuna, iar tocmai paginile proprii sunt
         * ce a reclamat comerciantul. Se prefera una marcata drept articol, ca sa
         * fie verificata si calea `BlogPosting`.
         *
         * ⚠ Doar din magazine VII, si fara embed: `businesses!inner(...)` aducea
         * si pagini ale magazinelor suspendate, unde ruta randeaza
         * `<SuspendedStorePage>` si n-are niciun JSON-LD. Doua din cele 26 de
         * candidate erau chiar asa — o alarma falsa care astepta o rescriere de rand.
         */
        const { data: paginiProprii, error: ePagini } = await admin
          .from("custom_pages")
          .select("slug, seo, business_id")
          .eq("is_published", true)
          .order("slug", { ascending: true })
          .limit(500);
        if (ePagini) return `citirea paginilor proprii a esuat: ${ePagini.message}`;
        type RandPagina = { slug: string; seo: { tip?: string; noindex?: boolean } | null; business_id: string };
        const candidate = ((paginiProprii ?? []) as unknown as RandPagina[])
          .filter((p) => p.seo?.noindex !== true && viuDupaId.has(p.business_id));
        const paginaProprie = candidate.find((p) => p.seo?.tip === "articol")
          ?? candidate.find((p) => p.seo?.tip === "lista-articole")
          ?? candidate[0];

        const deVerificat: { eticheta: string; url: string; tipuri: string[]; cuFirimituri: boolean }[] = [];
        if (catalog) deVerificat.push({ eticheta: "catalog", url: catalog, tipuri: ["CollectionPage"], cuFirimituri: true });
        if (categorie) deVerificat.push({ eticheta: "categorie", url: categorie, tipuri: ["CollectionPage"], cuFirimituri: true });
        if (politica) deVerificat.push({ eticheta: "politica", url: politica, tipuri: ["WebPage"], cuFirimituri: true });
        if (paginaProprie) {
          const b = viuDupaId.get(paginaProprie.business_id)!;
          deVerificat.push({
            eticheta: `pagina proprie (${paginaProprie.seo?.tip ?? "pagina"})`,
            url: `${b.baza}/${paginaProprie.slug}`,
            // Tipul depinde de ce a declarat comerciantul din editor; oricare
            // dintre ele inseamna „pagina se descrie". Absenta tuturor inseamna
            // ca emiterea s-a rupt.
            tipuri: ["WebPage", "CollectionPage", "ContactPage", "Blog", "BlogPosting"],
            cuFirimituri: true,
          });
        }
        /* Cu un sitemap citit si totusi nicio adresa: e un defect al sitemapului.
           Fara niciun magazin cu sitemap si fara pagini proprii: se spune de ce
           (`motivFaraSitemap`), sau e liniste adevarata. */
        if (deVerificat.length === 0) return magazinCuSitemap ? "sitemapul n-a dat nicio adresa de verificat" : motivFaraSitemap;

        const cazute: string[] = [];
        for (const v of deVerificat) {
          const r = await ia(v.url);
          if (r.cod !== 200) { cazute.push(`${v.eticheta}: ${v.url} raspunde cu ${r.cod}`); continue; }
          const noduri = noduriJsonLd(r.text);
          if (noduri.length === 0) { cazute.push(`${v.eticheta}: ${v.url} n-are NICIUN bloc JSON-LD`); continue; }
          if (!areTip(noduri, ...v.tipuri)) {
            cazute.push(`${v.eticheta}: ${v.url} n-are niciun nod ${v.tipuri.join("/")} (are: ${noduri.map((n) => n["@type"]).join(", ")})`);
          }
          if (v.cuFirimituri && !areTip(noduri, "BreadcrumbList")) {
            cazute.push(`${v.eticheta}: ${v.url} n-are BreadcrumbList`);
          }
        }
        return cazute.length ? cazute.join(" | ") : null;
      },
    },
  ];

  const rezultate: { nume: string; ok: boolean; motiv?: string }[] = [];
  for (const p of probe) {
    let motiv: string | null;
    try {
      motiv = await p.ruleaza();
    } catch (e) {
      motiv = e instanceof Error ? e.message : "proba a aruncat";
    }
    rezultate.push(motiv ? { nume: p.nume, ok: false, motiv } : { nume: p.nume, ok: true });
  }

  const cazute = rezultate.filter((r) => !r.ok);
  if (cazute.length > 0) {
    /*
     * `critical`, si intr-un SINGUR rand.
     *
     * Cate un rand pe proba ar fi umplut /admin/logs cu acelasi incident repetat
     * din ora in ora, iar cine se uita acolo ar fi invatat sa-l sara. Un rand cu
     * tot ce a cazut se citeste dintr-o privire.
     */
    await logError({
      action: "santinela",
      message: `${cazute.length} probe cazute: ${cazute.map((c) => c.nume).join(", ")}`,
      /*
       * ⚠ Cheia ramane `magazin`, nu numele variabilei. Cele 88 de randuri de dinainte
       * o poarta asa, iar orice interogare peste `details->>'magazin'` — inclusiv cea
       * care a dus la reparatia asta — s-ar fi oprit tacut la redenumire.
       */
      details: { magazin: slug, catalog: magazinProba?.catalog ?? null, cazute },
      severity: "critical",
    });
  }

  /*
   * ⚠ COD DE STARE ADEVARAT, nu 200 cu `ok: false`.
   *
   * Pana acum santinela raspundea 200 chiar cand toate probele cadeau. Un monitor
   * extern — sau chiar pagina de stare a Vercel — se uita la codul de stare, nu la
   * corpul JSON: ar fi vazut verde in timp ce inauntru scria ca magazinul nu
   * randeaza niciun produs.
   *
   * Adica santinela facuta impotriva raspunsurilor „200, dar continutul e gresit"
   * era ea insasi un raspuns 200 cu continutul gresit.
   */
  return NextResponse.json(
    { ok: cazute.length === 0, magazin: slug, catalog: magazinProba?.catalog ?? null, rezultate },
    { status: cazute.length === 0 ? 200 : 503 },
  );
}

/**
 * Toate preturile dintr-un nod `Product`/`ProductGroup`, in orice forma le-ar emite.
 *
 * ⚠ TREI forme, nu una. Forma dinainte citea doar `o.price`, si pe pagini corecte
 * dadea zero preturi:
 *
 *   * `Offer`         — `price`, produsul cu un singur pret;
 *   * `AggregateOffer` — `lowPrice`/`highPrice`, produsul cu variante de preturi
 *     diferite (verificat: `esafe.ro/product/jacheta-river-h1058` n-are deloc cheia
 *     `price`, ci `lowPrice: 110.2`);
 *   * `ProductGroup`  — n-are deloc `offers`, ci `hasVariant[]`, fiecare varianta
 *     cu `offers` al ei (`product-jsonld.ts`, ramura `caGrupDeVariante`).
 *
 * Fara asta, proba raporta „bloc Product, dar fara niciun pret" la primul produs cu
 * pret pe marime — o capcana armata care astepta doar ca proiectia sa mute randul.
 */
function preturiDinProdus(produs: Record<string, unknown>): number[] {
  const gasite: number[] = [];

  const dinOferte = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    const of = o as Record<string, unknown>;
    for (const cheie of ["price", "lowPrice", "highPrice"]) {
      const n = Number(of[cheie]);
      if (Number.isFinite(n) && n > 0) gasite.push(n);
    }
  };

  const oferte = produs.offers;
  if (Array.isArray(oferte)) oferte.forEach(dinOferte);
  else dinOferte(oferte);

  if (Array.isArray(produs.hasVariant)) {
    for (const v of produs.hasVariant as unknown[]) {
      if (!v || typeof v !== "object") continue;
      const o = (v as Record<string, unknown>).offers;
      if (Array.isArray(o)) o.forEach(dinOferte);
      else dinOferte(o);
    }
  }

  return gasite;
}
