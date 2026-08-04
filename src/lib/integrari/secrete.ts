/**
 * Campurile secrete ale integrarilor: mascare la citire, pastrare la salvare.
 *
 * PROBLEMA. Paginile de integrari din dashboard citeau configuratia intreaga si o
 * pasau unei Client Component, ca sa poata popula formularul. Adica parola de
 * curier, tokenul de facturare si cheia de plati coborau in browser, in clar, si
 * se citeau din Inspect Element sau din payload-ul RSC. Nu e o scurgere intre
 * chiriasi — sunt secretele PROPRIULUI comerciant — dar orice XSS pe dashboard,
 * orice extensie de browser si orice partajare de ecran le duce mai departe.
 *
 * TIPARUL, deja folosit in proiect pentru parola SMTP (vezi
 * `saveEmailConfig` din email-settings.actions.ts si comentariul din
 * settings/page.tsx: „send the config WITHOUT the password (write-only field)"):
 *   - la CITIRE, campul secret pleaca gol, insotit de un boolean „e completat";
 *   - la SALVARE, un camp gol inseamna „nu-l schimba", nu „sterge-l".
 *
 * ATENTIE, cea mai periculoasa greseala aici: mascarea si pastrarea trebuie sa
 * ajunga IMPREUNA. Mascat fara pastrare, prima salvare a comerciantului ii STERGE
 * credentiala — integrarea se opreste si nimeni nu intelege de ce.
 */

/** Numele reale ale campurilor, luate din datele de productie si din tipuri. */
export const CAMPURI_SECRETE: Record<string, readonly string[]> = {
  cargus_config: ["password", "subscription_key"],
  colete_config: ["client_secret", "token"],
  dpd_config: ["password"],
  fan_courier_config: ["password"],
  fgo_config: ["private_key"],
  ipay_config: ["password"],
  klarna_config: ["password", "authorization_token"],
  netopia_config: ["api_key", "pos_signature"],
  notice_config: ["api_token", "webhook_secret"],
  oblio_config: ["client_secret"],
  revolut_config: ["secret_key", "signing_secret", "token"],
  sameday_config: ["password"],
  smartbill_config: ["token"],
  smso_config: ["api_key"],
  woot_config: ["public_key", "secret_key"],
};

export type ConfigMascat = Record<string, unknown> & {
  /** Pentru fiecare camp secret: exista deja o valoare salvata? */
  _completate?: Record<string, boolean>;
};

/**
 * Pregateste o configuratie pentru trimiterea catre browser: campurile secrete
 * pleaca goale, iar `_completate` spune formularului ce sa afiseze
 * („••••••• salvat" in loc de camp gol, ca omul sa nu creada ca s-a pierdut).
 */
export function mascheazaConfig(cheie: string, config: unknown): ConfigMascat | null {
  if (!config || typeof config !== "object") return null;
  const secrete = CAMPURI_SECRETE[cheie];
  if (!secrete) return config as ConfigMascat;

  const sursa = config as Record<string, unknown>;
  const iesire: Record<string, unknown> = { ...sursa };
  const completate: Record<string, boolean> = {};

  for (const camp of secrete) {
    const v = sursa[camp];
    completate[camp] = typeof v === "string" ? v.length > 0 : v != null;
    if (camp in sursa) iesire[camp] = "";
  }

  return { ...iesire, _completate: completate };
}

/**
 * Reface configuratia inainte de scriere: orice camp secret venit GOL isi
 * pastreaza valoarea salvata. Scoate si `_completate`, care e doar pentru
 * interfata si n-are ce cauta in baza.
 *
 * `configVeche` se citeste de apelant cu clientul lui (deja verificat pe
 * proprietar), ca sa nu introducem aici inca un drum spre baza.
 */
export function pastreazaSecretele(
  cheie: string,
  configNoua: unknown,
  configVeche: unknown,
): Record<string, unknown> {
  const noua = { ...(configNoua as Record<string, unknown> ?? {}) };
  delete noua._completate;

  const secrete = CAMPURI_SECRETE[cheie];
  if (!secrete) return noua;

  const veche = (configVeche ?? {}) as Record<string, unknown>;
  for (const camp of secrete) {
    const primit = noua[camp];
    const eGol = primit === undefined || primit === null || (typeof primit === "string" && primit.trim() === "");
    if (eGol && veche[camp] !== undefined) noua[camp] = veche[camp];
  }
  return noua;
}

/**
 * Formularul stie ca un secret EXISTA, chiar daca nu-l primeste.
 *
 * `mascheazaConfig` trimite campul gol plus harta `_completate`. Fara helperul
 * asta, componentele vedeau doar campul gol si isi declansau propriile validari
 * („Tokenul API este obligatoriu"), deci un comerciant cu integrarea deja
 * configurata NU mai putea salva nicio modificare — nici macar un comutator.
 *
 * Regula peste tot: un camp secret e acceptabil gol DACA e deja salvat.
 *   if (!valoare.trim() && !secretulEsteSalvat(initialConfig, "token")) { eroare }
 */
export function secretulEsteSalvat(config: unknown, camp: string): boolean {
  if (!config || typeof config !== "object") return false;
  const harta = (config as ConfigMascat)._completate;
  return harta?.[camp] === true;
}

/** Text pentru campul de formular: arata ca exista o valoare, fara sa o dezvaluie. */
export const PLACEHOLDER_SECRET_SALVAT = "••••••••  (salvat — completeaza doar ca sa schimbi)";
