import { redirect } from "next/navigation";
import { adresaEditoruluiPentruPagina } from "@/lib/editor-magazin/pagini";

/**
 * Editorul de pagini de pana acum s-a mutat in editorul unic (etapa 5 din `docs/editor-magazin/PLAN.md`):
 * legaturile vechi (semne de carte, ghiduri, istoricul browserului) deschid pagina acolo. Editorul o
 * deschide doar daca e a magazinului celui logat; altfel ramane pe pagina principala.
 */
export default async function EditCustomPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  redirect(adresaEditoruluiPentruPagina(pageId));
}
