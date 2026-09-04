import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { intrariPlatforma } from "@/app/sitemap";
import { toateArticolelePublicate } from "@/lib/blog/citire";
import {
  adreseDeAnuntat, adreseDisparute, cheia, corpCerere, ENDPOINT, esteReusita, explicaCod,
  MAXIM_PE_CERERE, MAXIM_SONDE, verdictSonda, type Anuntata,
} from "@/lib/indexnow";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  INDEXNOW: anuntam la Bing ce a aparut sau s-a schimbat pe edinio.com
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ SINGURA CALE DE TRIMITERE. Nu se anunta nimic din actiunile de server, si
  motivul e scris intreg in `src/lib/indexnow.ts`: `after()` n-ar fi prins
  articolele PROGRAMATE, ar fi anuntat CIORNELE, si un esec de acolo n-ar fi
  vazut de nimeni.

  ⚠ SE INTREABA SITEMAPUL, NU BAZA. Adresele vin din `intrariPlatforma()`, adica
  din chiar functia care hotaraste ce e indexabil pe platforma. O ciorna, un
  articol programat neajuns la scadenta, unul `noindex` sau unul cu
  `canonical_url` catre alt site nu sunt acolo — deci nu pot fi anuntate, si nu
  fiindca cineva si-a adus aminte sa le filtreze.

  ⚠ CE FACE. Adauga, actualizeaza, si de pe 04.09.2026 anunta si STERGERILE.
  Randul asta a spus pana azi „NU anunta stergerile", iar migratia lasa
  intrebarea deschisa: „ce inseamna «stearsa» pentru o adresa care lipseste
  temporar dintr-un sitemap construit din baza?". Raspunsul e acum in cod, si nu
  e o deducere, ci o masuratoare: absenta din sitemap e doar BANUIALA, iar
  adevarul se cere de la chiar adresa, cu un `HEAD`. Vezi nota de deasupra lui
  `adreseDisparute` din `lib/indexnow.ts` — acolo sta si de ce paza evidenta
  (un prag pe marimea sitemapului) ar fi fost cod mort.

  ⚠ CAT DE MULT ARE DE FACUT AZI: NIMIC. Masurat pe 04.09.2026, inainte de a
  scrie mecanismul: sitemapul are 439 de adrese, tabela are aceleasi 439, deci
  ZERO candidati. Nici macar cele noua `/industrii` retrase in aceeasi zi nu
  sunt acolo — tabela s-a umplut DUPA retragerea lor, deci n-au fost anuntate
  niciodata. Se scrie pentru urmatoarea retragere, nu pentru una de acum; iar
  cine masoara si nu gaseste nimic sa nu creada ca s-a stricat ceva.
*/

export const maxDuration = 60;

/** Cat asteptam raspunsul lui Bing. Peste, se reincearca la rularea urmatoare. */
const MS_CERERE = 10_000;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const k = cheia();
  if (!k) {
    /*
      Fara cheie, IndexNow e stins. Nu e o eroare: e starea unui mediu care n-a
      fost configurat, si o desfasurare noua trece prin ea. Se spune o data, ca
      `info`, ca sa nu para ca merge cand nu merge.
    */
    await logError({
      action: "indexnow.fara-cheie",
      message: "INDEXNOW_KEY lipseste sau nu e o cheie valida — nu se trimite nimic.",
      severity: "info",
    });
    return NextResponse.json({ stins: true });
  }

  const supabase = createAdminClient();

  /* Ce spune sitemapul ACUM. Aceeasi functie care serveste /sitemap.xml. */
  const articole = await toateArticolelePublicate();
  const dinSitemap = intrariPlatforma(articole);

  /*
    Ce am anuntat pana acum.

    ⚠ SE CITESTE IN FELII, SI NU E O PRECAUTIE — e reparatia unui defect care ar
    fi lovit sigur. Aici statea `.select(...).limit(5000)`, iar PostgREST taie
    TACIT la propriul lui plafon de 1000 de randuri: de la al 1001-lea, restul
    adreselor ar fi lipsit din `stiute`, `adreseDeAnuntat` le-ar fi socotit NOI
    si le-ar fi retrimis la fiecare rulare, la nesfarsit — chiar drumul catre
    429 impotriva caruia exista tabela. Randurile nu se sterg niciodata, deci
    pragul nu era ipotetic, doar amanat: azi sunt 439.

    ⚠ Iar alarma gandita pentru exact acest caz (`deja.length >= 5000`) era COD
    MORT: lungimea nu putea trece de 1000. O paza care nu se poate aprinde e mai
    rea decat niciuna, fiindca linisteste.

    ⚠ CU `order`, nu fara. Fara o ordonare stabila, feliile se pot suprapune sau
    sari randuri intre ele — aceeasi capcana ca la orice paginare pe o multime
    care se schimba. `url` e cheia primara, deci ordinea e totala si stabila.
  */
  const PE_FELIE = 1000;
  const deja: Anuntata[] = [];
  for (let de_la = 0; ; de_la += PE_FELIE) {
    const { data, error } = await supabase
      .from("indexnow_trimise")
      .select("url, lastmod")
      .order("url", { ascending: true })
      .range(de_la, de_la + PE_FELIE - 1);
    if (error) {
      await logError({
        action: "indexnow.citire",
        message: `Nu pot citi ce s-a anuntat deja: ${error.message}`,
        details: { de_la },
        severity: "error",
      });
      return NextResponse.json({ error: "citire" }, { status: 500 });
    }
    const felie = (data ?? []) as Anuntata[];
    deja.push(...felie);
    if (felie.length < PE_FELIE) break;
    /* Plasa impotriva unei bucle fara sfarsit, daca vreodata `range` inceteaza
       sa mai avanseze. 200 de felii = 200.000 de adrese, mult peste orice. */
    if (deja.length > 200 * PE_FELIE) {
      await logError({
        action: "indexnow.felii",
        message: `Citirea a trecut de ${deja.length} de randuri fara sa se termine — ma opresc.`,
        severity: "error",
      });
      break;
    }
  }

  const deTrimis = adreseDeAnuntat(dinSitemap, deja);

  /*
    ═══ ADRESELE CARE AU DISPARUT DIN SITEMAP ═══

    Bănuiala e absența; adevărul se cere de la chiar adresa. Motivul întreg —
    inclusiv de ce un prag pe marimea sitemapului ar fi INERT aici — e in nota
    de deasupra lui `adreseDisparute` din `lib/indexnow.ts`.

    ⚠ `HEAD`, SI E MASURAT, NU PRESUPUS. Documentatia lui Next spune doar ca o
    metoda nesuportata primeste `405`; nu promite nicaieri ca `HEAD` se deduce
    din `GET`. Masurat in productie pe 04.09.2026, inainte de a scrie randul:
    `HEAD /industrii` -> 410 (ruta exporta doar `GET`), `HEAD /preturi` -> 200,
    `HEAD /o-adresa-inexistenta` -> 404. Deci merge, si costa cat un antet.

    ⚠ `redirect: "manual"`, ca o adresa mutata sa se vada ca `3xx` si sa fie
    socotita VIE. Urmarite, redirectarile ar fi ascuns mutarea sub codul tintei.
  */
  const disparute = adreseDisparute(dinSitemap, deja);
  const sterse: string[] = [];
  const deUitat: string[] = [];
  for (const url of disparute.slice(0, MAXIM_SONDE)) {
    let codSonda = 0;
    try {
      const r = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(MS_CERERE),
      });
      codSonda = r.status;
    } catch {
      /* Retea cazuta sau timp expirat: „nu stiu". Randul ramane, se reincearca. */
      codSonda = 0;
    }
    const v = verdictSonda(codSonda);
    if (v === "disparuta") sterse.push(url);
    else if (v === "vie") deUitat.push(url);
  }

  /*
    ⚠ UITAREA SE FACE CHIAR DACA TRIMITEREA PICA, si e intentionat: adresele
    astea nu se anunta, deci n-au nimic de asteptat de la Bing. Lasate, ar fi
    resondate la fiecare ora, la nesfarsit — chiar coada blocata pe care nota
    din `lib/indexnow.ts` o descrie.
  */
  if (deUitat.length > 0) {
    const { error: eUitare } = await supabase
      .from("indexnow_trimise")
      .delete()
      .in("url", deUitat);
    if (eUitare) {
      await logError({
        action: "indexnow.uitare",
        message: `Nu pot uita ${deUitat.length} adrese vii iesite din sitemap: ${eUitare.message}`,
        details: { prima: deUitat[0] },
        severity: "warning",
      });
    }
  }

  if (disparute.length > MAXIM_SONDE) {
    /* Nu e o eroare — e ritmul. Se spune ca sa nu para ca s-a terminat. */
    await logError({
      action: "indexnow.sonde",
      message: `${disparute.length} adrese lipsesc din sitemap; am sondat ${MAXIM_SONDE} in rularea asta.`,
      severity: "info",
    });
  }

  if (deTrimis.length === 0 && sterse.length === 0) {
    return NextResponse.json({ trimise: 0, uitate: deUitat.length });
  }

  /*
    Un singur lot pe rulare: `MAXIM_PE_CERERE` = 100 adrese, desi protocolul
    ingaduie 10.000. Graba ar insemna mai multe cereri intr-o secunda, adica
    drumul catre 429.

    ⚠ CRONUL SE INTOARCE PESTE O ORA, nu „peste cateva minute" cum scria pana
    azi — `vercel.json` il programeaza din ora in ora, la minutul 23. O revizie
    a prins randul. Deosebirea conteaza fiindca ea da viteza de golire: la
    100 pe ora, o coada de 1.000 de adrese se scurge in ~10 ore, nu in ~10
    minute. E indeajuns pentru un site care creste cu cateva pagini pe zi, si de
    stiut daca vreodata se publica un val mare deodata.
  */
  /*
    ⚠ STERGERILE INTRA PRIMELE IN LOT, si e o alegere. Sunt cel mult zece (cate
    sonde), pe cand adaugarile pot fi sute; puse la coada, o coada lunga de
    adaugari le-ar fi amanat ore intregi. Protocolul nu deosebeste oricum
    intre ele — o adresa trimisa inseamna „uita-te din nou aici".
  */
  const lot = [...sterse, ...deTrimis].slice(0, MAXIM_PE_CERERE);
  const trimiseAcum = new Set(lot);

  let cod = 0;
  let eroare: string | null = null;
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(corpCerere(lot, k)),
      signal: AbortSignal.timeout(MS_CERERE),
    });
    cod = r.status;
    if (!esteReusita(cod)) eroare = `${cod}: ${explicaCod(cod)}`;
  } catch (e) {
    eroare = e instanceof Error ? e.message : String(e);
  }

  if (eroare) {
    /*
      ⚠ NU SE SCRIE NIMIC IN TABELA LA ESEC. Adresa ramane „neanuntata", deci
      rularea urmatoare o ia de la capat. Marcata ca trimisa, ar fi fost pierduta
      pentru totdeauna — si tocmai despre asta e vorba aici.
    */
    await logError({
      action: "indexnow.trimitere",
      message: `Trimiterea a esuat: ${eroare}`,
      details: { cate: lot.length, cod, prima: lot[0] },
      /* `429` si `403` inseamna ca ceva e stricat la noi (ritm sau cheie), nu o
         pana trecatoare a retelei. */
      severity: cod === 429 || cod === 403 ? "error" : "warning",
    });
    return NextResponse.json({ trimise: 0, cod, eroare }, { status: 200 });
  }

  /*
    Reusit. Dar cele doua feluri de adrese din lot se insemneaza PE DOS unul
    fata de celalalt:

      - o ADAUGARE se scrie in tabela, ca sa nu se mai trimita;
      - o STERGERE se STERGE din tabela, fiindca tocmai am terminat cu ea.

    ⚠ SI E DEOSEBIREA CARE FACE MECANISMUL SA SE TERMINE. Scrise la fel, cele
    anuntate ca disparute ar fi ramas in tabela, ar fi lipsit si maine din
    sitemap, deci ar fi fost sondate si anuntate din nou — in fiecare ora, la
    nesfarsit. Chiar retrimiterea impotriva careia exista tabela.

    ⚠ Iar stergerea randului are si un al doilea inteles, bun: daca adresa
    invie candva, `adreseDeAnuntat` n-o mai gaseste in `stiute` si o trateaza ca
    NOUA. Pastrat, randul ar fi facut invierea invizibila — `lastmod` neschimbat
    inseamna „nimic de anuntat".
  */
  const acum = new Date().toISOString();
  const dateDupaUrl = new Map(
    dinSitemap.map((i) => [
      i.url,
      i.lastModified ? new Date(i.lastModified).toISOString() : null,
    ]),
  );
  const eSteargere = new Set(sterse);
  const adaugari = lot.filter((url) => !eSteargere.has(url));

  const anuntateCaDisparute = sterse.filter((url) => trimiseAcum.has(url));
  if (anuntateCaDisparute.length > 0) {
    const { error: eSters } = await supabase
      .from("indexnow_trimise")
      .delete()
      .in("url", anuntateCaDisparute);
    if (eSters) {
      /* Anuntata, dar nestearsa: rularea urmatoare o va anunta din nou. O data
         nu strica; repetat, e chiar drumul catre 429 — deci se striga. */
      await logError({
        action: "indexnow.stergere",
        message: `Am anuntat ${anuntateCaDisparute.length} adrese disparute, dar nu le-am putut scoate din tabela: ${eSters.message}`,
        details: { prima: anuntateCaDisparute[0] },
        severity: "error",
      });
    }
  }

  if (adaugari.length === 0) {
    return NextResponse.json({
      trimise: lot.length, disparute: anuntateCaDisparute.length, uitate: deUitat.length, cod,
    });
  }

  const { error: eScriere } = await supabase.from("indexnow_trimise").upsert(
    adaugari.map((url) => ({
      url,
      lastmod: dateDupaUrl.get(url) ?? null,
      trimis_la: acum,
      cod,
      ultima_eroare: null,
    })),
    { onConflict: "url" },
  );
  if (eScriere) {
    /*
      Trimis, dar neinsemnat. Urmarea e o retrimitere la rularea urmatoare — mai
      buna decat alternativa (sa credem ca am trimis cand n-am facut-o), dar
      merita stiuta: repetata, duce la 429.
    */
    await logError({
      action: "indexnow.insemnare",
      message: `Am trimis ${lot.length} adrese, dar nu le-am putut insemna: ${eScriere.message}`,
      severity: "error",
    });
  }

  return NextResponse.json({
    trimise: lot.length,
    adaugate: adaugari.length,
    disparute: anuntateCaDisparute.length,
    uitate: deUitat.length,
    ramase: Math.max(0, deTrimis.length - adaugari.length),
    cod,
  });
}
