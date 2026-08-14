import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
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
         * ore pentru ceva ce nu e defect — iar o alarma falsa e cel mai sigur mod
         * de a face pe cineva sa opreasca alarma. „Segmentat gol, dar intreg
         * plin" e chiar semnatura defectului de mai sus.
         */
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

        const { data: mag, error: eMag } = await admin
          .from("businesses")
          .select("id, slug, custom_domain, custom_domain_healthy")
          .in("id", cuFeeduri.map((s) => s.business_id as string))
          .eq("is_published", true)
          .not("slug", "is", null);
        if (eMag) return `citirea magazinelor a esuat: ${eMag.message}`;

        /*
         * ⚠ Adresa se compune pe domeniul CANONIC al magazinului, nu pe
         * `edinio.com/{slug}`.
         *
         * Prima forma cerea mereu adresa de platforma, „ca sa nu masuram DNS-ul
         * cuiva". Era o iluzie: `proxy.ts` raspunde cu 307 catre domeniul propriu
         * pentru orice cale a unui magazin care are unul, iar `.xml` nu e scutita
         * — deci cererea ajungea acolo oricum, doar ca prin doua salturi. Adica
         * exact ce credeam ca evit, plus o afirmatie falsa in comentariu.
         *
         * Si e bine sa fie asa: adresa canonica e chiar cea pe care comerciantul
         * o lipeste in Commerce Manager. Daca ea nu raspunde, nici Meta nu poate
         * citi feedul — doar ca atunci se raporteaza ALTCEVA decat „feed gol"
         * (vezi cele doua cosuri de mai jos).
         *
         * Magazinele cu domeniul dovedit stricat se sar: acolo defectul e
         * cunoscut si are alt proprietar, iar o alarma din doua in doua ore
         * despre acelasi certificat expirat e chiar felul in care o alarma
         * ajunge sa fie ignorata.
         */
        const bazaDupaId = new Map<string, string>();
        for (const b of mag ?? []) {
          const dom = (b.custom_domain ?? "").trim();
          if (dom && b.custom_domain_healthy === false) continue;
          bazaDupaId.set(b.id, dom ? `https://${dom}` : `${PLATFORM_ORIGIN}/${b.slug}`);
        }

        const deProbat: { slug: string; baza: string; cheie: string }[] = [];
        for (const s of cuFeeduri) {
          const b = bazaDupaId.get(s.business_id as string);
          if (!b) continue; // nepublicat (feedul da 404 dinadins) sau domeniu stricat
          const slugMagazin = (mag ?? []).find((x) => x.id === s.business_id)?.slug as string;
          for (const f of s.facebook_feeds as { cheie?: unknown }[]) {
            const cheie = typeof f?.cheie === "string" ? f.cheie.trim() : "";
            if (cheie) deProbat.push({ slug: slugMagazin, baza: b, cheie });
          }
        }
        if (deProbat.length === 0) return null;

        /*
         * Se probeaza cel mult cateva pe rulare, si se ROTESC.
         *
         * Un feed poate avea megaocteti, iar santinela ruleaza intr-o functie cu
         * memorie marginita — dar un plafon fix ar fi lasat mereu aceleasi feeduri
         * neverificate. Fereastra se muta cu fiecare rulare (la doua ore), deci
         * peste zi le acopera pe toate. Ordinea e stabila, ca fereastra sa
         * inainteze cu adevarat.
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
          const { cod, text } = await ia(`${b}/facebook-catalog.xml?feed=${encodeURIComponent(cheie)}`);
          /*
           * 404 ar insemna „cheia nu mai exista", desi tocmai am citit-o din baza:
           * o nepotrivire intre ce arata panoul si ce serveste ruta. 5xx sau 0
           * (timeout, TLS, DNS) sunt pene, nu feeduri goale. Toate merg in cosul
           * lor, cu codul in clar.
           */
          if (cod !== 200) { nuRaspund.push(`${s}/${cheie}: cod ${cod}`); continue; }
          if (numara(text, /<item>/g) > 0) continue;

          if (!martor.has(s)) {
            const intreg = await ia(`${b}/facebook-catalog.xml`);
            martor.set(s, { cod: intreg.cod, areProduse: intreg.cod === 200 && numara(intreg.text, /<item>/g) > 0 });
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
         * Trei magazine publicate aveau adresa completata si invizibila, iar
         * emailul nu se emitea la niciunul din cele 29 care il aveau.
         *
         * Nici `tsc`, nici probele, nici build-ul n-aveau cum: pagina exista,
         * compileaza si raspunde 200. Singurul lucru care prinde asa ceva e sa
         * CERI pagina si sa compari cu ce scrie in baza.
         *
         * ⚠ Proba se alege un magazin care CHIAR are datele completate. Fara asta
         * ar trece linistita pe un magazin gol — adica exact o proba care nu poate
         * esua.
         */
        const { data: cuAdresa, error } = await admin
          .from("businesses")
          .select("slug, store_address, store_city, store_county, address, city, county, email")
          .eq("is_published", true)
          .not("slug", "is", null)
          .limit(200);
        if (error) return `citirea magazinelor a esuat: ${error.message}`;

        const primul = (...v: (string | null | undefined)[]) =>
          v.map((x) => (x ?? "").trim()).find(Boolean) ?? "";
        const candidat = (cuAdresa ?? []).find(
          (b) => primul(b.store_city, b.city) && primul(b.store_address, b.address),
        );
        /* Niciun magazin cu adresa completata: n-avem ce compara, si nu inventam. */
        if (!candidat) return null;

        const { cod, text } = await ia(`${PLATFORM_ORIGIN}/${candidat.slug}`);
        if (cod !== 200) return `magazinul ${candidat.slug} raspunde cu ${cod}`;

        /* `[\s\S]` in loc de steagul `s`: tinta de compilare a proiectului nu-l accepta. */
        const blocuri = text.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) ?? [];
        const store = blocuri
          .map((b) => b.replace(/^[^>]*>/, "").replace(/<\/script>$/, ""))
          .map((b) => { try { return JSON.parse(b) as Record<string, unknown>; } catch { return null; } })
          .find((d) => d && d["@type"] === "Store");
        if (!store) return `magazinul ${candidat.slug} n-are bloc JSON-LD de tip Store`;

        const lipsa: string[] = [];
        const adresa = store.address as Record<string, string> | undefined;
        const oras = primul(candidat.store_city, candidat.city);
        const strada = primul(candidat.store_address, candidat.address);
        if (!adresa) lipsa.push("adresa lipseste cu totul");
        else {
          if (oras && !adresa.addressLocality) lipsa.push("orasul");
          if (strada && !adresa.streetAddress) lipsa.push("strada");
        }
        if ((candidat.email ?? "").trim() && !store.email) lipsa.push("emailul");

        return lipsa.length
          ? `magazinul ${candidat.slug} are datele completate in panou, dar in JSON-LD lipsesc: ${lipsa.join(", ")}`
          : null;
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
