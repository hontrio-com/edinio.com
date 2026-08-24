/**
 * Maparea categoriilor urmeaza redenumirea, in toate integrarile.
 *
 * ═══ ⚠ NUMELE E FOLOSIT CA IDENTITATE, SI NU E (audit 24.08.2026) ═══
 *
 * `emag_config.category_map` — si perechile ei de la Trendyol, OLX si Google Merchant —
 * au drept CHEIE numele categoriei Edinio. Iar comerciantul poate redenumi o categorie
 * oricand: `updateCategory` muta produsele pe numele nou (`remapeazaProduse`), dar
 * maparea ramane pe cel vechi.
 *
 * Rezultatul, tacut: „Telefoane" → 123 in configurare, produsele pe „Smartphone-uri", si
 * integrarea vede o categorie NEMAPATA. Publicarea se opreste pentru toate produsele din
 * ea, iar ecranul spune „leagă categoria" pentru una pe care omul o legase deja.
 *
 * ⚠ SE MUTA MAPAREA, NU SE REPARA IDENTITATEA. Corect ar fi ca cheia sa fie id-ul
 * categoriei, nu numele — numele e text de afisat, nu identitate. Dar schimbarea aia
 * atinge patru integrari, ecranele lor si datele deja scrise; mutarea la redenumire
 * inchide paguba acum, fara sa mute nimic din ce merge.
 *
 * ⚠ Se face pentru TOATE canalele, nu doar eMAG. Auditul extern l-a semnalat ca defect
 * eMAG; reparat asa, ar fi ramas trei canale cu aceeasi gaura.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";

/** Coloanele de configurare care tin o harta de categorii pe nume. */
const COLOANE = [
  "emag_config", "trendyol_config", "olx_config", "gmc_config",
] as const;

export async function mutaMapareaCategoriei(
  businessId: string,
  numeVechi: string,
  numeNou: string,
): Promise<void> {
  if (!numeVechi || !numeNou || numeVechi === numeNou) return;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("store_settings")
      .select(COLOANE.join(", "))
      .eq("business_id", businessId)
      .maybeSingle();

    /*
     * ⚠ La o citire picata NU se scrie nimic. Scris pe gol, peticul ar fi sters harta
     * intreaga — chiar paguba reparata azi la `patchEmagConfig`.
     */
    if (error || !data) return;

    for (const coloana of COLOANE) {
      const config = ((data as unknown as Record<string, unknown>)[coloana] ?? {}) as {
        category_map?: Record<string, unknown>;
      };
      const harta = config.category_map;
      if (!harta || typeof harta !== "object") continue;
      if (!(numeVechi in harta)) continue;
      /* ⚠ Daca numele nou are DEJA o mapare, aceea castiga: comerciantul a legat-o
         anume, iar cea veche ar fi o suprascriere pe care n-a cerut-o. */
      if (numeNou in harta) continue;

      const noua = { ...harta, [numeNou]: harta[numeVechi] };
      delete noua[numeVechi];

      /*
       * ⚠ Prin `jsonb_merge_config`, ca peste tot: imbinarea in Postgres, intr-o singura
       * instructiune. Citit-si-scris din Node, ar fi calcat o salvare concurenta.
       *
       * ⚠ `category_map` se trimite INTREAGA, nu ca petic: imbinarea `||` din Postgres e
       * la nivelul intai, deci un petic `{category_map: {nou: x}}` ar inlocui harta, nu ar
       * adauga in ea. Aici chiar asta vrem — harta noua, cu vechea cheie scoasa.
       */
      await admin.rpc("jsonb_merge_config", {
        p_business_id: businessId,
        p_column: coloana,
        p_patch: { category_map: noua } as never,
      });
    }
  } catch (e) {
    /* ⚠ O redenumire reusita n-are voie sa para picata fiindca o harta n-a putut fi
       mutata. Se scrie, si comerciantul poate relega categoria de mana. */
    await logError({
      action: "marketplace.mapareCategorii",
      message: e instanceof Error ? e.message : "mutarea maparii a esuat",
      details: { numeVechi, numeNou },
      businessId,
      severity: "warning",
    });
  }
}
