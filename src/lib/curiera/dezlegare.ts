import type { Verdict } from "@/lib/operatii/eroare-furnizor";
import type { RezultatAnulare } from "./client";

/**
 * Doua hotarari ale actiunilor Curiera, scoase aici ca sa poata fi PROBATE: fisierul de
 * actiuni e „use server", deci o proba acolo ar cere module mimate (aceeasi pricina ca la
 * `campuriDezlegareFan`).
 *
 *   1. cand se scoate AWB-ul de pe comanda (dezlegarea);
 *   2. cand un raspuns pierdut la emitere se poate lamuri dupa referinta noastra.
 */

// ─── 1. Dezlegarea ────────────────────────────────────────────────────────────

/** Ce s-a aflat cand s-a incercat anularea la Curiera. */
export type IncercareaAnularii =
  /** Nu exista cheie cu care sa se ceara (integrare deconectata sau fara cheie). */
  | { fel: "fara_config" }
  /** Curiera a raspuns, cu unul dintre cele patru raspunsuri stiute. */
  | { fel: "raspuns"; rezultat: RezultatAnulare }
  /** Apelul a aruncat. `verdict` e al registrului: `esuat` = dovedit, `necunoscut` = nu stim. */
  | { fel: "eroare"; verdict: Verdict; mesaj: string };

export type HotarareaDezlegarii =
  | { dezleaga: false; eroare: string }
  | {
      dezleaga: true;
      /** Coletul a incetat sa existe la ei (sau n-a existat). Altfel poate pleca mai departe. */
      anulatLaCuriera: boolean;
      /** Prima jumatate a mesajului catre comerciant: ce s-a intamplat la Curiera. */
      despreCurier: string;
    };

/**
 * Se dezleaga AWB-ul de pe comanda?
 *
 * ⚠ Aceeasi semantica ca `dezleagaFanAwbAction`: cheia de client Curiera anuleaza DOAR pana la
 * ridicare (`cancel_uncollected`, masurat), deci dupa ridicare refuzul e sigur si numarul ar
 * ramane lipit de comanda pe veci: comanda n-ar mai putea fi editata si n-ar mai primi alt
 * curier.
 *
 *   anulat / deja anulat / negasit  -> se dezleaga: la ei nu mai e nimic viu;
 *   refuzat                         -> se dezleaga, iar mesajul spune ca AWB-ul ramane VIU;
 *   eroare dovedita (`esuat`)       -> se dezleaga: apelul nostru n-a schimbat nimic la ei;
 *   fara cheie                      -> se dezleaga, cu mesaj ca anularea nu s-a putut cere;
 *   ⚠ NU STIM (`necunoscut`)        -> STOP. Dezlegat aici, s-ar sterge singura urma a unui
 *                                      AWB care poate tocmai s-a anulat, sau poate nu; comanda
 *                                      ar primi alt curier si ar putea pleca de doua ori.
 */
export function hotarareaDezlegarii(awb: string, incercare: IncercareaAnularii): HotarareaDezlegarii {
  if (incercare.fel === "fara_config") {
    return {
      dezleaga: true,
      anulatLaCuriera: false,
      despreCurier:
        "Integrarea Curiera nu mai are cheie API, deci anularea nu s-a putut cere: "
        + `AWB-ul ${awb} poate fi inca viu la Curiera, verifica-l in contul lor.`,
    };
  }

  if (incercare.fel === "eroare") {
    if (incercare.verdict === "necunoscut") {
      return {
        dezleaga: false,
        eroare:
          `Nu stim daca AWB-ul ${awb} s-a anulat la Curiera: ${incercare.mesaj} `
          + "Verifica in contul Curiera si incearca din nou. Numarul NU a fost scos de pe comanda, "
          + "ca sa nu ramana un colet in aer despre care nimeni nu mai stie.",
      };
    }
    return {
      dezleaga: true,
      anulatLaCuriera: false,
      despreCurier:
        `Anularea la Curiera n-a reusit (${incercare.mesaj}), deci AWB-ul ${awb} poate fi inca viu la ei.`,
    };
  }

  const r = incercare.rezultat;
  switch (r.fel) {
    case "anulat":
      return { dezleaga: true, anulatLaCuriera: true, despreCurier: `AWB-ul ${awb} a fost anulat la Curiera.` };
    case "deja_anulat":
      return { dezleaga: true, anulatLaCuriera: true, despreCurier: `AWB-ul ${awb} era deja anulat la Curiera.` };
    case "negasit":
      return {
        dezleaga: true,
        anulatLaCuriera: true,
        /* ⚠ „Negasit" e relativ la CHEIA de acum: o cheie schimbata cu a altui cont Curiera nu
           vede AWB-urile emise din contul vechi, care pot fi totusi vii acolo. */
        despreCurier:
          `AWB-ul ${awb} nu exista in contul Curiera al cheii salvate acum, deci nu era nimic de anulat acolo. `
          + "Daca ai schimbat intre timp contul Curiera, anuleaza-l din contul vechi.",
      };
    case "refuzat":
      return {
        dezleaga: true,
        anulatLaCuriera: false,
        despreCurier:
          `Curiera a refuzat anularea (starea coletului la ei: ${r.stare || "necunoscuta"}), `
          + `deci AWB-ul ${awb} ramane viu la ei. Opreste-l din contul Curiera daca nu trebuie sa plece.`,
      };
  }
}

// ─── 2. Lamurirea dupa referinta ──────────────────────────────────────────────

/**
 * AWB-ul unei emiteri al carei raspuns s-a pierdut, sau `null` daca nu se poate spune sigur.
 *
 * `gasite` sunt AWB-urile VII cu referinta comenzii, de la clipa emiterii incoace
 * (`cautaDupaReferintaCuriera`); `cunoscute` sunt AWB-urile pe care comanda le-a mai purtat
 * (din registru). `null` la oricare = citirea a picat.
 *
 * ⚠ Cele deja cunoscute se SCOT inainte de numarare. Un AWB dezlegat dupa un refuz de anulare
 * ramane viu la Curiera, cu aceeasi referinta; emis in aceeasi zi, s-ar fi gasit el si ar fi fost
 * luat drept expedierea NOUA, care poate nici n-a existat. Comanda ar fi primit inapoi un colet
 * deja plecat.
 *
 * ⚠ Numai EXACT UNUL e o dovada. Zero inseamna ca nu stim (poate nici nu apare inca la ei), iar
 * doua sau mai multe inseamna ca nu stim care. In ambele cazuri eroarea ramane `necunoscut`,
 * si omul lamureste din contul Curiera. Tot asa daca vreo citire a picat.
 */
export function awbLamuritDupaReferinta(
  gasite: readonly string[] | null,
  cunoscute: readonly string[] | null,
): string | null {
  if (!gasite || !cunoscute) return null;
  const vechi = new Set(cunoscute.map((a) => a.trim()).filter(Boolean));
  const noi = [...new Set(gasite.map((a) => a.trim()).filter(Boolean))].filter((a) => !vechi.has(a));
  return noi.length === 1 ? noi[0] : null;
}
