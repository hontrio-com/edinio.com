import { headers } from "next/headers";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { createAdminClient } from "@/lib/supabase/admin";
import { seMasoaraVizita } from "@/lib/storefront/vizita-de-masurat";
import { clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { esteProprietarulMagazinului } from "./proprietar";
import { scrieEvenimentAnalitic } from "./scrie";

/*
  ═══════════════════════════════════════════════════════════════════════════
  PALNIA: „a cumparat", DIN ORICE ACTIUNE CARE PLASEAZA O COMANDA IN VITRINA
  ═══════════════════════════════════════════════════════════════════════════

  Ultimul prag al palniei si singurul care hotaraste rata de conversie adevarata
  (sesiuni cu comanda / sesiuni).

  ⚠ ERA SCRIS DOAR INTR-UNA DIN CELE DOUA ACTIUNI (gasit pe 20.11.2026). Blocul
  statea de mana in `placeOrder` (comanda rapida, de pe pagina de produs) si lipsea
  din `placeCartOrder` (comanda din cos), de la aparitia palniei, 20.09.2026.
  Masurat in productie pe 13-19.11.2026: 150 de comenzi din vitrina, 29 de
  evenimente `purchase`, 27 de sesiuni „Au comandat". Deci „Au comandat", rata de
  conversie, comenzile si vanzarile pe sursa si pe dispozitiv si concluziile de
  felul „din N cosuri doar M au ajuns comanda" vedeau cam o comanda din cinci, fara
  ca vreo cifra sa arate care patru lipsesc. De aceea sta acum intr-un singur loc,
  chemat din amandoua; `palnia-e-intreaga.test.ts` cade daca o actiune care
  insereaza o comanda din vitrina nu-l cheama.

  ⚠ SE SCRIE PE SERVER, nu din browser: un eveniment de cumparare trimis din pagina
  ar putea fi nascocit de oricine, iar rata de conversie a comerciantului ar deveni
  o cifra pe care si-o poate desena singur oricine.

  ⚠ Se scrie pentru ORICE metoda de plata, spre deosebire de conversiile trimise la
  Google si Meta: acelea inseamna bani incasati, asta inseamna „comanda a fost
  plasata". Palnia masoara drumul cumparatorului, nu incasarea.

  ⚠ ACEEASI REGULA CA LA CELELALTE TREPTE (`seMasoaraVizita`): comanda de proba a
  proprietarului si cele plasate de pe o gazda de test nu intra in palnie, cum nu
  intra nici vizitele lor. Altfel sesiunea lui ar fi aparut direct la „Au comandat",
  fara vizita si fara cos, iar rata de conversie ar fi avut un numarator fara
  numitor. Comanda ramane, fireste, in Comenzi. `dinActiune` e fals dinadins: aici
  nu se reface o pagina, cumpararea e chiar actiunea.

  ⚠ In `after`, dintr-o ACTIUNE de server: acolo `headers()` si `cookies()` se pot
  citi (documentatia Next, `after.md`); intr-o pagina, nu.
*/
export function programeazaCumparareaInPalnie({ businessId, productId, valoare }: {
  businessId: string;
  /** Produsul comenzii, cand e unul singur; `null` la un cos cu mai multe produse. */
  productId: string | null;
  /** Cat a valorat comanda: fara ea, „venit pe sursa" ar spune cate comenzi vin din Facebook, dar nu si cati lei. */
  valoare: number;
}): void {
  dupaRaspuns(async () => {
    const anteturi = await headers();
    const ua = anteturi.get("user-agent");
    const { data: magazin } = await createAdminClient()
      .from("businesses")
      .select("user_id")
      .eq("id", businessId)
      .maybeSingle();

    if (!seMasoaraVizita({
      esteProprietar: await esteProprietarulMagazinului(magazin?.user_id),
      host: anteturi.get("host")?.split(":")[0] ?? "",
      userAgent: ua,
      dinActiune: false,
    })) return;

    await scrieEvenimentAnalitic({
      businessId,
      fel: "purchase",
      ip: clientIpFromHeaders(anteturi),
      userAgent: ua,
      device: /mobile/i.test(ua ?? "") ? "mobile" : /tablet/i.test(ua ?? "") ? "tablet" : "desktop",
      path: "/checkout",
      productId,
      valoare,
    });
  }, "analitice.cumparare", businessId);
}

/** Produsul unei comenzi din cos, pentru randul de palnie: cel al cosului cu un singur produs, altfel niciunul. */
export function produsulComenzii(linii: readonly { product_id: string }[]): string | null {
  const produse = new Set(linii.map((l) => l.product_id));
  return produse.size === 1 ? [...produse][0] : null;
}
