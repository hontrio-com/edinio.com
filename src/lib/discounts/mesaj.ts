/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN SINGUR MESAJ PENTRU ORICE CUPON RESPINS                    (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ MUTAT AICI DIN `discount.actions.ts`, unde era o constantă de modul.
 *
 * Erau patru mesaje deosebite: „nu este valid” / „a expirat” / „a atins limita
 * maximă” / „valoarea minimă a comenzii este X lei”. Deosebirea dintre ele
 * confirmă că un cod EXISTĂ, deci acțiunea publică putea fi folosită ca oracol
 * de dicționar (BLACKFRIDAY, WELCOME10, REDUCERE20 — codurile scrise de mână de
 * comerciant). Iar `subtotal` vine de la client și nu se verifică nicăieri, deci
 * trimițând 0 se forța mereu ramura care tipărea pragul minim al comerciantului.
 *
 * ⚠⚠ DE CE NU MAI STĂ ÎN FIȘIERUL DE ACȚIUNI. Două motive, amândouă măsurate:
 *
 *   1. `placeOrder` și `placeCartOrder` răspundeau cu ALT text când revendicarea
 *      atomică refuza codul („Codul a atins limita maximă de utilizări”). Ca să
 *      cadă și ele în mesajul unic, le trebuie constanta — iar un fișier
 *      `"use server"` nu are voie să exporte decât funcții `async`.
 *
 *   2. Vitrina trebuie să recunoască mesajul ca să scoată cuponul din coș când
 *      comanda se oprește din cauza lui. Recunoscut după un text copiat, s-ar fi
 *      despărțit de original la prima schimbare de virgulă.
 *
 * ⚠ Cine desparte mesajele la loc redeschide oracolul, și nu doar pe jumătate:
 * ajunge UNA dintre ramurile „codul există, dar…” ca enumerarea să meargă din
 * nou. Pragul minim se anunță pe pagina magazinului, unde comerciantul alege
 * să-l spună, nu ca răspuns la un cod ghicit.
 *
 * ⚠ Regulile adăugate pe 21.09.2026 (programare, o dată per client, restrângere
 * pe produse) resping mult mai des decât cele de dinainte, și din motive
 * cinstite. Toate cad tot aici. Motivul adevărat se scrie în `error_logs`, unde
 * îl vede comerciantul, niciodată în răspunsul către cumpărător.
 */
export const ESEC_CUPON =
  "Codul introdus nu este valid sau nu poate fi folosit pentru această comandă.";

/**
 * Mesajul celor două frâne de încercări.
 *
 * ⚠ E ALT TEXT, și are voie să fie: amândouă se întorc ÎNAINTE de căutarea
 * codului în bază, deci răspunsul lor nu depinde în niciun fel de codul cerut.
 * Nu spune dacă un cod există — spune doar că apelantul a bătut prea des.
 *
 * ⚠ Regula care apără mesajul unic se judecă pe ce EXCLUDE, nu pe ce se vede:
 * orice ieșire de după căutare trebuie să fie `ESEC_CUPON`. Vezi proba
 * `un-singur-mesaj.test.ts`.
 */
export const PREA_MULTE_INCERCARI =
  "Prea multe incercari. Asteapta un minut si incearca din nou.";
