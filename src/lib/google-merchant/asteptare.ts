import type { EroareToken } from "./oauth";

/**
 * Cat asteapta o trimitere dupa a N-a cadere: 1, 2, 4, 8 minute, apoi cate 15.
 *
 * ═══ ⚠ DE CE (17.09.2026) ═══
 *
 * Ghidul Merchant API („Handle error responses”): pentru `quota/request_rate_too_high` si
 * `internal_error`, „implement an exponential backoff strategy”. Cronul reincerca minut de minut, deci
 * dupa 5 minute un produs ramanea DEFINITIV in „eroare” pentru o pana de cateva minute la Google. Cu
 * asteptarea asta, cele 5 incercari acopera aproape o jumatate de ora. Aceeasi forma ca la OLX.
 */
export function asteptareaUrmatoare(attempts: number, acum: number = Date.now()): string {
  const minute = Math.min(15, 2 ** Math.max(0, attempts - 1));
  return new Date(acum + minute * 60_000).toISOString();
}

/**
 * Cat asteapta coada unui magazin cand tokenul Google nu vine.
 *
 * ⚠ NU SE STERGE NIMIC. Pana pe 17.09.2026, orice cadere a tokenului era citita ca „magazin deconectat”,
 * iar cronul STERGEA toata coada magazinului: schimbarile de pret si de stoc ajungeau la Google abia la
 * retrimiterea de peste 7 zile. O pana trecatoare se reia in cateva minute; un token revocat sau fara
 * drept asteapta reconectarea, verificat din ora in ora.
 */
export const ASTEPTARE_DUPA_TOKEN_MS: Record<EroareToken, number> = {
  indisponibil: 5 * 60_000,
  revocat: 60 * 60_000,
  "fara-drept": 60 * 60_000,
};

/** O eroare de la Google care isi pastreaza codul HTTP si `REASON`-ul, ca prinderea sa poata decide. */
export class EroareGoogle extends Error {
  /* ⚠ Campuri scrise explicit, nu `constructor(readonly status ...)`: probele ruleaza TypeScript in modul
     care doar sterge tipurile, iar proprietatile din constructor nu se pot sterge, se traduc. */
  readonly status: number;
  readonly reason?: string;
  constructor(mesaj: string, status: number, reason?: string) {
    super(mesaj);
    this.status = status;
    this.reason = reason;
  }
}

/**
 * Daca o cadere nu are rost reincercata.
 *
 * ⚠ Doar 400 (`INVALID_ARGUMENT`): produsul trimis e gresit si va fi gresit si peste un minut, iar
 * comerciantul trebuie sa vada motivul ACUM, nu dupa cinci incercari. 429 si 5xx sunt exact cele pe care
 * ghidul le cere reincercate; 401/403 pot veni dintr-un token care tocmai a expirat sau a pierdut dreptul,
 * iar acolo raspunde pasul cu tokenul, nu produsul.
 */
export function caderePermanenta(e: unknown): boolean {
  return e instanceof EroareGoogle && e.status === 400;
}
