import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/website/PageHero";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { ApasaCaSaConfirmi } from "@/components/website/blog/ApasaCaSaConfirmi";
import { confirmaAbonarea } from "@/lib/actions/blog-abonati.actions";
import { ACASA } from "@/lib/website/breadcrumbs";

/**
 * Pagina pe care ajunge cine apasă legătura din emailul de confirmare.
 *
 * ⚠ `noindex` DINADINS. Adresa poartă un jeton într-un parametru; indexată, ar
 * ajunge într-un loc public, iar jetonul e chiar cheia care confirmă o adresă
 * de email. Nici nu are ce căuta în rezultate: e o pagină pentru un singur om,
 * o singură dată.
 *
 * ⚠ CONFIRMAREA NU MAI SE FACE LA RANDARE. Multă vreme s-a făcut, cu scuza
 * scrisă chiar aici că „cel mai rău lucru pe care îl poate face un scaner de
 * legături e să confirme o adresă care oricum ceruse confirmarea". Scuza era
 * falsă: oricine poate scrie adresa ALTCUIVA în casetă — tocmai de asta există
 * dubla confirmare — iar porțile de email ale firmelor chiar deschid adresele
 * din mesaje, uneori înainte ca omul să vadă mesajul. Deci un GET însemna că
 * poarta firmei tale putea semna consimțământul în locul tău.
 *
 * Acum e un buton. O poartă deschide adrese; nu apasă butoane.
 */
export const metadata: Metadata = {
  title: "Confirmarea abonării",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ t?: string }> };

export default async function ConfirmaAbonareaPage({ searchParams }: Props) {
  const { t } = await searchParams;
  const jeton = (t ?? "").trim();

  return (
    <>
      <PageHero
        sir={[ACASA, { label: "Blog", href: "/blog" }, { label: "Confirmare" }]}
        title="Mai e o apăsare"
        lead={jeton ? "Confirmă că tu ai cerut noutățile de pe blog." : undefined}
      />

      <section className="mx-auto max-w-[640px] px-5 pb-20">
        {jeton ? (
          <ApasaCaSaConfirmi
            actiune={confirmaAbonarea}
            jeton={jeton}
            eticheta="Confirm abonarea"
            titluReusit="Gata, ești abonat"
            textReusit="Îți scriem doar când apare ceva care chiar ajută. În fiecare email ai jos o legătură de dezabonare."
            textPicat="Legătura nu mai lucrează. Un jeton de confirmare se folosește o singură dată și se stinge după 48 de ore. Dacă nu ești sigur că abonarea a mers, scrie adresa din nou pe pagina blogului."
            textTemporar="Nu am putut înregistra confirmarea acum — e o problemă de partea noastră, nu a legăturii tale. Mai apasă o dată peste câteva momente."
          />
        ) : (
          <div className="text-center">
            <p className="text-[15px] leading-[1.7] text-ink-2">
              Adresa aceasta se deschide din emailul de confirmare, și trebuie să poarte jetonul
              primit acolo. Deschide emailul și apasă butonul din el.
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

      <FinalCta />
    </>
  );
}
