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

/*
 * CE NU INTRA AICI, desi arata a secret: `notice_config.webhook_secret`.
 * Nu e o credentiala catre un serviciu extern, ci partea secreta din URL-ul de
 * webhook pe care comerciantul TREBUIE sa-l citeasca si sa-l lipeasca in contul
 * lui de notice.ro. Mascat, formularul nu mai are ce afisa si integrarea devine
 * imposibil de configurat — iar expunerea ar fi oricum aceeasi, fiindca scopul
 * campului este chiar sa fie aratat proprietarului.
 *
 * CONSECINTA, din 2026-08-05: fiind singurul camp CRIPTAT care trebuie si CITIT
 * de om, e si singurul care nu suporta o citire cu clientul comerciantului —
 * acolo ar sosi `enc.v1.…` si pagina ar afisa un URL de webhook pe care
 * `/api/notice/webhook` (care cauta pe valoarea decriptata, cu service role) nu-l
 * mai potriveste cu niciun magazin. De aceea `notice_config` se citeste cu
 * `createAdminClient()` si abia apoi trece prin `mascheazaConfig`, atat in
 * features/notice/page.tsx cat si in `getNoticeConfig`.
 */

/** Numele reale ale campurilor, luate din datele de productie si din tipuri. */
export const CAMPURI_SECRETE: Record<string, readonly string[]> = {
  cargus_config: ["password", "subscription_key"],
  colete_config: ["client_secret", "token"],
  dpd_config: ["password"],
  /* eColet: un token de acces luat din panel.ecolet.ro si trimis ca Bearer la
     fiecare cerere. E singura credentiala — nu exista user si parola. */
  ecolet_config: ["api_token"],
  fan_courier_config: ["password"],
  fgo_config: ["private_key"],
  gls_config: ["password"],
  /* Innoship: o singura cheie de API, trimisa ca `X-Api-Key` la fiecare cerere.
     ⚠ `webhook_secret` NU intra aici, desi se cripteaza in repaus: e partea
     secreta din URL-ul pe care comerciantul trebuie sa-l copieze in portalul
     Innoship. Acelasi caz ca `notice_config.webhook_secret` — vezi nota de mai
     sus. Nici `external_client_location` nu e secret: e id-ul depozitului lui. */
  innoship_config: ["api_key"],
  ipay_config: ["password"],
  klarna_config: ["password", "authorization_token"],
  netopia_config: ["api_key", "pos_signature"],
  notice_config: ["api_token"],
  oblio_config: ["client_secret"],
  /* Pall-Ex ClientPlus: autentificare HTTP Basic, deci parola pleaca la fiecare
     cerere. `username` NU e secret — e mailul cu care intra comerciantul in
     ClientPlus si trebuie sa se vada in formular, ca sa stie ce cont a legat. */
  pallex_config: ["password"],
  /* Posta Romana: autentificare HTTP Basic, deci parola pleaca la fiecare cerere.
     `username` NU e secret — e contul cu care intra comerciantul la Posta si
     trebuie sa se vada in formular, ca sa stie ce cont a legat. Nici
     `cod_trimitere` nu e: e un identificator de contract pe care omul il copiaza
     din contract si trebuie sa-l poata reciti ca sa-l verifice. */
  posta_config: ["password"],
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
 *
 * MERGE SI PESTE VALORI CRIPTATE, verificat pentru migratia din 2026-08-05.
 * De atunci, o citire facuta cu clientul comerciantului primeste `enc.v1.…` in
 * loc de textul in clar. Raspunsul la „e configurat?" se ia mai jos din
 * `v.length > 0`, iar `enc.v1.…` e un sir NEGOL — deci interfata arata in
 * continuare „salvat" acolo unde exista o credentiala si camp gol acolo unde
 * nu exista. Daca vreodata cineva schimba testul asta intr-unul pe continut
 * (prefix, lungime, forma), paginile de integrari incep sa minta.
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
 * `configVeche` se citeste de apelant, ca sa nu introducem aici inca un drum
 * spre baza.
 *
 * ATENTIE, din 2026-08-05: `configVeche` trebuie citita cu `createAdminClient()`,
 * dupa ce apelantul a dovedit proprietatea. Pe clientul comerciantului campurile
 * secrete sosesc `enc.v1.…`, iar functia asta le-ar „pastra" ca atare.
 *
 * IN BAZA nu se pierde nimic: `privat.cripteaza` sare peste orice sir care incepe
 * deja cu `enc.v1.`, deci rescrierea pune inapoi exact acelasi text cifrat (vezi
 * 2026-08-04-criptare-credentiale.sql: „recriptarea aceleiasi valori nu o strica").
 * Se strica tot ce FOLOSESTE rezultatul, si se strica in tacere:
 *   - configuratia intoarsa formularului (apelantii fac `setConfig(res.config)`),
 *     deci comerciantul vede `enc.v1.…` in loc de valoarea lui;
 *   - apelul catre furnizor facut imediat dupa salvare, cu textul cifrat pe post
 *     de parola — furnizorul raspunde „credentiale invalide";
 *   - orice valoare INREGISTRATA la furnizor din configul imbinat (URL-uri de
 *     webhook cu secretul in ele): raman inregistrate cu textul cifrat, iar
 *     cautarea inversa se face pe valoarea decriptata si nu mai potriveste nimic.
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
