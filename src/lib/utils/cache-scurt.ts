/**
 * Cache scurt, in memoria instantei, pentru cautari repetate identic.
 *
 * DE CE NU `unstable_cache` / `use cache`: cache-ul de date al Next.js nu e
 * disponibil in proxy (middleware), iar tocmai acolo se pierde cel mai mult —
 * rezolvarea domeniului rula la FIECARE cerere, 2.268.466 de ori.
 *
 * CE ESTE SI CE NU ESTE. E un cache PER INSTANTA: pe Vercel fiecare instanta
 * calda are propriul exemplar, iar la o desfasurare noua se pierde. Deci nu e o
 * sursa de adevar, ci doar o scutire de drumuri identice pe un interval scurt.
 * Exact acelasi rationament ca la limitatorul de rata din memorie, doar ca aici
 * proprietatea „per instanta" e inofensiva: cel mai rau caz e ca doua instante
 * fac fiecare cate o interogare in loc de una singura.
 *
 * PLAFONUL NU E OPTIONAL. Cheia vine din antetul `Host`, adica de la client.
 * Fara plafon, cineva care trimite gazde inventate ar umfla harta pana la
 * epuizarea memoriei instantei — un refuz de serviciu ieftin. La depasire
 * aruncam intrarile cele mai vechi.
 */

type Intrare<T> = { valoare: T; expiraLa: number };

export class CacheScurt<T> {
  private harta = new Map<string, Intrare<T>>();
  // Campurile se declara explicit, NU ca proprietati de parametru
  // (`constructor(private x)`): parserul „strip-only" al lui Node, folosit de
  // harness-ul de teste, nu le suporta si fisierul nici nu se incarca.
  private readonly ttlMs: number;
  private readonly maxIntrari: number;

  constructor(ttlMs: number, maxIntrari = 500) {
    this.ttlMs = ttlMs;
    this.maxIntrari = maxIntrari;
  }

  get(cheie: string): T | undefined {
    const i = this.harta.get(cheie);
    if (!i) return undefined;
    if (i.expiraLa <= Date.now()) {
      this.harta.delete(cheie);
      return undefined;
    }
    // Reinsereaza, ca `Map` sa pastreze ordinea „cel mai recent folosit" —
    // altfel evacuarea de mai jos ar putea arunca tocmai gazda cea mai ceruta.
    this.harta.delete(cheie);
    this.harta.set(cheie, i);
    return i.valoare;
  }

  set(cheie: string, valoare: T, ttlMsPropriu?: number): void {
    if (this.harta.size >= this.maxIntrari && !this.harta.has(cheie)) {
      // Map itereaza in ordinea inserarii: prima cheie e cea mai veche atinsa.
      const ceaMaiVeche = this.harta.keys().next().value;
      if (ceaMaiVeche !== undefined) this.harta.delete(ceaMaiVeche);
    }
    this.harta.set(cheie, { valoare, expiraLa: Date.now() + (ttlMsPropriu ?? this.ttlMs) });
  }

  /**
   * Ia din cache sau calculeaza. `ttlLaRezultatGol` exista fiindca un raspuns
   * NEGATIV („domeniul nu exista") trebuie tinut mai putin: altfel un domeniu
   * tocmai conectat ar da 404 pana expira intrarea.
   */
  async iaSau(
    cheie: string,
    calculeaza: () => Promise<T>,
    eGol?: (v: T) => boolean,
    ttlLaRezultatGol?: number,
  ): Promise<T> {
    const dinCache = this.get(cheie);
    if (dinCache !== undefined) return dinCache;
    const valoare = await calculeaza();
    const gol = eGol?.(valoare) ?? false;
    this.set(cheie, valoare, gol ? ttlLaRezultatGol : undefined);
    return valoare;
  }

  sterge(cheie: string): void {
    this.harta.delete(cheie);
  }

  goleste(): void {
    this.harta.clear();
  }

  get marime(): number {
    return this.harta.size;
  }
}
