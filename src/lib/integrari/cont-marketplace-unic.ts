import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";

/*
 * ═══ UN CONT DE MARKETPLACE, UN SINGUR MAGAZIN EDINIO (25.09.2026) ═══
 *
 * Un cont de vanzator (Trendyol, eMAG, OLX, About You) are UN flux de comenzi si
 * UN catalog. Legat de doua magazine Edinio, fiecare il sondeaza separat, deci:
 *   - fiecare comanda intra in AMBELE magazine (si poate pleca de doua ori);
 *   - stocul se impinge din doua cataloage si se calca reciproc.
 * S-a intamplat pe 11.09.2026: Okxi si VetDepo, conturi Edinio diferite, pe
 * aceleasi chei Trendyol; cele 24 de comenzi au intrat in ambele.
 *
 * Deci la CONECTARE se intreaba daca alt magazin are deja contul acela legat.
 * Propriul magazin nu se numara: o reconectare (token expirat, cheie noua pe
 * acelasi cont) trece ca inainte. Masurat la scriere: niciun cont nu era impartit,
 * deci niciun magazin conectat azi nu e oprit.
 *
 * ⚠ Nu se spune CARE magazin: celalalt poate fi al altui om. Numele merge in
 * jurnal, pentru suport.
 *
 * ⚠ Pepita nu e aici, dinadins: adresele de feed si de comenzi le genereaza Edinio
 * pentru fiecare magazin, deci un cont Pepita nu poate primi doua magazine.
 *
 * ⚠ easySales are DOUA identitati, si conflictul e pe ORICARE dintre ele: clientul API
 * (`client_id`; un token nou il revoca pe cel vechi, deci doua magazine pe acelasi client
 * si-ar taia reciproc tokenul) si website-ul (amprenta `website_token`; doua magazine pe
 * acelasi website si-ar amesteca cataloagele). O cheie compusa ar prinde numai potrivirea pe
 * amandoua.
 */

export type Marketplace = "trendyol" | "emag" | "olx" | "aboutyou" | "easysales";

const NUME: Record<Marketplace, string> = {
  trendyol: "Trendyol", emag: "eMAG", olx: "OLX", aboutyou: "About You", easysales: "easySales",
};

export function mesajContFolosit(m: Marketplace): string {
  if (m === "easysales") {
    return "Acest client API sau acest website easySales este deja conectat la alt magazin Edinio. Fiecare magazin are nevoie de clientul și de website-ul lui: altfel cele două magazine și-ar revoca reciproc accesul, iar cataloagele s-ar amesteca. Creează în easySales un client API și un website noi pentru acest magazin, sau deconectează-l din celălalt.";
  }
  return `Acest cont ${NUME[m]} este deja conectat la alt magazin Edinio. Un cont de vânzător poate fi legat de un singur magazin: altfel fiecare comandă ar intra de două ori, iar stocul s-ar suprascrie. Deconectează-l întâi din celălalt magazin sau scrie-ne la suport.`;
}

export const MESAJ_VERIFICARE_ESUATA =
  "Nu am putut verifica dacă acest cont este folosit de alt magazin. Încearcă din nou peste câteva momente.";

/** Amprenta unei chei API (About You nu ne spune cine e vanzatorul, deci cheia e identitatea). */
export function amprentaCheii(cheie: string): string {
  return createHash("sha256").update(cheie.trim()).digest("hex").slice(0, 32);
}

/** Identitatea contului, in forma in care se compara. `null` = nu se poate compara. */
export function identitateNormalizata(m: Marketplace, v: { id?: unknown; tara?: unknown }): string | null {
  const id = v.id == null ? "" : String(v.id).trim();
  if (!id) return null;
  if (m === "emag") {
    // Acelasi utilizator pe alta tara e alt raft eMAG, cu comenzi separate.
    const tara = typeof v.tara === "string" && v.tara ? v.tara : "ro";
    return `${id.toLowerCase()}@${tara}`;
  }
  return id;
}

export interface RandCandidat {
  business_id: string;
  id: unknown;
  tara?: unknown;
  /** About You, conectari de dinaintea amprentei: cheia (decriptata pe server). */
  cheie?: unknown;
  /** easySales: amprenta `website_token`, a doua identitate. */
  amprenta?: unknown;
}

/**
 * Magazinul (altul decat `businessId`) care are deja contul `noua`, sau null.
 * Pura, ca sa se poata proba fara baza.
 */
export function magazinulCareFolosesteContul(
  m: Marketplace, noua: string, businessId: string, randuri: RandCandidat[], amprentaNoua?: string | null,
): string | null {
  for (const r of randuri) {
    if (r.business_id === businessId) continue;
    if (m === "easysales") {
      const amprenta = typeof r.amprenta === "string" ? r.amprenta.trim() : "";
      if (identitateNormalizata(m, r) === noua || (amprentaNoua && amprenta && amprenta === amprentaNoua)) return r.business_id;
      continue;
    }
    let alta = identitateNormalizata(m, r);
    if (!alta && m === "aboutyou" && typeof r.cheie === "string" && r.cheie && !r.cheie.startsWith("enc.")) {
      alta = amprentaCheii(r.cheie);
    }
    if (alta && alta === noua) return r.business_id;
  }
  return null;
}

/*
 * Ce se citeste, pe marketplace. NUMAI identificatorii in clar, niciodata configul
 * intreg: vederea `store_settings` decripteaza pentru service role, iar secretele
 * altor magazine n-au ce cauta in memoria acestei cereri. Singura exceptie e cheia
 * About You a conectarilor fara amprenta (una singura la 25.09.2026), si numai ca
 * sa i se calculeze amprenta aici.
 */
const SELECTII: Record<Marketplace, { coloana: string; select: string }> = {
  trendyol: { coloana: "trendyol_config", select: "business_id, id:trendyol_config->>supplier_id" },
  emag: { coloana: "emag_config", select: "business_id, id:emag_config->>username, tara:emag_config->>tara" },
  olx: { coloana: "olx_config", select: "business_id, id:olx_config->>olx_user_id" },
  aboutyou: {
    coloana: "aboutyou_config",
    select: "business_id, id:aboutyou_config->>api_key_amprenta, cheie:aboutyou_config->>api_key",
  },
  easysales: {
    coloana: "easysales_config",
    select: "business_id, id:easysales_config->>client_id, amprenta:easysales_config->>website_token_amprenta",
  },
};

/**
 * Verifica, la conectare, ca niciun alt magazin nu are deja contul.
 * `null` = se poate conecta; altfel mesajul pentru comerciant.
 *
 * ⚠ Cade INCHIS: daca citirea pica, nu se conecteaza. O conectare amanata cu un
 * minut costa mai putin decat comenzi dublate care se descopera peste o saptamana.
 */
export async function refuzaContFolositDeAltMagazin(
  m: Marketplace,
  businessId: string,
  identitate: { id?: unknown; tara?: unknown; amprenta?: string | null },
): Promise<string | null> {
  const noua = identitateNormalizata(m, identitate);
  if (!noua) return null;

  const { coloana, select } = SELECTII[m];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("store_settings")
    .select(select)
    .eq(`${coloana}->>connected`, "true")
    .neq("business_id", businessId);
  if (error) {
    void logError({
      action: `${m}.contUnic`, severity: "error",
      message: `verificarea contului impartit a picat: ${error.message}`, businessId,
    });
    return MESAJ_VERIFICARE_ESUATA;
  }

  const alt = magazinulCareFolosesteContul(m, noua, businessId, (data ?? []) as unknown as RandCandidat[], identitate.amprenta ?? null);
  if (!alt) return null;

  void logError({
    action: `${m}.contUnic`, severity: "warning",
    message: `conectare refuzata: contul ${NUME[m]} e deja legat de alt magazin`,
    details: { businessId, altMagazin: alt }, businessId,
  });
  return mesajContFolosit(m);
}
