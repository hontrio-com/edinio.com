/**
 * „Randul nu exista" si „n-am putut interoga baza" sunt doua lucruri DIFERITE.
 *
 * ═══ DE CE ═══
 *
 * Tiparul `const { data } = await admin.from(...)...` arunca `error` si lasa
 * `data` null. Pe o ruta de webhook asta inseamna ca un incident de baza de doua
 * secunde arata exact ca „nu cunosc comanda" — si raspundem 200. Procesatorul
 * bifeaza notificarea ca livrata si NU o mai repeta. Banii raman incasati la el,
 * comanda ramane neplatita la noi, iar semnalul s-a pierdut definitiv.
 *
 * Aceeasi confuzie a produs deja doua defecte in proiect: citirea oarba din
 * `domains-reconcile` (raporta `checked: 0` pe o interogare picata) si maparea
 * codurilor de bare de la Trendyol (o citire picata devenea „nu exista mapare",
 * iar comanda se pierdea cand fereastra trecea peste ea).
 *
 * ═══ DE CE NU E DOAR `if (error)` ═══
 *
 * `.single()` raporteaza `PGRST116` cand pur si simplu NU exista randul. Un
 * `if (error) return 503` pus mecanic ar transforma „magazin fara rand in
 * `store_settings`" sau „orderId inventat de un strain" intr-un 5xx — adica exact
 * intr-o furtuna de reincercari la procesator, pe o ruta publica si nesemnata.
 * Poarta trebuie sa se inchida NUMAI pe esec real de infrastructura.
 */
export function citireCazuta(
  error: { code?: string } | null | undefined,
  rand: unknown,
): boolean {
  if (!error) return false;
  // Zero randuri pe `.single()`. Nu e o cadere: e un raspuns.
  if (error.code === "PGRST116") return false;
  /*
   * ⚠ Si `22P02` iese de sub poarta, din acelasi motiv, dar pe alt drum.
   *
   * Rutele astea sunt PUBLICE si nesemnate, iar `orderId`/`businessId` vin din
   * URL. Un sir care nu e uuid face Postgres sa raspunda `invalid input syntax
   * for type uuid` — un raspuns, nu o cadere. Tratat ca esec de infrastructura,
   * oricine ar putea cere `?orderId=abc` in bucla si ar obtine 5xx la nesfarsit
   * plus cate o alarma CRITICA la fiecare cerere, adica exact zgomotul care
   * ingroapa incidentele reale.
   */
  if (error.code === "22P02") return false;
  return rand == null;
}

/**
 * Coduri Postgres care inseamna „intrebarea n-are sens", nu „baza e cazuta".
 *
 * `22P02` = `invalid input syntax for type uuid`. Apare cand un procesator ne
 * trimite ca referinta externa ceva ce nu e un uuid de-al nostru (comanda
 * facuta direct in contul lui, eveniment de test). Tratat drept cadere, un
 * singur eveniment strain ar produce reincercari si alarme critice la fiecare
 * livrare — deci se citeste ca „nu exista".
 */
export function intrebareFaraSens(error: { code?: string } | null | undefined): boolean {
  return error?.code === "22P02";
}
