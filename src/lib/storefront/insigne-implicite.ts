/**
 * Insignele de incredere implicite: patru carduri cu iconita, titlu si descriere.
 *
 * ⚠ SCRISE INTR-UN SINGUR LOC, SI CITITE SI DE RANDARE, NU DOAR DE EDITOR.
 *
 * Lista traia doar ca valoare de pornire a starii din „Editeaza magazinul", iar
 * randarea o cerea obligatoriu din `page_content`. Mergea din intamplare: pana
 * de curand, orice buton Salveaza trimitea obiectul INTREG, deci implicitul se
 * materializa in baza la prima salvare. Din clipa in care fiecare panou a
 * inceput sa trimita doar cheile pe care CHIAR le-a atins, comutatorul „Garantii
 * (4 carduri)" pleca singur: in baza ajungea `show_trust_strip_on_store: true`
 * fara nicio lista, iar banda nu se randa niciodata. Comerciantul vedea cardurile
 * in editor, apasa Salveaza, primea „Salvat" — si in magazin nu aparea nimic.
 *
 * Implicitul sta acum in CITITOR. Asa se repara si magazinele care au apucat sa
 * salveze in starea proasta, fara nicio migrare.
 */
export interface InsignaIncredere {
  icon: string;
  title: string;
  desc: string;
}

export const INSIGNE_INCREDERE_IMPLICITE: InsignaIncredere[] = [
  { icon: "truck", title: "Livrare 24-48h", desc: "Livrare rapida in toata Romania." },
  { icon: "shield", title: "Plata la livrare", desc: "Platesti cash curierului. Zero riscuri." },
  { icon: "rotate-ccw", title: "Retur 14 zile", desc: "Returneaza fara intrebari in 14 zile." },
  { icon: "phone", title: "Suport", desc: "Disponibil pentru orice intrebare." },
];

/**
 * Insignele de aratat: cele salvate, sau cele implicite cand lipsesc.
 *
 * O lista GOALA ramane goala — asta inseamna „le-am sters pe toate", si e o
 * alegere, nu o lipsa.
 */
export function insigneDeAratat(salvate: InsignaIncredere[] | undefined): InsignaIncredere[] {
  return salvate === undefined ? INSIGNE_INCREDERE_IMPLICITE : salvate;
}
