/**
 * Scrierea unei bucati din `emag_config`.
 *
 * ═══ ⚠ DE CE STA INTR-UN SINGUR LOC ═══
 *
 * `emag_config` e un singur `jsonb`. Scris cu obiectul mic in loc de intregul,
 * ar sterge acreditarile, harta categoriilor si toate marcajele magazinului —
 * adica l-ar deconecta, dintr-o actualizare de cursor.
 *
 * Functia exista de mult in cronul de sincronizare. Mutata aici fiindca a fost
 * nevoie de ea si la import: doua copii ale aceleiasi citiri-si-scrieri se
 * departeaza mai devreme sau mai tarziu, iar aici departarea inseamna un magazin
 * deconectat fara ca nimeni sa fi atins butonul de deconectare.
 *
 * ═══ ⚠ CE A FOST GRESIT PANA PE 24.08.2026 ═══
 *
 * Forma dinainte facea CITIRE -> imbinare in Node -> SCRIERE a obiectului intreg. Doua
 * pagube diferite, una mai putin evidenta decat cealalta:
 *
 * **1. Citirea picata reducea configurarea la PETIC.** `const { data } = …` arunca
 * `error`. La o pana de o clipa, `data` vine `null`, `config` devine `{}`, iar scrierea
 * lasa in `emag_config` numai peticul: `{"reconcile_page": 20}`. Dispar `username`,
 * `connected`, `tara`, `category_map`, `auto_publish` — magazinul apare deconectat.
 * `privat.pazeste_secretele` tine parola, dar numai parola; restul se pierde.
 *
 * **2. Doua scrieri concurente se calca.** Cronul citeste, comerciantul apasa
 * „Conecteaza" cu parola noua, cronul scrie inapoi obiectul VECHI cu un cursor schimbat.
 * Parola noua dispare, ecranul spune „conectat", cererile pica pe autentificare.
 * Scriitorii sunt reali si nu se asteapta unul pe altul: cronul (cinci apeluri, din minut
 * in minut, cu `maxDuration = 60`, deci trecerile se suprapun), webhook-ul (pe ritmul
 * lor), salvarea din panou si importul.
 *
 * ⚠ `jsonb_merge_config` face imbinarea INTR-O SINGURA INSTRUCTIUNE, in Postgres:
 * `set emag_config = coalesce(emag_config,'{}') || $1`. Exista de mult, e deja folosita de
 * cronul-frate About You, si e `service_role`. Nu era de scris, era de chemat.
 *
 * ⚠ SI NU E O IMBINARE PERFECT ATOMICA, si merita spus. `public.store_settings` e o VEDERE
 * peste `privat.store_settings`, cu declansator `INSTEAD OF UPDATE`. Postgres nu incuie
 * randul de baza la scanarea vederii, deci doua apeluri simultane se pot inca pierde unul
 * pe altul. Fereastra scade de la un dus-intors de retea (zeci de ms) la interiorul unei
 * instructiuni (sub o ms). E mult mai bine, nu e „rezolvat".
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import type { EmagConfig } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export async function patchEmagConfig(
  admin: Admin, businessId: string, patch: Partial<EmagConfig>,
): Promise<void> {
  /*
   * ⚠ Peticul gol nu se trimite: `|| '{}'` in RPC ar rescrie randul degeaba, si fiecare
   * scriere goala inseamna un declansator `INSTEAD OF` care reface toate cele ~70 de
   * coloane ale randului — deci o sansa in plus sa calce o salvare concurenta pe alta
   * integrare.
   */
  if (Object.keys(patch).length === 0) return;

  const { error } = await admin.rpc("jsonb_merge_config", {
    p_business_id: businessId,
    p_column: "emag_config",
    p_patch: patch as never,
  });

  /*
   * ⚠ EROAREA SE SPUNE, dar NU se arunca.
   *
   * Se cheama din cron, dupa lucrari care CHIAR au reusit — un cursor de comenzi mutat, un
   * marcaj de retururi. O exceptie aici ar rupe trecerea si ar pierde si ce a mers.
   *
   * Dar tacuta cu totul, ar fi chiar tiparul vanat toata ziua: marcajul nu avanseaza,
   * fereastra reciteste la nesfarsit aceleasi comenzi, si nimic nu spune de ce.
   */
  if (error) {
    await logError({
      action: "emag.config",
      message: `peticul de configurare nu s-a scris: ${error.message}`,
      details: { businessId, campuri: Object.keys(patch) },
      businessId,
      severity: "error",
    });
  }
}
