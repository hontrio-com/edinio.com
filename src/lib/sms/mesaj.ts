/*
  ═══════════════════════════════════════════════════════════════════════════
  MESAJUL UNEI CAMPANII SMS: textul trimis, partile, costul       (27.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Un singur loc, folosit si de ecran (contorul, previzualizarea) si de server
  (validarea, trimiterea): ce numara ecranul e EXACT ce pleaca.

  ⚠⚠ DE CE EXISTA. Masurat in productie pe 27.09.2026: lungimea medie a
  mesajelor de campanie era 170 de caractere, iar ecranul numara cu 160 pe
  parte. Un SMS lung se imparte in parti de 153 (7 caractere merg pe antetul
  care le lipeste la loc), iar `€ [ ] { } ~ ^ | \` valoreaza cate DOUA. Adica
  fiecare om primea 2 SMS-uri, platite, fara ca ecranul sa spuna clar.

  ⚠ Textul se NORMALIZEAZA la noi inainte de trimitere (diacritice, ghilimele
  „”, cratime lungi, …), ca sa fie in alfabetul GSM de 7 biti. Un singur
  caracter din afara lui (un emoji) trece tot mesajul pe UCS-2: 70 de caractere
  pe parte in loc de 160, deci de doua ori mai scump. Ecranul il arata.
*/

/** Alfabetul GSM 03.38 de baza (un caracter = o unitate). */
const GSM_BAZA = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà".split(""),
);
/** Extensia GSM: fiecare costa DOUA unitati (caracter de evadare + caracterul). */
const GSM_EXTINS = new Set("^{}\\[~]|€\f".split(""));

/** Eticheta pe care SMSO o inlocuieste cu legatura scurta de dezabonare. */
export const ETICHETA_DEZABONARE = "[unsubscribe]";
/**
 * Cat lasam pentru legatura de dezabonare la numarare. SMSO nu-i publica lungimea;
 * o legatura scurta are de obicei 20-30 de caractere, deci socotim acoperitor 30.
 */
export const LUNGIME_LEGATURA_DEZABONARE = 30;
/** Prenumele nu-l stim dinainte: pentru estimare socotim unul de lungime obisnuita. */
const LUNGIME_PRENUME_ESTIMAT = 8;
/** Plafonul unei campanii: peste 6 parti, un SMS devine o scrisoare scumpa. */
export const MAX_PARTI = 6;
/** Pretul unei parti cand nu-l stim din trimiterile de pana acum (SMSO, 0,035 €). */
export const PRET_PARTE_IMPLICIT_EUROCENTI = 3.5;

export const VARIABILE = [
  { cheie: "{prenume}", descriere: "Prenumele clientului, din ultima lui comandă" },
  { cheie: "{magazin}", descriere: "Numele magazinului tău" },
] as const;

/** Textul, adus la alfabetul GSM cat se poate fara sa-i schimbe intelesul. */
export function normalizeazaTextSms(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[ăâ]/g, "a").replace(/[ĂÂ]/g, "A")
    .replace(/î/g, "i").replace(/Î/g, "I")
    .replace(/[șş]/g, "s").replace(/[ȘŞ]/g, "S")
    .replace(/[țţ]/g, "t").replace(/[ȚŢ]/g, "T")
    .replace(/[„“”«»″]/g, "\"")
    .replace(/[‘’‚′`´]/g, "'")
    .replace(/[\u2013\u2014\u2012\u2015\u2212]/g, "-")
    .replace(/…/g, "...")
    .replace(/[     ]/g, " ")
    .replace(/[​-‍﻿]/g, "");
}

/** Caracterele care nu intra in GSM (dupa normalizare): ele trec mesajul pe UCS-2. */
export function caractereInAfaraGsm(text: string): string[] {
  const afara = new Set<string>();
  for (const ch of normalizeazaTextSms(text)) {
    if (!GSM_BAZA.has(ch) && !GSM_EXTINS.has(ch)) afara.add(ch);
  }
  return [...afara];
}

/** Cate parti face textul, deja normalizat si cu variabilele puse. */
export function partiSms(text: string): { parti: number; unitati: number; ucs2: boolean; perParte: number } {
  const t = normalizeazaTextSms(text);
  const ucs2 = [...t].some((ch) => !GSM_BAZA.has(ch) && !GSM_EXTINS.has(ch));
  if (ucs2) {
    const n = [...t].length;
    const parti = n <= 70 ? 1 : Math.ceil(n / 67);
    return { parti: Math.max(1, parti), unitati: n, ucs2, perParte: n <= 70 ? 70 : 67 };
  }
  let unitati = 0;
  for (const ch of t) unitati += GSM_EXTINS.has(ch) ? 2 : 1;
  const parti = unitati <= 160 ? 1 : Math.ceil(unitati / 153);
  return { parti: Math.max(1, parti), unitati, ucs2, perParte: unitati <= 160 ? 160 : 153 };
}

/**
 * Dezabonarea garantata (varianta aleasa de el pentru consimtamant): daca omul n-a
 * pus eticheta, o adaugam noi la sfarsit. Asa niciun mesaj de marketing nu pleaca
 * fara o cale de oprire.
 */
export function cuDezabonare(text: string): string {
  const t = text.trim();
  if (t.toLowerCase().includes(ETICHETA_DEZABONARE)) return t;
  return `${t} Dezabonare: ${ETICHETA_DEZABONARE}`;
}

/** Variabilele puse pentru un destinatar anume. Un prenume lipsa nu lasa „Salut ,”. */
export function punVariabile(text: string, v: { prenume?: string | null; magazin?: string | null }): string {
  const prenume = (v.prenume ?? "").trim();
  let t = text
    .replace(/\{magazin\}/gi, (v.magazin ?? "").trim())
    .replace(/\{prenume\}/gi, prenume);
  if (!prenume) t = t.replace(/\s+([,!.?])/g, "$1").replace(/[ \t]{2,}/g, " ");
  return t.trim();
}

/**
 * Textul care pleaca efectiv catre un om: variabile, dezabonare, normalizare.
 * ⚠ Aceeasi functie la trimitere si la previzualizare.
 */
export function textDeTrimis(mesaj: string, v: { prenume?: string | null; magazin?: string | null }): string {
  return normalizeazaTextSms(punVariabile(cuDezabonare(mesaj), v));
}

/**
 * Estimarea pentru ecran si pentru garda de pe server: partile unui mesaj tipic
 * (prenume de lungime obisnuita, legatura de dezabonare socotita acoperitor).
 */
export function estimeazaMesaj(mesaj: string, magazin: string | null | undefined) {
  const cuEticheta = punVariabile(cuDezabonare(mesaj), { prenume: "x".repeat(LUNGIME_PRENUME_ESTIMAT), magazin });
  const deNumarat = cuEticheta.split(ETICHETA_DEZABONARE).join("x".repeat(LUNGIME_LEGATURA_DEZABONARE));
  const p = partiSms(deNumarat);
  return { ...p, faraGsm: caractereInAfaraGsm(mesaj), adaugaDezabonare: !mesaj.toLowerCase().includes(ETICHETA_DEZABONARE) };
}

/** Costul estimat, in eurocenti. */
export function costEstimatEurocenti(destinatari: number, parti: number, pretParte: number | null | undefined): number {
  const pret = pretParte && pretParte > 0 ? pretParte : PRET_PARTE_IMPLICIT_EUROCENTI;
  return Math.round(destinatari * parti * pret * 100) / 100;
}
