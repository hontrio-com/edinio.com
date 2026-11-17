import "server-only";
import { cheieValida } from "./config";

/**
 * Clientul SAGA Web (API v20260225, https://web.sagasoft.ro/DocumentatieAPI).
 *
 * ═══ FORMA API-ULUI, si de unde stim ═══
 *
 *   Import:  `POST {ADRESA}/Import`, multipart: `file` (XML-ul) si `importAutomat` (`true`/`false`,
 *            implicit `false`). Coduri: 200 import integral, 207 partial sau cu avertismente (raspuns:
 *            un fisier text, raportul), 422 esuat (tot raportul), 400 cerere eronata. La 200,
 *            exemplele lor citesc un JSON `{success, message}`.
 *   Citiri:  `GET {ADRESA}/Situatii/GetSoldCont|GetStocArticol|GetArticol|...`, JSON `{success,
 *            message, data}` sau un XML.
 *   Acces:   `Authorization: Bearer <cheie>` si `X-Saga-Cod-Fiscal: <cod fiscal>` la FIECARE cerere.
 *
 * ⚠⚠ CHEIA SE ROTESTE. „In anumite situatii, raspunsul va contine ... o noua cheie de acces in
 * header-ul X-Saga-Refresh-Token. Aceasta trebuie salvata pentru a putea fi folosita la urmatorul
 * apel. In caz contrar, cheia de acces va fi blocata." Deci, dupa FIECARE raspuns, inainte de orice
 * alt pas (chiar si inainte de citirea corpului), cheia noua se da `laCheieNoua`, care o scrie in
 * configurare. Serializarea apelurilor aceluiasi magazin e treaba apelantului (`server.ts`).
 *
 * ⚠ MASURAT PE FIR (17.11.2026, cu chei INVENTATE, numai citiri, nimic trimis la import):
 *   - fara antetul `Authorization`: `500`, corp GOL;
 *   - cu orice cheie inventata (si fara cod fiscal, si cu „1234", si in forma de JWT): `400`,
 *     `text/plain`, „A aparut o eroare. Reincercati mai tarziu." (pe GetSoldCont, GetArticol,
 *     GetStocArticol). Refuzul cheii NU e 401 si NU e JSON. Raspunsurile brute sunt in `client.test.ts`.
 *
 * ⚠ VERDICTELE, si de ce difera intre import si citire:
 *   - la IMPORT (o scriere in contabilitatea cuiva), tot ce nu e un raspuns intelese e „nu stim":
 *     cererea poate sa fi ajuns si documentul sa fi intrat. Un termen clasificat refuz ar debloca
 *     exact retrimiterea care il dubleaza (integratorul Odoo scrie ca SAGA dubleaza la retrimitere);
 *   - la CITIRE, orice cadere e un refuz: o citire nu lasa nimic in urma.
 */

export const ADRESA_SAGA = "https://web.sagasoft.ro/api/v20260225";

/** Importul asteapta mai mult: SAGA poate procesa fisierul pe loc (`importAutomat`). */
export const TERMEN_IMPORT_MS = 30_000;
export const TERMEN_CITIRE_MS = 15_000;
/** Raportul de import e un fisier text; peste atat, restul nu mai ajuta pe nimeni. */
const MARIME_MAXIMA_RASPUNS = 1_000_000;
/** Cat din raport se pastreaza in memorie (jurnalul il taie si el). */
const PLAFON_RAPORT = 8_000;

/**
 * Ce ii trebuie clientului ca sa vorbeasca cu SAGA in numele unui magazin.
 *
 * ⚠ `cheie` SE SCHIMBA SUB MANA: dupa o rotatie, clientul o inlocuieste aici, ca apelul urmator al
 * aceleiasi sesiuni sa plece cu cheia noua chiar daca scrierea ei in baza a picat.
 */
export interface SesiuneSaga {
  readonly codFiscal: string;
  cheie: string;
  /** Scrie cheia noua. Arunca daca n-a putut; clientul merge mai departe si spune (`cheieNesalvata`). */
  laCheieNoua(noua: string): Promise<void>;
}

/** Ce s-a intamplat cu cheia la un apel. */
export type Rotatie = {
  /** SAGA a trimis o cheie noua la apelul asta. */
  cheieRotita: boolean;
  /** ...si ea NU s-a putut scrie. Apelantul trebuie sa opreasca seria si sa spuna. */
  cheieNesalvata: boolean;
};

/** Ce a raspuns SAGA la import, fara partea despre cheie. */
export type VerdictImport =
  | { fel: "importat"; status: number; mesaj: string | null }
  | { fel: "incarcat"; status: number; mesaj: string | null }
  | { fel: "avertismente"; status: number; mesaj: string; raport: string }
  | { fel: "respins"; status: number; mesaj: string; raport: string | null }
  /** `faraMotiv`: refuz fara mesajul lor (corpul generic masurat pe fir), deci nu stim CE s-a refuzat. */
  | { fel: "refuzat"; status: number; mesaj: string; faraMotiv?: boolean }
  | { fel: "necunoscut"; status: number | null; mesaj: string };

export type RezultatImport = VerdictImport & Rotatie;

/**
 * Ce scrie registrul de operatii externe pentru un raspuns la import.
 *
 *   reusit      documentul e in SAGA (importat, incarcat pentru contabil, sau cu avertismente):
 *               o retrimitere l-ar dubla, deci registrul o opreste de acum incolo;
 *   esuat       SAGA a refuzat DOVEDIT (respins, cerere sau acces refuzat): nimic n-a intrat,
 *               retrimiterea e libera;
 *   necunoscut  poate a intrat: registrul blocheaza, iar omul verifica in SAGA inainte.
 *
 * ⚠ „cu avertismente" (207) e REUSIT, nu esec: documentatia spune „import realizat partial", deci
 * ceva a intrat. Marcat esec, retrimiterea l-ar fi adus a doua oara.
 */
export function verdictPentruRegistru(fel: VerdictImport["fel"]): "reusit" | "esuat" | "necunoscut" {
  if (fel === "importat" || fel === "incarcat" || fel === "avertismente") return "reusit";
  if (fel === "necunoscut") return "necunoscut";
  return "esuat";
}

export type RezultatProba = ({ ok: true } | { ok: false; refuz: boolean; error: string }) & Rotatie;

/* ═══════════════════════════════════════════════════════════════════════════
   BUCATI PURE, ca sa se poata proba fara retea
   ═══════════════════════════════════════════════════════════════════════════ */

export function anteteSaga(s: Pick<SesiuneSaga, "cheie" | "codFiscal">): Record<string, string> {
  return {
    Authorization: `Bearer ${s.cheie}`,
    "X-Saga-Cod-Fiscal": s.codFiscal,
    Accept: "application/json, text/plain, */*",
  };
}

/**
 * Cheia noua din raspuns, daca SAGA a trimis una.
 *
 * ⚠ `X-Saga-Refresh-Token` e antetul din proza documentatiei si din trei din cele patru exemple
 * (C#, Python, Java). Exemplul PHP cauta in schimb `Authorization:` in antetele RASPUNSULUI; pare o
 * scapare a lor, dar daca vreodata chiar asa trimit, o cheie ignorata e o cheie blocata. Deci
 * `Authorization` se citeste numai cand lipseste celalalt, numai daca arata a cheie, si fara „Bearer ".
 */
export function cheiaNouaDinRaspuns(antete: Headers, cheiaCurenta: string): string | null {
  const brut = (antete.get("x-saga-refresh-token") ?? antete.get("authorization") ?? "").trim();
  const cheie = brut.replace(/^bearer\s+/i, "").trim();
  if (!cheieValida(cheie) || cheie === cheiaCurenta) return null;
  return cheie;
}

/**
 * Textul unui raspuns, cu setul de caractere bun.
 *
 * ⚠ `Response.text()` decodeaza MEREU ca UTF-8, orice ar spune antetul. SAGA e un program de
 * Windows, iar un raport in „windows-1250" ar fi iesit cu semne de intrebare in loc de diacritice.
 * Deci: setul din `Content-Type` daca il spune; altfel UTF-8 strict, iar daca nu trece, windows-1250.
 */
export function decodeazaText(octeti: Uint8Array, contentType: string | null): string {
  const set = /charset\s*=\s*"?([\w.:-]+)"?/i.exec(contentType ?? "")?.[1]?.toLowerCase();
  const incearca = (eticheta: string, strict: boolean): string | null => {
    try {
      return new TextDecoder(eticheta, { fatal: strict }).decode(octeti);
    } catch {
      return null;
    }
  };
  const text = (set ? incearca(set, false) : null)
    ?? incearca("utf-8", true)
    ?? incearca("windows-1250", false)
    ?? incearca("utf-8", false)
    ?? "";
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/** `{success, message}`, cu cheile scrise oricum (exemplele lor C# le scriu cu majuscula). */
export function citesteJson(text: string): { success: boolean | null; message: string | null } | null {
  let date: unknown;
  try {
    date = JSON.parse(text);
  } catch {
    return null;
  }
  if (!date || typeof date !== "object" || Array.isArray(date)) return null;
  const d = date as Record<string, unknown>;
  const s = d.success ?? d.Success;
  const m = d.message ?? d.Message;
  return {
    success: typeof s === "boolean" ? s : s === "true" ? true : s === "false" ? false : null,
    message: typeof m === "string" && m.trim() ? m.trim() : null,
  };
}

/** Prima linie cu ceva in ea, pentru mesaje. Raportul intreg ramane in jurnal. */
export function primaLinie(text: string | null | undefined, max = 300): string {
  const l = (text ?? "").split("\n").map((x) => x.trim()).find(Boolean) ?? "";
  return l.length > max ? `${l.slice(0, max - 1)}…` : l;
}

const citat = (brut: string) => (brut ? ` („${brut}”)` : "");

/**
 * Mesajul unui refuz de acces. ⚠ Masurat: SAGA nu spune DE CE (acelasi „A aparut o eroare" pentru
 * cheie gresita, cod fiscal gresit sau lipsa lui), deci mesajul numeste ambele locuri de verificat.
 */
export function mesajAcces(status: number, brut: string): string {
  return `SAGA a refuzat cererea (cod ${status})${citat(primaLinie(brut, 160))}. Așa răspunde SAGA când cheia de acces sau codul fiscal nu sunt bune: verifică în Integrări, SAGA, codul fiscal (scris exact ca în SAGA) și, dacă e nevoie, generează o cheie nouă din SAGA Web (Utilizatori, Integrare API).`;
}

/**
 * Unde se verifica un document despre care nu stim daca a intrat.
 *
 * ⚠ Depinde de importul automat: cu el, SAGA importa pe loc, deci documentul se cauta la „Iesiri";
 * fara el, fisierul asteapta contabilul la „Diverse, Import date". Trimis in locul gresit, omul nu-l
 * gaseste, crede ca n-a ajuns si il retrimite: adica exact dublura de evitat.
 */
export function verificaInainte(importAutomat: boolean): string {
  return importAutomat
    ? "Verifică în SAGA, la Ieșiri, dacă documentul a intrat, înainte de a-l retrimite."
    : "Verifică în SAGA Web, la Diverse, Import date, dacă fișierul a ajuns, înainte de a-l retrimite.";
}

/**
 * Verdictul unui raspuns la import, din status si corp. Pur.
 *
 * ⚠ STATUSUL E VERDICTUL DOCUMENTAT; corpul doar il lamureste. Un 200 cu un corp de forma
 * neasteptata ramane „importat": documentatia spune „200: import realizat integral cu succes".
 * Singura exceptie e un JSON cu `success: false`, pe care exemplele lor il citesc chiar asa:
 * „Nu s-a realizat importul".
 */
export function verdictImport(status: number, corp: string, importAutomat: boolean): VerdictImport {
  const json = citesteJson(corp);
  const raport = corp.trim() ? corp.trim().slice(0, PLAFON_RAPORT) : "";

  if (status === 200) {
    if (json?.success === false) {
      return { fel: "respins", status, mesaj: `SAGA nu a importat fișierul${citat(json.message ?? "")}.`, raport: raport || null };
    }
    return { fel: importAutomat ? "importat" : "incarcat", status, mesaj: json?.message ?? null };
  }
  if (status === 207) {
    const prima = json?.message ?? primaLinie(raport);
    return {
      fel: "avertismente", status,
      mesaj: `SAGA a importat documentul parțial sau cu avertismente${citat(prima)}. Verifică raportul și documentul în SAGA.`,
      raport,
    };
  }
  if (status === 422) {
    const prima = json?.message ?? primaLinie(raport);
    return { fel: "respins", status, mesaj: `SAGA a respins fișierul${citat(prima)}.`, raport: raport || null };
  }
  if (status === 400 || status === 401 || status === 403) {
    /* Un 400 cu mesajul lor in JSON e un refuz al CERERII, spus de ei; fara JSON, e forma refuzului de
       acces masurat pe fir, dar nu stim sigur ce a refuzat (vezi `importaFisier`). */
    if (status === 400 && json?.message) {
      return { fel: "refuzat", status, mesaj: `SAGA a refuzat cererea${citat(json.message)}.` };
    }
    return { fel: "refuzat", status, mesaj: mesajAcces(status, corp), faraMotiv: true };
  }
  if (status === 404) {
    return { fel: "refuzat", status, mesaj: "Adresa API-ului SAGA nu răspunde (cod 404): versiunea folosită de Edinio poate să fi fost retrasă. Scrie-ne și îl actualizăm." };
  }
  if (status === 429) {
    return { fel: "refuzat", status, mesaj: "SAGA cere o pauză (prea multe cereri). Documentul n-a fost primit; încearcă din nou peste câteva minute." };
  }
  const verifica = verificaInainte(importAutomat);
  if (status >= 500) {
    return { fel: "necunoscut", status, mesaj: `SAGA a răspuns ${status} după ce a primit fișierul, deci nu știm dacă l-a importat. ${verifica}` };
  }
  if (status >= 300 && status < 400) {
    return { fel: "necunoscut", status, mesaj: `SAGA a răspuns cu o redirecționare (cod ${status}), deci nu știm dacă fișierul a ajuns. ${verifica}` };
  }
  if (status === 408) {
    return { fel: "necunoscut", status, mesaj: `SAGA a renunțat să aștepte fișierul (cod 408), deci nu știm dacă a ajuns. ${verifica}` };
  }
  if (status >= 400) {
    return { fel: "refuzat", status, mesaj: `SAGA a refuzat cererea (cod ${status})${citat(json?.message ?? primaLinie(raport, 160))}.` };
  }
  /* 2xx nedocumentat (201, 202, 204...): pe o scriere, „nu stim", nu „a mers". */
  return { fel: "necunoscut", status, mesaj: `SAGA a răspuns ${status}, un cod pe care documentația lor nu-l descrie, deci nu știm dacă fișierul a intrat. ${verifica}` };
}

/* ═══════════════════════════════════════════════════════════════════════════
   FIRUL
   ═══════════════════════════════════════════════════════════════════════════ */

/** Corpul, plafonat si decodat. Nu arunca: un corp pierdut lasa verdictul pe seama statusului. */
async function corpul(res: Response): Promise<string> {
  try {
    const octeti = new Uint8Array(await res.arrayBuffer());
    return decodeazaText(octeti.slice(0, MARIME_MAXIMA_RASPUNS), res.headers.get("content-type"));
  } catch {
    return "";
  }
}

/**
 * Preia cheia noua, INAINTE de orice altceva. Daca scrierea ei pica, cheia noua ramane totusi in
 * sesiune: SAGA o asteapta pe ea la apelul urmator, iar cea veche poate fi deja blocata.
 */
async function preiaRotatia(res: Response, s: SesiuneSaga): Promise<Rotatie> {
  const noua = cheiaNouaDinRaspuns(res.headers, s.cheie);
  if (!noua) return { cheieRotita: false, cheieNesalvata: false };
  let salvata = true;
  try {
    await s.laCheieNoua(noua);
  } catch {
    salvata = false;
  }
  s.cheie = noua;
  return { cheieRotita: true, cheieNesalvata: !salvata };
}

function eTermen(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

/**
 * Trimite un fisier la import. NU ARUNCA: intoarce verdictul, iar apelantul il duce in registru.
 *
 * ⚠ `redirect: "manual"`: o redirectionare urmata de `fetch` ar fi transformat POST-ul intr-un GET
 * catre alta pagina, iar un 200 de acolo ar fi parut un import reusit.
 */
export async function importaFisier(
  s: SesiuneSaga,
  fisier: { nume: string; xml: string },
  importAutomat: boolean,
): Promise<RezultatImport> {
  const form = new FormData();
  form.append("file", new Blob([fisier.xml], { type: "application/xml" }), fisier.nume);
  form.append("importAutomat", importAutomat ? "true" : "false");

  let res: Response;
  try {
    res = await fetch(`${ADRESA_SAGA}/Import`, {
      method: "POST",
      headers: anteteSaga(s),
      body: form,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(TERMEN_IMPORT_MS),
    });
  } catch (e) {
    return {
      fel: "necunoscut",
      status: null,
      mesaj: eTermen(e)
        ? `SAGA nu a răspuns în ${TERMEN_IMPORT_MS / 1000} de secunde, deci nu știm dacă fișierul a ajuns. ${verificaInainte(importAutomat)}`
        : `Legătura cu SAGA s-a rupt la trimitere, deci nu știm dacă fișierul a ajuns. ${verificaInainte(importAutomat)}`,
      cheieRotita: false,
      cheieNesalvata: false,
    };
  }

  const rotatie = await preiaRotatia(res, s);
  const text = await corpul(res);
  const verdict = verdictImport(res.status, text, importAutomat);

  /*
   * ⚠⚠ UN 400 FARA MOTIV LA IMPORT NU E REFUZ DOVEDIT. Pe fir, asa raspunde SAGA unei chei gresite, dar
   * corpul generic („A aparut o eroare") nu spune CE a refuzat: poate fisierul a fost primit si a cazut
   * dupa. Marcat refuz, cronul l-ar fi retrimis de trei ori, iar fiecare retrimitere il putea dubla.
   * Deci, pe loc si sub acelasi lacat, o citire cu aceeasi cheie: daca si ea e refuzata, e chiar accesul
   * (refuz dovedit); daca trece, cheia e buna si 400-ul a fost altceva, deci NU STIM.
   */
  if (verdict.fel === "refuzat" && verdict.status === 400 && verdict.faraMotiv) {
    const proba = await testeazaConexiunea(s);
    const ambele: Rotatie = {
      cheieRotita: rotatie.cheieRotita || proba.cheieRotita,
      cheieNesalvata: rotatie.cheieNesalvata || proba.cheieNesalvata,
    };
    if (!proba.ok && proba.refuz) return { ...verdict, ...ambele };
    return {
      fel: "necunoscut",
      status: 400,
      mesaj: proba.ok
        ? `SAGA a răspuns 400 la import, deși cheia de acces și codul fiscal sunt bune, deci nu știm dacă fișierul a intrat. ${verificaInainte(importAutomat)}`
        : `SAGA a răspuns 400 la import, iar verificarea cheii n-a primit răspuns, deci nu știm dacă fișierul a intrat. ${verificaInainte(importAutomat)}`,
      ...ambele,
    };
  }
  return { ...verdict, ...rotatie };
}

/** Contul citit la proba: „Casa in lei", in planul de conturi al oricarei firme romanesti. */
const CONT_PROBA = "5311";

/**
 * Proba de conexiune: o CITIRE fara efect, AUTENTIFICATA (soldul unui cont), pe acelasi cod fiscal.
 *
 * ⚠ SE CITESTE PE DOS: esec numai cand SAGA refuza ACCESUL (400/401/403, masurat: asa raspunde la
 * o cheie gresita). Orice 200 inseamna ca a trecut de cheie si de codul fiscal, chiar si un
 * `success: false` (contul lipsa intr-un plan de conturi neobisnuit). Altfel proba ar trimite
 * comerciantul sa schimbe o cheie buna (lectia fGO, 15.08.2026).
 *
 * `refuz` deosebeste „SAGA a spus NU" de „n-am ajuns la SAGA": salvarea il opreste pe primul si il
 * lasa pe al doilea sa treaca, cu avertisment.
 *
 * ⚠ Valoarea soldului NU se pastreaza nicaieri: e a comerciantului, iar proba n-are nevoie de ea.
 */
export async function testeazaConexiunea(s: SesiuneSaga): Promise<RezultatProba> {
  const adresa = `${ADRESA_SAGA}/Situatii/GetSoldCont?${new URLSearchParams({ cont: CONT_PROBA, tip: "D" })}`;
  let res: Response;
  try {
    res = await fetch(adresa, {
      method: "GET",
      headers: anteteSaga(s),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(TERMEN_CITIRE_MS),
    });
  } catch (e) {
    return {
      ok: false,
      refuz: false,
      error: eTermen(e) ? "SAGA nu a răspuns la timp. Încearcă din nou peste un minut." : "Nu am putut contacta SAGA. Încearcă din nou peste un minut.",
      cheieRotita: false,
      cheieNesalvata: false,
    };
  }

  const rotatie = await preiaRotatia(res, s);
  const text = await corpul(res);

  if (res.status === 200) {
    const json = citesteJson(text);
    if (json?.success === false && json.message && /cheie|token|autoriz|acces|cod fiscal|neautentificat/i.test(json.message)) {
      return { ok: false, refuz: true, error: `SAGA a refuzat accesul${citat(json.message)}.`, ...rotatie };
    }
    return { ok: true, ...rotatie };
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    return { ok: false, refuz: true, error: mesajAcces(res.status, text), ...rotatie };
  }
  if (res.status === 429) {
    return { ok: false, refuz: false, error: "SAGA cere o pauză (prea multe cereri). Încearcă din nou peste câteva minute.", ...rotatie };
  }
  return {
    ok: false,
    refuz: false,
    error: `SAGA a răspuns ${res.status}${citat(primaLinie(text, 160))}. Încearcă din nou peste un minut.`,
    ...rotatie,
  };
}
