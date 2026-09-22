import { createClient } from "@/lib/supabase/server";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { hasVariants, cerePersonalizare } from "@/lib/storefront/variants";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PRODUSELE DIN FORMULARUL DE OFERTE                            (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ DEFECT ADEVARAT, CU EXPUNERE MARE. Cele doua ecrane de oferte (creare si
 * editare) isi luau lista de produse din `getBundleEligibleProducts`, adica din
 * filtrul facut pentru PACHETE. Acela scoate, pe langa pachete, si produsele
 * INACTIVE, si pe cele cu VARIANTE, si pe cele care cer PERSONALIZARE — pe drept,
 * fiindca `BundleItem` n-are camp de varianta si un pachet n-are unde sa intrebe
 * ce marime.
 *
 * Numai ca o OFERTA nu e un pachet. Iar cel mai rau, filtrul lovea si sectiunea
 * „Cand apare", unde produsul ales spune doar PE CE PAGINA se vede oferta:
 * `triggerMatchesProduct` compara id-uri, nimic altceva. Deci un produs cu marimi
 * nu putea fi nici macar declansator.
 *
 * ⚠⚠ MASURAT PE PRODUCTIE, 24.09.2026, si de-aia s-a reparat:
 *   * `nordic-outlet-bucovina`  468 din 468 de produse ascunse — NICIUNUL de ales
 *   * `rallsro`                 113 din 113 — niciunul
 *   * `royal-boutique`           44 din 44  — niciunul
 *   * `yulmis-sound`             26 din 26  — niciunul
 *   * `esafero`               3.047 din 3.351 (91%)
 *   * `atelierul-larisei`        22 din 28, `jhbijuterii` 34 din 59, `caian-textile` 18 din 35
 * Adica magazinele de haine si de echipamente — chiar cele pentru care
 * recomandarile conteaza cel mai mult — deschideau „Oferta noua", isi cautau
 * produsul, si el nu era acolo. Fara nicio explicatie.
 *
 * ⚠ E acelasi defect ca la SmartShip, in alta forma: ce nu poate aparea in lista
 * nu poate fi ales, iar ce nu poate fi ales e taiat pentru totdeauna, tacut.
 *
 * ⚠ NU E UN FISIER `"use server"`, dinadins. Il cheama doua pagini de server, iar
 * intr-un fisier de actiuni fiecare export devine un capat pe care browserul il
 * poate chema. Vezi `use-server-expune-fiecare-export`.
 */

export interface ProdusPentruOferta {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  /**
   * Produsul cere o alegere inainte sa poata fi cumparat: are VARIANTE sau cere
   * PERSONALIZARE.
   *
   * ⚠ NU inseamna „nu se poate folosi". Inseamna „nu poate fi ADAUGAT dintr-o
   * apasare". Ca declansator e bun oricum; ca recomandare e bun (cardul duce pe
   * pagina produsului); ca produs oferit intr-o oferta care se bifeaza NU e, si
   * atunci formularul spune de ce, in loc sa-l ascunda.
   *
   * Acelasi steag pe care il citeste si vitrina, sub numele `needsChoice`.
   */
  cereAlegere: boolean;
}

/**
 * Produsele pe care le poate folosi o ofertă: toate cele ACTIVE care nu sunt
 * pachete.
 *
 * ⚠ Pachetele raman pe dinafara, ca la vitrina: `fetchOfferProducts` arunca orice
 * `is_bundle`, deci unul ales aici n-ar fi aparut niciodata in magazin.
 *
 * ⚠ Produsele INACTIVE raman si ele pe dinafara. Vitrina le arunca
 * (`fetchOfferProducts` cere `is_active`), deci alese aici ar fi fost o promisiune
 * care nu se vede nicaieri. Deosebirea fata de pachete: acolo un produs dezactivat
 * intre timp RAMANE in lista ca sa nu se piarda din configuratie; la oferte lipsa
 * lui nu opreste salvarea, iar fisa ofertei scrie „(produs sters)" pentru id-urile
 * care nu se mai gasesc.
 */
export async function produsePentruOferte(businessId: string): Promise<ProdusPentruOferta[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (!biz) return [];

  /*
    ⚠ TOATE randurile, nu primele o mie. PostgREST taie SILENTIOS la 1000, iar pe
    `esafero` (3.351 de produse) sau `okxi` (1.304) produsele de dupa n-ar fi
    aparut in selector — exact defectul pe care il reparam aici, in alta forma.
  */
  const data = await fetchAllRowsStrict("produse pentru oferte", (from, to) =>
    supabase
      .from("products")
      .select("id, name, price, images, page_sections")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .eq("is_bundle", false)
      .order("name")
      .range(from, to),
  );

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.price) || 0,
    image_url: Array.isArray(p.images) && p.images.length ? String(p.images[0]) : null,
    /* ⚠ ACELEASI doua functii pe care le cheama vitrina cand hotaraste
       `needsChoice`. Scrise a doua oara aici, panoul si magazinul ar fi putut
       ajunge la raspunsuri diferite despre acelasi produs. */
    cereAlegere: hasVariants(p.page_sections) || cerePersonalizare(p.page_sections),
  }));
}
