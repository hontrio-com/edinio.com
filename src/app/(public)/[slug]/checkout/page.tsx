import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { seMasoaraVizita } from "@/lib/storefront/vizita-de-masurat";
import { scrieEvenimentAnalitic } from "@/lib/analitice/scrie";
import { adreseFaraSlug } from "@/lib/teme/gazde-demo";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { MarcajSectiune } from "@/components/storefront/SectionRenderer";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData, loadSearchCategories } from "@/lib/storefront/chrome-value";
import { checkoutOnPage } from "@/lib/storefront/design/commerce";
import { cuSemnePastrate, sirDinSp } from "@/lib/storefront/preview-sticky";
import { radacinaMagazin } from "@/lib/storefront/category-href";
import { resolveDesign } from "@/lib/storefront/design/parse";
import { esteEditorDeDesign, semneDeEditor } from "@/lib/storefront/design/preview-protocol";
import { ciornaDeRandat } from "@/lib/storefront/design/ciorna-proprietarului";
import { magazinCuCiorna, pcCuCiorna } from "@/lib/storefront/design/continut-ciorna";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { CheckoutPageClient } from "@/components/storefront/sections/checkout/CheckoutPageClient";
import { pragTransportGratuit } from "@/lib/storefront/prag-transport-gratuit";
import { culoareMagazin } from "@/lib/storefront/culoare-magazin";

/**
 * Pagina de finalizare a comenzii.
 *
 * Exista doar pentru magazinele care si-au ales-o din catalogul de design-uri;
 * restul comanda in fereastra, peste magazin, iar aici sunt trimise inapoi.
 *
 * Nu se indexeaza: e un pas personal, cu cosul fiecarui vizitator in el.
 */
// `absolute` scoate sablonul „%s | Edinio" al layout-ului: pe domeniul
// comerciantului, taman la pasul de plata, nu are ce cauta numele platformei.
export const metadata: Metadata = { title: { absolute: "Finalizeaza comanda" }, robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ code?: string; preview?: string; editor?: string }>;
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { slug } = await params;
  // Codul de reducere vine din linkul de recuperare a cosului abandonat.
  // Restul sirului se citeste doar ca redirectarile de mai jos sa poata pastra
  // semnele de previzualizare: fara ele, comerciantul care se uita la formularul
  // de comanda din editor era scos din previzualizare la primul redirect.
  const sp = await searchParams;
  const { code } = sp;

  const supabase = await createClient();
  const [{ data: business }, { data: { user } }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, primary_color, is_published, suspended_until, custom_domain, social, gallery, features")
      .eq("slug", slug)
      .single(),
    supabase.auth.getUser(),
  ]);
  if (!business) notFound();

  const isOwner = user?.id === business.user_id;

  const admin = createAdminClient();
  const [{ data: storeSettings }] = await Promise.all([
    admin
      .from("store_settings")
      .select("page_content, storefront_design, default_shipping_cost, free_shipping_threshold")
      .eq("business_id", business.id)
      .single(),
  ]);

  // In editorul de design: ciorna proprietarului, ca o comanda aleasa „pagina”
  // sa se vada inainte de Publica. Vezi `ciorna-proprietarului.ts`.
  const esteEditorDesign = esteEditorDeDesign(semneDeEditor(sp), isOwner);
  // Etapa 6: in editor, continutul nepublicat al ciornei peste ce e in magazin. Numai proprietarul.
  const ciorna = await ciornaDeRandat(admin, business.id, esteEditorDesign);
  const magazin = magazinCuCiorna(business, ciorna.continut);
  const pageContent = pcCuCiorna((storeSettings?.page_content ?? {}) as Record<string, unknown>, ciorna.continut) as StorePageContent;
  const resolved = resolveDesign(ciorna.ciorna ?? storeSettings?.storefront_design, {
    primaryColor: culoareMagazin(magazin.primary_color),
    pageContent: pageContent as Record<string, unknown>,
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: magazin.cover_url,
    tagline: business.tagline,
  });

  // Antetele se citesc O DATA, aici, in randare: callbackul lui `after` de mai jos nu le mai poate cere.
  const anteturi = await headers();
  const host = anteturi.get("host");
  const basePath = adreseFaraSlug(host, { slug, custom_domain: business.custom_domain }) ? "" : `/${slug}`;

  // In editorul de design fara redirectare, din acelasi motiv ca pe ruta cosului:
  // previzualizarea vine aici inainte ca ciorna cu pagina de comanda sa fie in baza.
  if (!checkoutOnPage(resolved.design) && !esteEditorDesign) redirect(cuSemnePastrate(radacinaMagazin(basePath), sirDinSp(sp)));

  // Magazin suspendat sau abonament expirat: pagina magazinului arata deja
  // „suspendat", dar aici se putea comanda mai departe cu cosul din localStorage.
  // Aceeasi verificare ca pe pagina de magazin si pe paginile personalizate;
  // proprietarul trece, ca sa isi poata vedea magazinul.
  if (!isOwner) {
    let suspendat = business.suspended_until ? new Date(business.suspended_until) < new Date() : false;
    if (!suspendat) {
      const { data: ownerProfile } = await admin
        .from("users_profile")
        .select("plan, plan_expires_at")
        .eq("id", business.user_id)
        .single();
      if ((ownerProfile?.plan === "free" || ownerProfile?.plan === "trial") && ownerProfile?.plan_expires_at) {
        suspendat = new Date(ownerProfile.plan_expires_at) < new Date();
      }
    }
    if (suspendat) redirect(cuSemnePastrate(radacinaMagazin(basePath), sirDinSp(sp)));
  }

  /*
    ═══ PALNIA: „a inceput checkout-ul" ═══

    Al treilea prag al palniei (dupa vizita si vederea produsului). Se scrie
    dupa raspuns, cu aceeasi regula ca vizitele; proprietarul, gazdele de test
    si santinela raman afara.

    ⚠ DATELE CERERII SE CITESC IN RANDARE, NU IN CALLBACK (19.11.2026). Aici statea
    `await headers()` INAUNTRUL lui `after`. Intr-o pagina, Next arunca acolo („used
    `headers()` inside `after()` while rendering”), deci evenimentul nu s-a scris
    NICIODATA: in productie, de la aparitia palniei (20.09.2026) pana pe 19.11.2026,
    zero sesiuni cu checkout in `analitice_zilnic`, langa 825 cu cos si 137 cu
    comanda, iar cifra „Checkout-uri incepute” din Statistici a stat pe 0 la toate
    magazinele. Eroarea se vedea doar in jurnalul serverului. Regula e tinuta de
    `dupa-raspuns-fara-cerere.test.ts`.

    ⚠ STA DUPA CELE DOUA REDIRECTARI DE MAI SUS. `after` ruleaza si cand pagina
    redirecteaza, iar un magazin cu formularul in fereastra (fara pagina de comanda)
    sau unul suspendat n-a aratat nimanui niciun checkout: cifra numara paginile de
    comanda chiar servite.
  */
  const uaVizitator = anteturi.get("user-agent");
  const ipVizitator = clientIpFromHeaders(anteturi);
  after(async () => {
    if (!seMasoaraVizita({ esteProprietar: isOwner, host: host?.split(":")[0] ?? "", userAgent: uaVizitator })) return;

    await scrieEvenimentAnalitic({
      businessId: business.id,
      fel: "begin_checkout",
      ip: ipVizitator,
      userAgent: uaVizitator,
      device: /mobile/i.test(uaVizitator ?? "") ? "mobile" : /tablet/i.test(uaVizitator ?? "") ? "tablet" : "desktop",
      path: "/checkout",
    });
  });

  const searchCategories = await loadSearchCategories(business.id, resolved.design);
  const chrome = buildChromeData({
    searchCategories,
    business: magazin as never,
    pageContent,
    basePath,
    design: resolved.design,
  });

  return (
    <StorefrontThemeScope style={resolved.style}>
      <StorePageShell chrome={chrome} design={resolved.design} esteEditorDesign={esteEditorDesign} className="min-h-screen flex flex-col">
        <main className="flex-1">
          <MarcajSectiune sectiune={resolved.design.commerce.checkout}>
            <CheckoutPageClient
              variant={resolved.design.commerce.checkout.variant}
              color={culoareMagazin(magazin.primary_color)}
              basePath={basePath}
              businessId={business.id}
              shippingCost={Number(storeSettings?.default_shipping_cost ?? 20)}
              freeShippingThreshold={pragTransportGratuit(storeSettings?.free_shipping_threshold)}
              emailFieldConfig={pageContent.checkout_config?.email_field ?? { enabled: true, required: false }}
              initialDiscountCode={code ?? null}
            />
          </MarcajSectiune>
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
