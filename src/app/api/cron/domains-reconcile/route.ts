import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDomainStatus, addDomainToVercel, sanatateDomeniu, type DomainStatus } from "@/lib/vercel";
import {
  sendBrokenDomainsToAdmin,
  sendBrokenDomainToOwner,
  type DomeniuStricat,
  type DomeniuNeverificat,
} from "@/lib/email";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { logError } from "@/lib/error-logger";

// Plasa de siguranta pentru domeniile custom.
//
// Pe 2026-08-07, `atelierullarisei.ro` a stat doua zile complet cazut — nici
// site, nici email — pentru ca domeniul fusese atasat proiectului Vercel dar
// nu inregistrat in cont, deci fara zona DNS. Nameserverele Vercel raspundeau
// REFUSED, iar in Edinio scria linistit „Domeniu conectat". Nimeni nu avea de
// unde sa afle: nimic din produs nu compara ce zice baza noastra cu ce are
// Vercel de fapt.
//
// Cronul asta face exact comparatia aia, din ora in ora, pentru toate
// magazinele. Repara singur DOAR ce se poate repara adaugand: atasarea la
// proiect si geamanul www. Totul e idempotent, nimic nu e distructiv.
//
// ═══ CE S-A SCHIMBAT PE 10.08.2026, SI DE CE ═══
//
// eSafe (esafe.ro) a stat o zi intreaga inaccesibil, iar cronul asta l-a vazut
// din ora in ora si l-a clasificat de fiecare data drept „waitingForNameservers",
// adica „asteptam clientul" — o categorie care prin proiectare NU alerteaza si NU
// repara. Confirmat din logurile de productie la 06:23, 07:23 si 08:23.
//
// Cauza: categoria aia amesteca doua situatii care nu au nimic in comun.
//   (a) clientul nu si-a schimbat inca DNS-ul la registrar. Nu e defectiunea
//       noastra, nu avem ce repara, si e corect sa tacem (asa sunt okai.ro si
//       alexshop.ro chiar acum).
//   (b) clientul a facut TOT — nameserverele lui arata deja catre Vercel — si NOI
//       n-am terminat configurarea. Atunci domeniul e cazut complet, si site si
//       email, iar vinovatia e a noastra. Asta era eSafe.
// Din afara arata identic: `misconfigured` fara nimic altceva. Se deosebesc doar
// prin semnalele de teren: `delegated` (si-a mutat nameserverele la noi) si
// `dnsRaspunde` (raspunde cineva pentru domeniu, da sau nu).
//
// A doua schimbare: o CITIRE PICATA nu mai are voie sa treaca drept „asteptam
// clientul". Verdictele din `DomainStatus` sunt acum `true | false | null`, iar
// `null` inseamna „nu stiu", niciodata „e rau" si niciodata „e bine". Ce nu s-a
// putut citi ajunge intr-o categorie separata, `neverificate`, care se vede si in
// `/admin/logs` si in emailul catre suport. Starea „n-am putut afla nimic si nu
// spune nimeni nimic" nu mai exista.
//
// A treia: alerta pleaca acum SI catre proprietarul magazinului, nu doar catre
// suport. Vezi `sendBrokenDomainToOwner`.

/** Ce citim din `businesses` pentru fiecare magazin cu domeniu propriu. */
type Magazin = {
  id: string;
  slug: string;
  store_name: string | null;
  custom_domain: string | null;
  /** Verdictul stocat acum, ca sa nu rescriem inutil. Vezi `scrieSanatate`. */
  custom_domain_healthy: boolean | null;
  /** Adresa magazinului. Prima optiune pentru alerta catre proprietar. */
  email: string | null;
  /** Proprietarul contului, de unde luam adresa cand magazinul n-are una. */
  user_id: string;
};

/** Cum iese un domeniu din clasificare. `motiv` e tehnic, pentru suport. */
type Verdictul = {
  fel: "sanatos" | "asteptam" | "stricat" | "neverificat";
  motiv: string;
  /** Numai pe „stricat": reparatia e a noastra sau a clientului. */
  alNostru: boolean;
};

/**
 * Traduce starea reala a domeniului intr-una din patru categorii.
 *
 * Ordinea conteaza si e aleasa dupa cat de tare e dovada, nu dupa cat de grava e
 * concluzia: intai faptele dovedite (`false` citit efectiv), abia apoi
 * presupunerile. Asa `null` nu mai poate produce nici alarma, nici liniste.
 */
function clasifica(s: DomainStatus, esecReparatie?: string): Verdictul {
  // 1. Singura iesire buna. `healthy` cere dovezi pozitive peste tot, deci un
  //    „nu stiu" nu mai poate ajunge aici — vezi lib/vercel.ts.
  if (s.healthy) return { fel: "sanatos", motiv: "", alNostru: false };

  /*
   * 2. Cazul eSafe, si singurul pe care il stiam si inainte: nameserverele arata
   *    catre Vercel, dar nimeni nu raspunde pentru domeniu. `zoneMissing` cere
   *    DOVADA (`dnsRaspunde === false`), nu absenta unei dovezi — sonda veche
   *    raspundea 200 pe un domeniu complet mort, fiindca intorcea inregistrarile
   *    CAA de sistem, si de acolo a pornit tot incidentul.
   */
  if (s.zoneMissing) {
    return {
      fel: "stricat",
      alNostru: true,
      motiv:
        "Nameserverele arata catre Vercel, dar nimeni nu raspunde pentru domeniu: " +
        "zona DNS lipseste. Domeniul e cazut complet, si site si email. Se repara " +
        "din Setari > Domeniu, butonul Repara, sau mutandu-l pe inregistrari A/CNAME.",
    };
  }

  /*
   * 3. Domeniul e mort pentru toata lumea, dar NU e delegat catre noi: DNS-ul lui
   *    nu raspunde. Nu avem ce repara — nu tinem noi zona aia — dar magazinul lui
   *    chiar e inchis, si asta trebuie sa afle de la noi.
   */
  if (s.dnsRaspunde === false) {
    return {
      fel: "stricat",
      alNostru: false,
      motiv:
        "Nameserverele domeniului nu raspund deloc si domeniul nu e delegat catre noi. " +
        `Nameservere vazute acum: ${s.currentNameservers.join(", ") || "niciunul"}.`,
    };
  }

  /*
   * 4. Atasarea la proiect e exclusiv treaba noastra, si tocmai am incercat-o mai
   *    sus. Numai pe `false` DOVEDIT: un `null` inseamna citire picata, nu domeniu
   *    nelegat, iar a-l trata ca defect ar produce alarme in masa la primul 429.
   */
  if (s.inProject === false) {
    return {
      fel: "stricat",
      alNostru: true,
      motiv:
        "Domeniul nu e atasat proiectului Vercel" +
        (esecReparatie ? `, iar reatasarea automata a esuat: ${esecReparatie}` : "") +
        ".",
    };
  }

  /*
   * 5. Citirile picate NU mai trec drept „asteptam clientul".
   *
   * Aici ajung exact domeniile despre care nu stim destul ca sa spunem ceva. Nu
   * sunt nici sanatoase, nici stricate, si nu se repara automat — dar se
   * RAPORTEAZA. Inainte cadeau in `waiting` si nu le vedea nimeni niciodata.
   */
  if (s.error || s.dnsRaspunde === null || s.inProject === null) {
    return {
      fel: "neverificat",
      alNostru: false,
      motiv: s.error ?? "Sondele nu au raspuns; starea domeniului e necunoscuta.",
    };
  }

  /*
   * 6. Situatia (b) din incident, si motivul pentru care exista fisierul asta in
   *    forma noua: clientul a facut tot ce tinea de el — nameserverele arata catre
   *    noi SI raspund — dar domeniul tot nu serveste magazinul. Nu asteptam pe
   *    nimeni: asteptam pe noi.
   */
  if (s.delegated) {
    return {
      fel: "stricat",
      alNostru: true,
      motiv:
        "Domeniul e delegat catre Vercel si nameserverele raspund, dar traficul tot nu " +
        `ajunge la magazin (configuredBy=${s.configuredBy ?? "niciunul"}). E de terminat de partea noastra.`,
    };
  }

  // 7. DNS-ul lui raspunde si nu e mutat la noi: chiar asteptam clientul. Singurul
  //    caz in care tacerea e raspunsul corect.
  if (s.misconfigured) return { fel: "asteptam", motiv: "", alNostru: false };

  // 8. Nu e sanatos si nu avem nicio explicatie. Se raporteaza, nu se tace.
  return {
    fel: "neverificat",
    alNostru: false,
    motiv: "Domeniul nu iese sanatos, dar niciun semnal nu explica de ce.",
  };
}

/**
 * Ce are de facut comerciantul, in cuvintele lui.
 *
 * Valorile concrete (IP-uri, tinte de CNAME, nameservere) vin din `status`, adica
 * de la Vercel pentru PROIECTUL nostru. Nu se scriu de mana nicaieri: o lista
 * hardcodata se desincronizeaza tacut si trimite clientul sa configureze gresit.
 */
function pasiPentruClient(domain: string, s: DomainStatus, alNostru: boolean): string[] {
  if (alNostru) {
    /*
     * Lui NU i se dau instructiuni de DNS aici. A facut deja partea lui corect, si
     * o lista de pasi inutili l-ar pune sa strice ce e bun — exact riscul pe care
     * l-a avut eSafe, care si-a pierdut MX-urile mutandu-se pe nameserverele
     * noastre si are emailul cazut si acum.
     */
    const pasi = [
      "Nu trebuie sa schimbi nimic la firma de la care ai domeniul. Partea ta e facuta corect.",
      "Intra in Edinio, la Setari, sectiunea Domeniu, si apasa butonul Repara. Dureaza cateva secunde.",
    ];
    if (s.recommendedIPv4.length || s.recommendedCNAME.length) {
      pasi.push(
        "Daca vrei sa nu mai depinzi de noi pentru asta, poti trece pe conectarea prin " +
        "inregistrari A si CNAME, tot din pagina aceea: DNS-ul ramane la firma ta si nu iti pierzi emailul.",
      );
    }
    pasi.push("Daca dupa o ora tot nu functioneaza, raspunde la acest email si ne ocupam noi.");
    return pasi;
  }

  const pasi = [
    `Intra in contul de la firma de la care ai cumparat ${domain} si verifica daca domeniul mai este platit si activ.`,
  ];
  if (s.recommendedIPv4.length) {
    pasi.push(
      `La sectiunea DNS, pune o inregistrare de tip A pentru ${domain} catre ${s.recommendedIPv4.join(" sau ")}.`,
    );
  }
  if (s.recommendedCNAME.length) {
    pasi.push(
      `Si o inregistrare de tip CNAME pentru www.${domain} catre ${s.recommendedCNAME.join(" sau ")}.`,
    );
  }
  if (s.intendedNameservers.length) {
    pasi.push(
      `Alta varianta: muti domeniul complet la noi, punand nameserverele ${s.intendedNameservers.join(" si ")}. ` +
      "Atentie, in cazul acesta trebuie sa ne dai si inregistrarile de email (MX), altfel iti pierzi emailul pe acest domeniu.",
    );
  }
  pasi.push("Schimbarile de DNS se pot vedea si dupa cateva ore. Verificam automat din ora in ora.");
  return pasi;
}

/** Filtru minimal pentru o adresa care ajunge in antetul `To:`. */
const EMAIL_VALID = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adresa proprietarului magazinului: intai cea a magazinului, apoi cea a contului.
 * Se cheama DOAR pentru domeniile stricate, ca sa nu facem un `getUserById` pe
 * fiecare magazin sanatos la fiecare ora.
 */
async function adresaProprietarului(
  admin: ReturnType<typeof createAdminClient>,
  store: Magazin,
): Promise<string | null> {
  const alMagazinului = (store.email ?? "").trim();
  if (EMAIL_VALID.test(alMagazinului)) return alMagazinului;
  try {
    const { data } = await admin.auth.admin.getUserById(store.user_id);
    const alContului = (data?.user?.email ?? "").trim();
    return EMAIL_VALID.test(alContului) ? alContului : null;
  } catch {
    return null;
  }
}

/**
 * Adresa de email a proprietarului e chiar pe domeniul cazut?
 *
 * Daca da, alerta nu are cum sa ajunga: cu nameserverele mute pica si MX-ul, deci
 * si emailul lui. eSafe e fix cazul asta. Suportul trebuie sa stie ca omul acela
 * se suna, nu se scrie.
 */
function emailPeDomeniulCazut(email: string, domain: string): boolean {
  const gazda = email.split("@")[1]?.toLowerCase() ?? "";
  const d = domain.toLowerCase().replace(/^www\./, "");
  return gazda === d || gazda.endsWith(`.${d}`);
}

/**
 * Amprenta scurta si stabila a unei liste de domenii.
 *
 * Serveste la a raspunde la o singura intrebare: „e aceeasi lista ca data
 * trecuta?". Nu apara nimic, deci nu are de ce sa fie criptografica; FNV-1a pe 32
 * de biti ajunge.
 *
 * De ce hash si nu lista in clar: cheia de franare se scrie in
 * `details.destinatar` pe un rand din `error_logs`, iar `logError` TAIE `details`
 * peste 4000 de caractere serializate si il inlocuieste cu un ciot. O cheie care
 * ar contine cincizeci de domenii ar putea impinge randul peste limita, iar atunci
 * dispare chiar cheia dupa care se citeste franarea la rularea urmatoare — si
 * emailul ar pleca din ora in ora, adica exact ce incearca franarea sa opreasca.
 * O amprenta de opt caractere nu poate face asta niciodata.
 */
function amprenta(valori: string[]): string {
  // Sortat si deduplicat: aceeasi multime de domenii da aceeasi amprenta,
  // indiferent de ordinea in care le-a intors baza sau in care s-au terminat
  // sondele paralele.
  const text = [...new Set(valori.map((v) => v.trim().toLowerCase()))].sort().join(",");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/*
 * Verificarea comuna, nu una proprie.
 *
 * Ce era aici: `req.headers.get("authorization")?.replace(...) === process.env.CRON_SECRET`.
 * `headers.get()` intoarce `null` cand antetul lipseste, `null?.replace()` da
 * `undefined`, iar `CRON_SECRET` nesetat e tot `undefined` — deci
 * `undefined === undefined` si ruta se deschidea la o cerere FARA niciun antet.
 * Fail-OPEN, adica pe dos decat trebuie o poarta.
 *
 * `verificaCron` a fost scris exact pentru bug-ul asta si a fost pus peste tot;
 * ruta asta a ramas singura pe forma veche. Acum nu mai exista niciuna.
 */
export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    return NextResponse.json({ skipped: "Vercel API neconfigurat" });
  }

  // Client de SISTEM si tipat: `custom_domain_healthy` si `custom_domain_checked_at`
  // se pot scrie doar cu `service_role`, iar genericul `<Database>` e singurul care
  // verifica de fapt numele coloanelor la scriere.
  const admin = createAdminClient();

  /*
   * ⚠ AICI ERAU DOUA GAURI, si a doua e mai rea decat prima.
   *
   * `.range(0, 999)` taia la o mie de domenii, cu un `console.warn` pe care nu-l
   * citeste nimeni. Dar mai grav: `const { data } = await ...` nu se uita deloc la
   * `error`. La o interogare picata, `data` e `null`, `?? []` o preface intr-o
   * lista goala, si cronul raporta senin `checked: 0, broken: []` — o rulare
   * perfect sanatoasa la vedere, care n-a verificat NIMIC. Exact forma care a
   * tinut sitemapul gol doua saptamani.
   *
   * Strict: mai bine cronul cade zgomotos decat sa spuna ca toate domeniile sunt
   * in regula fiindca n-a reusit sa se uite la niciunul.
   */
  let rows: Magazin[];
  try {
    rows = await fetchAllRowsStrict<Magazin>("domains-reconcile.stores", (from, to) =>
      admin
        .from("businesses")
        .select("id, slug, store_name, custom_domain, custom_domain_healthy, email, user_id")
        .not("custom_domain", "is", null)
        .neq("custom_domain", "")
        .order("id")
        .range(from, to));
  } catch (e) {
    await logError({
      action: "domains-reconcile",
      message: e instanceof Error ? e.message : "citirea domeniilor a esuat",
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const repaired: string[] = [];
  const stricate: DomeniuStricat[] = [];
  const asteptam: string[] = [];
  const neverificate: DomeniuNeverificat[] = [];
  /** Apexul merge, dar geamanul `www.` nu s-a putut atasa. Degradare, nu cadere. */
  const wwwLipsa: string[] = [];
  let healthy = 0;

  /*
   * Steagul citit de proxy inainte de a redirecta 307 catre domeniul propriu.
   * Se strang id-urile pe verdict si se scriu in cateva UPDATE-uri la final, nu
   * unul per magazin.
   *
   * Se scrie DOAR CE S-A SCHIMBAT, si asta nu e o optimizare, e o obligatie:
   * `businesses` are declansatorul `set_businesses_updated_at BEFORE UPDATE`, iar
   * `businesses.updated_at` ajunge in `<lastmod>` in sitemapuri. Un UPDATE orar pe
   * toate magazinele ar declara catre Google ca fiecare magazin s-a modificat
   * acum o ora, la nesfarsit — adica ar transforma `lastmod` intr-un camp fara
   * nicio informatie. Pretul e ca `custom_domain_checked_at` inseamna „cand s-a
   * schimbat ultima data verdictul", nu „cand am privit ultima data"; cat de
   * proaspata e privirea se vede din rularile cronului si din `/admin/logs`.
   */
  /*
   * Doua galeti, nu trei. „Incert" a disparut deliberat: pe verdict necunoscut
   * NU se mai atinge coloana deloc, ca un `null` sa nu poata sterge un `false`
   * dovedit si sa redeschida redirectul catre un domeniu mort.
   */
  const deScris = new Map<string, string[]>([["sanatos", []], ["mort", []]]);

  /*
   * Patru deodata, nu unul dupa altul.
   *
   * Fiecare domeniu inseamna una pana la trei cereri catre Vercel. La 15 domenii
   * (masurat la 18.08) nu conteaza; la o mie, secvential ar depasi limita de timp
   * a functiei si cronul ar fi taiat pe la jumatate — adica jumatate din domenii
   * neverificate, si un raspuns care arata a reusita. Patru sta departe de
   * plafonul de cereri al Vercel si nu incarca nimic.
   */
  const DEODATA = 4;
  for (let i = 0; i < rows.length; i += DEODATA) {
  await Promise.all(rows.slice(i, i + DEODATA).map(async (store) => {
    const domain = (store.custom_domain ?? "").trim();
    if (!domain) return;
    const label = store.store_name ?? store.slug;

    try {
      let status = await getDomainStatus(domain);
      let esecReparatie: string | undefined;

      /*
       * Cronul face DOAR reparatii care adauga: ataseaza domeniul la proiect,
       * adauga geamanul www. Nimic distructiv, niciodata, nesupravegheat — de
       * aceea `poateDetasa: false`. Detasarea temporara care permite crearea zonei
       * ramane exclusiv in spatele butonului „Repara", apasat de un om pe propriul
       * domeniu.
       *
       * Motivul e ce s-a vazut pe 07.08.2026: judecata automata „domeniul asta e
       * stricat" s-a inselat de doua ori intr-o singura zi — o data crezand ca
       * lipsa zonei e defect (ar fi demolat `caian-textile.ro`, care merge pe DNS
       * extern), o data crezand ca zona exista pentru ca API-ul Vercel o raporta,
       * desi nameserverele raspundeau REFUSED.
       *
       * ⚠ Conditia cere `=== false`, nu `!status.inProject`. De cand verdictele
       * sunt `true | false | null`, `!null` e adevarat: pe forma veche, un plafon
       * atins la Vercel ar fi facut cronul sa incerce sa reataseze TOATE domeniile
       * deodata, adica sa transforme o citire picata intr-un val de scrieri.
       */
      if (status.inProject === false || status.wwwInProject === false) {
        const eraNeatasat = status.inProject === false;
        /*
         * Metoda o alege realitatea, nu o presupunere: cine si-a mutat deja
         * nameserverele la noi ARE NEVOIE de zona la Vercel, iar cine e pe DNS
         * extern n-are ce face cu ea si a i-o cere e doar un mod de a esua degeaba.
         * Implicitul e `inregistrari`, care nu atinge deloc zona, deci nu poate
         * pune in pericol emailul nimanui.
         */
        const fix = await addDomainToVercel(domain, {
          metoda: status.delegated ? "nameservere" : "inregistrari",
          poateDetasa: false,
        });
        status = await getDomainStatus(domain);
        if (!fix.success) esecReparatie = fix.error;
        if (eraNeatasat && status.inProject === true) repaired.push(domain);
        if (status.wwwInProject === false) wwwLipsa.push(domain);
      }

      /*
       * Steagul de sanatate. Regula: doar DOVEZILE scriu verdictul.
       *   sanatos dovedit                         -> true
       *   nameservere dovedit mute                -> false (proxy-ul opreste redirectul)
       *   raspund, dar Vercel spune ca traficul
       *     nu ajunge la noi pe nicio cale        -> false (la fel de dovedit)
       *   n-am putut citi                         -> NU atingem coloana
       *
       * Predicatul e `sanatateDomeniu` din lib/vercel.ts, folosit si de ruta de
       * status: erau doi scriitori scrisi separat si deja divergeau.
       *
       * Ultima linie e cea care conteaza. Un `null` scris peste un `false`
       * dovedit ar redeschide redirectul catre un domeniu mort la prima citire
       * picata — adica exact iesirea prin care esafe.ro a scos magazinul offline
       * pe TOATE adresele, inclusiv pe edinio.com/esafe.
       */
      const sanatate = sanatateDomeniu(status);
      if (sanatate !== null && sanatate !== store.custom_domain_healthy) {
        deScris.get(sanatate ? "sanatos" : "mort")?.push(store.id);
      }

      const verdict = clasifica(status, esecReparatie);

      if (verdict.fel === "sanatos") { healthy++; return; }
      if (verdict.fel === "asteptam") { asteptam.push(domain); return; }
      if (verdict.fel === "neverificat") { neverificate.push({ domain, motiv: verdict.motiv }); return; }

      const ownerEmail = await adresaProprietarului(admin, store);
      stricate.push({
        store: label,
        slug: store.slug,
        domain,
        problem: verdict.motiv,
        pasi: pasiPentruClient(domain, status, verdict.alNostru),
        alNostru: verdict.alNostru,
        ownerEmail,
        ownerEmailPeDomeniu: ownerEmail ? emailPeDomeniulCazut(ownerEmail, domain) : false,
      });
    } catch (err) {
      /*
       * O exceptie e cea mai completa forma de citire picata: nu stim nimic despre
       * domeniu, stim doar ca sonda a cazut. Inainte ajungea in `broken` si trimitea
       * email — adica o pana de retea de-a noastra se raporta ca „domeniul tau e
       * stricat", catre proprietar.
       */
      neverificate.push({
        domain,
        motiv: `Verificarea a aruncat: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }));
  }

  // ─── Steagul de sanatate, in cateva UPDATE-uri, nu unul per magazin ──────────
  const acum = new Date().toISOString();
  const BUCATA = 200;
  const scrieSanatate = async (ids: string[], valoare: boolean | null) => {
    for (let i = 0; i < ids.length; i += BUCATA) {
      const bucata = ids.slice(i, i + BUCATA);
      // `.in("id", ...)` e si filtru, si AUTORIZARE: `service_role` respinge un
      // UPDATE fara WHERE, si pe buna dreptate.
      const { error } = await admin
        .from("businesses")
        .update({ custom_domain_healthy: valoare, custom_domain_checked_at: acum })
        .in("id", bucata);
      if (error) {
        await logError({
          action: "domains-reconcile",
          message: `Steagul de sanatate nu s-a putut scrie pentru ${bucata.length} magazine: ${error.message}`,
          details: { valoare, ids: bucata },
          severity: "error",
        });
      }
    }
  };
  for (const [galeata, ids] of deScris) {
    if (ids.length === 0) continue;
    await scrieSanatate(ids, galeata === "sanatos");
  }

  if (stricate.length > 0) {
    /*
     * Ce e stricat ajunge INTOTDEAUNA in `/admin/logs`. Pana pe 18.08 cronul nu
     * scria nimic acolo: singura lui iesire era `console.log`, adica invizibil din
     * produs. Un domeniu cazut complet — nici site, nici email — merita sa se vada
     * unde se uita omul, nu doar in logurile Vercel.
     */
    await logError({
      action: "domains-reconcile",
      message: `${stricate.length} domenii cu probleme: ${stricate.map((b) => b.domain).join(", ")}`,
      // Proiectie slaba, fara `pasi`: `logError` taie `details` la 4000 de
      // caractere serializate si il inlocuieste cu un ciot. Instructiunile pentru
      // client ar fi umplut singure limita si ar fi scos afara chiar diagnosticul.
      details: {
        stricate: stricate.map((b) => ({
          store: b.store,
          domain: b.domain,
          problem: b.problem,
          alNostru: b.alNostru,
          ownerEmail: b.ownerEmail ?? null,
          ownerEmailPeDomeniu: b.ownerEmailPeDomeniu ?? false,
        })),
      },
      severity: "critical",
    });
  }

  if (neverificate.length > 0 || wwwLipsa.length > 0) {
    /*
     * ═══ ⚠ O ALARMA CARE SUNA MEREU E O ALARMA OPRITA (26.08.2026) ═══
     *
     * Nota de aici prezicea exact ce s-a intamplat: „daca aceleasi domenii revin rulare de
     * rulare, ce e stricat e CITIREA, nu domeniul". Prezicea, si nu facea nimic.
     *
     * ⚠ MASURAT: `okai.ro` a scris randul asta de 150 de ori, din 10.08.2026, din ora in ora,
     * cu acelasi text. Iar magazinul de sub el are ZERO produse si ZERO comenzi — deci nici
     * macar nu era o vitrina cazuta, era un rand parasit care tipa de saisprezece zile.
     *
     * ⚠ SI ZGOMOTUL COSTA. Emailurile erau deja franate chiar mai jos, cu explicatia potrivita
     * („dupa a treia zi emailul se muta intr-un dosar si nu se mai citeste, inclusiv in ziua in
     * care cade ALT domeniu"). Jurnalul nu era, si tot el e locul in care se uita omul.
     *
     * ⚠ CAND SETUL SE SCHIMBA, se scrie pe loc. Cand nu se schimba, se tace — pana la douasprezece
     * ore, cand se scrie o data SI SE SPUNE CE INSEAMNA: nu „un domeniu neverificat", ci „de
     * atatea ori la rand acelasi, deci uita-te la sonda, nu la domeniu".
     */
    const amprenta = JSON.stringify({
      n: neverificate.map((x) => `${x.domain}|${x.motiv}`).sort(),
      w: [...wwwLipsa].sort(),
    });

    const { data: precedente, error: eIstoric } = await admin
      .from("error_logs")
      .select("created_at, details")
      .eq("action", "domains-reconcile.neverificate")
      .order("created_at", { ascending: false })
      .limit(200);

    /* ⚠ La indoiala se SCRIE. O citire picata a istoricului n-are voie sa faca zgomotul sa
       para liniste — aceeasi asimetrie ca la emailuri, unde „la indoiala se trimite". */
    let laRand = 0;
    let deCand: string | null = null;
    if (!eIstoric) {
      for (const rand of (precedente ?? []) as { created_at: string; details: unknown }[]) {
        const d = rand.details as { amprenta?: unknown } | null;
        if (!d || typeof d !== "object" || d.amprenta !== amprenta) break;
        laRand++;
        deCand = rand.created_at;
      }
    }

    const ORE_TACERE = 12;
    const ultima = (precedente ?? [])[0] as { created_at: string } | undefined;
    const deLaUltima = ultima ? Date.now() - Date.parse(ultima.created_at) : Infinity;
    const seScrie = laRand === 0 || deLaUltima >= ORE_TACERE * 3600_000;

    if (seScrie) {
      const repetat = laRand > 0
        ? ` — al ${laRand + 1}-lea rand cu ACELASI rezultat${deCand ? `, de la ${deCand.slice(0, 10)}` : ""}.`
          + " Cand nu se schimba nimic, ce e de reparat e sonda sau randul din baza, nu domeniul."
        : "";
      await logError({
        action: "domains-reconcile.neverificate",
        message:
          `${neverificate.length} domenii neverificate` +
          (wwwLipsa.length ? `, ${wwwLipsa.length} fara geamanul www` : "") +
          repetat,
        details: { neverificate, wwwLipsa, amprenta, laRand },
        severity: "warning",
      });
    }
  }

  if (stricate.length > 0 || neverificate.length > 0) {
    /*
     * ═══ EMAILUL SE FRANEAZA, ACUM PER DESTINATAR. ═══
     *
     * Zona lipsa nu se repara automat, deliberat (vezi mai sus): o rezolva un om.
     * Pana o face, cronul gaseste acelasi domeniu stricat la fiecare ora — si
     * trimitea de fiecare data un email. Douazeci si patru pe zi pentru aceeasi
     * problema, la nesfarsit. Asta nu e vigilenta, e antrenament: dupa a treia zi
     * emailul de la Edinio se muta intr-un dosar si nu se mai citeste, inclusiv in
     * ziua in care cade ALT domeniu. O alarma care suna mereu e o alarma oprita.
     *
     * Franarea era insa GLOBALA: un singur magazin cazut consuma fereastra de 12
     * ore si ii tacea pe toti ceilalti. De cand alerta pleaca si catre proprietari,
     * asta ar fi insemnat ca un comerciant nu afla ca magazinul lui e jos fiindca
     * al altcuiva cazuse primul. Marcajul e acum pe DESTINATAR.
     *
     * ═══ SI PE SEVERITATE, DE PE 10.08.2026. ═══
     *
     * Suportul avea o singura cheie, literalul "suport", pentru amandoua
     * categoriile. Deci o ora in care singura problema era un „neverificat"
     * trecator — un 429 de la Vercel, care se stinge singur la rularea urmatoare —
     * ardea fereastra de 12 ore, iar in urmatoarele douasprezece ore un domeniu
     * care chiar CADEA complet nu mai producea nicio alerta catre suport. Adica
     * fix cazul pe care exista cronul asta, taiat de zgomotul cel mai ieftin din el.
     *
     * Acum sunt doua chei, si nu la fel construite, fiindca cele doua categorii se
     * poarta diferit:
     *
     *   - STRICATE: cheia contine amprenta multimii de domenii cazute. Un domeniu
     *     stricat ramane stricat pana il repara un om, deci aceeasi multime la ora
     *     urmatoare inseamna aceeasi stire si se tace. Dar cand cade INCA unul,
     *     multimea e alta, amprenta e alta, si alerta pleaca imediat: nici o
     *     cadere noua nu mai asteapta doisprezece ore dupa una veche.
     *   - NEVERIFICATE: cheie fixa, FARA amprenta. Astea sunt prin natura lor
     *     schimbatoare (un plafon la Vercel loveste alte domenii de fiecare data),
     *     iar o amprenta peste ele s-ar schimba la fiecare rulare si ar anula
     *     franarea complet. Sunt `warning`, nu `critical`: un email la 12 ore e
     *     destul, si oricum se vad toate in `/admin/logs`.
     *
     * Sta tot in `error_logs`, nu intr-o tabela noua: acolo e deja istoricul, si o
     * citire pe `action` + `created_at` costa nimic. La indoiala (citirea picata)
     * se TRIMITE: un email in plus e mai ieftin decat unul lipsa.
     */
    const ORE_INTRE_EMAILURI = 12;
    const de = new Date(Date.now() - ORE_INTRE_EMAILURI * 3600_000).toISOString();
    const { data: trimisRecent, error: eCitire } = await admin
      .from("error_logs")
      .select("details")
      .eq("action", "domains-reconcile.email")
      .gte("created_at", de)
      .limit(1000);

    const dejaTrimis = new Set<string>();
    if (!eCitire) {
      for (const rand of trimisRecent ?? []) {
        const d = rand.details;
        if (d && typeof d === "object" && !Array.isArray(d)) {
          const cheie = (d as Record<string, unknown>).destinatar;
          if (typeof cheie === "string") dejaTrimis.add(cheie);
        }
      }
    }

    /**
     * `chei` sunt TOATE franarile pe care le consuma emailul acesta, fiindca un
     * singur mesaj poate duce mai multe severitati deodata (suportul primeste si
     * stricatele si neverificatele in acelasi corp).
     *
     * Se trimite daca MACAR o cheie e noua: cand cea grava n-a fost inca anuntata,
     * faptul ca cea usoara a fost nu are voie s-o taca. Si se marcheaza TOATE la
     * reusita, ca sa nu plece imediat dupa el un al doilea email cu ce tocmai a
     * plecat.
     */
    const trimite = async (chei: string[], catre: string, domenii: string[], fn: () => Promise<void>) => {
      if (chei.length === 0 || chei.every((c) => dejaTrimis.has(c))) return;
      // Se marcheaza si local: acelasi proprietar poate avea doua magazine cazute
      // in aceeasi rulare, si ar primi doua emailuri identice.
      for (const c of chei) dejaTrimis.add(c);
      try {
        await fn();
        for (const cheie of chei) {
          await logError({
            action: "domains-reconcile.email",
            message: `Alerta de domenii trimisa catre ${catre} (${cheie}).`,
            // `domenii` sunt DOAR cele din emailul acesta. Randul de log al unui
            // comerciant nu are ce cauta cu domeniile altui magazin in el.
            //
            // Plafonat la 50: peste 4000 de caractere serializate `logError`
            // arunca `details` intreg si scrie un ciot in loc, iar odata cu el ar
            // disparea `destinatar` — adica insasi cheia de franare, si emailul
            // ar pleca apoi din ora in ora. Numarul intreg ramane in `total`.
            details: { destinatar: cheie, domenii: domenii.slice(0, 50), total: domenii.length },
            severity: "info",
          });
        }
      } catch (err) {
        // Domenii stricate SI emailul picat: dubla tacere de dinainte. Acum se
        // vede, si tot ce s-a gasit e deja in randul `critical` de mai sus. Nu se
        // scrie marcajul de franare, deci se reincearca la rularea urmatoare.
        await logError({
          action: "domains-reconcile.email",
          message: `Alerta catre ${catre} a esuat: ${err instanceof Error ? err.message : String(err)}`,
          severity: "critical",
        });
      }
    };

    /*
     * Suportul primeste tot, inclusiv neverificatele, intr-un singur email: e
     * acelasi cititor si acelasi corp de mesaj, si doua mesaje una dupa alta ar
     * fi tot zgomot. Cheile lui nu pornesc de la adresa, ci de la severitate, ca
     * sa nu depinda de ce e configurat in `SUPPORT_ADMIN_EMAIL`.
     */
    const cheiSuport = [
      ...(stricate.length ? [`suport:stricate:${amprenta(stricate.map((b) => b.domain))}`] : []),
      ...(neverificate.length ? ["suport:neverificate"] : []),
    ];
    await trimite(
      cheiSuport,
      "suport",
      [...stricate.map((b) => b.domain), ...neverificate.map((n) => n.domain)],
      () => sendBrokenDomainsToAdmin(stricate, neverificate),
    );

    /*
     * Si proprietarii. Un magazin cazut trebuie sa ajunga la omul al carui magazin
     * e — pana acum alerta pleca exclusiv catre `SUPPORT_ADMIN_EMAIL`, adica in
     * aceeasi cutie cu tichetele si cu notificarile de utilizator nou, si
     * comerciantul nu afla niciodata.
     *
     * Grupate pe adresa: cine are doua domenii cazute primeste un email, nu doua.
     */
    const peProprietar = new Map<string, DomeniuStricat[]>();
    for (const it of stricate) {
      if (!it.ownerEmail) continue;
      const cheie = it.ownerEmail.toLowerCase();
      const lista = peProprietar.get(cheie);
      if (lista) lista.push(it);
      else peProprietar.set(cheie, [it]);
    }
    for (const [cheie, lista] of peProprietar) {
      const catre = lista[0].ownerEmail ?? cheie;
      /*
       * Franarea proprietarului ramane strict PER DESTINATAR, si fara amprenta:
       * el primeste doar despre magazinele lui, si toate cazurile lui sunt grave.
       * Amprenta ar fi in plus aici — la un singur proprietar cu un singur domeniu
       * cazut nu exista „inca unul" care sa fie tacut de cel dinainte, iar cand
       * are doua, amandoua intra in acelasi email.
       */
      await trimite([cheie], catre, lista.map((b) => b.domain), () => sendBrokenDomainToOwner(catre, lista));
    }
  }

  const summary = {
    checked: rows.length,
    healthy,
    repaired,
    // Numele vechi era `waitingForNameservers` si acoperea si domeniile pe care
    // le tineam noi cazute. Acum inseamna strict ce spune: clientul nu si-a mutat
    // inca DNS-ul, si nu avem ce repara.
    asteptamClientul: asteptam,
    broken: stricate.map((b) => ({
      store: b.store,
      domain: b.domain,
      problem: b.problem,
      alNostru: b.alNostru,
      anuntat: b.ownerEmail ? (b.ownerEmailPeDomeniu ? "adresa e pe domeniul cazut" : "da") : "nu are adresa",
    })),
    neverificate,
    wwwLipsa,
  };
  console.log("[domains-reconcile]", JSON.stringify(summary));

  return NextResponse.json(summary);
}
