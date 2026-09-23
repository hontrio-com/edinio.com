/**
 * Setarea conturilor de client a unui magazin (`store_settings.cont_client_config`).
 *
 * ⚠⚠ MODUL PUR, FARA "use server". Fiecare export dintr-un modul "use server" e un
 * endpoint public, iar aici stau date si reguli, nu actiuni.
 *
 * ⚠⚠ VALOAREA DIN BAZA NU E DE INCREDERE. Politica RLS a lui `store_settings` il
 * lasa pe comerciant sa-si scrie randul direct din browser, cu cheia publica si
 * sesiunea lui, deci in coloana poate ajunge ORICE JSON: `enabled: true` fara
 * domeniu, o iconita inventata, un text de zece mii de caractere. De aceea
 * `curataContClientConfig` se aplica la FIECARE citire (vitrina, comanda, panou),
 * nu doar la scriere, iar poarta de domeniu se recalculeaza din gazda cererii.
 *
 * ⚠ Cheile sunt PLATE, fiindca `jsonb_merge_config` imbina numai primul nivel: un
 * obiect imbricat trimis ar inlocui intreg obiectul vechi.
 *
 * ⚠ Hotararile proprietarului (23.09.2026): contul e optional sau OBLIGATORIU la
 * comanda, dupa alegerea comerciantului; butonul „Contul meu" din antet se
 * regleaza (text, iconita sau amandoua, iconita aleasa dintr-o lista); nimic din
 * toate astea nu se poate porni fara domeniu propriu.
 */

export const ICONITE_CONT = [
  "user-round",
  "user",
  "circle-user-round",
  "circle-user",
  "square-user",
  "user-check",
  "log-in",
  "key-round",
] as const;
export type IconitaCont = (typeof ICONITE_CONT)[number];

export const AFISARI_BUTON = ["iconita", "text", "iconita_text"] as const;
export type AfisareButon = (typeof AFISARI_BUTON)[number];

export const LIMITE = {
  buton_text: 24,
  intrare_titlu: 80,
  intrare_text: 240,
  buget: 5000,
} as const;

/** Cu contul obligatoriu, un plafon mai mic ar opri vanzarile dupa cateva comenzi. */
export const BUGET_MINIM_OBLIGATORIU = 50;

export const ETICHETA_IMPLICITA = "Contul meu";

export type ContClientConfig = {
  enabled: boolean;
  /** Contul e cerut ca sa poti trimite o comanda. Numai cu `enabled`. */
  obligatoriu: boolean;
  buget_email_zilnic: number;
  buget_sms_zilnic: number;
  /** Butonul din antetul vitrinei. */
  buton_antet: boolean;
  buton_afisare: AfisareButon;
  buton_iconita: IconitaCont;
  buton_text: string;
  /** Pagina de intrare; sirul gol inseamna textul implicit al ecranului. */
  intrare_titlu: string;
  intrare_text: string;
  intrare_avantaje: boolean;
};

export const IMPLICIT: ContClientConfig = {
  enabled: false,
  obligatoriu: false,
  buget_email_zilnic: 300,
  buget_sms_zilnic: 100,
  buton_antet: true,
  buton_afisare: "iconita",
  buton_iconita: "user-round",
  buton_text: ETICHETA_IMPLICITA,
  intrare_titlu: "",
  intrare_text: "",
  intrare_avantaje: true,
};

function numar(v: unknown, implicit: number): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(LIMITE.buget, Math.max(0, Math.trunc(n))) : implicit;
}

/** Fara caractere de control, cu spatiile comasate, taiat la limita. */
export function textCurat(v: unknown, limita: number): string {
  if (typeof v !== "string") return "";
  let s = "";
  for (const ch of v) {
    const c = ch.codePointAt(0) ?? 0;
    s += c < 32 || c === 127 ? " " : ch;
  }
  return s.replace(/\s+/g, " ").trim().slice(0, limita).trim();
}

function unaDin<T extends string>(v: unknown, lista: readonly T[], implicit: T): T {
  return typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : implicit;
}

/**
 * Configuratia curatata: numai cheile cunoscute, fiecare in forma ei, restul
 * aruncat. Ordinea cheilor e FIXA (a lui `IMPLICIT`), ca doua obiecte curatate sa
 * se poata compara cu `JSON.stringify`.
 */
export function curataContClientConfig(brut: unknown): ContClientConfig {
  const o = brut && typeof brut === "object" && !Array.isArray(brut) ? (brut as Record<string, unknown>) : {};
  /* ⚠ Strict `=== true`, ca si in SQL: sirul „true" nu aprinde nimic. */
  const enabled = o.enabled === true;
  const text = textCurat(o.buton_text, LIMITE.buton_text);
  return {
    enabled,
    /* ⚠ Obligatoriu fara conturi pornite nu inseamna nimic si nu are voie sa
       ramana scris: la reaprindere s-ar fi activat tacut. */
    obligatoriu: enabled && o.obligatoriu === true,
    buget_email_zilnic: numar(o.buget_email_zilnic, IMPLICIT.buget_email_zilnic),
    buget_sms_zilnic: numar(o.buget_sms_zilnic, IMPLICIT.buget_sms_zilnic),
    buton_antet: o.buton_antet !== false,
    buton_afisare: unaDin(o.buton_afisare, AFISARI_BUTON, IMPLICIT.buton_afisare),
    buton_iconita: unaDin(o.buton_iconita, ICONITE_CONT, IMPLICIT.buton_iconita),
    buton_text: text || ETICHETA_IMPLICITA,
    intrare_titlu: textCurat(o.intrare_titlu, LIMITE.intrare_titlu),
    intrare_text: textCurat(o.intrare_text, LIMITE.intrare_text),
    intrare_avantaje: o.intrare_avantaje !== false,
  };
}

/** Ce ajunge la vitrina despre butonul din antet. Fara bugete, fara nimic altceva. */
export type ButonContAntet = { afisare: AfisareButon; iconita: IconitaCont; eticheta: string };

/** Ce afla vitrina despre conturile magazinului, pe cererea asta. */
export type ContulMagazinului = {
  /** Zona de cont exista pe cererea asta (conturi pornite, domeniul propriu, magazin activ). */
  aprins: boolean;
  /** Butonul din antet; `null` si cand comerciantul l-a ascuns, cu zona de cont aprinsa. */
  buton: ButonContAntet | null;
  /** Comanda cere cont, pe cererea asta (domeniul propriu, conturi pornite). */
  obligatoriu: boolean;
};

export const CONT_STINS: ContulMagazinului = { aprins: false, buton: null, obligatoriu: false };

/**
 * Textul cu care serverul refuza o comanda fara cont, cand contul e obligatoriu.
 * Sta aici, in modulul pur, ca formularul sa-l poata recunoaste fara sa importe
 * cod de server.
 */
export const MESAJ_CONT_NECESAR = "Intra in cont ca sa trimiti comanda. Cosul si datele completate raman aici.";

/**
 * Starea conturilor pentru o cerere de vitrina.
 *
 * ⚠ Totul se stinge in afara originii magazinului: pe `www.edinio.com/<slug>`
 * zona de cont nu exista (acolo toate vitrinele impart o origine), deci nici
 * butonul, nici obligativitatea n-au ce cauta. Un magazin cu domeniul masurat
 * cazut e servit acolo, iar comenzile lui trebuie sa mearga mai departe.
 *
 * ⚠⚠ `suspended_until` E UN TERMEN DE GRATIE, nu „suspendat pana la". Magazinul
 * e oprit cand data a TRECUT (`magazinulEOprit`, `/cos`, `/checkout`, pagina
 * de acasa, toate la fel); pana atunci vinde normal. Prima scriere de aici
 * citea invers: butonul disparea tocmai in zilele de gratie, cand magazinul
 * vinde, si aparea dupa oprire.
 */
export function contulMagazinului(p: {
  config: unknown;
  peOrigineaMagazinului: boolean;
  /** `businesses.suspended_until`, de pe randul citit deja. */
  suspendatPana: string | null;
  acum?: number;
}): ContulMagazinului {
  const c = curataContClientConfig(p.config);
  const termen = p.suspendatPana ? new Date(p.suspendatPana).getTime() : NaN;
  const oprit = Number.isFinite(termen) && termen < (p.acum ?? Date.now());
  if (!c.enabled || !p.peOrigineaMagazinului || oprit) return CONT_STINS;
  return {
    aprins: true,
    buton: c.buton_antet ? { afisare: c.buton_afisare, iconita: c.buton_iconita, eticheta: c.buton_text } : null,
    obligatoriu: c.obligatoriu,
  };
}
