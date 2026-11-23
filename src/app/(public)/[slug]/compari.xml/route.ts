import { createAdminClient } from "@/lib/supabase/admin";
import { construiesteArticolCompari, serializeazaFeedCompari, type ArticolCompari } from "@/lib/compari/feed";
import { caileCategoriilorPentruCompari, magazinulPentruCompari, produselePentruCompari } from "@/lib/compari/server";
import { logError } from "@/lib/error-logger";

export const dynamic = "force-dynamic";

/*
 * Feedul de produse pentru Compari.ro, pe magazin, la {adresa magazinului}/compari.xml.
 *
 * O singura ruta pentru amandoua felurile de adresa, ca la `facebook-catalog.xml`: pe domeniul propriu ajunge
 * aici prin `proxy.ts` (domeniu.ro/compari.xml -> /{slug}/compari.xml), iar pe edinio.com/{slug} e servita direct.
 * Comerciantul lipeste adresa in Centrul de clienti Compari, la „Sursa listei produselor”; ei o descarca zilnic.
 *
 * ⚠ O citire care esueaza da 503, nu un feed valid si gol. Un `<products></products>` cu 200 i-ar spune lui
 * Compari „magazinul nu mai vinde nimic”, iar produsele ar fi scoase si reluate de la capat (3-7 zile lucratoare,
 * dupa pagina lor despre modificarea feedului). 503 inseamna „mai incearca”.
 *
 * Ce se citeste si cu ce reguli sta in `lib/compari/server.ts`, acelasi loc din care isi ia cifrele si panoul.
 */
async function indisponibil(e: unknown): Promise<Response> {
  /* `await`, nu lasat in urma: raspunsul pleaca imediat dupa, iar functia poate fi inghetata inainte ca
     randul sa ajunga in baza. */
  await logError({
    action: "feedCompari",
    message: e instanceof Error ? e.message : "citirea a esuat",
    severity: "critical",
  });
  return new Response("temporar indisponibil", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    return await construieste(ctx);
  } catch (e) {
    return await indisponibil(e);
  }
}

async function construieste({ params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  const admin = createAdminClient();

  const citit = await magazinulPentruCompari(admin, { slug });
  if (!citit || !citit.publicat) return new Response("Not found", { status: 404 });

  const [produse, caleaCategoriei] = await Promise.all([
    produselePentruCompari(admin, citit.id),
    caileCategoriilorPentruCompari(admin, citit.id),
  ]);

  const articole: ArticolCompari[] = [];
  for (const p of produse) {
    const articol = construiesteArticolCompari(citit.magazin, p, caleaCategoriei);
    if (articol) articole.push(articol);
  }

  return new Response(serializeazaFeedCompari(articole), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      /* Compari descarca o data pe zi; o ora de pastrare tine in frau citirile repetate fara sa intarzie pretul. */
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
