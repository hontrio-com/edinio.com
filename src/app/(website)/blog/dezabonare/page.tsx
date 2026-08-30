import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/website/PageHero";
import { ApasaCaSaConfirmi } from "@/components/website/blog/ApasaCaSaConfirmi";
import { dezaboneazaDinBlog } from "@/lib/actions/blog-abonati.actions";
import { ACASA } from "@/lib/website/breadcrumbs";

/**
 * Ieșirea.
 *
 * ⚠ TEXTUL O PROMITEA DE LA ÎNCEPUT ȘI NU EXISTA. Caseta de abonare spunea
 * „te poți dezabona din orice email", emailul de confirmare spunea la fel, iar
 * pagina de după confirmare spunea „dintr-o apăsare". Trei locuri, aceeași
 * promisiune, zero rute care să o țină.
 *
 * Nu e o scăpare cosmetică. Pentru cine primește un email nedorit, dezabonarea e
 * singura ieșire cuviincioasă; fără ea, următoarea lui apăsare nu e „scrie-le
 * lor", e „Raportează ca spam". Și de acolo nu suferă blogul, suferă tot
 * domeniul: emailurile de comandă ale comercianților ajung în același dosar.
 *
 * ⚠ FĂRĂ `FinalCta`. Toate celelalte pagini ale site-ului se termină cu un
 * îndemn să încerci Edinio. Pe pagina prin care omul tocmai ne spune că nu mai
 * vrea să audă de noi, un asemenea îndemn e exact felul de a nu asculta.
 *
 * ⚠ `noindex`: adresa poartă un jeton, și e o pagină pentru un singur om.
 */
export const metadata: Metadata = {
  title: "Dezabonare",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ t?: string }> };

export default async function DezabonarePage({ searchParams }: Props) {
  const { t } = await searchParams;
  const jeton = (t ?? "").trim();

  return (
    <>
      <PageHero
        sir={[ACASA, { label: "Blog", href: "/blog" }, { label: "Dezabonare" }]}
        title="Te scoatem de pe listă"
        lead={jeton ? "O apăsare și nu mai primești nimic de la blogul Edinio." : undefined}
      />

      <section className="mx-auto max-w-[640px] px-5 pb-24">
        {jeton ? (
          <ApasaCaSaConfirmi
            actiune={dezaboneazaDinBlog}
            jeton={jeton}
            eticheta="Mă dezabonez"
            titluReusit="Gata, te-am scos"
            textReusit="Nu-ți mai trimitem noutățile blogului. Emailurile despre comenzile și contul tău nu au legătură cu lista aceasta și continuă să vină."
            textPicat="Legătura nu pare să fie a noastră sau e dintr-un email prea vechi. Dacă tot primești mesaje, scrie-ne și te scoatem noi."
          />
        ) : (
          <div className="text-center">
            <p className="text-[15px] leading-[1.7] text-ink-2">
              Adresa aceasta se deschide din legătura de dezabonare aflată la subsolul fiecărui
              email pe care ți-l trimitem.
            </p>
            <p className="mt-6">
              <Link
                href="/blog"
                className="text-[14px] font-semibold text-ink underline-offset-4 hover:underline"
              >
                Înapoi la articole
              </Link>
            </p>
          </div>
        )}
      </section>
    </>
  );
}
