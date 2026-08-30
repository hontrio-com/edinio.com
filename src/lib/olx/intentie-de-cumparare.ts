/**
 * O CUMPARARE ARE O INTENTIE, SI EA TREBUIE SA TRAIASCA MAI MULT DECAT ECRANUL
 * ════════════════════════════════════════════════════════════════════════════ (02.09.2026)
 *
 * Registrul de operatii externe deduplica dupa o CHEIE. Pana acum cheia unei plati purta ziua:
 *
 *     plata:olx:promovare:123:top_ad:2026-09-01
 *
 * Ziua facea doua treburi deodata, si le facea prost pe amandoua:
 *
 *   ⚠ DEDUBLA PREA MULT. Doua cumparari perfect legitime ale aceluiasi lucru in aceeasi zi UTC
 *     primeau aceeasi cheie. A doua intorcea `deja`, OLX nu era chemat deloc, si Edinio raporta
 *     succes. Omul credea ca a cumparat.
 *
 *   ⚠ DEDUBLA PREA PUTIN. O cumparare care da timeout la 23:59 si e reluata la 00:01 primea alta
 *     cheie, deci se putea executa a doua oara. Cu bani.
 *
 * Lucrul dupa care trebuie deduplicat nu e ziua, ci INTENTIA: „apasarea asta a omului, si toate
 * reluarile ei". Un id de intentie o numeste.
 *
 * ═══ DE CE `localStorage`, SI NU UN `useRef` ═══
 *
 * ⚠ Prima varianta tinea id-ul intr-un `useRef` in panou. Panoul e un acordeon: `{open && …}`
 * demonteaza componenta. Deci omul apasa, apelul cade in ceata, el inchide panoul si il redeschide
 * — iar id-ul s-a dus odata cu componenta. A doua apasare ar fi trimis alt id, alta cheie, si OLX
 * ar fi fost chemat A DOUA OARA.
 *
 * Ar fi fost mai rau decat ziua din cheie, care cel putin tinea pana la miezul noptii. O reparatie
 * care inrautateste exact cazul pe care il repara.
 *
 * `localStorage`, nu `sessionStorage`: intentia trebuie sa fie aceeasi si in a doua fila.
 *
 * ═══ CAND SE ARUNCA INTENTIA ═══
 *
 * Numai cand serverul a spus limpede cum s-a terminat — fie ca a cumparat acum, fie ca gasise
 * cumpararea deja facuta. O eroare, un timeout sau un „e in curs" o PASTREAZA: acelea sunt exact
 * clipele in care reluarea trebuie sa poarte acelasi nume.
 *
 * ⚠ Si o margine de varsta. O intentie ramasa in `localStorage` de acum trei zile nu mai descrie
 * nimic din ce vrea omul azi; tinuta, ar face ca o cumparare noua sa primeasca `deja` pe una veche.
 */

/** Peste atat, o intentie nemaifolosita nu mai descrie ce vrea omul acum. */
const VIATA_MS = 6 * 60 * 60 * 1000;

/**
 * Forma primita de server.
 *
 * ⚠ NU E „UUID" DINADINS. `crypto.randomUUID` exista numai in secure context: pe
 * `http://192.168.…:3000`, la o demonstratie sau in dezvoltare, arunca. Rezerva de mai jos nu e un
 * UUID, si un server care ar cere strict forma UUID ar face cumpararea imposibila acolo, cu un
 * refuz pe care comerciantul nu-l poate nici repara, nici intelege.
 *
 * Ce conteaza e sa fie greu de ghicit si stabil, nu sa aiba cratimele la locul lor.
 */
export const FORMA_INTENTIEI = /^[A-Za-z0-9_-]{16,64}$/;

function ziceCine(): string {
  const r = globalThis.crypto?.randomUUID?.();
  if (typeof r === "string") return r;
  /* ⚠ Rezerva pentru contextele nesigure. Aceeasi forma ca in `src/lib/cart-session.ts`. */
  const octeti = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(octeti);
  else for (let i = 0; i < octeti.length; i++) octeti[i] = Math.floor(Math.random() * 256);
  return Array.from(octeti, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** `olx:intentie:<magazin>:<ce se cumpara>` — doua lucruri diferite nu impart o intentie. */
export function cheiaIntentiei(businessId: string, ceSeCumpara: string): string {
  return `olx:intentie:${businessId}:${ceSeCumpara}`;
}

/**
 * Id-ul intentiei pentru cumpararea asta: cel pastrat, daca mai e proaspat, altfel unul nou.
 *
 * ⚠ Cand `localStorage` nu se poate atinge (fila privata cu cookie-uri blocate, iframe fara
 * `storage-access`), se intoarce totusi un id — dar unul care nu supravietuieste reincarcarii.
 * Asta e mai bine decat sa opreasca cumpararea: paza dinaintea platii ramane pe deplin in picioare
 * (se intreaba OLX daca promovarea e deja activa), iar registrul apara in continuare apasarea
 * dubla din aceeasi pagina.
 */
export function intentiaPentru(businessId: string, ceSeCumpara: string): string {
  const cheie = cheiaIntentiei(businessId, ceSeCumpara);
  try {
    const brut = globalThis.localStorage?.getItem(cheie);
    if (brut) {
      const p = JSON.parse(brut) as { id?: unknown; la?: unknown };
      if (typeof p.id === "string" && FORMA_INTENTIEI.test(p.id)
          && typeof p.la === "number" && Date.now() - p.la < VIATA_MS) {
        return p.id;
      }
    }
  } catch { /* stricat sau inchis: se face una noua */ }

  const id = ziceCine();
  try {
    globalThis.localStorage?.setItem(cheie, JSON.stringify({ id, la: Date.now() }));
  } catch { /* nu se poate scrie: id-ul tine cat tine pagina */ }
  return id;
}

/**
 * Cumpararea s-a incheiat limpede. Urmatoarea apasare inseamna o cumparare NOUA.
 *
 * ⚠ Se cheama SI cand serverul a raspuns ca o gasise deja facuta. Altfel intentia veche ar ramane
 * si a doua cumparare adevarata a aceluiasi lucru ar primi iar `deja` — chiar defectul de la care
 * a pornit toata treaba asta, doar mutat din cheie in `localStorage`.
 */
export function incheieIntentia(businessId: string, ceSeCumpara: string): void {
  try {
    globalThis.localStorage?.removeItem(cheiaIntentiei(businessId, ceSeCumpara));
  } catch { /* nimic de curatat */ }
}

/* ── Numele lucrurilor care se cumpara ─────────────────────────────────────
 *
 * ⚠ Un singur loc care le compune. Ecranul si cheia din registru trebuie sa vorbeasca despre
 * ACELASI lucru; scrise separat, s-ar putea desparti fara ca nimic sa se planga.
 */

export const cePromovare = (advertId: number, code: string) => `promovare:${advertId}:${code}`;

/**
 * ⚠ `premium` INTRA IN NUME (03.09.2026). Doua variante de aceeasi marime si acelasi tip, una
 * premium, cadeau pe ACELASI nume — deci pe aceeasi cheie si pe aceeasi tinta. Doua cumparari cu
 * adevarat diferite se blocau una pe alta degeaba, iar reluarea uneia se lipea de cealalta.
 */
export const cePachetCategorie = (categoryId: number, size: number, type: string, premium: boolean) =>
  `pachet-categorie:${categoryId}:${size}:${type}${premium ? ":premium" : ""}`;

export const cePachetAnunt = (advertId: number, premium: boolean) =>
  `pachet-anunt:${advertId}:${premium ? "premium" : "normal"}`;
