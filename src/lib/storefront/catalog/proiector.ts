import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductPriceRange } from "@/lib/utils/product-price";
import { descriereDeCautare, slimPageSections } from "@/lib/storefront/catalog-slim";
import { normalizeSearchText } from "@/lib/storefront/product-search";
import { jeton, perechileProdusului } from "@/lib/storefront/catalog/facets";
import { pretulDePornire } from "@/lib/configurators/pornire";
import { configuratoareleCuVerdict, type RaspunsConfiguratoare } from "@/lib/configurators/vitrina";
import type { Compilat } from "@/lib/configurators/compileaza";

/**
 * Umple campurile CALCULATE din `catalog_produs`, apeland regulile existente.
 *
 * Asta e jumatatea de Node a modelului de citire. Declansatorul din baza copiaza
 * mecanicele (nume, pret, stoc, imagine) in aceeasi tranzactie cu scrierea si
 * marcheaza randul in `catalog_murdar`; de aici incolo continua proiectorul.
 *
 * DE CE IN NODE, SI NU IN SQL. Fiindca regulile exista deja, scrise si testate, in
 * TypeScript — iar rescrise in SQL ar deveni o a doua sursa de adevar care diverge
 * tacut. `getProductPriceRange` singur codifica patru reguli castigate greu (doar
 * combinatiile `enabled`; doar PRIMA combinatie per titlu duplicat, cu 129 de
 * perechi duplicate in productie; randurile `null` nu au voie sa arunce; un pret 0
 * sau nenumeric cade pe pretul de baza). Un port gresit pe oricare dintre ele
 * schimba preturile AFISATE pe mii de produse. Aici nu se reimplementeaza NIMIC:
 * se apeleaza exact functiile pe care le foloseste si randarea de azi.
 *
 * Singura regula care traieste in SQL e disponibilitatea pachetului
 * (`catalog_fara_stoc`), fiindca de ea depinde un declansator — si are un test de
 * paritate care ruleaza ambele implementari peste aceleasi cazuri.
 */

/** Cate produse se citesc si se scriu intr-un lot. */
const LOT = 500;

/** Coloanele de care are nevoie proiectorul. Nimic in plus: `page_sections` e deja
 *  partea grea (1,2 kB in medie pe eSAFE), nu mai carem si restul randului. */
const COLOANE = "id, business_id, name, description, category, tags, price, page_sections";

interface RandSursa {
  id: string;
  business_id: string;
  name: string | null;
  description: string | null;
  category: string | null;
  tags: unknown;
  price: unknown;
  page_sections: unknown;
}

/** Ce scrie proiectorul. Mecanicele NU sunt aici: le tine declansatorul. */
export interface ProiectieCalculata {
  product_id: string;
  price_min: number;
  price_max: number;
  has_range: boolean;
  fara_oferta: boolean;
  optiuni: Record<string, unknown> | null;
  descriere_scurta: string;
  cauta_norm: string;
  fatete: string[];
  proiectat_la: string;
  /**
   * Produsul cere configurare, si de la ce pret porneste.
   *
   * ⚠ AMANDOUA LIPSESC CAND NU S-A AFLAT, si tocmai asta e rostul lor optional.
   *
   * `catalog_aplica_proiectii` se uita daca exista cheia `cere_configurare`: cand lipseste,
   * pastreaza ce era in coloane. Trimise mereu, un lot venit de la un proiector caruia i-a picat
   * citirea configuratoarelor ar fi stins steagul pe toate produsele magazinului — si nimic nu
   * l-ar mai fi reaprins pana cand cineva atingea produsele pe rand.
   *
   * `pret_pornire: null` NU inseamna zero, ci „nu se poate socoti”. Vezi `configuratori/pornire.ts`.
   */
  cere_configurare?: boolean;
  pret_pornire?: number | null;
}

/**
 * Ce s-a aflat despre configuratorul UNUI produs.
 *
 * ⚠ Lipsa obiectului nu inseamna „n-are configurator”, ci „n-am putut afla”. Cele doua se scriu
 * altfel: prima e un raspuns si se salveaza, a doua e o pana si nu se salveaza nimic. Un simplu
 * `Compilat | null` le-ar fi confundat, iar confuzia s-ar fi vazut ca un card care spune „Adauga
 * in cos” pe un produs pe care nu-l poti cumpara fara sa alegi intai ceva.
 */
export interface StireConfigurator {
  /** `null` = magazinul a raspuns limpede ca produsul asta n-are configurator activ. */
  compilat: Compilat | null;
}

/**
 * Proiectia unui singur rand. Exportata separat ca sa poata fi testata fara baza:
 * testul de paritate ruleaza chiar functia asta peste randuri reale si compara cu
 * `getProductPriceRange`.
 */
export function proiecteazaRand(
  p: RandSursa,
  acum: string,
  /** Ce s-a aflat despre configuratorul produsului. Lipsa = nu s-a aflat; vezi `StireConfigurator`. */
  stire?: StireConfigurator,
): ProiectieCalculata {
  const interval = getProductPriceRange(Number(p.price), p.page_sections);

  // Textul pe care il vede cautarea, in aceeasi ordine de importanta ca indexul
  // din browser: nume, categorie, valorile de varianta, descrierea scurta.
  // Ponderile NU se pierd — raman in `product-search.ts`, care ramane singurul
  // motor de scor. Aici se pregateste doar materialul pentru filtrarea din SQL.
  const perechi = perechileProdusului({ id: p.id, tags: p.tags, page_sections: p.page_sections });
  const valoriOptiuni = perechi.filter((x) => x.grup === "atribut").map((x) => x.valoare);
  const descriere = typeof p.description === "string" ? descriereDeCautare(p.description) : "";

  const cauta_norm = normalizeSearchText(
    [p.name ?? "", p.category ?? "", valoriOptiuni.join(" "), descriere].filter(Boolean).join(" "),
  );

  return {
    product_id: p.id,
    price_min: interval.min,
    price_max: interval.max,
    has_range: interval.hasRange,
    fara_oferta: interval.faraOferta,
    optiuni: slimPageSections(p.page_sections),
    descriere_scurta: descriere,
    cauta_norm,
    // `Set` fiindca acelasi (cheie, valoare) poate veni si din `google.brand`, si
    // dintr-o specificatie scrisa „Brand" — `construiesteFatete` le uneste oricum,
    // dar un array cu dubluri ar umfla degeaba indexul GIN.
    // `jeton()` din facets.ts, nu un separator propriu: doua definitii ale
    // aceluiasi caracter ar putea diverge, si atunci fatetele s-ar reconstrui
    // gresit fara nicio eroare.
    fatete: Array.from(new Set(perechi.map((x) => jeton(x.cheie, x.valoare)))),
    proiectat_la: acum,
    /*
     * Cheile se pun NUMAI cand s-a aflat. Raspandirea conditionata nu e cochetarie: absenta lor
     * e semnalul pe care il citeste `catalog_aplica_proiectii` ca sa lase coloanele neatinse.
     *
     * ⚠ SE PORNESTE DE LA `interval.min`, NU DE LA `p.price`.
     *
     * `price` e pretul de BAZA al randului, nu unul la care se poate cumpara. Pe un produs cu
     * variante, cardul arata dintotdeauna minimul VANDABIL — chiar de aia exista
     * `getProductPriceRange`, si chiar de aia scriau blocurile eSAFE 92,80 lei pentru o geaca
     * ale carei marimi costa toate 116. Socotit din `price`, „De la” ar fi mintit in amandoua
     * directiile: sub pretul adevarat cand toate marimile costa mai mult decat baza, si peste
     * cel mai ieftin drum cand o marime e mai ieftina decat ea.
     *
     * Configuratorul cu baza „produs” adauga peste pretul variantei ALESE, deci cel mai ieftin
     * inceput e cea mai ieftina varianta plus configuratia implicita.
     */
    ...(stire
      ? {
          cere_configurare: stire.compilat !== null,
          pret_pornire: stire.compilat ? pretulDePornire(stire.compilat, interval.min) : null,
        }
      : {}),
  };
}

/**
 * Configuratoarele intregului lot, cerute o data pe magazin.
 *
 * ═══ ⚠ UN LOT AMESTECA MAGAZINE ═══
 *
 * `proiecteazaCoada` citeste coada INTREGII platforme, ordonata dupa vechimea marcajului, si o
 * taie in bucati de 500. Deci intr-o bucata incap produse de la zeci de comercianti. Intrebate
 * cu un singur `businessId` — al primului rand, sa zicem — raspunsul ar fi fost, pentru toti
 * ceilalti, „n-are configurator”: filtrul pe magazin din `configuratoareleCuVerdict` nu
 * potriveste nimic, si iese o harta goala care arata exact ca un raspuns bun.
 *
 * ⚠ De aceea se grupeaza pe `business_id` INAINTE, si se intreaba o data pentru fiecare grup.
 * Costul e mic: pentru magazinele fara niciun configurator — aproape toate — intrebarea se
 * inchide dupa o singura citire pe index.
 */
export async function configuratoareleLotului(
  randuri: RandSursa[],
  /*
   * ⚠ CITITORUL SE POATE INLOCUI, si numai de dragul probelor.
   *
   * Toata grija fazei sta in ce se intampla cand citirea configuratoarelor NU raspunde limpede:
   * atunci nu se scrie nimic si produsele raman in coada. Cu cititorul legat de-a dreptul,
   * singurul fel de a proba asta ar fi fost o baza de date la indemana — adica, in practica,
   * deloc. Trei mutatii diferite ar fi trecut verzi: pana tratata ca „n-are configurator”,
   * gruparea pe magazin desfiintata, si produsele ratate scoase totusi din coada.
   *
   * Valoarea din oficiu e chiar drumul adevarat, deci productia nu vede nicio deosebire.
   */
  citeste: (
    businessId: string,
    produse: { id: string; category: string | null }[],
  ) => Promise<RaspunsConfiguratoare> = configuratoareleCuVerdict,
): Promise<{ stiri: Map<string, StireConfigurator>; ratate: Set<string> }> {
  const out = new Map<string, StireConfigurator>();
  /*
   * Produsele pentru care NU s-a putut afla. Ele isi pastreaza coloanele vechi — si tocmai de
   * aceea NU au voie sa iasa din coada: altfel „nu s-a putut afla” ar fi devenit permanent, iar
   * un configurator publicat chiar in clipa penei n-ar mai fi ajuns niciodata pe carduri.
   */
  const ratate = new Set<string>();

  const peMagazin = new Map<string, { id: string; category: string | null }[]>();
  for (const r of randuri) {
    if (!r.business_id) continue;
    const ale = peMagazin.get(r.business_id);
    if (ale) ale.push({ id: r.id, category: r.category });
    else peMagazin.set(r.business_id, [{ id: r.id, category: r.category }]);
  }

  for (const [businessId, produse] of peMagazin) {
    let raspuns: RaspunsConfiguratoare;
    try {
      raspuns = await citeste(businessId, produse);
    } catch (e) {
      /*
       * ⚠ Cronul nu are voie sa cada aici. `proiecteazaCoada` e chemata din ruta de cron fara
       * niciun `catch` deasupra, deci o exceptie de aici ar fi oprit proiectia INTREGII
       * platforme — pentru un singur magazin cu ceva stricat.
       */
      console.error("[proiector] citirea configuratoarelor a esuat:", e instanceof Error ? e.message : e);
      for (const p of produse) ratate.add(p.id);
      continue;
    }
    /*
     * ⚠ AICI E TOATA GRIJA FAZEI.
     *
     * `configuratoareleCuVerdict` intoarce harta GOALA si la izbanda, si la orice pana de citire —
     * dinadins, fiindca pe pagina de produs degradarea corecta e „produsul se vinde simplu”. Pe
     * proiectie insa harta goala luata drept raspuns ar SCRIE „n-are configurator” peste produse
     * care au, si ar ramane asa: proiectia nu se reia singura, produsul iese din coada, iar cardul
     * ar minti pana la urmatoarea salvare a produsului. Cu `ok: false` nu se scrie nimic, si
     * randurile raman in coada pentru cronul urmator.
     */
    if (!raspuns.ok) {
      console.error(
        `[proiector] configuratoarele magazinului ${businessId} n-au putut fi citite; `
        + `cele doua coloane raman cum erau pentru ${produse.length} produse`,
      );
      for (const p of produse) ratate.add(p.id);
      continue;
    }
    for (const p of produse) {
      out.set(p.id, { compilat: raspuns.harta.get(p.id)?.compilat ?? null });
    }
  }

  return { stiri: out, ratate };
}

/**
 * Proiecteaza produsele cerute si le scoate din coada.
 *
 * `admin` trebuie sa fie clientul cu service role: `catalog_produs` are RLS
 * pornit si NICIO politica, deci un client de utilizator n-ar scrie nimic si —
 * mai rau — n-ar da eroare, PostgREST raporteaza zero randuri afectate.
 *
 * Intoarce cate randuri a scris. Nu arunca la un lot esuat: proiectorul e chemat
 * si sincron, din actiuni pe care n-are voie sa le doboare. Randul ramane in
 * coada si il ia cronul de la minut.
 */
export async function proiecteaza(
  admin: SupabaseClient,
  ids: string[],
  /**
   * Pana la ce marcaj are voie sa se goleasca coada.
   *
   * CURSA pe care o inchide: intre citirea cozii si scrierea proiectiei,
   * comerciantul poate salva din nou produsul. Declansatorul il remarcheaza
   * (`marcat_la = now()`), dar lucratorul vechi stergea randul oricum — deci
   * proiectia ramanea cea VECHE si nimic n-o mai punea la coada. Un pret sau un
   * nume invechit pe pagina, fara nicio eroare; il gasea abia alarma orara de
   * drift, daca il prindea in esantion.
   *
   * Gol inseamna „sterge tot ce ai cerut", pentru apelurile SINCRONE din
   * mutatoare: acolo id-urile vin de la codul care tocmai a scris, nu din coada.
   */
  pragCoada = "",
  acum = new Date().toISOString(),
): Promise<number> {
  if (ids.length === 0) return 0;
  let scrise = 0;

  for (let i = 0; i < ids.length; i += LOT) {
    const bucata = ids.slice(i, i + LOT);
    const { data, error } = await admin.from("products").select(COLOANE).in("id", bucata);
    if (error) {
      console.error("[proiector] citirea produselor a esuat:", error.message);
      continue;
    }
    const randuri = (data ?? []) as unknown as RandSursa[];
    if (randuri.length === 0) {
      // Produsele au disparut intre marcaj si proiectare. Declansatorul a sters
      // deja randurile din `catalog_produs`; aici doar golim coada, altfel ar
      // ramane marcaje care nu se pot rezolva niciodata.
      await (pragCoada
        ? admin.from("catalog_murdar").delete().in("product_id", bucata).lte("marcat_la", pragCoada)
        : admin.from("catalog_murdar").delete().in("product_id", bucata));
      continue;
    }

    // O singura data pe lot, grupat pe magazin. Vezi `configuratoareleLotului`.
    const { stiri, ratate } = await configuratoareleLotului(randuri);
    const proiectii = randuri.map((r) => proiecteazaRand(r, acum, stiri.get(r.id)));

    /*
     * Un singur dus-intors pe lot, nu unul pe produs.
     *
     * Varianta rand-cu-rand ar fi insemnat 5.826 de cereri la backfill si cateva
     * sute la fiecare import — chiar tiparul pe care modelul asta de citire exista
     * ca sa-l stearga. `catalog_aplica_proiectii` primeste lotul ca jsonb si face
     * un singur `UPDATE ... FROM`.
     *
     * NU e un upsert, deliberat: randurile care nu exista in `catalog_produs` nu se
     * creeaza aici. Cine intra in catalog decide declansatorul, dupa `is_active`.
     * Un upsert ar fi avut nevoie si de coloanele mecanice si le-ar fi rescris cu
     * ce a citit proiectorul, care poate fi mai vechi decat ce e deja in tabela —
     * exact cursa pe care declansatorul o evita.
     */
    const { data: afectate, error: eUpd } = await admin.rpc("catalog_aplica_proiectii", {
      p_randuri: proiectii as unknown as Record<string, unknown>[],
    });
    if (eUpd) {
      console.error("[proiector] scrierea lotului a esuat:", eUpd.message);
      // Coada NU se goleste: randurile raman marcate si le reia cronul urmator.
      continue;
    }
    scrise += Number(afectate) || 0;

    // Se sterge TOATA bucata din coada, nu doar cele scrise: un rand care nu are
    // pereche in `catalog_produs` (produs inactiv) n-ar iesi niciodata altfel.
    // Se sterge doar ce nu s-a remarcat intre timp: un produs salvat din nou intre
    // citirea cozii si scrierea de mai sus are `marcat_la` mai nou si RAMANE, ca
    // sa fie reluat. Vezi `pragCoada`.
    /*
     * ⚠ SI RAMAN SI PRODUSELE DESPRE ALE CAROR CONFIGURATOARE N-AM AFLAT.
     *
     * Proiectia lor s-a scris — pret, nume, fatete — dar cele doua coloane de configurator au
     * ramas cele vechi. Sterse totusi din coada, „n-am aflat” ar fi devenit „asa ramane”: un
     * configurator publicat chiar in clipa penei nu s-ar mai fi vazut niciodata pe carduri,
     * fiindca nimic nu repune produsul la coada.
     *
     * Aceeasi purtare ca la esecul scrierii lotului, cateva randuri mai sus: randul ramane si il
     * ia cronul urmator. Riscul stiut e ca un magazin care pica DE FIECARE DATA isi tine
     * randurile in fata cozii; e vechi de cand modelul asta de citire, si se vede in jurnal,
     * unde fiecare rulare striga acelasi magazin.
     */
    const deSters = ratate.size ? bucata.filter((id) => !ratate.has(id)) : bucata;

    /*
     * ⚠ CE N-A REUSIT SE MUTA LA COADA, nu ramane in fata ei.
     *
     * `proiecteazaCoada` ia cele mai VECHI 1000 de randuri. Lasate cu `marcat_la` neschimbat,
     * produsele unui singur magazin care pica de fiecare data raman permanent cele mai vechi — si
     * ocupa toata coada, la fiecare minut, pentru toata platforma. Un magazin stricat ar fi oprit
     * proiectia tuturor.
     *
     * Remarcate cu ora de acum, ele se reiau tot, dar dupa ceilalti. Marcajul nou inseamna exact
     * ce spune: „mai trebuie proiectat” — acelasi lucru pe care il scrie si declansatorul cand
     * comerciantul salveaza produsul.
     */
    if (ratate.size) {
      const { error: eRem } = await admin
        .from("catalog_murdar").update({ marcat_la: acum }).in("product_id", [...ratate]);
      if (eRem) console.error("[proiector] remarcarea celor ratate a esuat:", eRem.message);
    }
    if (deSters.length === 0) continue;
    const { error: eDel } = await (pragCoada
      ? admin.from("catalog_murdar").delete().in("product_id", deSters).lte("marcat_la", pragCoada)
      : admin.from("catalog_murdar").delete().in("product_id", deSters));
    if (eDel) console.error("[proiector] golirea cozii a esuat:", eDel.message);
  }

  return scrise;
}

/**
 * Ia din coada si proiecteaza. Folosit de cron.
 *
 * `maxim` NU are voie sa treaca de 1000: PostgREST plafoneaza ORICE raspuns la
 * 1000 de randuri si nu da eroare, taie tacut (vezi `lib/supabase/fetch-all.ts`).
 * Am scris intai 2000 si prima rulare pe productie a intors exact 1000 — capcana
 * functioneaza si asupra celui care o cunoaste. Nu se ridica plafonul de aici:
 * daca vreodata coada creste mai repede decat o goleste cronul, se merge pe
 * ferestre cu `fetchAllRows`, nu pe un numar mai mare care oricum nu se onoreaza.
 */
export const MAX_COADA_PE_RULARE = 1000;

/**
 * Proiecteaza ACUM, din calea unei actiuni de dashboard.
 *
 * Se cheama `await`, inaintea lui `revalidatePath`, in mutatoarele de produse:
 * altfel comerciantul salveaza un pret si isi vede magazinul cu cel vechi pana
 * trece cronul — pana la un minut de „nu s-a salvat", pe care il va raporta ca bug.
 *
 * NU ARUNCA NICIODATA. Randul e deja marcat in `catalog_murdar` de declansator,
 * deci cel mai rau lucru care se poate intampla e ca proiectia sa intarzie un
 * minut. Asta nu justifica sa cada salvarea produsului, care e treaba adevarata a
 * apelantului. Erorile se scriu in consola si atat.
 *
 * Isi face singura clientul de service role: `catalog_produs` are RLS pornit si
 * nicio politica, iar clientul comerciantului ar raporta senin zero randuri
 * afectate, fara eroare.
 */
export async function proiecteazaImediat(businessId: string): Promise<void> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient() as unknown as SupabaseClient;
    /*
     * Se goleste coada MAGAZINULUI, nu o lista de id-uri data de apelant.
     *
     * O lista ar fi parut mai precisa, dar ar fi fost mai putin corecta: o
     * scriere atinge si randuri pe care apelantul nu le stie. Sterge o
     * componenta si declansatorul marcheaza pachetele care o contineau; schimba
     * un pret si declansatorul repretuieste pachetele, care se marcheaza si ele.
     * Coada e singurul loc care le stie pe toate, fiindca chiar declansatorul
     * le-a scris acolo.
     */
    const { data, error } = await admin
      .from("catalog_murdar")
      .select("product_id")
      .eq("business_id", businessId)
      .limit(MAX_COADA_PE_RULARE);
    if (error) {
      console.error("[proiector] citirea cozii magazinului a esuat:", error.message);
      return;
    }
    await proiecteaza(admin, (data ?? []).map((r) => (r as { product_id: string }).product_id));
  } catch (e) {
    console.error("[proiector] proiectia sincrona a esuat:", e instanceof Error ? e.message : e);
  }
}



export async function proiecteazaCoada(
  admin: SupabaseClient,
  maxim = MAX_COADA_PE_RULARE,
): Promise<number> {
  const { data, error } = await admin
    .from("catalog_murdar")
    // `marcat_la` se citeste, nu doar id-ul: la final se sterge din coada NUMAI
    // ce n-a fost remarcat intre timp. Vezi `proiecteaza`.
    .select("product_id, marcat_la")
    // Cele mai vechi intai: altfel un magazin care se editeaza intens ar putea
    // tine la infinit in coada randurile altuia.
    .order("marcat_la", { ascending: true })
    .limit(maxim);
  if (error) {
    console.error("[proiector] citirea cozii a esuat:", error.message);
    return 0;
  }
  const randuri = (data ?? []) as { product_id: string; marcat_la: string }[];
  /*
   * Cel mai NOU marcaj din lotul citit e granita pana la care avem voie sa
   * stergem. Orice remarcare de dupa el are `marcat_la` mai mare si supravietuieste.
   */
  const pragul = randuri.reduce((m, r) => (r.marcat_la > m ? r.marcat_la : m), "");
  return proiecteaza(admin, randuri.map((r) => r.product_id), pragul);
}
