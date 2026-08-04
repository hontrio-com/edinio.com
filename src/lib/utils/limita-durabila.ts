import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Limitare de rata DURABILA (contorul sta in Postgres, nu in memoria procesului).
 *
 * Cand sa folosesti asta si cand `rateLimit` din ./rate-limit:
 *
 *   rateLimit        — prima linie, ieftina, in memorie. Buna pentru a taia
 *                      rafalele fara sa atinga baza de date. Dar starea e PER
 *                      INSTANTA serverless, deci limita reala se inmulteste cu
 *                      numarul de instante calde si se pierde la fiecare deploy.
 *   consumaLimita    — a doua linie, globala si persistenta. Obligatorie acolo
 *                      unde limita chiar trebuie sa tina: autentificare,
 *                      inregistrare, resetare de parola, si orice actiune care
 *                      costa bani (email, SMS, API-uri de curier, facturare).
 *
 * Ideal se folosesc AMANDOUA: intai cea din memorie (fara cost), apoi asta.
 */

export type RezultatLimita = { permis: boolean; blocatPana: Date | null };

/**
 * Inregistreaza o incercare pe `cheie` si spune daca e permisa.
 *
 * @param cheie        identificator stabil, ex. `login:ip:1.2.3.4` sau `login:email:x@y.z`
 * @param limita       cate incercari sunt permise in fereastra
 * @param fereastraSec lungimea ferestrei, in secunde
 * @param blocareSec   daca > 0, la depasire cheia se BLOCHEAZA atat timp
 *                     (blocare progresiva); daca 0, se refuza doar pana la
 *                     expirarea ferestrei
 *
 * La orice eroare de baza de date raspunde PERMIS. E o alegere deliberata:
 * limitatorul nu trebuie sa devina el insusi o cadere de serviciu. Prima linie
 * (in memorie) ramane oricum activa.
 */
export async function consumaLimita(
  cheie: string,
  limita: number,
  fereastraSec: number,
  blocareSec = 0,
): Promise<RezultatLimita> {
  try {
    const { data, error } = await createAdminClient().rpc("consuma_limita", {
      p_cheie: cheie,
      p_limita: limita,
      p_fereastra_sec: fereastraSec,
      p_blocare_sec: blocareSec,
    });

    if (error) return { permis: true, blocatPana: null };

    const rand = Array.isArray(data) ? data[0] : data;
    const r = rand as { permis?: boolean; blocat_pana?: string | null } | null;
    if (!r || typeof r.permis !== "boolean") return { permis: true, blocatPana: null };

    return { permis: r.permis, blocatPana: r.blocat_pana ? new Date(r.blocat_pana) : null };
  } catch {
    return { permis: true, blocatPana: null };
  }
}

/** Sterge contorul — de chemat dupa o incercare REUSITA, ca sa nu ramana
 *  utilizatorul legitim pedepsit pentru incercarile esuate de dinainte. */
export async function reseteazaLimita(cheie: string): Promise<void> {
  try {
    await createAdminClient().rpc("reseteaza_limita", { p_cheie: cheie });
  } catch {
    /* fara consecinte: contorul expira singur */
  }
}

/** Mesaj in romana pentru utilizator, cu timpul ramas cand exista blocare. */
export function mesajLimita(rez: RezultatLimita, implicit = "Prea multe incercari. Incearca din nou peste un minut."): string {
  if (!rez.blocatPana) return implicit;
  const minute = Math.max(1, Math.ceil((rez.blocatPana.getTime() - Date.now()) / 60_000));
  return `Prea multe incercari. Contul este blocat temporar. Incearca din nou peste ${minute} ${minute === 1 ? "minut" : "minute"}.`;
}
