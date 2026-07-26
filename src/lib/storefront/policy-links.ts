/**
 * Paginile de politici pe care storefrontul le expune la `/{slug}/politici/{tip}`.
 *
 * Etichetele sunt cele folosite de pagina de magazin. `StoreFooter` (paginile
 * custom) are inca propria copie, cu formulari usor diferite („Confidentialitate"
 * fata de „Politica de confidentialitate"); cele doua se unifica la unificarea
 * footerelor, unde alegerea schimba text vizibil si trebuie facuta explicit.
 */
export const POLICY_LINKS = [
  { slug: "termeni", label: "Termeni si conditii" },
  { slug: "livrare", label: "Politica de livrare" },
  { slug: "retur", label: "Politica de retur" },
  { slug: "confidentialitate", label: "Politica de confidentialitate" },
  { slug: "gdpr", label: "GDPR" },
  { slug: "anulare", label: "Politica de anulare" },
] as const;
