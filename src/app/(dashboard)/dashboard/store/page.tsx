import { redirect } from "next/navigation";

/**
 * Pagina „Editeaza magazinul... in curs de dezvoltare”, ramasa de la inceputuri
 * si legata de nicaieri. Duce acum la editorul unic.
 */
export default function StoreEditorPage() {
  redirect("/dashboard/editor");
}
