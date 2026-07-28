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
