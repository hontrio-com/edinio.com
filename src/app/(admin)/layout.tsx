import { requireBlogEditor } from "@/lib/admin-guard";
import { NotificariToast } from "@/components/ui/NotificariToast";

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  /*
    ⚠ AICI E PAZA CEA LARGA, NU CEA STRANSA.

    Aspectul lasa sa treaca si redactorii, fiindca ei au treaba la /admin/blog.
    Restul paginilor NU se bizuie pe el: toate cele 23 isi cheama singure
    `requireAdmin()`, deci un redactor care scrie de mana /admin/utilizatori e
    trimis inapoi de pagina aceea.

    Pana pe 30.08.2026, DOUASPREZECE pagini nu aveau paza proprie — inclusiv
    utilizatori, facturi si setari — si toata siguranta lor statea in randul
    asta. Largirea lui atunci le-ar fi deschis pe toate deodata.
  */
  await requireBlogEditor();
  return (
    <>
      {children}
      <NotificariToast />
    </>
  );
}
