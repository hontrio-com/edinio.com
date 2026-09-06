import { escapeHtml as esc } from "@/lib/utils/html-escape";
import { instantaneulLiniei } from "@/lib/configurators/instantaneu";

/**
 * Randul de configuratie dintr-un email cu linii de comanda.
 *
 * ═══ ⚠ DE CE E UN MODUL APARTE, SI NU O FUNCTIE IN `email.ts` ═══
 *
 * Fiindca asa a putut fi MOARTA luni de zile fara ca nimeni sa afle.
 *
 * Scrisa inauntru, singura proba care se putea scrie era una care numara aparitiile sirului
 * `${randConfiguratie(i)}` in sursa. Alea erau trei, proba trecea verde — iar functia intorcea
 * sirul GOL la fiecare dintre cele trei apeluri, fiindca apelantul din `order.actions.ts` compunea
 * lista de linii cu un `.map` care enumera patru campuri si il pierdea pe al cincilea.
 *
 * `tsc` n-avea ce spune: functia primeste `unknown` si intoarce un sir pentru orice. Deci
 * comerciantul si clientul primeau amandoi „Cana personalizata x1" si atat, iar cu doua cani
 * gravate diferit primeau doua randuri identice.
 *
 * Scoasa aici, se poate CHEMA dintr-o proba, cu o linie adevarata, si se poate verifica ce iese.
 * Aia e deosebirea dintre o proba care apara si una care linisteste.
 *
 * ═══ ⚠ SE ESCAPEAZA, SI ASTA NU E O FORMALITATE ═══
 *
 * Textul vine din campul de gravura completat de cumparator — un sir ales de un STRAIN, lipit
 * intr-un HTML care ajunge in casuta comerciantului. `esc` e singurul lucru care sta intre cele
 * doua.
 *
 * ═══ ⚠ SE CITESTE APARARE ═══
 *
 * `orders.items` e jsonb vechi de luni, editabil din panou. Un email care arunca nu se trimite
 * deloc, si comanda ramane nestiuta. `instantaneulLiniei` nu arunca niciodata.
 */
export function randConfiguratie(linie: unknown): string {
  const cfg = instantaneulLiniei(linie);
  if (!cfg) return "";
  const text = cfg.rezumat.map((r) => `${r.eticheta}: ${r.valoare}`).join(" · ");
  if (!text) return "";
  return `<br><span style="font-size:12px;color:#71717a;">${esc(text)}</span>`;
}
