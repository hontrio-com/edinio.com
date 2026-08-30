import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, PencilLine } from "lucide-react";
import { CorpArticol } from "@/components/website/blog/CorpArticol";
import { articolDePrevizualizat } from "@/lib/actions/blog.actions";
import { STARI, asteaptaCeasul, seVede } from "@/lib/blog/types";

/**
 * Cum va arăta articolul, înainte să existe pentru cineva.
 *
 * ⚠ REDACTORII N-AVEAU NICIUN FEL DE A VEDEA O CIORNĂ. Pagina publică refuză
 * tot ce nu e `published` cu data trecută — și bine face. Dar asta însemna că
 * singurul fel de a te uita la un text era să-l publici, adică să-l arăți lumii
 * ca să vezi dacă e bun de arătat lumii.
 *
 * ⚠ STĂ SUB `(website)`, NU SUB `(admin)`, ȘI E DINADINS. Aceleași fonturi,
 * aceleași margini, aceeași lățime de coloană, același `CorpArticol`. O
 * previzualizare care reface aranjarea „cam la fel" e mai rea decât niciuna:
 * omul ia hotărâri despre lungimea titlului și despre unde cade coperta
 * uitându-se la altceva decât la ce urmează să apară.
 *
 * ⚠ CE ȚINE UȘA ÎNCHISĂ e `requireBlogEditorApi()` din `articolDePrevizualizat`,
 * nu ruta. O rută sub `(website)` nu e apărată de nimic prin ea însăși.
 */
export const metadata: Metadata = {
  title: "Previzualizare",
  robots: { index: false, follow: false, nocache: true },
};

/* Ciornele nu se pot prerandă: nici nu s-ar cuveni, nici n-ar avea de unde. */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function PrevizualizarePage({ params }: Props) {
  const { id } = await params;
  const a = await articolDePrevizualizat(id);

  /* Un om fără drept și un articol care nu există arată LA FEL de aici. Altfel
     pagina ar spune „există un articol cu id-ul ăsta, dar nu ai voie" — ceea ce
     e deja o informație. */
  if (!a) notFound();

  const stare = seVede(a)
    ? "E publicat și se vede pe site."
    : asteaptaCeasul(a)
      ? `Publicat, dar cu data în viitor: apare singur pe ${new Date(a.published_at!).toLocaleString("ro-RO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}.`
      : `E ${STARI[a.status].toLowerCase()}. Nimeni în afară de redacție nu poate ajunge la el.`;

  return (
    <>
      {/*
        Banda de sus nu e ornament: fără ea, un redactor care lasă fila deschisă
        se poate întoarce peste o oră crezând că se uită la site-ul adevărat.
      */}
      <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-[1140px] flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[13px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-900">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Previzualizare
          </span>
          <span className="text-amber-800">{stare}</span>
          <Link
            href={`/admin/blog/${a.id}`}
            className="ml-auto inline-flex items-center gap-1.5 font-medium text-amber-900 underline-offset-4 hover:underline"
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
            Înapoi la editare
          </Link>
        </div>
      </div>

      <CorpArticol a={a} />
    </>
  );
}
