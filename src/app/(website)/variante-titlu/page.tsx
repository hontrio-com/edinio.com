import { notFound } from "next/navigation";
import { VarianteParanteze } from "@/components/website/sections/mentenanta/VarianteParanteze";

/**
 * ⚠ PAGINĂ DE LUCRU, NU DE SITE. SE ȘTERGE DUPĂ ALEGERE.
 *
 * Clientul a cerut (13.08) mai multe feluri de paranteze pentru cuvântul
 * „tehnică" din titlul paginii „Mentenanță gratuită", ca să aleagă. Pagina asta
 * le arată una sub alta, la mărimea adevărată a titlului, pe fundalul adevărat.
 *
 * ⚠ NU EXISTĂ ÎN PRODUCȚIE: dă 404. Nu e o măsură de prisos — o pagină de lucru
 * uitată pe site ajunge indexată, iar Google o arată apoi ca pe o pagină
 * adevărată. Aici nici măcar nu se poate întâmpla: `notFound()` se cheamă
 * înainte de orice.
 *
 * Nu e în meniu, nu e în subsol, nu e în sitemap.
 */
export default function VarianteTitluPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <VarianteParanteze />;
}
