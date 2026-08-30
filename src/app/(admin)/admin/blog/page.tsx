import { redirect } from "next/navigation";

/**
 * Capul sectiunii de blog.
 *
 * Deocamdata trimite la autori, fiindca ecranul de articole nu exista inca.
 * Cand va exista, AICI se muta lista de articole, iar redirectarea dispare —
 * bara laterala arata deja spre /admin/blog, deci nu se schimba nimic in ea.
 */
export default function AdminBlogPage() {
  redirect("/admin/blog/autori");
}
