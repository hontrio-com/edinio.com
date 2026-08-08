/**
 * Cine intra in reconcilierea abonamentelor — regula care hotaraste, pana la urma,
 * cui i se poate inchide magazinul.
 *
 * ═══ DE CE STA SEPARAT DE CRON ═══
 *
 * Fiindca acolo nu poate fi testata: ruta cere `CRON_SECRET`, client Supabase si
 * chei Stripe, iar niciuna nu exista la rulare de teste. Iar regula asta ARE nevoie
 * de test: `suspended_until` inchide si panoul, si cosul, si checkout-ul. O
 * greseala aici nu strica un ecran — opreste vanzarile unui comerciant care
 * plateste.
 *
 * Acelasi motiv ca la [[stoc-rezervat]] si [[refuz-stoc]].
 */

export interface UtilizatorDeReconciliat {
  id: string;
  plan: string | null;
  stripe_customer_id: string | null;
}

export interface MagazinRand {
  user_id: string;
  suspended_until: string | null;
}

/**
 * Cei carora chiar merita sa le cerem Stripe-ului parerea.
 *
 * Trei motive de sarire, toate INSPRE „nu suspenda":
 *
 *  - fara `stripe_customer_id` — n-avem ce intreba;
 *  - deja in gratie — cronul e idempotent, dar un al doilea drum la Stripe pentru
 *    un cont deja suspendat e munca in gol;
 *  - fara niciun magazin — n-are ce sa fie suspendat.
 *
 * ⚠ „In gratie" inseamna ORICARE magazin al userului are `suspended_until`, nu
 * toate. Asa era si inainte, si asa ramane: userul e deja instiintat, iar a-l
 * trece din nou prin verificare nu adauga nimic. Daca cineva schimba vreodata
 * regula pe „toate magazinele", un user cu doua magazine si unul singur suspendat
 * ar fi verificat la fiecare ora, la nesfarsit.
 */
export function alegeDeVerificat(
  utilizatori: UtilizatorDeReconciliat[],
  magazine: MagazinRand[],
): UtilizatorDeReconciliat[] {
  const inGratie = new Set(magazine.filter((b) => b.suspended_until).map((b) => b.user_id));
  const areMagazin = new Set(magazine.map((b) => b.user_id));
  return utilizatori.filter(
    (u) => Boolean(u.stripe_customer_id) && !inGratie.has(u.id) && areMagazin.has(u.id),
  );
}
