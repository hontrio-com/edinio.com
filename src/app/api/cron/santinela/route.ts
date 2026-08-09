import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { logError } from "@/lib/error-logger";
import { PLATFORM_ORIGIN } from "@/lib/seo";

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
 * ═══ REGULA CARE FACE SANTINELA UTILA ═══
 *
 * Fiecare proba trebuie sa poata ESUA. O proba care verifica doar codul HTTP e
 * chiar greseala care a lasat cele patru defecte in viata: toate raspundeau 200.
 */

/** Cat asteptam o pagina. Peste atat, e o defectiune indiferent de continut. */
const TIMP_MAX_MS = 20_000;

interface Proba {
  nume: string;
  /** `null` = a trecut. Un sir = ce anume nu e in regula, in cuvinte. */
  ruleaza: () => Promise<string | null>;
}

async function ia(url: string): Promise<{ cod: number; text: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMP_MAX_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "edinio-santinela" }, cache: "no-store" });
    return { cod: r.status, text: await r.text() };
  } catch (e) {
    return { cod: 0, text: e instanceof Error ? e.message : "cerere esuata" };
  } finally {
    clearTimeout(t);
  }
}

const numara = (text: string, tipar: RegExp) => (text.match(tipar) ?? []).length;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  /*
   * Magazinul de proba se ALEGE din baza, nu se scrie in cod.
   *
   * Un slug fixat aici ar fi facut santinela sa tipe in ziua in care magazinul
   * ala isi conecteaza un domeniu sau se depublica — adica alarma falsa, care e
   * cel mai sigur mod de a face pe cineva sa opreasca alarma.
   *
   * Se alege cel mai mare magazin de pe palierul server: acolo traiesc si
   * paginarea in SQL, si cautarea, deci o singura pagina acopera amandoua.
   */
  const { data: rezumate } = await admin
    .from("catalog_rezumat")
    .select("business_id, total")
    .eq("fara_imagini", false).eq("fara_stoc_ascuns", false)
    .order("total", { ascending: false }).limit(5);
  const idCandidati = ((rezumate ?? []) as { business_id: string; total: number }[]).map((r) => r.business_id);
  const { data: magazine } = await admin
    .from("businesses").select("slug, custom_domain")
    .in("id", idCandidati.length ? idCandidati : ["00000000-0000-0000-0000-000000000000"])
    .eq("is_published", true).is("custom_domain", null);
  const slug = ((magazine ?? [])[0] as { slug: string } | undefined)?.slug ?? null;
  const baza = slug ? `${PLATFORM_ORIGIN}/${slug}` : null;

  const probe: Proba[] = [
    {
      nume: "sitemap-index are magazine",
      ruleaza: async () => {
        const { cod, text } = await ia(`${PLATFORM_ORIGIN}/sitemap-magazine.xml`);
        if (cod !== 200) return `cod ${cod}`;
        const n = numara(text, /<sitemap>/g);
        // Zero inseamna ori interogare picata, ori filtru prea strans. Ambele au
        // acelasi efect: niciun produs al platformei nu mai ajunge la indexare.
        return n === 0 ? "index gol: niciun magazin" : null;
      },
    },
    {
      nume: "sitemap de magazin are produse",
      ruleaza: async () => {
        if (!baza) return "niciun magazin de proba";
        const { cod, text } = await ia(`${baza}/sitemap.xml`);
        if (cod !== 200) return `cod ${cod}`;
        const n = numara(text, /\/product\//g);
        return n === 0 ? "sitemapul magazinului n-are niciun produs" : null;
      },
    },
    {
      nume: "catalogul randeaza carduri",
      ruleaza: async () => {
        if (!baza) return "niciun magazin de proba";
        const { cod, text } = await ia(`${baza}/magazin`);
        if (cod !== 200) return `cod ${cod}`;
        const n = numara(text, /href="[^"]*\/product\//g);
        // Exact defectul „0 din 1049 produse": pagina raspunde, contorul arata
        // numarul intreg, si grila e goala.
        return n === 0 ? "pagina de catalog n-a randat niciun card" : null;
      },
    },
    {
      nume: "paginarea da ALTE produse",
      ruleaza: async () => {
        if (!baza) return "niciun magazin de proba";
        const [unu, doi] = await Promise.all([ia(`${baza}/magazin`), ia(`${baza}/magazin?page=2`)]);
        if (unu.cod !== 200 || doi.cod !== 200) return `coduri ${unu.cod}/${doi.cod}`;
        const ids = (t: string) => [...new Set((t.match(/href="[^"]*\/product\/([^"?#]+)"/g) ?? []))];
        const a = ids(unu.text), b = ids(doi.text);
        if (b.length === 0) return "pagina 2 e goala";
        /*
         * Doua pagini cu ACELEASI produse inseamna ca felierea nu se aplica —
         * chiar defectul din A3, unde `?page=2` randa neschimbat primele 20.
         * Contoarele aratau corect si atunci.
         */
        return JSON.stringify(a) === JSON.stringify(b) ? "pagina 2 arata aceleasi produse ca pagina 1" : null;
      },
    },
    {
      nume: "cautarea intoarce rezultate",
      ruleaza: async () => {
        if (!baza) return "niciun magazin de proba";
        /*
         * Termenul se ia din chiar vocabularul magazinului, nu e inventat: un
         * cuvant scris de mana ar fi putut sa nu existe in catalog, si atunci
         * „zero rezultate" ar fi fost raspunsul CORECT — o alarma care nu poate
         * distinge intre defect si adevar nu ajuta pe nimeni.
         */
        const { data: cuv } = await admin
          .from("catalog_cuvant").select("cuvant, cate")
          .in("business_id", idCandidati.length ? idCandidati : ["00000000-0000-0000-0000-000000000000"])
          .order("cate", { ascending: false }).limit(1);
        const termen = ((cuv ?? [])[0] as { cuvant: string } | undefined)?.cuvant;
        if (!termen) return "magazinul n-are vocabular de cautare";
        const { cod, text } = await ia(`${baza}/magazin?q=${encodeURIComponent(termen)}`);
        if (cod !== 200) return `cod ${cod}`;
        const n = numara(text, /href="[^"]*\/product\//g);
        return n === 0 ? `cautarea dupa „${termen}" (cel mai frecvent cuvant al magazinului) n-a gasit nimic` : null;
      },
    },
    {
      nume: "ciclul stocului si cursa pe marime",
      ruleaza: async () => {
        /*
         * Singura proba care VERIFICA O SCRIERE, nu o citire.
         *
         * Celelalte cinci cer pagini si numara ce iese. Asta cheama `proba_stoc()`,
         * care isi face un produs cu doua marimi si o comanda, le trece prin tot
         * ciclul — revendicare, refuz pe marimea epuizata, anulare, reactivare — si
         * ANULEAZA TRANZACTIA la final. Nimic nu ramane in baza; verificat.
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
         */
        const { data, error } = await admin.rpc("proba_stoc" as never, {} as never);
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
      nume: "cozile nu sunt blocate",
      ruleaza: async () => {
        /*
         * O coada care creste inseamna ca un cron nu-si face treaba — exact ce s-a
         * intamplat cu vocabularul, care esua tacut de patru zile. Pragul e mare
         * DELIBERAT: un import mare umple legitim coada de proiectie pentru cateva
         * minute, si o alarma la fiecare import ar fi zgomot.
         */
        const [pr, rez, cuv] = await Promise.all([
          admin.from("catalog_murdar").select("product_id", { count: "exact", head: true }),
          admin.from("catalog_rezumat_murdar").select("business_id", { count: "exact", head: true }),
          admin.from("catalog_cuvinte_murdar").select("business_id", { count: "exact", head: true }),
        ]);
        /*
         * `error` VERIFICAT, nu doar `count`.
         *
         * La o citire picata, `count` e `null`, iar `?? 0` il preface in zero —
         * adica „cozile sunt goale", adica sanatos. Santinela ar fi raportat verde
         * tocmai cand baza nu raspunde. O santinela trebuie sa fie mai stricta
         * decat sistemul pe care il verifica, nu mai iertatoare.
         */
        for (const [nume, r] of [["proiectie", pr], ["rezumat", rez], ["vocabular", cuv]] as const) {
          if (r.error) return `citirea cozii ${nume} a esuat: ${r.error.message}`;
        }
        const vechi: string[] = [];
        if ((pr.count ?? 0) > 5000) vechi.push(`proiectie ${pr.count}`);
        if ((rez.count ?? 0) > 200) vechi.push(`rezumat ${rez.count}`);
        if ((cuv.count ?? 0) > 200) vechi.push(`vocabular ${cuv.count}`);
        return vechi.length ? `cozi in crestere: ${vechi.join(", ")}` : null;
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
      details: { magazin: slug, cazute },
      severity: "critical",
    });
  }

  /*
   * ⚠ COD DE STARE ADEVARAT, nu 200 cu `ok: false`.
   *
   * Pana acum santinela raspundea 200 chiar cand toate cele sapte probe cadeau.
   * Un monitor extern — sau chiar pagina de stare a Vercel — se uita la codul de
   * stare, nu la corpul JSON: ar fi vazut verde in timp ce inauntru scria ca
   * magazinul nu randeaza niciun produs.
   *
   * Adica santinela facuta impotriva raspunsurilor „200, dar continutul e gresit"
   * era ea insasi un raspuns 200 cu continutul gresit.
   */
  return NextResponse.json(
    { ok: cazute.length === 0, magazin: slug, rezultate },
    { status: cazute.length === 0 ? 200 : 503 },
  );
}
