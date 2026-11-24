import { PaginaSuport } from "@/components/dashboard/suport/PaginaSuport";

/* Chatul din magazin, pagina furnizorului. Toata logica sta in `PaginaSuport` (aceeasi pentru cei patru). */
export default function Page() {
  return <PaginaSuport furnizor="zendesk" />;
}
