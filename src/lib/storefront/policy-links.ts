/**
 * Paginile de politici pe care storefrontul le expune la `/{slug}/politici/{tip}`.
 *
 * Etichetele erau declarate de doua ori, cu formulari usor diferite
 * („Confidentialitate" fata de „Politica de confidentialitate"). Au ramas cele
 * lungi, mai explicite, si sunt acum singurele — footerul e unul singur pe toate
 * paginile publice.
 */
export const POLICY_LINKS = [
  { slug: "termeni", label: "Termeni si conditii" },
  { slug: "livrare", label: "Politica de livrare" },
  { slug: "retur", label: "Politica de retur" },
  { slug: "confidentialitate", label: "Politica de confidentialitate" },
  { slug: "gdpr", label: "GDPR" },
  { slug: "anulare", label: "Politica de anulare" },
] as const;

/** Segmentul din adresa al unei politici: `termeni`, `livrare` si celelalte. */
export type TipPolitica = (typeof POLICY_LINKS)[number]["slug"];

/*
 * Cate o fraza pe tip. Tabelul e scris pe `TipPolitica`, deci o politica noua in
 * `POLICY_LINKS`, fara fraza ei, nu trece de `tsc`.
 */
const DESCRIERI: Record<TipPolitica, (m: string) => string> = {
  termeni: (m) => `Termenii și condițiile de utilizare ale magazinului online ${m}.`,
  livrare: (m) => `Politica de livrare a magazinului ${m}: cum ajung comenzile la tine.`,
  retur: (m) => `Politica de retur a magazinului ${m}: condițiile și pașii pentru returnarea produselor.`,
  confidentialitate: (m) => `Cum prelucrează ${m} datele personale ale clienților.`,
  gdpr: (m) => `Drepturile tale privind datele personale la ${m}.`,
  anulare: (m) => `Cum poți anula o comandă plasată la ${m}.`,
};

/**
 * Descrierea de cautare a paginii de politica: `<meta name="description">`, og si twitter.
 *
 * ═══ DE CE ═══
 *
 * Pagina nu-si declara descrierea, deci o mostenea din layout: descrierea PAGINII
 * PRINCIPALE (Setari > SEO). Toate cele sase politici apareau in Google cu textul primei
 * pagini, iar un text identic peste tot e exact ce spune Google ca „nu ajuta": atunci
 * isi construieste singur fragmentul. Reclamat de caian-textile.ro (10.09.2026).
 *
 * ⚠ `magazin` vine SCURTAT de apelant (`numeScurtMagazin`), nu se scurteaza aici:
 * fisierul il importa si subsolul, care e componenta de client, iar generatorul de
 * descrieri ar fi tras dupa el in browser formatarea preturilor si datele structurate.
 *
 * Un tip necunoscut primeste o fraza generica, niciodata sirul gol. Pagina il respinge
 * oricum inainte (404); cautarea e pe cheile PROPRII ale tabelului, ca „constructor" sau
 * „__proto__" din adresa sa nu nimereasca ceva mostenit de la `Object`.
 */
export function descrierePolitica(tip: string, magazin: string): string {
  const m = magazin.replace(/\s+/g, " ").trim();
  const fraza = Object.prototype.hasOwnProperty.call(DESCRIERI, tip)
    ? DESCRIERI[tip as TipPolitica]
    : null;
  return fraza ? fraza(m) : `Politicile magazinului online ${m}.`;
}
