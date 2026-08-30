import { requireBlogEditor } from "@/lib/admin-guard";
import { listeazaAutori, listeazaCategorii } from "@/lib/actions/blog.actions";
import { AdminBlogPostEditor } from "@/components/admin/AdminBlogPostEditor";
import { AlegeSablon } from "@/components/admin/AlegeSablon";
import { sablonDupaCheie } from "@/lib/blog/sabloane";

export const metadata = { title: "Articol nou" };

type Props = { searchParams: Promise<{ sablon?: string }> };

/**
 * ⚠ FARA `?sablon=`, SE ALEGE INTAI SCHELA. Nu e un pas in plus pus degeaba:
 * un buton „pune sablonul" in editor ar fi trebuit sa raspunda la intrebarea
 * „ce fac cu ce e deja scris?", iar orice raspuns ar fi fost prost. Aici
 * intrebarea nu apare, fiindca articolul inca nu exista.
 *
 * `?sablon=gol` e drumul limpede pentru „scriu de la zero".
 */
export default async function AdminBlogArticolNouPage({ searchParams }: Props) {
  const { rol } = await requireBlogEditor();
  const { sablon } = await searchParams;
  if (!sablon) return <AlegeSablon />;

  const [autori, categorii] = await Promise.all([listeazaAutori(), listeazaCategorii()]);
  return (
    <AdminBlogPostEditor
      articol={null}
      autori={autori}
      categorii={categorii}
      rol={rol}
      sablon={sablon === "gol" ? null : sablonDupaCheie(sablon)}
    />
  );
}
