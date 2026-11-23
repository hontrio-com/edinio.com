import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { CompariClient, type LivrareCompari } from "@/components/dashboard/CompariClient";
import { magazinulPentruCompari, type MagazinCitit } from "@/lib/compari/server";
import { cotaTva, pretBrut } from "@/lib/pepita/pret";
import { storeBaseUrl } from "@/lib/seo";

/*
 * Pagina „Compari.ro” din Integrari: adresa feedului si ce anunta el in numele comerciantului.
 *
 * ⚠ Magazinul se gaseste cu clientul OMULUI (dupa `user_id`); abia id-ul lui merge mai departe la citirea cu
 * cheia de serviciu, care trece peste RLS.
 * ⚠ Setarile vin din `magazinulPentruCompari`, chiar functia din care isi ia ruta feedului cifrele: pagina nu
 * are o a doua regula despre TVA, termen sau prag.
 */
export default async function CompariPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, is_published")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (!biz) redirect("/dashboard");

  let citit: MagazinCitit | null = null;
  let eroareCitire = false;
  try {
    citit = await magazinulPentruCompari(createAdminClient(), { id: biz.id });
  } catch {
    eroareCitire = true;
  }

  const baza = biz.slug ? storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain }) : "https://www.edinio.com";
  const m = citit?.magazin ?? null;
  const livrare: LivrareCompari | null = m
    ? {
        zile: m.zileLivrare,
        activa: m.transport.activ,
        /* Brut, cum pleaca in feed: la preturi fara TVA, transportul intra in baza de TVA. */
        cost: m.transport.cost === null ? null : pretBrut(m.transport.cost, m.tva),
        pragGratuit: m.transport.pragGratuit,
      }
    : null;
  const tvaAdaugat = m && m.tva.vat_enabled && !m.tva.prices_include_vat && cotaTva(m.tva) > 0 ? cotaTva(m.tva) : null;

  return (
    <CompariClient
      feedUrl={`${baza}/compari.xml`}
      hasCustomDomain={!!biz.custom_domain}
      publicat={biz.is_published === true}
      livrare={livrare}
      tvaAdaugat={tvaAdaugat}
      eroareCitire={eroareCitire || !m}
    />
  );
}
