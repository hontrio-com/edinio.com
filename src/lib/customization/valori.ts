import {
  MAX_LUNGIME_TEXT,
  type CampPersonalizare,
  type DefinitiePersonalizare,
} from "./definitie";
import { MAX_LATURA_M, inMetri } from "./suprafata";

/**
 * Ce a completat cumparatorul, curatat si verificat.
 *
 * ═══ ⚠ DATELE ASTEA NU SUNT ALE NOASTRE ═══
 *
 * Vin dintr-un formular public, de la un vizitator fara cont. Pe drumul comenzii ele ajung sa
 * hotarasca un PRET, deci fiecare verificare de aici e o poarta de bani, nu o politete de UI.
 *
 * ⚠ Si de aceea acelasi modul ruleaza pe amandoua partile: in browser ca sa arate omului ce a
 * gresit, pe server ca sa refuze. Ce se vede pe ecran si ce se incaseaza ies din acelasi cod.
 *
 * ⚠ CE NU FACE: nu verifica adresele fisierelor incarcate. Aia e o verificare de PROPRIETATE
 * (obiectul e in depozitul nostru, sub prefixul magazinului asta?), are nevoie de mediu si de
 * secrete, si sta pe server — vezi `validateCustomization` din `order.actions.ts`. Aici raman doar
 * forma si marginile, adica exact ce se poate socoti la fel in amandoua locurile.
 */

/** Valoarea unui camp, dupa curatare. */
export type ValoareCamp =
  | { fel: "text"; text: string }
  | { fel: "fisiere"; adrese: string[] }
  | { fel: "optiune"; id: string }
  | { fel: "numar"; numar: number }
  | { fel: "dimensiuni"; latime: number; inaltime: number }
  | { fel: "pornit"; pornit: boolean };

export interface Constatare {
  campId: string;
  eticheta: string;
  mesaj: string;
}

export interface ValoriCurate {
  /** `true` cand nu s-a gasit nicio problema. */
  ok: boolean;
  /** Cheiate pe `camp.id`. Campurile necompletate si neobligatorii lipsesc. */
  valori: Map<string, ValoareCamp>;
  constatari: Constatare[];
}

/** Cate fisiere accepta un camp cand comerciantul n-a spus. Aceeasi cifra ca in formularul de azi. */
const FISIERE_IMPLICIT = 5;
/** Plafonul nostru peste cel al comerciantului. */
const MAX_FISIERE = 20;
/** Cat de lunga poate fi adresa unui fisier. */
const MAX_ADRESA = 500;

function sir(x: unknown): string {
  return typeof x === "string" ? x : "";
}

/** Numarul de zecimale ale unui pas, ca sa se poata spune „multiplu de 0,5". */
function multipluDe(valoare: number, pas: number): boolean {
  if (!(pas > 0)) return true;
  const raport = valoare / pas;
  return Math.abs(raport - Math.round(raport)) < 1e-6;
}

/** Numarul scris asa cum il vede omul: 8,75 nu 8.75. */
function caText(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

function citesteLatura(
  brut: unknown,
  camp: CampPersonalizare,
  latura: "latime" | "inaltime",
  numeLatura: string,
  constatari: Constatare[],
): number | null {
  const marg = camp[latura];
  const n = Number(brut);
  if (brut === undefined || brut === null || brut === "" || !Number.isFinite(n)) {
    constatari.push({ campId: camp.id, eticheta: camp.label, mesaj: `Completeaza ${numeLatura}.` });
    return null;
  }
  if (n <= 0) {
    constatari.push({ campId: camp.id, eticheta: camp.label, mesaj: `${numeLatura} trebuie sa fie mai mare ca zero.` });
    return null;
  }
  const u = camp.unitate ?? "cm";
  if (marg && (n < marg.min || n > marg.max)) {
    constatari.push({
      campId: camp.id, eticheta: camp.label,
      mesaj: `${numeLatura} trebuie sa fie intre ${caText(marg.min)} si ${caText(marg.max)} ${u}.`,
    });
    return null;
  }
  /*
   * ⚠ PASUL LATURII, verificat pe SERVER ca oricare alta margine.
   *
   * Atributul `step` din browser opreste sagetile, dar nu si o valoare scrisa de mana si nici o
   * cerere trimisa direct. Un fototapet pe rola de 10 cm comandat la 137 cm inseamna o rola taiata
   * degeaba: pierderea o plateste atelierul, iar clientul primeste alta masura decat a cerut.
   *
   * Se masoara de la `min`, nu de la zero: „intre 100 si 500, din 10 in 10" inseamna 100, 110,
   * 120 — nu 100, 110 doar din intamplare fiindca 100 se imparte la 10.
   */
  if (marg?.pas !== undefined && !multipluDe(n - marg.min, marg.pas)) {
    constatari.push({
      campId: camp.id, eticheta: camp.label,
      mesaj: `${numeLatura} creste din ${caText(marg.pas)} in ${caText(marg.pas)} ${u}.`,
    });
    return null;
  }
  /*
   * ⚠ Plafonul absolut se verifica SI cand comerciantul n-a pus margini. Fara el, un camp de
   * dimensiuni lasat nemarginit ar fi primit din browser o latime de un milion, iar suprafata ar
   * fi iesit un numar pe care nicio alta socoteala din platforma nu-l mai poate purta.
   */
  if (inMetri(n, u) === null) {
    constatari.push({
      campId: camp.id, eticheta: camp.label,
      mesaj: `${numeLatura} depaseste ${MAX_LATURA_M} m.`,
    });
    return null;
  }
  return n;
}

function citesteCamp(
  camp: CampPersonalizare,
  brut: unknown,
  constatari: Constatare[],
): ValoareCamp | null {
  const lipsa = (mesaj = "Camp obligatoriu.") => {
    if (camp.required) constatari.push({ campId: camp.id, eticheta: camp.label, mesaj });
    return null;
  };

  switch (camp.type) {
    case "text":
    case "textarea": {
      const t = sir(brut).trim();
      if (!t) return lipsa();
      const maxim = camp.max_length && camp.max_length > 0 ? camp.max_length : MAX_LUNGIME_TEXT;
      if (t.length > maxim) {
        constatari.push({
          campId: camp.id, eticheta: camp.label,
          mesaj: `Textul are cel mult ${maxim} caractere.`,
        });
        return null;
      }
      return { fel: "text", text: t };
    }

    /*
     * ⚠ `fisier` se curata IDENTIC cu `image`: amandoua sunt tablouri de adrese produse de
     * aceeasi ruta. Ce le deosebeste — ce fel de continut a ajuns acolo — se hotaraste pe SERVER,
     * in `verificaPersonalizarea`, unde se stie si tipul campului, si depozitul.
     */
    case "fisier":
    case "image": {
      /*
       * ⚠ Se verifica FORMA, nu proprietatea. Ca adresa chiar arata catre un fisier al nostru se
       * hotaraste pe server, unde se stie si depozitul, si magazinul. Aici s-ar fi putut scrie o
       * verificare de domeniu, dar ea ar fi mintit: in browser variabilele de mediu ale
       * serverului nu exista, deci ar fi trecut orice.
       */
      const brute = Array.isArray(brut) ? brut : [];
      const adrese = brute
        .filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= MAX_ADRESA)
        .slice(0, Math.min(camp.max_files ?? FISIERE_IMPLICIT, MAX_FISIERE));
      if (!adrese.length) return lipsa("Incarca cel putin un fisier.");
      return { fel: "fisiere", adrese };
    }

    case "select": {
      const t = sir(brut).trim();
      if (!t) return lipsa("Alege o optiune.");
      /*
       * ⚠ Optiunea trebuie sa fie din lista. Fara verificarea asta, un client putea trimite orice
       * text si el ajungea in comanda ca alegere „legitima" — iar la un camp cu pret ar fi fost o
       * alegere fara pret.
       */
      if (!(camp.options ?? []).includes(t)) {
        constatari.push({ campId: camp.id, eticheta: camp.label, mesaj: "Optiunea aleasa nu exista." });
        return null;
      }
      return { fel: "text", text: t };
    }

    case "color": {
      const t = sir(brut).trim();
      if (!t) return lipsa("Alege o culoare.");
      if (!/^#[0-9a-f]{6}$/i.test(t)) {
        constatari.push({ campId: camp.id, eticheta: camp.label, mesaj: "Culoarea nu e valida." });
        return null;
      }
      return { fel: "text", text: t.toLowerCase() };
    }

    case "numar": {
      if (brut === undefined || brut === null || brut === "") return lipsa();
      const n = Number(brut);
      if (!Number.isFinite(n)) {
        constatari.push({ campId: camp.id, eticheta: camp.label, mesaj: "Scrie un numar." });
        return null;
      }
      if (camp.min !== undefined && n < camp.min) {
        constatari.push({ campId: camp.id, eticheta: camp.label, mesaj: `Cel putin ${caText(camp.min)}.` });
        return null;
      }
      if (camp.max !== undefined && n > camp.max) {
        constatari.push({ campId: camp.id, eticheta: camp.label, mesaj: `Cel mult ${caText(camp.max)}.` });
        return null;
      }
      if (camp.pas !== undefined && !multipluDe(n - (camp.min ?? 0), camp.pas)) {
        constatari.push({
          campId: camp.id, eticheta: camp.label,
          mesaj: `Valoarea creste din ${caText(camp.pas)} in ${caText(camp.pas)}.`,
        });
        return null;
      }
      return { fel: "numar", numar: n };
    }

    case "dimensiuni": {
      const o = brut && typeof brut === "object" ? (brut as Record<string, unknown>) : {};
      const gol = (o.latime === undefined || o.latime === "") && (o.inaltime === undefined || o.inaltime === "");
      if (gol && !camp.required) return null;
      const l = citesteLatura(o.latime, camp, "latime", "Latimea", constatari);
      const i = citesteLatura(o.inaltime, camp, "inaltime", "Inaltimea", constatari);
      if (l === null || i === null) return null;
      return { fel: "dimensiuni", latime: l, inaltime: i };
    }

    case "butoane": {
      const t = sir(brut).trim();
      if (!t) return lipsa("Alege o optiune.");
      if (!(camp.optiuni ?? []).some((o) => o.id === t)) {
        constatari.push({ campId: camp.id, eticheta: camp.label, mesaj: "Optiunea aleasa nu exista." });
        return null;
      }
      return { fel: "optiune", id: t };
    }

    case "comutator": {
      /*
       * ⚠ Un comutator STINS e o valoare, nu o lipsa. La un camp obligatoriu, „nu" e un raspuns
       * bun — altfel „Adaug protectie impermeabila?" n-ar fi putut fi obligatoriu si sa primeasca
       * totusi raspunsul „nu".
       */
      const pornit = brut === true || brut === "true" || brut === 1 || brut === "1";
      return { fel: "pornit", pornit };
    }
  }
}

/**
 * Curata si verifica tot ce a trimis clientul, fata de definitia AUTORITARA a produsului.
 *
 * ⚠ Se plimba peste CAMPURILE DEFINITIEI, nu peste cheile trimise de client. Invers, un client ar
 * fi putut trimite chei inventate si ele ar fi ajuns in comanda ca „personalizare" — iar
 * comerciantul ar fi citit din ecranul lui date pe care nu le-a cerut nimeni.
 */
export function normalizeazaValorile(
  definitie: DefinitiePersonalizare,
  brut: unknown,
): ValoriCurate {
  const intrare = brut && typeof brut === "object" ? (brut as Record<string, unknown>) : {};
  const constatari: Constatare[] = [];
  const valori = new Map<string, ValoareCamp>();

  for (const camp of definitie.fields) {
    const v = citesteCamp(camp, intrare[camp.id], constatari);
    if (v !== null) valori.set(camp.id, v);
  }

  return { ok: constatari.length === 0, valori, constatari };
}
