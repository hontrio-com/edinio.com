import { redirect } from "next/navigation";

/**
 * Fostul catalog „Design sectiuni”, absorbit in editorul unic (etapa 2,
 * 25.10.2026): designul fiecarei sectiuni se alege acum din nodul ei, cu
 * „Schimba designul”. Adresa ramane, ca linkurile vechi sa duca undeva.
 */
export default function SectionDesignPage() {
  redirect("/dashboard/editor");
}
