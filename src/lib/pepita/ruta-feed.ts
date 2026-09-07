import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { rateLimit } from "@/lib/utils/rate-limit";
import { amprentaCheii, magazinulCheii } from "./chei";
import { pregateste, scrieFeed } from "./feed";

/**
 * Trunchiul comun al celor doua rute de feed.
 *
 * Amandoua fac exact acelasi lucru pana la ultimul pas, si de-aia stau intr-un
 * singur loc: doua copii ar fi ajuns, la prima reparatie, sa raspunda diferit la
 * „ce produse pleaca" sau la „ce se intampla cand cheia e revocata".
 */

/** Cheia din cale, fara sufixul `.xml`. */
export function cheieDinCale(brut: string): string {
  return brut.endsWith(".xml") ? brut.slice(0, -4) : brut;
}

function text(corp: string, status: number): Response {
  return new Response(corp, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function raspundeCuFeed(
  req: Request, cheieBruta: string, fel: "produse" | "stoc",
): Promise<Response> {
  const cheie = cheieDinCale(cheieBruta);

  /*
   * ⚠ PRIMA LINIE, INAINTE DE BAZA. Adresa e publica prin definitie (Pepita nu se
   * poate autentifica altfel), deci oricine o poate lovi. Fara plafon, o rafala pe
   * o cheie gresita ar fi devenit o interogare in baza la fiecare cerere.
   *
   * Plafonul e larg dinadins: Pepita citeste stocul o data pe ora si produsele o
   * data pe zi, dar comerciantul isi poate deschide si el adresa ca sa se uite, iar
   * un plafon strans l-ar fi oprit tocmai cand incearca sa inteleaga de ce nu merge.
   */
  if (!rateLimit(`pepita:feed:${cheie.slice(0, 24)}`, 60, 60_000)) {
    return text("prea multe cereri", 429);
  }

  const admin = createAdminClient();

  let magazin: Awaited<ReturnType<typeof magazinulCheii>>;
  try {
    magazin = await magazinulCheii(admin, "feed", cheie);
  } catch (e) {
    /*
     * ⚠ O CITIRE CAZUTA NU E O CHEIE GRESITA. 503 ii spune lui Pepita „mai
     * incearca"; 404 i-ar spune „feedul asta nu exista", si atunci ar putea scoate
     * catalogul de la vanzare pentru o pana de doua secunde.
     */
    await logError({
      action: "pepita/feed",
      message: `nu s-a putut verifica cheia: ${e instanceof Error ? e.message : String(e)}`,
      severity: "critical",
    });
    return text("temporar indisponibil", 503);
  }

  /*
   * ⚠ 404, NU 401, si nu un corp care sa deosebeasca cele doua cazuri. O cheie
   * gresita si o cheie revocata trebuie sa arate la fel din afara: altfel adresa
   * devine un instrument de ghicit chei valide.
   */
  if (!magazin) return text("Not found", 404);

  let pregatire: Awaited<ReturnType<typeof pregateste>>;
  try {
    pregatire = await pregateste(admin, magazin.businessId);
  } catch (e) {
    await logError({
      action: "pepita/feed",
      message: `pregatirea feedului a cazut: ${e instanceof Error ? e.message : String(e)}`,
      details: { fel }, businessId: magazin.businessId, severity: "critical",
    });
    return text("temporar indisponibil", 503);
  }
  /* Integrare oprita sau magazin sters. Vezi nota din `pregateste`: 404, nu feed gol. */
  if (!pregatire) return text("Not found", 404);

  /*
   * ⚠ `HEAD` NU CONSTRUIESTE FEEDUL. Raspunsul unui `HEAD` n-are corp, deci
   * generarea intregului catalog ar fi fost munca aruncata, iar Vercel ar fi
   * platit-o la fiecare verificare de disponibilitate.
   */
  if (req.method === "HEAD") {
    await marcheazaFolosirea(admin, cheie);
    return new Response(null, { status: 200, headers: anteturi() });
  }

  const businessId = magazin.businessId;
  await marcheazaFolosirea(admin, cheie);

  const generator = scrieFeed(admin, businessId, pregatire, fel);
  const encoder = new TextEncoder();
  const flux = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const pas = await generator.next();
        if (pas.done) controller.close();
        else controller.enqueue(encoder.encode(pas.value));
      } catch (e) {
        /*
         * ⚠ SE INCHIDE CU EROARE, nu cu `close()`.
         *
         * `close()` ar fi terminat raspunsul frumos, dar fara `</Catalog>` scris,
         * deci cu XML invalid, ceea ce e bine. `error()` face insa si conexiunea sa
         * cada, ceea ce e si mai limpede pentru cine citeste de partea cealalta.
         *
         * Ce NU se face niciodata e sa se scrie incheierea aici: un feed valid cu
         * jumatate de catalog inseamna jumatate de magazin scos de la vanzare.
         */
        await logError({
          action: "pepita/feed",
          message: `feedul s-a rupt la mijloc: ${e instanceof Error ? e.message : String(e)}`,
          details: { fel }, businessId, severity: "critical",
        });
        controller.error(e);
      }
    },
    cancel() {
      /* Pepita a inchis conexiunea. Generatorul se opreste, ca sa nu mai citeasca pagini degeaba. */
      void generator.return(undefined as never);
    },
  });

  return new Response(flux, { status: 200, headers: anteturi() });
}

function anteturi(): HeadersInit {
  return {
    "content-type": "application/xml; charset=utf-8",
    /*
     * ⚠ FARA CACHE. Feedul poarta preturi si stocuri, iar Pepita il citeste dupa
     * programul ei. O copie pastrata de CDN ar face ca stocul citit la ora 14 sa fie
     * cel de la 13, adica exact fereastra in care se vinde marfa care nu mai exista.
     *
     * ⚠ Si e si o poarta: `private` opreste orice cache intermediar sa pastreze un
     * catalog intreg de-al comerciantului.
     */
    "cache-control": "no-store, private",
    /* Adresa nu are ce cauta in indexuri, nici daca ajunge cumva intr-un link. */
    "x-robots-tag": "noindex, nofollow",
  };
}

/**
 * Cand a citit Pepita ultima oara.
 *
 * ⚠ SINGURUL SEMN CA LEGATURA TRAIESTE. Nu exista niciun API Pepita de stare, deci
 * „merge integrarea" nu se poate afla intrebandu-i. Fara marcajul asta, comerciantul
 * care a trimis adresele nu are cum sa deosebeasca „inca n-au activat conexiunea" de
 * „citesc de doua saptamani si nu se vinde nimic".
 *
 * ⚠ NU ARUNCA SI NU SE ASTEAPTA REZULTATUL LUI CU MIZA: un marcaj nescris nu e motiv
 * sa nu plece feedul.
 */
async function marcheazaFolosirea(admin: ReturnType<typeof createAdminClient>, cheie: string): Promise<void> {
  try {
    await admin.from("pepita_chei")
      .update({ ultima_folosire: new Date().toISOString() } as never)
      .eq("amprenta", amprentaCheii(cheie));
  } catch {
    /* Marcajul e informativ. O scriere picata nu are de ce sa opreasca feedul. */
  }
}
