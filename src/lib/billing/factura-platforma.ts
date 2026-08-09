import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createSmartbillInvoice } from "@/lib/smartbill";
import { cheieOperatie, cuRegistru, type Verdict } from "@/lib/operatii/registru";

/**
 * Facturarea PLATFORMEI (abonamente Edinio, comenzi de domenii), sub registru.
 *
 * ═══ DE CE E CAZUL CEL MAI URAT DIN TOT INVENTARUL ═══
 *
 * `createSmartbillInvoice` (src/lib/smartbill.ts:121-125) prinde ORICE excepție de
 * retea si intoarce `{ error }`. Deci un POST care a REUSIT si al carui raspuns s-a
 * pierdut arata identic cu un esec — iar pe exact starea asta e construit butonul
 * de reincercare din `/api/admin/invoices/[id]`. Administratorul vede „a esuat",
 * apasa, si pleaca AL DOILEA document fiscal pe aceeasi incasare.
 *
 * `unique(stripe_invoice_id)` pe `invoices` nu apara: apelul la SmartBill se face
 * INAINTE de scriere, deci a doua factura se emite oricum si doar nu mai e
 * inregistrata — o factura orfana, mai rea decat una duplicata vizibila.
 *
 * ═══ CHEIA ═══
 *
 * Toate cele trei cai — abonament, domeniu, buton de reincercare — trebuie sa
 * ajunga la ACEEASI cheie, altfel butonul ar ocoli registrul si n-ar rezolva nimic.
 * De aceea cheia se compune AICI, dintr-un singur loc, si mereu din incasarea
 * Stripe (`stripe_invoice_id` / `paymentIntentId`) — nu din randul `invoices`, care
 * poate lipsi la prima incercare.
 *
 * `businessId` e `null`: operatiile astea sunt ale platformei, nu ale unui magazin
 * (`public.invoices` are doar `user_id`). Registrul accepta asta din
 * migrations/2026-08-24; indexul unic e pe expresie cu `coalesce`, tocmai ca
 * `NULL != NULL` sa nu deschida o gaura tacuta acolo unde se emit documentele
 * fiscale ale platformei.
 */

export interface ClientFactura {
  name: string;
  email: string;
  vatCode?: string;
  address?: string;
  city?: string;
  county?: string;
}

export interface ProdusFactura {
  name: string;
  price: number;
  quantity: number;
}

/**
 * A refuzat SmartBill, sau doar n-a raspuns? Derivat din cele patru iesiri de
 * eroare ale wrapperului de PLATFORMA (src/lib/smartbill.ts:52, :107-111, :113-117,
 * :120-124) — altele decat cele ale wrapperului de comerciant.
 */
function verdictPlatforma(e: unknown): Verdict {
  const m = e instanceof Error ? e.message : String(e);
  // Configurare lipsa: nu se trimite nimic nicaieri.
  if (m === "Smartbill not configured (missing env vars)") return "esuat";
  // Status fara nicio explicatie de la ei — n-avem ce dovedi.
  if (/^HTTP \d+$/.test(m)) return "necunoscut";
  // 200 fara serie/numar: nici ei nu spun ce a iesit.
  if (m.startsWith("Missing series/number in response:")) return "necunoscut";
  // `catch { return { error: String(err) } }` — retea cazuta, JSON stricat.
  if (/^\w*Error:/.test(m) || m.startsWith("TypeError")) return "necunoscut";
  // A ramas `errorText`, adica un mesaj VENIT DE LA SmartBill: a inteles si a refuzat.
  return "esuat";
}

export type RezultatFacturaPlatforma =
  | { fel: "emisa"; series: string; number: string }
  /** Exista deja de la o incercare anterioara. NU s-a chemat SmartBill din nou. */
  | { fel: "adoptata"; series: string; number: string }
  | { fel: "eroare"; mesaj: string };

/**
 * Emite (sau adopta) factura de platforma pentru o incasare Stripe.
 *
 * `incasareId` e `stripe_invoice_id` la abonamente si `paymentIntentId` la domenii.
 * Cand lipseste — se poate, `session.payment_intent` nu e mereu un sir — se cade pe
 * `rezervaId`, care e id-ul randului din `invoices`. Fara NICIUNA dintre ele nu
 * exista cheie stabila, si atunci se refuza: mai bine o factura neemisa, pe care
 * cineva o cere din nou, decat una emisa de doua ori.
 */
export async function emiteFacturaPlatforma(
  admin: SupabaseClient<Database>,
  incasareId: string | null,
  rezervaId: string | null,
  client: ClientFactura,
  produs: ProdusFactura,
): Promise<RezultatFacturaPlatforma> {
  const discriminant = incasareId ?? rezervaId;
  if (!discriminant) {
    return {
      fel: "eroare",
      mesaj: "Incasarea nu are un identificator stabil, deci factura nu poate fi emisa in siguranta.",
    };
  }

  const r = await cuRegistru(
    admin,
    {
      businessId: null,
      orderId: null,
      fel: "factura",
      furnizor: "smartbill",
      cheie: cheieOperatie("factura", "smartbill", `platforma:${discriminant}`),
    },
    async () => {
      const rezultat = await createSmartbillInvoice(client, produs);
      // Wrapperul nu arunca; registrul lucreaza cu exceptii. Textul se pastreaza
      // EXACT, fiindca `verdictPlatforma` il citeste.
      if ("error" in rezultat) throw new Error(rezultat.error);
      return {
        referinta: rezultat.number ?? "",
        detalii: { serie: rezultat.series ?? null },
        valoare: rezultat,
      };
    },
    verdictPlatforma,
  );

  switch (r.fel) {
    case "facut":
      return { fel: "emisa", series: r.valoare.series ?? "", number: r.valoare.number ?? "" };
    case "deja": {
      // Documentul exista de la o incercare anterioara careia i s-a pierdut
      // scrierea. NU se mai cheama SmartBill: legatura se reface din registru.
      const d = (r.detalii ?? {}) as { serie?: string | null };
      return { fel: "adoptata", series: d.serie ?? "", number: r.referinta ?? "" };
    }
    case "blocat":
    case "eroare":
      return { fel: "eroare", mesaj: r.mesaj };
  }
}
