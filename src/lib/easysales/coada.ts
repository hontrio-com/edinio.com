import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { scrieDacaNeschimbat, stergeDacaNeschimbat } from "@/lib/marketplace/coada-cas";
import type { ContextEasySales } from "./client";
import { anuleazaLaEi, citesteLegatura, intoarceLaEdinio, scrieLegatura, trimiteComanda } from "./comenzi";
import { anunta } from "./notificari";
import { recitesteComanda } from "./oglinda";
import { COADA, asteptareaDupaPauze, type ElementCoada, type Soarta } from "./coada-element";
import { OPERATII_CATALOG, prelucreazaLotulCatalogului } from "./catalog";

/**
 * Lucratorul cozii `easysales_sync_queue` (planul, §5.1.6 si §7.5).
 *
 * ═══ CE CONSUMA INCERCARI SI CE NU ═══
 *
 *   `incercari`  refuzurile: o operatie care a primit „nu" de mai multe ori;
 *   `pauze`      panele trecatoare (429, 5xx, retea, baza) si asteptarile dupa om (token, pauza):
 *                NU abandoneaza. O pana easySales de o jumatate de ora nu are voie sa faca scrisori
 *                moarte din comenzi (lectia OLX, 31.08.2026).
 *
 * Capatul comenzilor nu e un numar de incercari, ci VARSTA: 48 de ore de la stampila. Atunci
 * legatura devine `abandonata`, iar comanda se intoarce la Edinio, dar NUMAI dupa ce cautarea la ei
 * dovedeste ca n-o au. Notificarea pleaca dupa ~2 ore de reluari.
 *
 * Fiecare scriere in coada trece prin compare-and-set pe generatie (`coada-cas.ts`): o cerere noua,
 * pusa peste rand cat lucram, nu dispare sub una veche.
 */

type Admin = SupabaseClient<Database>;
export { COADA, asteptareaDupaPauze, type ElementCoada, type Soarta } from "./coada-element";

const VIATA_COMENZII_MS = 48 * 3600_000;
const NOTIFICARE_DUPA_MS = 2 * 3600_000;
const ASTEPTARE_OM_MS = 5 * 60_000;


/** CAS pe generatie, prin ajutorul comun. */
async function sterge(admin: Admin, el: ElementCoada): Promise<Soarta> {
  await stergeDacaNeschimbat(admin, COADA, el);
  return "gata";
}

async function amana(admin: Admin, el: ElementCoada, ms: number, eroare: string, opt: { refuz?: boolean } = {}): Promise<Soarta> {
  await scrieDacaNeschimbat(admin, COADA, el, {
    ...(opt.refuz ? { incercari: el.incercari + 1 } : { pauze: el.pauze + 1 }),
    ultima_eroare: eroare.slice(0, 500),
    next_retry_at: new Date(Date.now() + ms).toISOString(),
  });
  return "amanat";
}

/** O trimitere care tot nu pleaca: dupa 48 de ore, `abandonata` si inapoi la Edinio. */
async function poateAbandona(admin: Admin, ctx: ContextEasySales, el: ElementCoada, mesaj: string): Promise<Soarta> {
  const leg = await citesteLegatura(admin, ctx.businessId, el.cheie);
  const nascut = Date.parse(leg?.created_at ?? el.created_at);
  const varsta = Number.isFinite(nascut) ? Date.now() - nascut : 0;
  if (leg && varsta > VIATA_COMENZII_MS && (leg.stare === "de_trimis" || leg.stare === "necunoscuta")) {
    const r = await intoarceLaEdinio(admin, ctx, leg, `n-a putut fi trimisă în 48 de ore (${mesaj})`);
    if (r === "intoarsa") {
      await scrieLegatura(admin, leg, ["preluata_edinio"], { motiv: `abandonata dupa 48 de ore: ${mesaj}`.slice(0, 500) });
      await stergeDacaNeschimbat(admin, COADA, el);
      return "abandonat";
    }
  }
  if (leg && varsta > NOTIFICARE_DUPA_MS && el.pauze === 6) {
    await anunta(admin, ctx.businessId, {
      titlu: "O comandă nu poate pleca în easySales",
      mesaj: `Reîncercăm de peste două ore (${mesaj}). Dacă nu reușește în 48 de ore, comanda trece automat în Edinio. O poți prelua și acum din pagina integrării.`,
      detalii: { orderUuid: el.cheie },
    });
  }
  return amana(admin, el, asteptareaDupaPauze(el.pauze), mesaj);
}

/** Un element de coada, dus la capat. ⚠ Arunca numai erori de programare; baza picata = amanare. */
export async function prelucreazaElementul(admin: Admin, ctx: ContextEasySales, el: ElementCoada): Promise<Soarta> {
  try {
    switch (el.op) {
      case "comanda_trimite": {
        const r = await trimiteComanda(admin, ctx, el.cheie);
        switch (r.fel) {
          case "necunoscuta": return amana(admin, el, 2 * 60_000, r.mesaj);
          case "reincearca": return poateAbandona(admin, ctx, el, r.mesaj);
          case "asteapta_omul": return amana(admin, el, ASTEPTARE_OM_MS, r.mesaj);
          default: return sterge(admin, el);
        }
      }
      case "comanda_anuleaza": {
        const r = await anuleazaLaEi(admin, ctx, el.cheie, "Comanda a fost anulată în magazin.");
        if (r.fel === "reincearca") return amana(admin, el, asteptareaDupaPauze(el.pauze), r.mesaj);
        if (r.fel === "asteapta_omul") return amana(admin, el, ASTEPTARE_OM_MS, r.mesaj);
        if (r.fel === "refuz") {
          await anunta(admin, ctx.businessId, {
            titlu: "Anulează comanda și în easySales",
            mesaj: `O comandă anulată în Edinio nu s-a putut anula în easySales: ${r.mesaj}. Anuleaz-o și stornează factura direct acolo.`,
            severitate: "error", detalii: { orderUuid: el.cheie },
          });
        }
        return sterge(admin, el);
      }
      case "comanda_citeste": {
        const r = await recitesteComanda(admin, ctx, el.cheie);
        if (r === "reincearca") return amana(admin, el, asteptareaDupaPauze(el.pauze), "recitirea a cazut");
        if (r === "asteapta_omul") return amana(admin, el, ASTEPTARE_OM_MS, "tokenul cere reconectare");
        return sterge(admin, el);
      }
      default:
        /* Catalogul (E3) si stocul (E4): lucratorul lor, care stie si cand catalogul e oprit. */
        if (OPERATII_CATALOG.includes(el.op)) {
          const [s] = await prelucreazaLotulCatalogului(admin, ctx, el.op, [el], { maiAreTimp: () => true });
          return s;
        }
        return amana(admin, el, 60 * 60_000, `operatia ${el.op} nu are lucrator`);
    }
  } catch (e) {
    /* `EroareCitireBaza` si orice pana neasteptata: se amana, nu se pierde. */
    await logError({ action: "easysales.coada", severity: "warning", businessId: ctx.businessId, message: `${el.op}: ${(e as Error).message}`, details: { cheie: el.cheie } });
    return amana(admin, el, asteptareaDupaPauze(el.pauze), (e as Error).message);
  }
}
