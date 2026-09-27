import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { PreviewHeightReporter } from "@/components/storefront/PreviewHeightReporter";
import { SectionPreviewFrame } from "@/components/storefront/SectionPreviewFrame";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData } from "@/lib/storefront/chrome-value";
import type { BusinessCitit } from "@/lib/storefront/business-public";
import { slimCatalogProduct } from "@/lib/storefront/catalog-slim";
import { construiesteFatete } from "@/lib/storefront/catalog/facets";
import { DEMO_CATEGORIES, DEMO_MENU, demoProducts } from "@/lib/storefront/design/demo-content";
import { resolveDesign } from "@/lib/storefront/design/parse";
import { variantMeta } from "@/lib/storefront/design/registry";
import type { SectionInstance, SectionKind } from "@/lib/storefront/design/types";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { culoareValida, normalizeazaTelefon, stilDupaId, telefonValid } from "@/lib/onboarding/aspect";

/**
 * Magazinul care URMEAZA sa se nasca, randat din componentele reale.
 *
 * Previzualizarea din onboarding (27.09.2026). Magazinul nu exista inca in baza,
 * deci ruta nu citeste nimic: numele, culoarea si stilul vin din adresa, iar
 * imaginile si produsele sunt cele demonstrative ale galeriei de design.
 * Aceleasi componente ca `preview-sectiune`, deci ce vede omul aici e exact ce
 * primeste, nu un desen care seamana.
 *
 * ⚠ DOAR PENTRU UN OM AUTENTIFICAT. Altfel adresa ar fi fost o fabrica de
 * magazine false pe domeniul nostru: `?nume=Banca…` cu produse si cos, gata de
 * trimis cuiva. Pe cine se inscrie tocmai l-am autentificat, deci nu pierde nimic.
 *
 * ⚠ Sta in afara lui `[slug]` din acelasi motiv ca `preview-sectiune`: layoutul
 * magazinelor pune pixelii comerciantilor si bannerul de cookies.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  searchParams: Promise<{ nume?: string; culoare?: string; stil?: string; telefon?: string }>;
}

const SECTIUNI: { kind: SectionKind; variant: (antet: string, subsol: string) => string }[] = [
  { kind: "header", variant: (antet) => antet },
  { kind: "hero", variant: () => "overlay" },
  { kind: "product_row", variant: () => "grid" },
  { kind: "footer", variant: (_a, subsol) => subsol },
];

export default async function PrevizualizareMagazinNou({ searchParams }: Props) {
  const user = await getCachedUser();
  if (!user) notFound();

  const q = await searchParams;
  const nume = (q.nume ?? "").trim().slice(0, 100) || "Magazinul tău";
  const culoare = culoareValida(q.culoare);
  const stil = stilDupaId(q.stil);
  const telefon = normalizeazaTelefon(q.telefon ?? "");

  const business = {
    id: "00000000-0000-4000-8000-000000000000",
    user_id: user.id,
    slug: "magazin",
    business_name: nume,
    store_name: nume,
    tagline: null,
    description: null,
    phone: telefonValid(telefon) ? telefon : null,
    whatsapp: null,
    email: null,
    website: null,
    address: null,
    city: null,
    county: null,
    cui: null,
    reg_com: null,
    store_address: null,
    store_city: null,
    store_county: null,
    logo_url: null,
    cover_url: null,
    gallery: [],
    primary_color: culoare,
    is_published: true,
    suspended_until: null,
    custom_domain: null,
    social: {},
    features: {},
    type: "ministore",
    updated_at: null,
  } as unknown as BusinessCitit;

  const produseDemo = demoProducts(business.id);
  const indexFatete = construiesteFatete(produseDemo);
  const produse = produseDemo.map((p) => {
    const slim = slimCatalogProduct(p);
    const f = indexFatete.perProdus.get(p.id);
    return f ? { ...slim, f } : slim;
  });

  /*
   * Fara bannere: un magazin nou nu are niciunul, iar hero-ul lui e numele scris
   * peste culoarea aleasa (vezi `createBusiness`). Cu bannerele demonstrative,
   * previzualizarea ar fi aratat o reclama verde pe care magazinul n-o va avea.
   */
  const pageContent: StorePageContent = {
    menu: DEMO_MENU,
  };
  const resolved = resolveDesign(undefined, {
    primaryColor: culoare,
    pageContent: pageContent as Record<string, unknown>,
    features: {},
    coverUrl: null,
    tagline: null,
  });

  const chrome = {
    ...buildChromeData({
      business,
      pageContent,
      basePath: "/magazin",
      searchCategories: DEMO_CATEGORIES,
    }),
    hasAnnouncementBar: false,
  };

  return (
    <StorefrontThemeScope style={resolved.style}>
      {SECTIUNI.map(({ kind, variant }) => {
        const v = variant(stil.antet, stil.subsol);
        const section: SectionInstance = {
          id: `onboarding_${kind}`,
          kind,
          variant: v,
          enabled: true,
          settings: { ...(variantMeta(kind, v)?.defaults ?? {}) },
        };
        return (
          <SectionPreviewFrame
            key={kind}
            chrome={chrome}
            section={section}
            products={produse}
            categories={DEMO_CATEGORIES}
            fatete={indexFatete.fatete}
          />
        );
      })}
      <PreviewHeightReporter />
    </StorefrontThemeScope>
  );
}
