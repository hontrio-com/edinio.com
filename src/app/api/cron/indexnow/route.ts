import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { intrariPlatforma } from "@/app/sitemap";
import { toateArticolelePublicate } from "@/lib/blog/citire";
import {
  adreseDeAnuntat, cheia, corpCerere, ENDPOINT, esteReusita, explicaCod, MAXIM_PE_CERERE,
  type Anuntata,
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

  ⚠ CE FACE SI CE NU FACE. Adauga si actualizeaza. NU anunta stergerile: o
  adresa iesita din sitemap ramane marcata ca anuntata si nu se mai trimite.
  Motoarele o afla din 404 sau 410 la urmatoarea trecere. Vezi nota din migratie.
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

  /* Ce am anuntat pana acum. Tabela e mica (cate un rand pe adresa), deci se
     citeste intreaga; daca vreodata creste peste plafonul tacut al lui PostgREST,
     verificarea de mai jos o spune in loc s-o ascunda. */
  const { data: dejaBrut, error } = await supabase
    .from("indexnow_trimise")
    .select("url, lastmod")
    .limit(5000);
  if (error) {
    await logError({
      action: "indexnow.citire",
      message: `Nu pot citi ce s-a anuntat deja: ${error.message}`,
      severity: "error",
    });
    return NextResponse.json({ error: "citire" }, { status: 500 });
  }
  const deja = (dejaBrut ?? []) as Anuntata[];
  if (deja.length >= 5000) {
    await logError({
      action: "indexnow.plafon",
      message: "Tabela `indexnow_trimise` a atins plafonul de citire (5000). " +
        "Se citeste in felii sau se curata, altfel adrese vechi par neanuntate si se retrimit.",
      severity: "warning",
    });
  }

  const deTrimis = adreseDeAnuntat(dinSitemap, deja);
  if (deTrimis.length === 0) return NextResponse.json({ trimise: 0 });

  /* Un singur lot pe rulare. Cronul se intoarce peste cateva minute; graba ar
     insemna mai multe cereri intr-o secunda, adica drumul catre 429. */
  const lot = deTrimis.slice(0, MAXIM_PE_CERERE);

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

  /* Reusit: se scrie ce s-a trimis, cu data cu care a fost trimis. */
  const acum = new Date().toISOString();
  const dateDupaUrl = new Map(
    dinSitemap.map((i) => [
      i.url,
      i.lastModified ? new Date(i.lastModified).toISOString() : null,
    ]),
  );
  const { error: eScriere } = await supabase.from("indexnow_trimise").upsert(
    lot.map((url) => ({
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

  return NextResponse.json({ trimise: lot.length, ramase: deTrimis.length - lot.length, cod });
}
