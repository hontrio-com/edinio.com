/*
 * Foaia magazinelor, nu a aplicatiei (19.11.2026): aceleasi reguli, dar cu utilitarele generate doar din fisierele
 * vitrinei. Vezi `app/vitrina.css`.
 */
import "../../vitrina.css";
import { headers } from "next/headers";
import { incarcaAntetMagazin, setarileDin } from "@/lib/storefront/antet-magazin";
import { FacebookPixel } from "@/components/public/FacebookPixel";
import { TikTokPixel } from "@/components/public/TikTokPixel";
import { TheMarketerTracking } from "@/components/public/TheMarketerTracking";
import { vitrinaTheMarketer, type SetariTMBrute, type VitrinaTM } from "@/lib/themarketer/vitrina";
import { GoogleTag } from "@/components/public/GoogleTag";
import { corpEticheteiGoogle } from "@/lib/eticheta-google/corp";
import { parseIdConversieAds } from "@/lib/google-ads/conversie";
import { ConsentGate } from "@/components/public/ConsentGate";
import { CookieConsent } from "@/components/public/CookieConsent";
import { AttributionCapture } from "@/components/public/AttributionCapture";
import { DoarInMagazinReal, DoarInPrevizualizare } from "@/components/public/DoarInMagazinReal";
import { DoarInAfaraContului } from "@/components/public/DoarInAfaraContului";
import type { MarketingConfig } from "@/lib/marketing-config";
import type { GoogleAnalyticsConfig } from "@/lib/google-analytics/types";
import { detectConsentCategories, parseCookieBannerConfig } from "@/lib/cookie-consent";
import { deriveStoreDescription, deriveStoreTitle, parseStoreSeo, robotsVitrinaPeGazda, verificareGooglePentru } from "@/lib/seo";
import { esteDomeniulPropriu } from "@/lib/platform-hosts";
import { adreseFaraSlug } from "@/lib/teme/gazde-demo";
import type { Metadata } from "next";
import { contulMagazinului as contulMagazinuluiPeCerere } from "@/lib/cont/config";
import { ContulMagazinuluiProvider } from "@/components/storefront/cont/ContulMagazinului";
import { PermalinkuriProvider } from "@/components/storefront/PermalinkuriMagazin";
import { permalinkuriDin } from "@/lib/storefront/permalinkuri";
import { FeteRomanesti } from "@/components/pages/FeteRomanesti";
import { culoareMagazin } from "@/lib/storefront/culoare-magazin";
import { contrastOn } from "@/lib/storefront/design/css-vars";
import { IdentitateMagazinProvider } from "@/components/storefront/IdentitateMagazin";
import { sanitizeNetopiaBadge } from "@/lib/utils/sanitize-embed";
import { ButonContactLaCerere } from "@/components/storefront/suport/ButonContactLaCerere";
import { MartorButonContact } from "@/components/storefront/suport/MartorButonContact";
import { ChatInMagazinProvider, type ModChat } from "@/components/storefront/suport/ChatInMagazin";
import { vitrinaSuport, type SetariSuportBrute, type VitrinaSuport } from "@/lib/suport/config";
import { numeleFurnizorului } from "@/lib/suport/furnizori";
import { whatsappLink } from "@/lib/utils/format";

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

/**
 * Identitatea magazinului, pusa pe TOT ce se randeaza sub `/[slug]`.
 *
 * Favicon si verificarea Search Console au stat aici de la inceput. Titlul,
 * descrierea si OpenGraph sunt noi, si sunt aici dintr-un motiv precis: paginile
 * si le pun singure, dar 404-ul NU poate. `not-found.tsx` nu accepta
 * `generateMetadata` — antetul lui vine de la cel mai apropiat layout — asa ca
 * orice adresa gresita de pe domeniul unui comerciant servea titlul, descrierea
 * si og:title ale PLATFORMEI pe domeniul comerciantului — masurat pe
 * caian-textile.ro.
 *
 * ⚠ Randul de mai sus citea pana azi titlul de atunci al radacinii, cuvant cu
 * cuvant. Pe 04.09.2026 textele platformei s-au schimbat, iar citatul ar fi
 * ramas sa arate spre ceva ce nu mai exista — deci s-a scos exemplul si a ramas
 * defectul, care e partea care conteaza. Titlul curent al radacinii se citeste
 * din `app/layout.tsx`; el nu mai ajunge aici, fiindca golul e umplut mai jos.
 *
 * Sunt IMPLICITE, nu impuse: orice pagina care isi declara titlul sau OpenGraph
 * il pastreaza, fiindca segmentul mai adanc castiga. Umplu doar golul.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await incarcaAntetMagazin(slug);
  if (!data) return {};
  const settings = setarileDin<{ page_content: unknown }>(data);
  const favicon = ((settings?.page_content ?? null) as { favicon_url?: string | null } | null)?.favicon_url || data.logo_url;
  // Google Search Console "HTML tag" verification, set in Settings > SEO.
  const seo = parseStoreSeo(settings?.page_content ?? null);

  const numeAfisat = data.store_name ?? data.business_name;
  const titlu = seo.title || deriveStoreTitle(numeAfisat, data.store_city);
  const descriere = seo.description || deriveStoreDescription({
    tagline: data.tagline,
    description: data.description,
    displayName: numeAfisat,
  });
  const imagini = seo.ogImage || data.cover_url ? [seo.ogImage || data.cover_url!] : [];

  const meta: Metadata = {
    /*
     * `absolute`, nu `default`, si iata de ce.
     *
     * `default` e tot un titlu, deci sablonul radacinii („%s | Edinio") se
     * aplica peste el: pe 404-ul de la caian-textile.ro a iesit „Caian Textile |
     * Prosoape Hotel & HoReCa Romania | Edinio" — numele platformei se
     * intorsese pe alta usa. `absolute` opreste sablonul de deasupra, iar
     * paginile de dedesubt care nu-si declara titlul il mostenesc ca atare.
     *
     * `template` ramane, pentru copiii care si-ar declara titlul ca sir simplu:
     * acolo se lipeste numele magazinului, nu al platformei. Azi toate il declara
     * `absolute`, deci e doar plasa de siguranta.
     */
    title: { absolute: titlu, template: `%s | ${numeAfisat}` },
    description: descriere,
    openGraph: { type: "website", locale: "ro_RO", siteName: numeAfisat, title: titlu, description: descriere, images: imagini },
    twitter: { card: imagini.length ? "summary_large_image" : "summary", title: titlu, description: descriere, ...(imagini.length ? { images: imagini } : {}) },
    /*
     * ═══ ⚠ CE MAI CURGEA DE LA RADACINA PE DOMENIUL COMERCIANTULUI (04.09.2026) ═══
     *
     * `keywords` a plecat din radacina, dar familia lui a ramas. Next contopeste
     * metadatele pe CHEI DE NIVEL INTAI: o cheie pe care un layout mai adanc n-o
     * numeste pastreaza valoarea de deasupra (`resolve-metadata.js`, `mergeMetadata`
     * itereaza `for (const key in metadata)`). Deci, pana azi, pe bricosmart.ro iesea:
     *
     *   <link rel="manifest" href="/site.webmanifest">   -> 404 pe domeniul propriu,
     *       fiindca `.webmanifest` nu e in `EXTENSII_STATICE`, deci proxy-ul rescrie
     *       calea in `/{slug}/site.webmanifest`. Iar pe `www.edinio.com/{slug}` da 200
     *       cu manifestul PLATFORMEI: vitrina se instala pe telefon sub numele „Edinio",
     *       cu verdele Edinio.
     *   <meta name="author" content="Edinio">, `creator`, `publisher`, plus
     *       <link rel="author" href="https://www.edinio.com">.
     *
     * ⚠ CHEIA PREZENTA CU `undefined` NU MOSTENESTE, SI NU EMITE NIMIC. Aia e chiar
     * purtarea de care avem nevoie pentru manifest: `for...in` intra si pe cheile puse
     * anume pe `undefined`, iar ramura lui face `?? null`. Un magazin nu are (inca)
     * manifest propriu, si mai bine niciunul decat al altcuiva.
     *
     * Celelalte trei se pot spune ADEVARAT, deci se spun: pe vitrina, autorul,
     * creatorul si editorul sunt comerciantul. Fara adresa: domeniul lui poate fi
     * nelegat inca, iar o legatura `rel="author"` catre o adresa moarta e mai rea
     * decat lipsa ei.
     */
    manifest: undefined,
    authors: [{ name: numeAfisat }],
    creator: numeAfisat,
    publisher: numeAfisat,
  };
  /*
   * ⚠ SE DECLARA SI CAND MAGAZINUL N-ARE PICTOGRAMA (04.09.2026).
   *
   * Randul era `if (favicon) meta.icons = …`, deci un magazin fara `favicon_url`
   * si fara `logo_url` nu numea cheia deloc — iar o cheie nenumita pastreaza
   * valoarea radacinii. Urmarea, pe DOMENIUL LUI PROPRIU: HTML-ul lui anunta
   * setul de pictograme Edinio (`/favicon.ico`, cele doua PNG-uri si
   * `apple-touch-icon`). Aceeasi familie cu `manifest` si `authors` de mai sus,
   * si scapata din aceeasi reparatie.
   *
   * `undefined` stinge cheia fara sa emita nimic — vezi nota de mai sus despre
   * cum contopeste Next cheile de nivel intai.
   *
   * ⚠ CE RAMANE NEACOPERIT, si o spun ca sa nu para inchis: browserul cere
   * `/favicon.ico` din oficiu cand pagina nu declara nicio pictograma, iar `ico`
   * e in `EXTENSII_STATICE`, deci proxy-ul nu rescrie calea si se serveste
   * fisierul din `public/` — al nostru. Aia se repara in proxy, nu aici.
   */
  meta.icons = favicon ? { icon: favicon } : undefined;
  /*
   * Verificarea Search Console se injecteaza NUMAI cand cererea vine de pe
   * domeniul propriu al comerciantului (03.09.2026).
   *
   * Pe `www.edinio.com/{slug}` vitrina e `noindex` (invarianta din
   * `indexare-pe-platforma.ts`), deci n-are ce cauta in Search Console, iar
   * eticheta ar fi lasat un comerciant sa revendice o bucata din site-ul
   * platformei. Codul ramane salvat si se activeaza singur pe domeniul propriu.
   * Regula e in `verificareGooglePentru`, cu proba ei in `src/lib/seo.test.ts`.
   */
  const gazda = (await headers()).get("host");
  const codVerificare = verificareGooglePentru(gazda, data, seo.googleVerification);
  if (codVerificare) meta.verification = { google: codVerificare };
  /*
   * Al doilea strat al invariantei: pe orice gazda care nu e domeniul propriu
   * (platforma, `*.vercel.app`, localhost) vitrina spune si in HTML `noindex`,
   * nu doar in antet. Paginile care isi declara singure `robots` (cos, checkout,
   * politici ascunse, noindex de comerciant) il pastreaza pe al lor: segmentul
   * mai adanc castiga. Vezi `robotsVitrinaPeGazda`.
   */
  const robots = robotsVitrinaPeGazda(gazda, data);
  if (robots) meta.robots = robots;
  return meta;
}

export default async function StoreLayout({ children, params }: Props) {
  const { slug } = await params;
  // Service role: marketing_config (public pixel IDs) lives in store_settings,
  // which is no longer anon-readable. Read it server-side and pass only pixel IDs.
  // Acelasi rand pe care l-a citit deja `generateMetadata` in aceasta randare:
  // `incarcaAntetMagazin` e invelit in `cache` din React, deci al doilea apel nu
  // mai atinge baza.
  const business = await incarcaAntetMagazin(slug);

  /*
   * Insigna Netopia si creditul „Creat cu Edinio” din subsol, hotarate AICI, pe server (19.11.2026, auditul temelor).
   *
   * Pana atunci subsolul le cerea din browser, prin doua actiuni de server, la FIECARE afisare a FIECAREI pagini de
   * magazin: doua cereri POST in plus pe vizita (doua porniri de functie), puse la coada inaintea oricarei alte
   * actiuni a vizitatorului („Adauga in cos”, cautarea), iar insigna aparea abia dupa raspuns. Cea de la Netopia nici
   * nu avea `catch`: taiata de o navigare, lasa o eroare neprinsa in Firefox si Safari (gasita de proba pe 3 motoare).
   *
   * ⚠ FARA NICIO CERERE NOUA: insigna vine in randul de antet (`np_activ`, `np_insigna`; vezi `antet-magazin.ts`), iar
   * creditul se hotaraste din `page_content`, adus si el. Prima varianta chema aici cele doua actiuni ca functii si le
   * astepta: masurat, timpul pana la primul octet crestea cu un drum la baza (419 -> 452 ms pe demo), cat castiga restul.
   *
   * ⚠ Magazinele care AU cerut ascunderea creditului (`hide_edinio_badge`) raman pe drumul vechi (`null` = piesa
   * intreaba din browser): verdictul lor cere planul proprietarului, adica inca o citire, pe care nu o platim in
   * timpul randarii. Restul magazinelor afla raspunsul fara nicio citire: creditul se arata.
   *
   * `null` la insigna = randul a venit fara campuri (selectul de rezerva): piesa cere atunci singura, ca inainte.
   */
  const setarileSubsolului = setarileDin<{ page_content: unknown; np_activ?: unknown; np_insigna?: unknown }>(business);
  const cereAscundereaCreditului = Boolean((setarileSubsolului?.page_content as { hide_edinio_badge?: unknown } | null | undefined)?.hide_edinio_badge);
  const creditAscuns: boolean | null = !business || cereAscundereaCreditului ? null : false;
  const insignaNetopia: string | null = setarileSubsolului && "np_activ" in setarileSubsolului
    ? (setarileSubsolului.np_activ ? sanitizeNetopiaBadge(typeof setarileSubsolului.np_insigna === "string" ? setarileSubsolului.np_insigna : "") : "")
    : null;

  let fbPixelId: string | null = null;
  let ttPixelId: string | null = null;
  let googleTagId: string | null = null;
  let gaMeasurementId: string | null = null;
  let mc: MarketingConfig | null = null;
  let cookieRaw: unknown = null;
  let contRaw: unknown = null;
  let tm: VitrinaTM | null = null;
  let chat: VitrinaSuport | null = null;

  if (business) {
    const rawSettings = (business as unknown as { store_settings: { marketing_config: unknown; cookie_banner_config: unknown; google_analytics_config: unknown; cont_client_config?: unknown } | { marketing_config: unknown; cookie_banner_config: unknown; google_analytics_config: unknown; cont_client_config?: unknown }[] | null }).store_settings;
    const settings = Array.isArray(rawSettings) ? rawSettings[0] : rawSettings;
    mc = (settings?.marketing_config ?? null) as MarketingConfig | null;
    cookieRaw = settings?.cookie_banner_config ?? null;
    contRaw = settings?.cont_client_config ?? null;
    /* theMarketer: numai campurile publice (`tm_*`), citite prin cale JSON. Vezi `themarketer/vitrina.ts`. */
    tm = vitrinaTheMarketer(settings as SetariTMBrute | null);
    /*
     * Chatul de suport: numai campurile publice (`sp_*`), citite prin cale JSON. Vezi `suport/config.ts`.
     * ⚠ Un magazin oprit (termenul de gratie trecut) nu primeste butonul: paginile lui arata ecranul de
     * indisponibilitate, iar un chat deasupra lui ar promite un magazin care nu vinde.
     */
    const oprit = !!business.suspended_until && new Date(business.suspended_until as string) < new Date();
    chat = oprit ? null : vitrinaSuport(settings as SetariSuportBrute | null);
    fbPixelId = mc?.facebook_pixel_id?.trim() || null;
    ttPixelId = mc?.tiktok_pixel_id?.trim() || null;
    googleTagId = mc?.google_tag_id?.trim() || null;
    // GA4: connected via OAuth + tracking left on -> inject its Measurement ID.
    const ga = (settings?.google_analytics_config ?? null) as GoogleAnalyticsConfig | null;
    gaMeasurementId = ga?.connected && ga.tracking_enabled !== false ? ga.measurement_id?.trim() || null : null;
  }

  /*
   * ⚠ ID-ul de conversie Google Ads e un tag in sine: fara `config` pe el, conversia n-are unde ajunge.
   * Pana la 18.09.2026 se incarca doar ce scria in `google_tag_id`, care putea fi un GA4.
   */
  const adsConversionId = parseIdConversieAds(mc?.google_ads_conversion_id) ?? parseIdConversieAds(googleTagId);
  // One gtag loader for all Google tags (Ads + GA4), deduplicated.
  const googleTagIds = [...new Set([googleTagId, gaMeasurementId, adsConversionId].filter((v): v is string => !!v))];

  const cookieConfig = parseCookieBannerConfig(cookieRaw);
  const consentCategories = detectConsentCategories(mc, gaMeasurementId, tm !== null, chat !== null);
  /* Numele furnizorului de chat, pentru categoria „Functionale” din banner si pentru cartonasul de acord. */
  const furnizorChat = chat ? numeleFurnizorului(chat.cont.furnizor) : undefined;
  /* Ce sta sub „Marketing” in banner, pe nume: omul isi da acordul pentru ce citeste acolo. */
  const furnizoriMarketing = [adsConversionId && "Google Ads", fbPixelId && "Facebook", ttPixelId && "TikTok", tm && "theMarketer"].filter((x): x is string => !!x);
  /*
   * „Marketing” exista in banner numai din cauza Google Ads. Pana pe 25.11.2026 Google Ads nu aprindea nicio
   * categorie, deci vizitatorii de dinainte ai unui asemenea magazin n-au fost intrebati de marketing: bannerul
   * ii mai intreaba o data. Vezi `bannerDecis`.
   */
  const marketingDoarGoogleAds = Boolean(adsConversionId) && !fbPixelId && !ttPixelId && tm === null;
  const color = culoareMagazin(business?.primary_color);
  const storeName = (business?.store_name as string | null) ?? (business?.business_name as string | null) ?? "magazin";

  // Policy link must honour custom domains (proxy rewrites customdomain.ro/x → /slug/x).
  // Aceeasi intrebare ca la verificarea Search Console de mai sus, cu acelasi
  // raspuns: `esteDomeniulPropriu` e singurul loc care o judeca.
  const host = (await headers()).get("host");
  const customDomain = (business?.custom_domain as string | null) ?? null;
  const basePath = adreseFaraSlug(host, { slug, custom_domain: customDomain }) ? "" : `/${slug}`;

  /*
   * Conturile de client, pe cererea asta: butonul „Contul meu" din antet si daca o
   * comanda cere cont. ⚠ Din randul citit deja si din gazda, fara cookie si fara
   * cerere noua. Totul se stinge in afara domeniului propriu (acolo zona de cont
   * nu exista) si la un magazin oprit, al carui termen de gratie a trecut (acolo
   * /cont da 404). Valoarea din baza
   * trece prin curatare: comerciantul isi poate scrie randul direct.
   */
  const contulMagazinului = contulMagazinuluiPeCerere({
    config: contRaw,
    peOrigineaMagazinului: esteDomeniulPropriu(host, customDomain),
    suspendatPana: (business?.suspended_until as string | null) ?? null,
  });

  // Pixelii (Meta, TikTok, theMarketer) intra in pagina DUPA acordul pentru marketing (GDPR opt-in).
  // Eticheta Google: Analytics si evenimentele tot dupa acord; eticheta de RECLAME poate porni la orice
  // vizita, cu semnalele refuzate, ca Google Ads sa o gaseasca pe site. Vezi `lib/eticheta-google/corp.ts`.
  // When the merchant disabled the cookie banner, there is no consent flow, so
  // the gate is bypassed and trackers load unconditionally (merchant owns the
  // GDPR responsibility — a warning is shown in Settings → Banner Cookies).
  const requireConsent = cookieConfig.enabled;
  /*
   * Scriptul de pornire al etichetei Google, scris de SERVER in pagina (mai jos, la inceputul ei). `null` cand
   * magazinul n-are niciun ID Google. Vezi `lib/eticheta-google/corp.ts`.
   */
  const etichetaGoogle = corpEticheteiGoogle({
    tagIds: googleTagIds, slug, cuBanner: requireConsent, adsId: adsConversionId,
    adsInainteDeAcord: cookieConfig.google_ads_inainte_de_acord,
  });
  /*
   * WhatsApp si telefonul plutitoare, pentru butonul de contact. ⚠ Aceeasi regula ca in `MiniStoreRenderer`:
   * WhatsApp porneste singur cand exista numarul, apelul numai cand comerciantul l-a pornit.
   */
  const butoane = ((business?.features ?? null) as { floating_whatsapp?: boolean; floating_call?: boolean } | null) ?? {};
  const contactRapid = {
    whatsapp: butoane.floating_whatsapp !== false && business?.whatsapp ? whatsappLink(business.whatsapp as string) : null,
    telefon: butoane.floating_call === true && business?.phone ? (business.phone as string) : null,
  };
  /*
   * Tot ce nu e magazinul propriu-zis sta sub `DoarInMagazinReal`.
   *
   * In previzualizarea din editor, bannerul de cookie-uri acoperea cadrul si
   * fiecare reincarcare a iframe-ului trimitea un `PageView` fals in Facebook
   * Pixel, TikTok si Google — iar iframe-ul se reincarca la fiecare salvare.
   * Vezi componenta pentru intreaga poveste.
   */
  return (
    <>
      {/*
        Literele romanesti dintr-un fisier mic, nu din tot subsetul latin-ext al fontului (19.11.2026): primul lucru
        din pagina, inaintea oricarui text. Vezi `lib/fonturi-ro-css.ts`.
      */}
      <FeteRomanesti />
      {/*
        ⚠⚠ ETICHETA GOOGLE PORNESTE DE AICI, DIN PAGINA TRIMISA DE SERVER (25.11.2026). La magazinele cu
        reclame Google, eticheta de reclame porneste la orice vizita, cu toate semnalele consent mode refuzate
        pana raspunde omul: cat a stat dupa poarta de consimtamant, Google Ads ii spunea comerciantului ca
        eticheta lipseste de pe site. Analytics si evenimentele asteapta acordul, ca inainte.

        ⚠ NU STA SUB `DoarInMagazinReal` / `DoarInAfaraContului`: acelea sunt componente de client si pe
        server nu deseneaza nimic. Scriptul isi tine singur cele doua reguli, din adresa: nu porneste in
        previzualizarea din editor si nici in zona de cont. Vezi `lib/eticheta-google/corp.ts`.
      */}
      {etichetaGoogle && <script id="eticheta-google" dangerouslySetInnerHTML={{ __html: etichetaGoogle.script }} />}
      {/*
        ⚠⚠ SI NU IN ZONA DE CONT. Paginile de sub `/{slug}/cont` sunt copiii
        layoutului asta, deci pana pe 23.09.2026 mosteneau pixelii alesi de
        comerciant: adresa paginii, care poarta identificatorul comenzii, pleaca
        din oficiu la Meta, TikTok si Google, iar pe ecranul de intrare exista un
        camp `type="email"` pe care potrivirea avansata AUTOMATA a lui Meta il
        culege. Zona de cont e personala; acolo nu au ce cauta scripturi alese de
        altcineva. Vezi `DoarInAfaraContului` pentru ce s-a incercat si de ce nu
        merge un `layout.tsx` sub `cont/`.
      */}
      <DoarInAfaraContului slug={slug} niciDupaIesire>
        <DoarInMagazinReal>
          <AttributionCapture basePath={basePath} />
          {fbPixelId && (
            <ConsentGate slug={slug} category="marketing" bypass={!requireConsent}><FacebookPixel pixelId={fbPixelId} magazin={slug} capi={mc?.facebook_capi_activ === true} /></ConsentGate>
          )}
          {ttPixelId && (
            <ConsentGate slug={slug} category="marketing" bypass={!requireConsent}><TikTokPixel pixelId={ttPixelId} magazin={slug} capi={mc?.tiktok_capi_activ === true} /></ConsentGate>
          )}
          {/*
            Jumatatea din browser a etichetei Google: duce raspunsul din banner la eticheta si o porneste
            cand n-a pornit din scriptul de la inceputul paginii. Pixelii Meta, TikTok si theMarketer raman
            dupa poarta de consimtamant: ei nu au un mod in care sa porneasca refuzati.
          */}
          {googleTagIds.length > 0 && (
            <GoogleTag tagIds={googleTagIds} slug={slug} requireConsent={requireConsent} adsId={adsConversionId} adsInainteDeAcord={cookieConfig.google_ads_inainte_de_acord} />
          )}
          {tm && (
            <ConsentGate slug={slug} category="marketing" bypass={!requireConsent}><TheMarketerTracking cheie={tm.cheie} captura={tm.captura} /></ConsentGate>
          )}
        </DoarInMagazinReal>
      </DoarInAfaraContului>
      {/*
        Felul butonului de chat, pentru stiva veche „Contact rapid” din `MiniStoreRenderer`. ⚠ Numai la magazinele
        cu chat: la celelalte `CuChat` nu pune nimic in jurul paginilor (vezi functia, la coada fisierului).
      */}
      <CuChat mod={chat ? chat.aspect.buton : null}>
        {/* Prefixele din Setari > Permalink-uri, din acelasi rand: nicio cerere in plus. */}
        <PermalinkuriProvider valoare={permalinkuriDin(setarileDin<{ page_content: unknown }>(business)?.page_content)}>
          <ContulMagazinuluiProvider valoare={contulMagazinului}>
            {/* Pentru 404-ul si pagina de eroare a magazinului, care nu primesc slugul (vezi `IdentitateMagazin.tsx`). */}
            <IdentitateMagazinProvider valoare={{ nume: business ? storeName : null, culoare: color, culoareText: contrastOn(color), acasa: basePath || "/", insignaNetopia, creditAscuns }}>
              {children}
            </IdentitateMagazinProvider>
          </ContulMagazinuluiProvider>
        </PermalinkuriProvider>
      </CuChat>
      {cookieConfig.enabled && (
        <DoarInMagazinReal>
          <CookieConsent
            slug={slug}
            color={color}
            categories={consentCategories}
            position={cookieConfig.position}
            policyHref={`${basePath}/politici/confidentialitate`}
            storeName={storeName}
            furnizoriMarketing={furnizoriMarketing}
            furnizorChat={furnizorChat}
            googleAdsInainteDeAcord={etichetaGoogle?.inainteDeAcord === true}
            marketingDoarGoogleAds={marketingDoarGoogleAds}
          />
        </DoarInMagazinReal>
      )}
      {/*
        Butonul de contact (chatul furnizorului ales si, cand exista, WhatsApp si telefonul). ⚠ Ca pixelii: nu in
        zona de cont (`DoarInAfaraContului`) si nu in previzualizarea din editor (`DoarInMagazinReal`). Scriptul
        furnizorului nu se incarca aici: il aduce butonul, la prima apasare sau dupa acord. Vezi `ButonContact`.
        ⚠ Prin `ButonContactLaCerere`: codul butonului sta in bucata lui si nu ajunge la magazinele fara chat.
      */}
      {chat && (
        <DoarInAfaraContului slug={slug}>
          <DoarInMagazinReal>
            <ButonContactLaCerere
              slug={slug}
              culoare={color}
              culoareText={contrastOn(color)}
              chat={chat}
              numeFurnizor={furnizorChat ?? ""}
              whatsapp={contactRapid.whatsapp}
              telefon={contactRapid.telefon}
              cereAcord={requireConsent}
              peDomeniuPropriu={esteDomeniulPropriu(host, customDomain)}
              politica={`${basePath}/politici/confidentialitate`}
            />
          </DoarInMagazinReal>
        </DoarInAfaraContului>
      )}
      {/*
        In editor, butonul magazinului se DESENEAZA (acolo nu se incarca scripturi si nu se cere acord): altfel
        comerciantul cu chatul pornit n-ar vedea in editor niciun buton de contact. Vezi `MartorButonContact`.
      */}
      {chat && chat.aspect.buton === "magazin" && (
        <DoarInAfaraContului slug={slug}>
          <DoarInPrevizualizare>
            <MartorButonContact
              culoare={color}
              culoareText={contrastOn(color)}
              stanga={chat.aspect.pozitie === "stanga"}
              text={chat.aspect.text}
              peTelefon={chat.aspect.pe_telefon}
            />
          </DoarInPrevizualizare>
        </DoarInAfaraContului>
      )}
    </>
  );
}

/**
 * Paginile magazinului, cu felul butonului de chat pus in jurul lor numai cand magazinul are chat.
 *
 * ⚠ Componenta de SERVER, dinadins: la magazinele fara chat intoarce paginile neatinse, deci nici providerul
 * (o componenta de client) nu ajunge in pagina lor. ⚠ Sta la coada fisierului: o proba cere ca fetele romanesti
 * sa fie scrise in layout inaintea primului `{children}`.
 */
function CuChat({ mod, children }: { mod: ModChat | null; children: React.ReactNode }) {
  return mod ? <ChatInMagazinProvider mod={mod}>{children}</ChatInMagazinProvider> : <>{children}</>;
}
