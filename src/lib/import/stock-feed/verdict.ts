/**
 * Verdictul unei rulari, citit din cifre.
 *
 * Sta separat de ecran, si pur, fiindca aici s-a greșit deja o data pe date
 * adevarate: prima varianta compara `unchanged` cu `total` si dadea alarma
 * portocalie „A citit fisierul, dar n-a actualizat nimic" pe o rulare perfect
 * sanatoasa.
 *
 * De ce era gresit: `total` numara TOATE randurile din fisier, iar un feed de
 * distribuitor are mult mai multe randuri decat produse are magazinul. Masurat
 * pe feedul Maravet: 5.926 de randuri in fisier, 1.275 de produse in magazin,
 * toate cele 1.275 potrivite si toate deja la zi. `unchanged (1275) < total
 * (5926)` era adevarat, deci alarma pornea — desi nu era nimic in neregula.
 *
 * Numitorul corect nu e cate randuri are fisierul, ci cate au ajuns la un produs:
 * `written + unchanged`.
 */

/** Cifrele unei rulari. Campurile noi lipsesc din totalurile scrise mai demult. */
export interface CifreRulare {
  total: number;
  written: number;
  unchanged: number;
  pending?: number;
  not_found?: number;
  ambiguous?: number;
  invalid?: number;
  duplicate?: number;
  ignored?: number;
}

export type FelVerdict = "esuat" | "in_curs" | "nimic_potrivit" | "deja_la_zi" | "reusit";

export interface Verdict {
  fel: FelVerdict;
  ton: "rau" | "atentie" | "bun";
  text: string;
  /** Randuri din fisier care au ajuns la un produs din magazin. */
  potrivite: number;
  /** Randuri respinse, de orice fel. */
  probleme: number;
  /**
   * Codurile negasite sunt SINGURA problema, si ceva chiar s-a potrivit.
   *
   * Asta e tiparul obisnuit al unui feed de distribuitor: fisierul acopera tot
   * catalogul furnizorului, magazinul vinde o parte din el. Nu e o defectiune, si
   * ecranul n-are voie sa o arate ca pe una.
   */
  negasiteSuntNormale: boolean;
}

const n = (v: number | undefined) => v ?? 0;

export function verdictRulare(
  totals: CifreRulare | null,
  lastStatus: "ok" | "error" | null,
): Verdict {
  const t = totals;
  const potrivite = t ? n(t.written) + n(t.unchanged) : 0;
  const probleme = t
    ? n(t.not_found) + n(t.ambiguous) + n(t.invalid) + n(t.duplicate) + n(t.ignored)
    : 0;
  const negasiteSuntNormale = t !== null && potrivite > 0 && probleme > 0 && probleme === n(t.not_found);

  const baza = { potrivite, probleme, negasiteSuntNormale };

  if (lastStatus === "error") {
    return { ...baza, fel: "esuat", ton: "rau", text: "Ultima rulare a esuat" };
  }

  /* Au ramas randuri de scris. Statusul din baza nu poate purta informatia asta
     (are CHECK pe 'ok'/'error'), dar cifra o poarta. */
  if (t && n(t.pending) > 0) {
    return {
      ...baza,
      fel: "in_curs",
      ton: "atentie",
      text: `Se termina in fundal (${n(t.pending)} randuri ramase)`,
    };
  }

  /* NICIUN rand n-a ajuns la un produs. Abia asta inseamna „feedul nu face
     nimic": codurile din fisier nu se potrivesc cu magazinul, deci cel mai
     probabil e aleasa alta coloana sau alta cheie de potrivire. */
  if (t && t.total > 0 && potrivite === 0) {
    return {
      ...baza,
      fel: "nimic_potrivit",
      ton: "atentie",
      text: "A citit fisierul, dar niciun cod nu s-a potrivit cu magazinul",
    };
  }

  /* S-a potrivit, dar n-a fost nimic de schimbat. E rezultatul cel mai des
     intalnit la un feed care ruleaza zilnic, si e o veste buna, nu una proasta. */
  if (t && t.written === 0 && n(t.unchanged) > 0) {
    return {
      ...baza,
      fel: "deja_la_zi",
      ton: "bun",
      text: `Totul era deja la zi (${n(t.unchanged)} produse verificate)`,
    };
  }

  return { ...baza, fel: "reusit", ton: "bun", text: "Ultima rulare reusita" };
}

/** Randul de cifre de sub verdict. */
export function rezumatCifre(t: CifreRulare | null): string | null {
  if (!t) return null;
  const potrivite = n(t.written) + n(t.unchanged);

  /*
   * Se numara pornind de la CE S-A POTRIVIT, nu de la cate randuri are fisierul.
   * „0 actualizate din 5926 randuri" il facea pe om sa creada ca ar fi trebuit
   * actualizate 5926 de produse — pe cand magazinul are 1275.
   */
  const bucati = [`${potrivite} produse potrivite`];
  if (n(t.written) > 0) bucati.push(`${n(t.written)} actualizate`);
  if (n(t.unchanged) > 0) bucati.push(`${n(t.unchanged)} deja la zi`);
  return bucati.join(" · ");
}
