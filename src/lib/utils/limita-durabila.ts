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
  /**
   * Cat consuma chemarea asta din fereastra. `1` = o incercare, ca pana acum.
   *
   * ═══ ⚠ DE CE EXISTA: SUNT LIMITE CARE NU SE NUMARA IN CERERI ═══
   *
   * La autentificare, o incercare e o incercare. La incarcarea de fisiere, ce se plateste nu e
   * numarul de cereri, ci OCTETII scrisi in depozit — iar depozitul se plateste lunar, la
   * nesfarsit. Cu 400 de fisiere pe ora pe magazin si 40 MB pe fisier, marginea „in cereri"
   * ingaduie ~16 GB pe ora fara ca nimic sa se opuna.
   *
   * ⚠ Vezi `migrations/2026-09-07-limita-cu-cost.sql`, unde scrie si de ce e DROP+CREATE si de ce
   * drepturile se refac de mana.
   */
  cost = 1,
): Promise<RezultatLimita> {
  try {
    let { data, error } = await createAdminClient().rpc("consuma_limita", {
      p_cheie: cheie,
      p_limita: limita,
      p_fereastra_sec: fereastraSec,
      p_blocare_sec: blocareSec,
      ...(cost !== 1 ? { p_cost: cost } : {}),
    });

    /*
     * ⚠ DACA BAZA N-ARE INCA PARAMETRUL, SE INCEARCA DIN NOU FARA EL — si nu e pedanterie.
     *
     * Migratia si codul pleaca separat: migratia se aplica de mana, desfasurarea vine de la
     * `git push`. Fara randurile astea, orice fereastra intre ele ar fi facut chemarile cu cost sa
     * cada in `esecTacut`, care raspunde PERMIS — adica exact limita pe care o intarim ar fi fost
     * SINGURA stinsa, si tacut, pe drumul cel mai expus din proiect.
     *
     * ⚠ A doua incercare pierde greutatea (costul devine 1), dar pastreaza limita. Mai putin decat
     * vrem, mult mai mult decat nimic — si numai pana se aplica migratia.
     *
     * ⚠ SE INCEARCA DOAR PE „nu exista functia asta", nu pe orice eroare: o cadere adevarata a
     * bazei nu are de ce sa fie chemata de doua ori.
     */
    if (error && cost !== 1 && /function|PGRST202|schema cache/i.test(error.message)) {
      ({ data, error } = await createAdminClient().rpc("consuma_limita", {
        p_cheie: cheie,
        p_limita: limita,
        p_fereastra_sec: fereastraSec,
        p_blocare_sec: blocareSec,
      }));
    }

    if (error) return esecTacut(cheie, error.message);

    const rand = Array.isArray(data) ? data[0] : data;
    const r = rand as { permis?: boolean; blocat_pana?: string | null } | null;
    if (!r || typeof r.permis !== "boolean") return esecTacut(cheie, "raspuns de forma neasteptata");

    return { permis: r.permis, blocatPana: r.blocat_pana ? new Date(r.blocat_pana) : null };
  } catch (e) {
    return esecTacut(cheie, e instanceof Error ? e.message : String(e));
  }
}

/**
 * Cand limitatorul cade, LASA cererea sa treaca — dar SPUNE-O.
 *
 * Alegerea de a raspunde „permis" e deliberata: limitatorul nu trebuie sa devina
 * el insusi o cadere de serviciu, si prima linie (cea din memorie) ramane activa.
 * Riscul e insa ca o limitare complet stricata (grant revocat din greseala,
 * functie redenumita, tabela lipsa) arata EXACT ca una care functioneaza si nu
 * blocheaza pe nimeni. Fara linia asta in loguri, singurul semn ar fi o tabela
 * `rate_limits` suspect de goala — greu de observat, fiindca si o autentificare
 * reusita sterge randul.
 */
function esecTacut(cheie: string, motiv: string): RezultatLimita {
  console.error("[limita-durabila] contorul NU a putut fi consultat — cererea trece nelimitata", {
    cheie: cheie.split(":").slice(0, 2).join(":"), // fara partea variabila (IP, email)
    motiv,
  });
  return { permis: true, blocatPana: null };
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
