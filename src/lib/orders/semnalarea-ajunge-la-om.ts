import type { SupabaseClient } from "@supabase/supabase-js";
import { logError } from "@/lib/error-logger";
import type { Database } from "@/types/database.types";

type Admin = SupabaseClient<Database>;

/**
 * ⚠⚠ O SEMNALARE CARE NU AJUNGE LA OM NU E O SEMNALARE.
 *
 * Masurat pe 16.09.2026: din cele saptesprezece cronuri de urmarire, DOUASPREZECE scriau
 * si in `notifications` (clopotelul din panou), iar cinci scriau numai in `error_logs`.
 * Iar cele trei transportatoare care au miscat vreodata un colet — **Woot (172 AWB-uri),
 * DPD (3) si Sameday (1)** — erau chiar printre cele cinci.
 *
 * Toate trei faceau acelasi lucru: calculau ca ceva merita spus (`semnalate++`), compuneau
 * propozitia, si o scriau intr-un jurnal pe care comerciantul nu-l deschide niciodata.
 * Dovada: zero randuri de tip `woot` in `notifications`, desi jurnalul are patru retururi
 * repetate la fiecare rulare.
 *
 * ⚠ SI A DOUA JUMATATE, fara de care prima ar fi fost mai rea decat lipsa ei: cele trei
 * NU comparau starea noua cu cea veche. Woot re-semnala aceleasi patru retururi la 02:59,
 * 04:59 si 06:59 — in jurnal e inofensiv, dar ca notificare ar fi fost o alarma la fiecare
 * doua ore pentru acelasi eveniment. De aia garda pe SCHIMBARE si notificarea se pun
 * impreuna, niciodata una fara alta.
 *
 * Ajutorul sta aici, si nu in fisierul unui curier, fiindca regula e a tuturor: vezi
 * lectia de la `eroareDeTermen`, mutata din `fancourier.ts` din acelasi motiv.
 */

/**
 * Proprietarii magazinelor, pe `business_id`.
 *
 * ⚠ `user_id` e OBLIGATORIU in `notifications` (si e cheie straina catre `auth.users`), deci
 * fara el nu se poate scrie nimic. Un magazin fara proprietar gasit NU e o eroare: contul
 * poate fi sters, iar jurnalul ramane oricum.
 *
 * ⚠ `.in()` se taie in bucati: adresa unei cereri PostgREST are limita de lungime, iar un lot
 * mare ar face cererea sa cada intreaga — adica nimeni n-ar mai primi nimic.
 */
export async function proprietariiMagazinelor(
  admin: Admin,
  businessIds: readonly string[],
): Promise<Map<string, string | null>> {
  const harta = new Map<string, string | null>();
  const unice = [...new Set(businessIds.filter(Boolean))];
  for (let i = 0; i < unice.length; i += 100) {
    const { data, error } = await admin
      .from("businesses").select("id, user_id").in("id", unice.slice(i, i + 100));
    if (error) {
      console.error("[semnalare] proprietarii nu s-au putut citi:", error.message);
      continue;
    }
    for (const r of data ?? []) harta.set(r.id, r.user_id ?? null);
  }
  return harta;
}

/**
 * S-a schimbat starea fata de ce aveam scris pe comanda?
 *
 * ⚠ Se compara valori NORMALIZATE, si asta conteaza: coloana poate purta un cod scris de
 * mana sau un numar venit ca text. Fara normalizare, aceeasi stare s-ar resemnala la fiecare
 * rulare — adica exact defectul pe care garda il repara.
 *
 * ⚠ O stare noua fata de NIMIC (coloana goala) se semnaleaza: e prima oara cand aflam ceva.
 */
export function stareaSaSchimbat(veche: unknown, noua: unknown): boolean {
  const curat = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim().toUpperCase());
  const n = curat(noua);
  if (!n) return false;
  return curat(veche) !== n;
}

export type Semnalare = {
  /** Proprietarul magazinului. `null` inseamna ca notificarea se sare, dar jurnalul ramane. */
  userId: string | null;
  businessId: string;
  orderId?: string | null;
  orderNumber?: string | null;
  /** Numarul expedierii, asa cum il stie comerciantul. */
  awb?: string | null;
  /** Tipul notificarii: numele curierului, cu litere mici (`woot`, `dpd`, `sameday`). */
  tip: string;
  titlu: string;
  mesaj: string;
  /** Numele cronului, pentru jurnal. */
  actiune: string;
  detalii?: Record<string, unknown>;
};

/**
 * Spune-i omului, si scrie si in jurnal.
 *
 * ⚠ Ordinea conteaza: notificarea INTAI. Jurnalul e pentru noi si nu se pierde daca ramane
 * ultimul; notificarea e pentru comerciant, si daca functia cade la mijloc el trebuie sa fie
 * cel care a primit, nu cel care a ramas fara.
 *
 * ⚠ Si niciuna dintre ele nu are voie sa arunce: o notificare picata n-are dreptul sa
 * opreasca urmarirea celorlalte colete.
 */
export async function semnaleazaExpedierea(admin: Admin, p: Semnalare): Promise<void> {
  if (p.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: p.userId,
      type: p.tip,
      title: p.titlu,
      message: p.mesaj,
    });
    if (error) console.error(`[${p.actiune}] notificarea nu s-a scris:`, error.message);
  }

  await logError({
    action: p.actiune,
    message: p.mesaj,
    details: { ...(p.detalii ?? {}), ...(p.orderId ? { orderId: p.orderId } : {}), ...(p.awb ? { awb: p.awb } : {}) },
    businessId: p.businessId,
    severity: "warning",
  });
}
