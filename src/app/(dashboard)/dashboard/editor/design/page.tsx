import { redirect } from "next/navigation";

/**
 * Fostul editor de design („Ordinea sectiunilor”), absorbit in editorul unic
 * (etapa 2, 25.10.2026). Adresa ramane, ca linkurile vechi si ghidurile sa duca
 * undeva: in editorul unic, pe pagina principala.
 */
export default function DesignEditorPage() {
  redirect("/dashboard/editor?pagina=acasa");
}
