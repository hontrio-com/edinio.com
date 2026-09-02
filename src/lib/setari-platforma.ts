/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE DIN `platform_settings` ARE VOIE SA AJUNGA IN BROWSER
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA. `/api/admin/settings` face `select("*")` pe toata tabela si o
  intoarce ca `{cheie: valoare}`. Cat timp acolo au stat numai comutatoare si
  numere, a fost bine.

  Din 02.09.2026 acolo sta si legatura Google a platformei, care poarta un
  `refresh_token`. Un asemenea jeton NU EXPIRA: cine il are are contul, pana la o
  revocare pe care nimeni n-o va face fiindca nimeni nu va sti. Trimis catre
  browserul unui administrator, ar sta in memoria paginii si in orice unealta care
  ii vede raspunsurile.

  ⚠ SI NU E DE AJUNS „administratorii sunt oameni de incredere". Paza asta nu e
  impotriva lor; e impotriva unei singure scapari de XSS in panou, si impotriva
  urmatoarei chei pe care o va pune cineva aici fara sa se gandeasca.

  ⚠ REGULA E PE VALOARE, NU PE CHEIE, si asta e miezul. O lista de chei oprite ar
  fi imbatranit la prima cheie noua — iar cine o adauga nu se gandeste la fisierul
  asta. Aici cade orice camp care POARTA un secret, oricum s-ar numi randul.
*/

/** Numele de campuri care nu ies niciodata dintr-o valoare de setare. */
export const CAMPURI_SECRETE = [
  "refresh_token", "access_token", "token", "jeton",
  "client_secret", "secret", "password", "parola",
  "api_key", "apikey", "private_key",
] as const;

function eCampSecret(nume: string): boolean {
  const n = nume.toLowerCase();
  return (CAMPURI_SECRETE as readonly string[]).some(c => n === c || n.endsWith(`_${c}`));
}

/**
 * Scoate secretele dintr-o valoare de setare, oricat de adanc ar sta.
 *
 * ⚠ SE INLOCUIESC, NU SE STERG. Un camp disparut face interfata sa creada ca
 * legatura nu exista si sa arate butonul de conectare peste una buna. Un semn
 * spune adevarul: „e ceva aici, dar nu-l primesti".
 */
export function faraSecrete(valoare: unknown): unknown {
  if (Array.isArray(valoare)) return valoare.map(faraSecrete);
  if (valoare && typeof valoare === "object") {
    const iesire: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valoare as Record<string, unknown>)) {
      iesire[k] = eCampSecret(k) ? "[ascuns]" : faraSecrete(v);
    }
    return iesire;
  }
  return valoare;
}

/**
 * Un rand din `platform_settings`.
 *
 * ⚠ STA AICI, LANGA TAIERE, dinadins. Era declarat in fiecare loc care citea
 * tabela — deci fiecare usa avea propria idee despre ce e un rand, si nimic nu
 * lega forma de regula care o curata.
 */
export type PlatformSetting = {
  key: string;
  value: unknown;
  updated_at?: string | null;
  updated_by?: string | null;
};

/** Randurile din `platform_settings`, gata de trimis catre browser. */
export function setariPentruBrowser(
  randuri: ReadonlyArray<{ key: string; value: unknown }>,
): Record<string, unknown> {
  const iesire: Record<string, unknown> = {};
  for (const r of randuri) iesire[r.key] = faraSecrete(r.value);
  return iesire;
}
