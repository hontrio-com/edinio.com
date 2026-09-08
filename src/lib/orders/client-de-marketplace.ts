/**
 * Clientul comenzii e al MARKETPLACE-ului, nu al comerciantului?
 *
 * ═══ ⚠ DE CE EXISTA, SI CE COSTA CAND LIPSESTE ═══
 *
 * O comanda de marketplace poarta datele unui cumparator care nu s-a inscris niciodata la
 * nimic la comerciant. Emailul e adesea un ALIAS al platformei (Pepita, About You), dat anume
 * pentru comunicarea despre acea comanda. Trecut in Brevo sau Mailchimp, omul ajunge intr-o
 * lista de marketing: segmentari, campanii, retargetare.
 *
 * ⚠ IAR ASTA S-A INTAMPLAT CU ADEVARAT, si nu prin calea de ingest, care e curata:
 * `updateOrder` chema `maybeMarkBrevoOrderPaid` si `maybeMarkMailchimpOrderPaid` de fiecare
 * data cand comerciantul trecea o comanda pe „platit", fara sa se uite la origine. Deci prima
 * apasare pe butonul de plata trimitea emailul si comanda mai departe.
 *
 * ⚠ SI NU E O PROBLEMA A PEPITEI. Atinge orice comanda cu `order_source.marketplace`: eMAG,
 * Trendyol, About You, OLX. Pepita a fost doar prilejul cu care s-a vazut. De aceea regula e
 * scrisa generic si sta langa comenzi, nu langa vreo integrare anume.
 *
 * ⚠ CE NU OPRESTE: automatizarile OPERATIONALE ale comenzii. Instiintarea despre expediere,
 * factura, AWB-ul si SMS-ul de livrare tin de executarea contractului si merg mai departe.
 * Se opreste numai ce hraneste marketingul.
 */

/**
 * Comanda vine dintr-un marketplace, deci clientul ei nu intra in marketingul comerciantului.
 *
 * ⚠ ORICE marketplace, nu o lista de nume. O lista ar fi ramas in urma la a sasea integrare,
 * si tocmai cea noua ar fi fost cea nepazita. Semnul e prezenta lui `order_source.marketplace`,
 * care se scrie la ingest de fiecare cale de marketplace si nu se mai schimba.
 */
export function clientDeMarketplace(orderSource: unknown): boolean {
  const m = (orderSource as { marketplace?: unknown } | null)?.marketplace;
  return typeof m === "string" && m.trim() !== "";
}
