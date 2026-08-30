import { requireAdmin } from "@/lib/admin-guard";
import { AdminOperatiiClient } from "@/components/admin/AdminOperatiiClient";

/**
 * ⚠ INVELIS DE SERVER, PUS DINADINS.
 *
 * Pagina era o componenta de CLIENT, deci nu putea chema `requireAdmin()`, si
 * toata paza ei statea in aspectul comun. Din 23 de pagini de admin, 12 erau
 * asa pe 30.08.2026 — inclusiv utilizatori, facturi si setari. O singura
 * slabire a aspectului le-ar fi deschis pe toate deodata.
 *
 * Acum fiecare pagina se apara singura, iar aspectul e a doua plasa, nu
 * singura.
 */
export default async function Pagina() {
  await requireAdmin();
  return <AdminOperatiiClient />;
}
