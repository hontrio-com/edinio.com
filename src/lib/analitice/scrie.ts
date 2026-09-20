import { createAdminClient } from "@/lib/supabase/admin";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { identitateAnalitica } from "@/lib/analitice/identitate";

/*
  ═══════════════════════════════════════════════════════════════════════════
  SCRIEREA UNUI EVENIMENT DE ANALITICA, INTR-UN SINGUR LOC
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ ERAU DOUA COPII: pagina de magazin (`(public)/[slug]/page.tsx`) si pagina de
  catalog (`storefront/catalog/pagina-magazin.tsx`) scriau fiecare acelasi
  `insert`, cu aceleasi comentarii. Orice camp nou (acum: sesiunea si
  vizitatorul) trebuia adaugat in amandoua, iar uitat intr-una, jumatate din
  trafic ar fi ramas nemasurat - exact felul de defect care nu se vede.

  ⚠ Se scrie cu SERVICE ROLE, nu cu clientul vizitatorului. Politica publica de
  INSERT a fost stearsa demult: permitea oricui cu cheia publica sa injecteze
  evenimente pentru ORICE magazin.

  ⚠ Limitatorul pe adresa IP ramane: scrierea asta e singura scriere publica a
  platformei, iar tabela a ajuns a cincea ca marime doar din trafic normal.
*/

export type FelEveniment = "visit" | "product_view" | "add_to_cart" | "begin_checkout" | "purchase";

export async function scrieEvenimentAnalitic({
  businessId, fel, ip, userAgent, device, source, referrer, country, path, productId,
}: {
  businessId: string;
  fel: FelEveniment;
  ip: string | null;
  userAgent: string | null;
  device?: string | null;
  source?: string | null;
  referrer?: string | null;
  country?: string | null;
  path?: string | null;
  productId?: string | null;
}): Promise<void> {
  const { permis } = await consumaLimita(`analytics:${ip ?? "necunoscut"}`, 120, 3600);
  if (!permis) return;

  const { visitorId, sessionId } = await identitateAnalitica({ businessId, ip, userAgent });

  await createAdminClient().from("site_analytics").insert({
    business_id: businessId,
    event_type: fel,
    device: device ?? null,
    source: source ?? null,
    referrer: referrer ?? null,
    /*
      ⚠ `null` CAND TARA NU SE STIE, si asta a cerut o migrare.

      Coloana era `NOT NULL DEFAULT 'RO'`: schema INSASI afirma ca fiecare
      vizitator din lume e din Romania. Migrarea
      `site_analytics_country_fara_implicit_ro` (02.09.2026) a scos si `NOT NULL`,
      si implicitul. Randurile vechi raman 'RO' si nu se ating: ele chiar n-au
      fost masurate, iar rescrierea lor ar inlocui o minciuna veche cu una noua.
    */
    country: country ?? null,
    session_id: sessionId,
    visitor_id: visitorId,
    path: path ?? null,
    product_id: productId ?? null,
  } as never);
}
