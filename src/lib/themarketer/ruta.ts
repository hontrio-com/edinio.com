import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { rateLimit } from "@/lib/utils/rate-limit";
import { formaCheieValida, magazinulCheii, type FelFeed } from "./chei";
import { modulPornit, theMarketerGata, type TheMarketerConfig } from "./config";
import { citesteConfig, insemneaza, type CampStare } from "./server";
import {
  cerereaComenzilor, contextulMagazinului, fluxBranduri, fluxCategorii, fluxProduse, paginaComenzi,
  type ContextMagazin,
} from "./feed-server";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  TRUNCHIUL COMUN AL ADRESELOR PE CARE LE CHEAMA THEMARKETER
  ═══════════════════════════════════════════════════════════════════════════════

  Adresele sunt publice prin definitie (theMarketer nu se poate autentifica altfel decat prin cheia din
  cale), deci ordinea pazei conteaza:
    1. plafon pe cheie, INAINTEA oricarei interogari: o rafala pe chei inventate nu ajunge in baza;
    2. forma cheii, tot fara baza;
    3. cheia, cautata dupa amprenta;
    4. configurarea si modulul.

  ⚠ 404, NU 401, si acelasi corp pentru „cheie gresita”, „cheie revocata”, „integrare oprita” si „modul
  oprit”: altfel adresa devine un instrument de ghicit chei valide.
  ⚠ O CITIRE CAZUTA E 503, nu 404: theMarketer trebuie sa reincerce, nu sa creada ca feedul a disparut.
*/

export function text(corp: string, status: number): Response {
  return new Response(corp, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}

export function json(corp: unknown, status = 200): Response {
  return new Response(JSON.stringify(corp), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-robots-tag": "noindex, nofollow" },
  });
}

export type Poarta =
  | { ok: true; businessId: string; config: TheMarketerConfig }
  | { ok: false; raspuns: Response };

/** Plafonul pe cheie: larg, ca omul care isi deschide adresa sa nu fie oprit cand incearca sa inteleaga. */
export async function poarta(cheieBruta: string, unde: string, plafon = 120): Promise<Poarta> {
  const cheie = (cheieBruta ?? "").trim();
  if (!rateLimit(`themarketer:${unde}:${cheie.slice(0, 24)}`, plafon, 60_000)) {
    return { ok: false, raspuns: text("prea multe cereri", 429) };
  }
  if (!formaCheieValida(cheie)) return { ok: false, raspuns: text("Not found", 404) };

  let businessId: string | null;
  let config: TheMarketerConfig | null;
  try {
    businessId = await magazinulCheii(createAdminClient(), cheie);
    config = businessId ? await citesteConfig(businessId) : null;
  } catch (e) {
    await logError({
      action: `themarketer/${unde}`,
      message: `cheia nu s-a putut verifica: ${e instanceof Error ? e.message : String(e)}`,
      severity: "error",
    });
    return { ok: false, raspuns: text("temporar indisponibil", 503) };
  }
  if (!businessId || !theMarketerGata(config)) return { ok: false, raspuns: text("Not found", 404) };
  return { ok: true, businessId, config };
}

function anteturi(tip: string): HeadersInit {
  return {
    "content-type": tip,
    /* Feedul poarta preturi si stocuri: o copie pastrata pe drum ar trimite stocul de acum o ora. Si e o
       poarta: `private` opreste orice cache intermediar sa pastreze catalogul sau comenzile. */
    "cache-control": "no-store, private",
    "x-robots-tag": "noindex, nofollow",
  };
}

const CAMP_CITIRE: Record<FelFeed, CampStare> = {
  produse: "citit_produse_la",
  categorii: "citit_categorii_la",
  branduri: "citit_branduri_la",
  comenzi: "citit_comenzi_la",
};

/** Raspunsul unei adrese de feed. */
export async function raspundeCuFeed(req: Request, cheieBruta: string, fel: FelFeed): Promise<Response> {
  const p = await poarta(cheieBruta, `feed-${fel}`);
  if (!p.ok) return p.raspuns;
  const { businessId, config } = p;

  /* Exportul comenzilor scoate date personale: numai cu modulul lui pornit, si la fel de mut ca o cheie gresita. */
  if (fel === "comenzi" && !modulPornit(config, "export_comenzi")) return text("Not found", 404);

  const admin = createAdminClient();
  let ctx: ContextMagazin | null;
  try {
    ctx = await contextulMagazinului(admin, businessId);
  } catch (e) {
    await logError({ action: `themarketer/feed-${fel}`, message: `pregatirea feedului a cazut: ${e instanceof Error ? e.message : String(e)}`, businessId, severity: "error" });
    return text("temporar indisponibil", 503);
  }
  if (!ctx) return text("Not found", 404);
  /* Catalogul unui magazin nepublicat ar trimite oamenii, din email, pe adrese care nu se deschid. */
  if (fel !== "comenzi" && !ctx.publicat) return text("Not found", 404);

  if (fel === "comenzi") {
    const cerere = cerereaComenzilor(new URL(req.url).searchParams);
    if ("eroare" in cerere) return json({ status: cerere.eroare }, 400);
    if (req.method === "HEAD") return new Response(null, { status: 200, headers: anteturi("application/json; charset=utf-8") });
    try {
      const corp = await paginaComenzi(admin, ctx, cerere);
      await insemneaza(businessId, CAMP_CITIRE.comenzi);
      return new Response(corp, { status: 200, headers: anteturi("application/json; charset=utf-8") });
    } catch (e) {
      await logError({ action: "themarketer/feed-comenzi", message: e instanceof Error ? e.message : String(e), businessId, severity: "error" });
      return text("temporar indisponibil", 503);
    }
  }

  /* ⚠ `HEAD` NU CONSTRUIESTE FEEDUL: raspunsul n-are corp, deci generarea catalogului ar fi munca aruncata. */
  if (req.method === "HEAD") return new Response(null, { status: 200, headers: anteturi("application/xml; charset=utf-8") });
  await insemneaza(businessId, CAMP_CITIRE[fel]);

  const generator = fel === "produse" ? fluxProduse(admin, ctx) : fel === "categorii" ? fluxCategorii(ctx) : fluxBranduri(admin, ctx);
  const encoder = new TextEncoder();
  const flux = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const pas = await generator.next();
        if (pas.done) controller.close();
        else controller.enqueue(encoder.encode(pas.value));
      } catch (e) {
        /* ⚠ SE INCHIDE CU EROARE, fara `</products>`: un XML valid cu jumatate de catalog ar scoate din
           recomandari produse care exista. */
        await logError({ action: `themarketer/feed-${fel}`, message: `feedul s-a rupt la mijloc: ${e instanceof Error ? e.message : String(e)}`, businessId, severity: "error" });
        controller.error(e);
      }
    },
    cancel() {
      void generator.return(undefined as never);
    },
  });
  return new Response(flux, { status: 200, headers: anteturi("application/xml; charset=utf-8") });
}
