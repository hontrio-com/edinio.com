import { pentruBrowser } from "@/lib/storefront/business-public";
import { incarcaMagazinul, metadataMagazinNepublicat } from "@/lib/storefront/antet-magazin";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { MiniStoreRenderer } from "@/components/ministore/MiniStoreRenderer";
import { SuspendedStorePage } from "@/components/ministore/SuspendedStorePage";
import { construiesteFateteDinJetoane, jeton, type Fateta } from "@/lib/storefront/catalog/facets";
import { alegePalier } from "@/lib/storefront/catalog/tier";
import { cautaPeServer, sortareLaCautare } from "@/lib/storefront/catalog/cauta-server";
import { numeSubarbore } from "@/lib/storefront/catalog/subarbore";
import { categoriiVizibile, numeCategoriiAscunse } from "@/lib/categories/vizibilitate";
import { citesteSetariMagazin } from "@/lib/storefront/catalog/shop-settings";
import { COLOANE_PROIECTIE, dinProiectie, proiectieDb, type RandProiectie } from "@/lib/storefront/catalog/din-proiectie";
import { radacinaMagazinCuFiltre, slugCategorie } from "@/lib/storefront/category-href";
import { SEGMENT_MAGAZIN, SEGMENT_CAUTARE, shopHref, shopOnPage } from "@/lib/storefront/design/commerce";
import { resolveDesign } from "@/lib/storefront/design/parse";
import { esteEditorDeDesign } from "@/lib/storefront/design/preview-protocol";
import { isNonProductionHost } from "@/lib/storefront/host";
import { parseStoreMode } from "@/lib/storefront/store-mode";
import { canonicalCatalog, citesteFiltreDinAdresa } from "@/lib/storefront/catalog/url";
import { parseStoreSeo, storeBaseUrl } from "@/lib/seo";
// Ce declara pagina despre sine sta separat, intr-un modul pur si probat.
import { construiesteDateCatalog, titluSiDescriere } from "@/lib/storefront/catalog/date-catalog";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import type { Json } from "@/types/database.types";
import { clasificaSursa, taraDinAnteturi, referrerScurt, primaValoare } from "@/lib/storefront/sursa-vizita";

/**
 * Pagina de catalog si paginile de categorie, dintr-un singur loc.
 *
 * `/magazin` si `/magazin/<categorie>` sunt aceeasi pagina cu o categorie fixata
 * din cale. Scrise ca doua rute independente, ar fi trebuit tinute in sincron pe
 * sapte lucruri care n-au nimic de-a face cu categoriile — modul „un singur
 * produs", magazinul suspendat, ciorna de design, ferestrele de 1000 de randuri,
 * fatetele calculate inainte de slimuire, analitica, curatarea ciornei din
 * props. Prima nepotrivire ar fi fost una tacuta: o pagina de categorie care
 * vinde mai departe dintr-un magazin suspendat.
 */

interface Argumente {
  slug: string;
  sp: Record<string, string | string[] | undefined>;
  /** Segmentul de categorie din cale, cand pagina e a unei categorii. */
  categorieSlug?: string;
  /**
   * Pagina de REZULTATE ale cautarii (`/cautare?q=…`).
   *
   * ═══ ⚠ DE CE E UN STEAG, SI NU O A DOUA PAGINA ═══
   *
   * Rezultatele au nevoie de exact ce are catalogul: grila, filtrele, paginarea,
   * fatetele, ordonarea. O pagina scrisa separat ar fi fost o a doua copie a
   * acelorasi sapte sute de randuri, care se desparte de prima la prima schimbare.
   *
   * ⚠ Steagul schimba DOUA lucruri, si numai doua:
   *
   *   1. Nu se mai redirecteaza magazinele care n-au catalog separat. Pagina de
   *      rezultate trebuie sa existe pentru ORICARE magazin — altfel cautarea din
   *      header, care e in toate design-urile, ar fi dus inapoi pe pagina principala
   *      la unii si pe o pagina adevarata la altii.
   *   2. Nu se indexeaza. Rezultatele proprii de cautare n-au ce cauta in Google —
   *      o spun chiar ei in indrumarul pentru webmasteri — iar spatiul de adrese e
   *      nesfarsit: un termen scris de oricine ar fi devenit o pagina.
   */
  esteCautare?: boolean;
}

type CategorieMinima = { id: string; name: string; parent_id: string | null };

/**
 * Categoria al carei nume da segmentul cerut.
 *
 * Cautarea e pe NUME slugificat, nu pe o coloana `slug`: categoriile n-au asa
 * ceva, iar produsele isi poarta categoria ca text. Vezi `slugCategorie`.
 */
function potrivesteCategorie<T extends { name: string }>(lista: T[], segment: string): T | null {
  const cautat = slugCategorie(segment);
  if (!cautat) return null;
  return lista.find((c) => slugCategorie(c.name) === cautat) ?? null;
}


/** Numele de categorie care exista DOAR pe produse (importuri fara categorie in tabel). */
async function numeCategoriiDinProduse(businessId: string): Promise<{ name: string }[]> {
  const randuri = await fetchAllRows("storefront.magazin.categoriiProduse", (from, to) =>
    createAdminClient()
      .from("products").select("category").eq("business_id", businessId).eq("is_active", true)
      .order("id").range(from, to));
  return Array.from(new Set(randuri.map((r) => r.category).filter(Boolean) as string[]))
    .map((name) => ({ name }));
}

export async function metadataMagazin({ slug, sp, categorieSlug, esteCautare }: Argumente): Promise<Metadata> {
  const admin = createAdminClient();
  const { data: business } = await admin
    .from("businesses")
    .select("id, business_name, store_name, store_city, cover_url, custom_domain, is_published, store_settings(page_content, storefront_design)")
    .eq("slug", slug)
    .single();
  if (!business) return {};

  // Nepublicat: pagina redirectioneaza catre vitrina, care arata „in curand
  // disponibil". Metadata ei n-are ce cauta in index. Vezi `incarcaMagazinul`.
  if (!business.is_published) {
    return metadataMagazinNepublicat(business.store_name ?? business.business_name);
  }

  const brut = (business as unknown as {
    store_settings: { page_content: unknown; storefront_design: unknown } | { page_content: unknown; storefront_design: unknown }[] | null;
  }).store_settings;
  const settings = Array.isArray(brut) ? brut[0] : brut;
  const seo = parseStoreSeo(settings?.page_content ?? null);
  const displayName = business.store_name ?? business.business_name;

  // Aceeasi formula ca peste tot in storefront, nu una scrisa a doua oara aici:
  // pe domeniu propriu canonicalul e domeniul, altfel adresa de pe platforma.
  const radacina = storeBaseUrl({ slug, custom_domain: business.custom_domain });

  /*
   * Categoria vine ori din cale, ori din `?cat=`.
   *
   * Cu o categorie in adresa, pagina ESTE pagina acelei categorii. Un titlu
   * „Toate produsele" pe `?cat=Manusi de protectie` spune si vizitatorului din
   * fila si motorului de cautare exact pe langa.
   *
   * `cat` poate purta si un id de categorie, cand vine dintr-un element de
   * meniu. Un id in titlu ar fi mai rau decat titlul generic, deci se foloseste
   * doar cand arata a nume.
   */
  const catBrut = (Array.isArray(sp.cat) ? sp.cat[0] : sp.cat)?.trim() ?? "";
  let categorie = "";
  let radacinaPagina = `${radacina}/${SEGMENT_MAGAZIN}`;
  // Categoria e in cale sau in interogare; in ambele cazuri se cauta in tabel, ca
  // titlul sa fie numele adevarat si canonicalul adresa adevarata.
  // Fara subarborii stinsi: pagina lor da 404, iar metadata unei pagini care nu
  // exista n-are ce descrie.
  const categorii = categorieSlug || catBrut
    ? categoriiVizibile(
        (await admin.from("categories").select("id, name, parent_id, is_active").eq("business_id", business.id).limit(1000)).data ?? [],
      )
    : [];

  if (categorieSlug) {
    // Si printre categoriile purtate doar de produse, ca la randare: importurile
    // lasa des categorii care nu ajung in tabel, iar acelea au pagini adevarate,
    // deci merita titlu adevarat. Cautarea in produse costa, deci se face doar
    // cand tabelul n-a raspuns.
    const gasita = potrivesteCategorie(categorii, categorieSlug)
      ?? potrivesteCategorie(await numeCategoriiDinProduse(business.id), categorieSlug);
    // Fara categorie nu exista pagina: ruta va da 404, iar metadata unei pagini
    // care nu exista n-are ce descrie.
    if (!gasita) return {};
    categorie = gasita.name;
    radacinaPagina = `${radacina}/${SEGMENT_MAGAZIN}/${slugCategorie(gasita.name)}`;
  } else if (catBrut) {
    /*
     * Forma veche, `?cat=`, isi trimite acum valoarea catre pagina categoriei.
     *
     * `cat` poate purta si un id de categorie, cand vine dintr-un element de
     * meniu. Cautarea acopera ambele, deci si linkurile alea capata in sfarsit un
     * titlu cu nume, nu unul generic. Canonicalul se muta pe pagina categoriei ca
     * cele doua adrese sa nu se concureze in index — dar numai cand categoria
     * chiar exista, altfel ar arata catre un 404.
     */
    const gasita = categorii.find((c) => c.id === catBrut)
      ?? categorii.find((c) => c.name.toLowerCase() === catBrut.toLowerCase());
    if (gasita) {
      categorie = gasita.name;
      radacinaPagina = `${radacina}/${SEGMENT_MAGAZIN}/${slugCategorie(gasita.name)}`;
    } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(catBrut)) {
      // Nume care nu e in tabel (categorie ramasa doar pe produse, dintr-un
      // import): bun de titlu, dar canonicalul ramane pe catalog.
      categorie = catBrut.slice(0, 80);
    }
  }

  // Categoria nu mai are ce cauta in interogarea canonicalului: o poarta calea.
  const { url, indexabila } = canonicalCatalog(radacinaPagina, { ...sp, cat: undefined });

  // Aceleasi doua siruri le foloseste si nodul `CollectionPage` din randare.
  const { titlu: title, descriere: description } = titluSiDescriere(seo, categorie, displayName, business.store_city);
  const images = business.cover_url ? [business.cover_url] : [];

  /*
   * ⚠ REZULTATELE DE CAUTARE NU SE INDEXEAZA, NICIODATA.
   *
   * Google o cere limpede in indrumarul pentru webmasteri, si are dreptate: spatiul de
   * adrese e nesfarsit — orice termen scris de oricine ar fi devenit o pagina — iar
   * paginile alea n-au continut propriu, doar o felie din catalog.
   *
   * `follow: true` ramane: legaturile catre produse merita urmarite.
   */
  if (esteCautare) {
    /* ⚠ Citit ca vecinii lui: un `?q=a&q=b` ajunge tablou, iar `.trim()` pe tablou
       ar fi cazut in randare, nu la compilare. */
    const termen = ((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim().slice(0, 80);
    return {
      title: { absolute: termen ? `Rezultate pentru „${termen}” · ${displayName}` : `Caută · ${displayName}` },
      description,
      robots: { index: false, follow: true },
      alternates: { canonical: `${radacina}/${SEGMENT_CAUTARE}` },
    };
  }

  return {
    // `absolute` scoate template-ul „%s | Edinio" al radacinii: pe domeniul
    // comerciantului, fila din browser n-are ce cauta cu numele platformei.
    title: { absolute: title },
    description,
    // Filtrele deschid un spatiu combinatoriu: o pagina cu doua sau mai multe
    // bife nu se indexeaza, dar linkurile din ea se urmaresc mai departe.
    ...(seo.noindex || !indexabila ? { robots: { index: false, follow: true } } : {}),
    openGraph: { type: "website", locale: "ro_RO", siteName: displayName, title, description, url, images },
    twitter: { card: images.length ? "summary_large_image" : "summary", title, description, ...(images.length ? { images } : {}) },
    alternates: { canonical: url },
  };
}

export async function RandeazaMagazin({ slug, sp, categorieSlug, esteCautare }: Argumente) {
  const supabase = await createClient();
  /*
   * Randul de magazin vine din citirea DEDUPLICATA a antetului, nu dintr-o a doua
   * interogare. Layout-ul l-a adus deja in aceeasi randare, cu `cache()` din React.
   *
   * `incarcaMagazinul` poarta si refuzul: citirea de dinainte trecea prin RLS
   * (`is_published = true`), deci pentru un strain un magazin nepublicat intorcea
   * nimic si pagina raspundea 404. Aceeasi purtare, acum scrisa explicit.
   */
  const { data: { user } } = await supabase.auth.getUser();
  const acces = await incarcaMagazinul(slug, user?.id);
  if (!acces) notFound();
  const { business, esteProprietar: isOwner } = acces;

  const admin = createAdminClient();
  const { data: storeSettings } = await admin
    .from("store_settings")
    .select("id, business_id, page_content, store_policies, default_shipping_cost, free_shipping_threshold, min_order_amount, storefront_design, storefront_design_draft")
    .eq("business_id", business.id)
    .single();

  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${slug}`;

  // Ciorna se randeaza DOAR in editorul de design, exact ca pe pagina
  // principala; pana la Publica, vizitatorii vad versiunea publicata.
  //
  // ⚠ Nu pe `preview=1`: il pune si „Editeaza magazinul", care nu stie nimic
  // despre ciorne. Regula sta intr-un singur loc, in `preview-protocol.ts`,
  // fiindca prima oara cele doua suprafete au divergat tacut exact aici.
  const isPreview = sp.preview === "1";
  const esteEditorDesign = esteEditorDeDesign(sp as { preview?: string; editor?: string }, isOwner);
  const useDraft = esteEditorDesign && !!storeSettings?.storefront_design_draft;
  const resolved = resolveDesign(useDraft ? storeSettings?.storefront_design_draft : storeSettings?.storefront_design, {
    primaryColor: business.primary_color ?? "#1AB554",
    pageContent: (storeSettings?.page_content as Record<string, unknown>) ?? {},
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });
  // Citite o data, aici: le cer si felierea de pe server (`perPage`), si titlul
  // catalogului din firimituri si din `CollectionPage`.
  const setari = citesteSetariMagazin(resolved.design);

  /*
   * Magazinul cu un singur produs n-are catalog, prin definitie.
   *
   * Verificarea NU e in tiparul copiat de la cos, si lipsa ei ar fi anulat
   * dintr-o data cele trei reguli ale modului: pagina principala randeaza
   * produsul in locul catalogului, `/product/*` face 301 catre ea, iar sitemapul
   * nu listeaza produse. O pagina care le arata pe toate, indexabila, ar fi
   * ocolit toate trei. Se verifica INAINTEA gate-ului de design.
   */
  if (parseStoreMode((storeSettings?.page_content as Json) ?? null).mode === "one_product") {
    redirect(radacinaMagazinCuFiltre(basePath, sp));
  }

  /*
   * Magazinul are produsele pe pagina principala: pagina de CATALOG n-are ce cauta.
   * Redirect, nu 404 — un link vechi trebuie sa duca in magazin, nu intr-o pagina de
   * eroare.
   *
   * ⚠ PAGINA DE REZULTATE FACE EXCEPTIE, si asta e chiar rostul ei.
   *
   * Cautarea din header e in toate cele sapte design-uri. Daca rezultatele ar depinde
   * de o alegere de design, ar fi dus la o pagina adevarata la unii comercianti si
   * inapoi pe pagina principala — peste erou, peste randurile de produse — la altii.
   * Chiar ce a raportat eSAFE: „sunt tot pe pagina principala".
   */
  if (!esteCautare && !shopOnPage(resolved.design)) redirect(radacinaMagazinCuFiltre(basePath, sp));

  if (!business.is_published && !isOwner) redirect(radacinaMagazinCuFiltre(basePath, sp));

  // Magazin suspendat sau abonament expirat: pagina principala arata deja
  // „suspendat", dar de aici se putea cumpara mai departe. Aceeasi verificare ca
  // pe rutele frate de cos si de finalizare; proprietarul trece.
  if (!isOwner) {
    let suspendat = business.suspended_until ? new Date(business.suspended_until) < new Date() : false;
    if (!suspendat) {
      const { data: ownerProfile } = await admin
        .from("users_profile").select("plan, plan_expires_at").eq("id", business.user_id).single();
      if ((ownerProfile?.plan === "free" || ownerProfile?.plan === "trial") && ownerProfile?.plan_expires_at) {
        suspendat = new Date(ownerProfile.plan_expires_at) < new Date();
      }
    }
    if (suspendat) {
      return (
        <SuspendedStorePage
          businessName={business.store_name ?? business.business_name}
          primaryColor={business.primary_color}
          phone={business.phone}
        />
      );
    }
  }

  /*
   * Ordinea: agregatele INTAI, decizia, apoi produsele.
   *
   * Decizia „cine feliaza" are nevoie de numarul total, care sta in rezumat.
   * Citit dupa produse, palierul server ar fi citit si tot catalogul, SI pagina —
   * adica exact invers decat scopul. Rezumatul si categoriile sunt amandoua
   * ieftine (un rand, respectiv cateva zeci), deci valul asta nu costa nimic.
   */
  const pc = (storeSettings?.page_content as Record<string, unknown>) ?? {};
  const faraImagini = pc.hide_products_without_images === true;
  const faraStocAscuns = pc.hide_out_of_stock_products === true;

  const [rezumatRaspuns, categoriesData] = await Promise.all([
    proiectieDb()
      .from("catalog_rezumat")
      .select("total, price_min, price_max, categorii, fatete")
      .eq("business_id", business.id)
      .eq("fara_imagini", faraImagini)
      .eq("fara_stoc_ascuns", faraStocAscuns)
      .maybeSingle(),
    fetchAllRows("storefront.magazin.categories", (from, to) =>
      supabase
        .from("categories")
        // `is_active` vine INTREAGA, nefiltrata: subarborele unei categorii
        // stinse se calculeaza in `lib/categories/vizibilitate.ts`, iar el nu se
        // mai poate deduce dupa ce randul a fost scos din lista.
        .select("id, name, parent_id, image_url, sort_order, is_active")
        .eq("business_id", business.id)
        .order("sort_order")
        .order("id")
        .range(from, to)),
  ]);
  const rezumat = (rezumatRaspuns.data ?? null) as unknown as {
    total: number; price_min: number; price_max: number; categorii: string[];
    fatete: { jetoane?: string[]; fatete?: Fateta[] };
  } | null;

  /*
   * Ce pleaca in browser: lista FARA subarborii stinsi, plus numele lor.
   *
   * Amandoua se calculeaza aici, pe server. Trimisa intreaga, lista ar fi ajuns
   * in HTML-ul fiecarui vizitator cu tot cu raioanele scoase din magazin —
   * randuri pe care browserul nu le randeaza niciodata, dar care se citesc din
   * sursa paginii. Numele stinse merg separat, fiindca grila are nevoie de ele ca
   * sa scoata produsele acelor categorii.
   */
  const categoriiDeNavigat = categoriiVizibile(categoriesData);
  const numeStinse = numeCategoriiAscunse(categoriesData);

  /*
   * Fara rezumat, palierul client — si nu e un caz teoretic: un magazin nou n-are
   * randuri pana la prima trecere a cronului. Calea veche merge oricum, deci
   * lipsa rezumatului intarzie castigul, nu strica pagina.
   */
  const palier = rezumat
    ? alegePalier({ pageContent: pc, totalProduse: rezumat.total, publicat: business.is_published === true })
    : "client";
  const peServer = palier === "server";



  /*
   * Categoria din cale, daca pagina e a unei categorii.
   *
   * Se cauta si printre numele de categorie purtate DOAR de produse: importurile
   * lasa des categorii care nu exista in tabel, iar acelea apar in navigare ca
   * „orfane". O pagina 404 pentru un link pe care magazinul singur il arata ar
   * fi cel mai prost raspuns cu putinta.
   */
  let categorieDinCale: (CategorieMinima & { areCopii: boolean; numeParinte: string | null }) | null = null;
  let numeCategorie = "";
  if (categorieSlug) {
    // Cautarea se face in lista VIZIBILA: pagina unei categorii stinse trebuie sa
    // raspunda 404, nu sa-si arate raftul pe alta usa.
    const gasita = potrivesteCategorie(categoriiDeNavigat, categorieSlug);
    if (gasita) {
      numeCategorie = gasita.name;
      categorieDinCale = {
        id: gasita.id,
        name: gasita.name,
        parent_id: gasita.parent_id,
        areCopii: categoriiDeNavigat.some((c) => c.parent_id === gasita.id),
        numeParinte: categoriiDeNavigat.find((c) => c.id === gasita.parent_id)?.name ?? null,
      };
    } else {
      // Categoriile purtate DOAR de produse. Pe palierul server vin din rezumat;
      // pe client se citesc dintr-o interogare dedicata, ca sa nu depinda de
      // produsele care se incarca abia mai jos. Numele stinse ies si de aici,
      // altfel o categorie stinsa si-ar fi gasit pagina pe usa din dos.
      const orfane = (rezumat
        ? rezumat.categorii
        : (await numeCategoriiDinProduse(business.id)).map((c) => c.name))
        .filter((n) => !numeStinse.has(n));
      const numeOrfan = potrivesteCategorie(orfane.map((n) => ({ name: n })), categorieSlug)?.name;
      if (!numeOrfan) notFound();
      numeCategorie = numeOrfan;
    }
  }

  /*
   * Fatetele vin din jetoanele deja calculate de proiector.
   *
   * Se calculau aici, pe randul BRUT, fiindca brandul si specificatiile stau in
   * `page_sections` si nu supravietuiau slimuirii — deci pagina trebuia sa
   * citeasca tot randul doar ca sa afle dupa ce se poate filtra. Acum perechile
   * sunt scrise o data, la salvarea produsului, si se citesc ca `text[]`.
   *
   * Politica ramane NESCHIMBATA: aceleasi praguri, aceeasi deduplicare, aceeasi
   * ordonare. `construiesteFateteDinJetoane` trece prin exact aceeasi agregare ca
   * `construiesteFatete`; difera doar de unde vin perechile.
   */
  /*
   * Fatetele, filtrele si produsele — pe calea palierului.
   *
   * DEPENDENTA CIRCULARA, si cum se rupe: RPC-ul are nevoie de filtrele parsate;
   * `citesteFiltreDinAdresa` are nevoie de lista de fatete, ca sa stie ce chei din
   * adresa sunt valide; iar fatetele se construiau din produse. Pe server nu se
   * pot astepta produsele. Deci pe server fatetele vin din REZUMAT (exista deja),
   * iar pe client raman construite din produse, ca pana acum. Doua cai, fiecare cu
   * sursa ei de adevar.
   *
   * Politica de fatete e aceeasi in ambele: `construiesteFateteDinJetoane` a scris
   * rezumatul, si tot ea ruleaza pe calea client.
   */
  // Valori de pornire, nu implicite cu inteles: a doua ramura ruleaza ori de cate
  // ori prima n-a reusit, deci amandoua le rescriu. Sunt aici doar fiindca `tsc`
  // nu poate dovedi ca `if (...) {} if (!reusit) {}` acopera totul.
  let fateteDePagina: Fateta[] = [];
  let jetoaneDePagina: string[] = [];
  let products: StorefrontProduct[] = [];
  let totalVizibile = 0;
  let totalFiltrate = 0;
  let filtre = citesteFiltreDinAdresa(sp, []);

  let reusitPeServer = false;
  if (peServer && rezumat) {
    fateteDePagina = rezumat.fatete?.fatete ?? [];
    jetoaneDePagina = rezumat.fatete?.jetoane ?? [];
    filtre = citesteFiltreDinAdresa(sp, fateteDePagina);

    // EXACT marimea pe care o calculeaza si renderer-ul (`PRODUCTS_PER_PAGE`).
    // Diferite, felierea de pe server si numarul de pagini din browser s-ar
    // contrazice: ultima pagina ar fi goala, sau ar lipsi produse de pe ea.
    const perPagina = setari.perPage;

    /*
     * Sortarea EFECTIVA, nu cea din adresa.
     *
     * Clientul o compune ca `sortare || sortareImplicita || default_sort`
     * (MiniStoreRenderer). Trimis brut, un `?sort=` lipsa insemna pe server
     * „ordinea de catalog" si in browser „newest" — aceleasi produse, alta
     * ordine, deci alte pagini. Testul diferential a prins asta pe 20 din 20 de
     * carduri pe prima pagina.
     */
    const sortareImplicita = (pc.sort_options as { default_sort?: string } | undefined)?.default_sort ?? "newest";
    const sortareEfectiva = filtre.sortare || setari.sortareImplicita || sortareImplicita;

    /*
     * Categoria vine SI din `?cat=`, nu doar din cale.
     *
     * `?cat=` poate purta numele categoriei sau ID-ul ei (linkurile de meniu).
     * Ignorate aici, serverul intorcea tot catalogul in timp ce browserul filtra
     * — server 20, client 7. Aceeasi traducere ca `initialCategory` de mai jos;
     * calea bate interogarea, fiindca pagina se numeste dupa ea.
     */
    const categoriaCeruta = numeCategorie
      || (filtre.categorie && categoriiDeNavigat.find((c) => c.id === filtre.categorie)?.name)
      || filtre.categorie
      || "";
    // Subarborele se ia din lista vizibila: o subcategorie stinsa n-are ce cauta
    // in filtrul parintelui ei aprins. RPC-ul taie oricum si el, pe aceeasi
    // regula (`public.categorii_ascunse`); aici e ca cele doua sa ceara la fel.
    const numeleFiltrate = categoriaCeruta ? numeSubarbore(categoriiDeNavigat, categoriaCeruta) : null;
    // Grupate pe cheie: SAU inauntru, SI intre chei — ca `trecefiltrele`.
    const filtreRpc = {
      categorii: numeleFiltrate,
      pretMin: filtre.pretMin,
      pretMax: filtre.pretMax,
      reduceri: filtre.reduceri,
      stoc: filtre.stoc,
      faraImagini,
      faraStocAscuns,
      fatete: Object.entries(filtre.fatete).map(([cheie, valori]) => valori.map((v) => jeton(cheie, v))),
    };

    let pag: { randuri: RandProiectie[]; total: number } | null = null;
    if (filtre.cautare.trim()) {
      /*
       * Cu `?q=`, pagina vine din cautare, nu din `catalog_pagina`.
       *
       * Sortarea e ALTA aici: cat timp se cauta si adresa nu cere explicit o
       * sortare, ordinea e RELEVANTA — nu implicitul magazinului. Vezi
       * `sortareLaCautare`, unde sta motivul si de ce e o functie cu nume.
       *
       * `null` inseamna „nu pot raspunde" (magazin neindexat, cuvant prea comun,
       * RPC picat), NU „zero rezultate": atunci `reusitPeServer` ramane fals si
       * pagina cade pe calea veche, cu catalogul intreg si cautarea in browser.
       */
      pag = await cautaPeServer({
        businessId: business.id,
        q: filtre.cautare,
        filtre: filtreRpc,
        sortare: sortareLaCautare(filtre.sortare),
        limit: perPagina,
        offset: (filtre.pagina - 1) * perPagina,
        slug: business.slug,
      });
    } else {
      const { data: raspuns, error: eroareRpc } = await proiectieDb().rpc("catalog_pagina", {
        p_business: business.id,
        p_filtre: { ...filtreRpc, sortare: sortareEfectiva },
        p_limit: perPagina,
        p_offset: (filtre.pagina - 1) * perPagina,
      });
      /*
       * Un RPC stricat NU are voie sa randeze un catalog gol.
       *
       * Exact asta s-a intamplat la prima aprindere: `categorii: null` facea
       * functia sa arunce (`jsonb_array_elements` pe un null JSON), clientul
       * Supabase inghitea eroarea in `data: null`, si magazinul afisa
       * „0 din 1049 produse" — fara nicio urma nicaieri. Un catalog gol arata a
       * magazin fara marfa, nu a defect, deci nu-l raporteaza nimeni.
       *
       * De acum orice esec se scrie in loguri SI cade pe calea veche. Aia e mai
       * lenta, dar e intreaga; palierul server e o optimizare, si o optimizare
       * n-are voie sa fie singurul drum catre produse.
       */
      if (eroareRpc || !raspuns) {
        console.error(`[catalog] catalog_pagina a esuat pentru ${business.slug}:`, eroareRpc?.message ?? "raspuns gol");
      }
      pag = (raspuns ?? null) as { randuri: RandProiectie[]; total: number } | null;
    }
    products = (pag?.randuri ?? []).map((r) => {
      const p = dinProiectie(r);
      // Indicii trebuie sa arate catre dictionarul REZUMATULUI, nu catre unul
      // construit din pagina: altfel bifele din bara ar arata alte valori decat
      // cele pe care le filtreaza serverul.
      const f = (r.fatete ?? []).map((j) => jetoaneDePagina.indexOf(j)).filter((i) => i >= 0);
      return f.length ? { ...p, f } : p;
    });
    if (pag) {
      totalVizibile = rezumat.total;
      totalFiltrate = pag.total;
      reusitPeServer = true;

      /*
       * O pagina dincolo de ultima e 404, nu o pagina goala.
       *
       * `?page=500` pe un catalog de 53 de pagini randa un catalog fara niciun
       * produs, cu raspuns 200. Search Console citeste asta ca SOFT 404 si ii
       * scade increderea in restul paginilor de acelasi fel — adica exact in
       * paginile 2..N pentru care s-a facut toata paginarea crawlabila.
       *
       * `notFound()` se cheama AICI, in componenta care randeaza pagina, nu
       * intr-o bucata de sub `<Suspense>`: aruncat de acolo, invelisul ar fi fost
       * deja trimis cu 200 si raspunsul ar fi ramas 200 cu un 404 desenat
       * inauntru. Vezi [[suspense-coaja-pagini]].
       *
       * Pagina 1 goala NU e 404: un magazin fara produse, sau un filtru fara
       * rezultate, sunt raspunsuri valide si trebuie sa arate mesajul lor.
       */
      if (filtre.pagina > 1 && products.length === 0) notFound();
    }
  }

  if (!reusitPeServer) {
    const productsRaw = await fetchAllRows("storefront.magazin.products", (from, to) =>
      proiectieDb()
        .from("catalog_produs")
        .select(COLOANE_PROIECTIE)
        .eq("business_id", business.id)
        .order("is_featured", { ascending: false })
        .order("sort_order")
        .order("product_id")
        .range(from, to));
    const randuri = productsRaw as unknown as RandProiectie[];
    const index = construiesteFateteDinJetoane(
      randuri.map((r) => ({ id: r.product_id, fatete: r.fatete })),
    );
    fateteDePagina = index.fatete;
    jetoaneDePagina = index.jetoane;
    filtre = citesteFiltreDinAdresa(sp, fateteDePagina);
    // Adnotarea tabloului, nu un cast: `as StorefrontProduct` ar fi trecut chiar
    // daca lipsea un camp, fiindca tipul tinta e asignabil catre forme mai sarace.
    products = randuri.map((r) => {
      const p = dinProiectie(r);
      const f = index.perProdus.get(r.product_id);
      return f ? { ...p, f } : p;
    });
    // Pe palierul client numerele se calculeaza oricum in browser; astea sunt
    // doar valorile de pornire.
    totalVizibile = products.length;
    totalFiltrate = products.length;
  }

  /*
   * DACA S-A CAZUT PE CALEA VECHE, BROWSERUL TREBUIE SA AFLE.
   *
   * `palier` spune ce s-a DECIS; asta spune ce s-a INTAMPLAT, si numai al doilea
   * are voie sa ajunga la renderer. Trimis „server" peste un `products` care e
   * catalogul INTREG, renderer-ul nu mai filtreaza, nu mai sorteaza si mai ales nu
   * mai feliaza — deci pagina ar fi randat toate cele 1.049 de carduri deodata,
   * nefiltrate si necautate, la o adresa care cerea douazeci.
   *
   * Defectul exista deja pe calea de eroare a RPC-ului, unde era rar. Cautarea il
   * face obisnuit: un cuvant prea comun cade pe calea veche prin proiectare.
   */
  const palierRandat = reusitPeServer ? palier : "client";

  // Analitica: aterizarile directe pe pagina de catalog sunt vizite reale, la
  // fel ca cele pe pagina principala. Aceleasi excluderi — proprietarul si
  // gazdele care nu sunt de productie, ca preview-ul sa nu scrie in statistici.
  if (!isOwner && !isNonProductionHost(host)) {
    const anteturi = await headers();
    const ua = anteturi.get("user-agent") ?? "";
    const device = /mobile/i.test(ua) ? "mobile" : /tablet/i.test(ua) ? "tablet" : "desktop";
    /*
      ═══ ⚠ SURSA SE MASOARA, NU SE PRESUPUNE (02.09.2026) ═══

      `source`, `referrer` si `metadata` nu se scriau NICIODATA: 0 randuri
      completate din 15.306. Dar panoul comerciantului are o sectiune „Surse de
      trafic", iar acolo lipsa devenea afirmatie (`e.source ?? "direct"`).

      Deci fiecare comerciant vedea „Direct 100%" — o cifra pe care se taie
      bugete de reclama. Nu lipsea o cifra; era una FALSA.

      Iar `country` era scris in cod ca `"RO"`, pentru orice vizitator din lume.

      ⚠ TOT CE SE CITESTE DIN ANTETURI SE CITESTE AICI, in randare. In `after`
      nu se mai poate — vezi nota de mai jos.
    */
    const referrerBrut = anteturi.get("referer");
    const sursaVizitei = clasificaSursa({
      utmSource: primaValoare(sp.utm_source),
      gclid: primaValoare(sp.gclid),
      fbclid: primaValoare(sp.fbclid),
      ttclid: primaValoare(sp.ttclid),
      referrer: referrerBrut,
      gazdaProprie: host,
    });
    const taraVizitatorului = taraDinAnteturi(anteturi);
    const referrerVizitei = referrerScurt(referrerBrut);

    // `after`, ca pe pagina principala: un `.then()` lasat sa atarne nu tine
    // raspunsul, dar nici nu e garantat sa apuce sa se scrie. Antetele se citesc
    // AICI, nu in callback. Nu face ruta dinamica.
    //
    // Scriem cu SERVICE ROLE, nu cu clientul vizitatorului. Politica publica de
    // INSERT (`with_check true`) a fost stearsa: permitea oricui cu cheia anon
    // sa injecteze evenimente pentru ORICE magazin — statistici otravite si
    // crestere necontrolata a bazei. Serverul stie deja ce magazin randeaza.
    const ipVizitator = clientIpFromHeaders(anteturi);
    /*
     * Limita pe IP inaintea scrierii.
     *
     * Scrierea de analitice era SINGURA scriere publica fara NICIUN limitator —
     * nici in memorie, nici durabil. Un script care cere `/{slug}` in bucla
     * insereaza un rand la fiecare cerere, cu service role, deci ocolind si RLS-ul
     * si orice plafon. Tabela a ajuns a cincea ca marime a bazei doar din trafic
     * NORMAL; e cel mai ieftin mod de a umfla baza platformei si de a otravi
     * statisticile unui comerciant.
     *
     * Exact atacul pentru care s-a sters deja politica publica de INSERT — doar ca
     * atunci s-a inchis usa clientului si a ramas deschisa cea a serverului.
     *
     * Sta INAUNTRUL lui `after`, deci nu intra pe drumul raspunsului. Iar `ip` se
     * citeste AICI, in randare: antetele nu se pot citi din callback.
     */
    after(async () => {
      const { permis } = await consumaLimita(`analytics:${ipVizitator}`, 120, 3600);
      if (!permis) return;
      await createAdminClient().from("site_analytics").insert({
        business_id: business.id,
        event_type: "visit",
        device,
        source: sursaVizitei,
        referrer: referrerVizitei,
        /*
          ⚠ TARA SE PUNE DOAR CAND E STIUTA, si cheia lipseste cu totul altfel.

          Coloana e `NOT NULL DEFAULT 'RO'` — deci un `null` explicit n-ar strica
          randul, l-ar face SA NU EXISTE: vizita s-ar pierde de tot. Verificat in
          schema, nu presupus; iar `tsc` a prins-o inainte sa ajunga in productie.

          ⚠ RAMANE O JUMATATE DE MINCIUNA, si o spun aici ca sa nu se uite: cand
          antetul lipseste, baza scrie tot „RO". Pe Vercel antetul e practic mereu
          acolo, deci cazul e rar — dar reparatia intreaga cere o migrare care
          scoate `NOT NULL` si implicitul, si aia se face separat, cu voie.
        */
        ...(taraVizitatorului ? { country: taraVizitatorului } : {}),
      });
    });
  }

  // `?cat=` poate purta numele categoriei (headere, footer) sau id-ul ei
  // (linkurile de meniu de tip categorie). Filtrul lucreaza pe nume, deci
  // id-urile se traduc aici; altfel linkul din meniu ar duce la un catalog gol.
  // Categoria din cale bate orice `?cat=`: pagina se numeste dupa ea.
  const initialCategory = numeCategorie
    || (filtre.categorie && categoriiDeNavigat.find((c) => c.id === filtre.categorie)?.name)
    || filtre.categorie
    || "toate";

  /*
   * Ciorna de design nu are voie sa iasa din functia asta.
   *
   * `storeSettings` ajunge INTREG ca prop la o componenta de client, iar React
   * serializeaza props-urile in HTML: coloana de ciorna — pana la 200 KB de
   * design nepublicat — ar ajunge in pagina fiecarui vizitator anonim. Tipul
   * propului n-o contine, dar un tip nu curata nimic la executie.
   */
  const setariDeTrimis = storeSettings ? { ...storeSettings, storefront_design_draft: null } : null;

  const dateStructurate = construiesteDateCatalog({
    business,
    seo: parseStoreSeo(storeSettings?.page_content ?? null),
    setari,
    sp,
    // Filtrele PARSATE, nu `sp` brut: `citesteFiltreDinAdresa` a aruncat deja
    // cheile care nu sunt fatete reale ale magazinului, deci `utm_source` si
    // `gclid` — adica aterizarea din orice reclama — nu trec drept filtre.
    filtre,
    numeCategorie,
    parinteCategorie: categorieDinCale?.numeParinte ?? null,
    products,
    reusitPeServer,
    esteCiorna: isPreview || !business.is_published,
  });

  return (
    <>
      {dateStructurate ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: dateStructurate }} />
      ) : null}
    <MiniStoreRenderer
      surface="shop"
      business={pentruBrowser(business)}
      products={products}
      storeSettings={setariDeTrimis as never}
      basePath={basePath}
      categories={categoriiDeNavigat}
      design={resolved.design}
      designStyle={resolved.style}
      editorDesign={esteEditorDesign}

      fatete={fateteDePagina}
      jetoane={jetoaneDePagina}
      palier={palierRandat}
      totalVizibileServer={totalVizibile}
      totalFiltrateServer={totalFiltrate}
      // Numele de categorie cu produse vin din rezumat: derivate din pagina
      // curenta, ar disparea din meniu toate categoriile fara produse pe ea.
      numeCategoriiCuProduse={reusitPeServer ? rezumat?.categorii : undefined}
      // Numai cand filtrarea chiar se face in browser: pe palierul server
      // produsele vin deja taiate de RPC, iar numele stinse ar fi singurul loc
      // din HTML din care s-ar afla ce raioane si-a stins comerciantul.
      numeCategoriiStinse={reusitPeServer ? undefined : [...numeStinse]}
      // Capetele filtrului de pret descriu TOT catalogul, nu pagina trimisa.
      intervalServer={reusitPeServer && rezumat
        ? { min: Number(rezumat.price_min), max: Number(rezumat.price_max) }
        : undefined}
      initialPage={filtre.pagina}
      initialSearch={filtre.cautare}
      initialCategory={initialCategory}
      initialOnSale={filtre.reduceri}
      initialInStock={filtre.stoc}
      initialPriceMin={filtre.pretMin}
      initialPriceMax={filtre.pretMax}
      initialSelectieFatete={filtre.fatete}
      initialSort={filtre.sortare}
      // Calea se compune din numele gasit, nu din segmentul cerut: „Bocanci" si
      // „bocanci" duc la aceeasi pagina, iar paginarea si filtrele trebuie sa
      // ramana pe adresa canonica a categoriei.
      caleCategorie={numeCategorie
        ? `${shopHref(basePath)}/${slugCategorie(numeCategorie)}`
        : undefined}
      initialDrillParentId={categorieDinCale
        ? (categorieDinCale.areCopii ? categorieDinCale.id : categorieDinCale.parent_id)
        : null}
      parinteCategorie={categorieDinCale?.numeParinte ?? null}
    />
    </>
  );
}
