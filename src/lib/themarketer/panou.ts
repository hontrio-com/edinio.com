import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { adresaFeed, adresaGeneratorCoduri, adresaWebhook, formaCheieValida } from "./chei";
import { theMarketerGata, type TheMarketerConfig } from "./config";

/**
 * Ce arata pagina theMarketer in afara formularului: adresele de lipit in contul lor, ce a citit theMarketer
 * si cand, cate coduri a cerut, recenziile aduse si mersul cozii de comenzi.
 *
 * ⚠ Adresele poarta cheia adreselor (secreta): se calculeaza aici, pe server, si pleaca numai spre
 * pagina proprietarului, care trebuie sa le poata copia. Configurarea insasi pleaca MASCATA.
 */
export type AdreseTM = {
  produse: string;
  categorii: string;
  branduri: string;
  comenzi: string;
  coduri: string;
  webhookDezabonat: string;
  webhookRespins: string;
  webhookSpam: string;
};

export type RecenziePanou = {
  id: number;
  produs: string;
  autor: string;
  nota: number;
  text: string;
  data: string | null;
  ascunsa: boolean;
};

export type DatePanouTM = {
  adrese: AdreseTM | null;
  stare: {
    produse: string | null;
    categorii: string | null;
    branduri: string | null;
    comenzi: string | null;
    cod: string | null;
    webhook: string | null;
    recenzii: string | null;
    dezabonari: string | null;
    eroare: string | null;
    eroareLa: string | null;
  };
  coduri: { generate: number; folosite: number };
  coada: { trimise: number; sarite: number; esuate: number; inAsteptare: number };
  recenzii: { total: number; ascunse: number; ultimele: RecenziePanou[] };
};

const FARA = { produse: null, categorii: null, branduri: null, comenzi: null, cod: null, webhook: null, recenzii: null, dezabonari: null, eroare: null, eroareLa: null };

export async function datePanou(businessId: string, config: TheMarketerConfig | null): Promise<DatePanouTM> {
  const admin = createAdminClient();
  const cheie = config?.cheie_feed && formaCheieValida(config.cheie_feed) ? config.cheie_feed : null;
  const adrese: AdreseTM | null = theMarketerGata(config) && cheie
    ? {
        produse: adresaFeed(cheie, "produse"),
        categorii: adresaFeed(cheie, "categorii"),
        branduri: adresaFeed(cheie, "branduri"),
        comenzi: adresaFeed(cheie, "comenzi"),
        coduri: adresaGeneratorCoduri(cheie),
        webhookDezabonat: adresaWebhook(cheie, "dezabonat"),
        webhookRespins: adresaWebhook(cheie, "respins"),
        webhookSpam: adresaWebhook(cheie, "spam"),
      }
    : null;

  const deLa30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [stare, generate, folosite, trimise, sarite, esuate, asteapta, recTotal, recAscunse, ultimele] = await Promise.all([
    admin.from("themarketer_stare").select("*").eq("business_id", businessId).maybeSingle(),
    admin.from("discounts").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("generat_de", "themarketer"),
    admin.from("discounts").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("generat_de", "themarketer").gt("uses_count", 0),
    admin.from("email_marketing_coada").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("furnizor", "themarketer").gte("creat_la", deLa30).eq("rezultat", "trimis"),
    admin.from("email_marketing_coada").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("furnizor", "themarketer").gte("creat_la", deLa30).like("rezultat", "sarit:%"),
    admin.from("email_marketing_coada").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("furnizor", "themarketer").gte("creat_la", deLa30).not("abandonat_la", "is", null),
    admin.from("email_marketing_coada").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("furnizor", "themarketer").is("trimis_la", null).is("abandonat_la", null),
    admin.from("recenzii_produse").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    admin.from("recenzii_produse").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("ascunsa", true),
    admin.from("recenzii_produse")
      .select("id, autor, nota, text, data_recenzie, ascunsa, products(name)")
      .eq("business_id", businessId)
      .order("creat_la", { ascending: false })
      .limit(20),
  ]);

  const s = (stare.data ?? null) as Record<string, string | null> | null;
  return {
    adrese,
    stare: s
      ? {
          produse: s.citit_produse_la ?? null,
          categorii: s.citit_categorii_la ?? null,
          branduri: s.citit_branduri_la ?? null,
          comenzi: s.citit_comenzi_la ?? null,
          cod: s.ultim_cod_la ?? null,
          webhook: s.ultim_webhook_la ?? null,
          recenzii: s.recenzii_sincronizat_la ?? null,
          dezabonari: s.dezabonari_sincronizat_la ?? null,
          eroare: s.ultima_eroare ?? null,
          eroareLa: s.ultima_eroare_la ?? null,
        }
      : FARA,
    coduri: { generate: generate.count ?? 0, folosite: folosite.count ?? 0 },
    coada: { trimise: trimise.count ?? 0, sarite: sarite.count ?? 0, esuate: esuate.count ?? 0, inAsteptare: asteapta.count ?? 0 },
    recenzii: {
      total: recTotal.count ?? 0,
      ascunse: recAscunse.count ?? 0,
      ultimele: ((ultimele.data ?? []) as unknown as {
        id: number; autor: string; nota: number; text: string; data_recenzie: string | null; ascunsa: boolean;
        products: { name: string } | { name: string }[] | null;
      }[]).map((r) => ({
        id: r.id,
        produs: (Array.isArray(r.products) ? r.products[0]?.name : r.products?.name) ?? "Produs șters",
        autor: r.autor,
        nota: r.nota,
        text: r.text,
        data: r.data_recenzie,
        ascunsa: r.ascunsa,
      })),
    },
  };
}
