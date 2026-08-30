import type { Metadata } from "next";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { PageHero } from "@/components/website/PageHero";
import { FinalCta } from "@/components/website/sections/FinalCta";
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
 * ⚠ CONFIRMAREA SE FACE LA RANDARE, adică la GET. Nu e purtarea manualului —
 * un GET nu ar trebui să schimbe nimic — dar aici e singura care funcționează:
 * clienții de email nu trimit formulare, trimit oameni către adrese. Paguba
 * posibilă e mărginită: jetonul e de unică folosință și se stinge, iar cel mai
 * rău lucru pe care îl poate face un scaner de legături e să confirme o adresă
 * care oricum ceruse confirmarea.
 */
export const metadata: Metadata = {
  title: "Confirmarea abonării",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ t?: string }> };

export default async function ConfirmaAbonareaPage({ searchParams }: Props) {
  const { t } = await searchParams;
  const reusit = t ? await confirmaAbonarea(t) : false;

  return (
    <>
      <PageHero
        sir={[ACASA, { label: "Blog", href: "/blog" }, { label: "Confirmare" }]}
        title={reusit ? "Gata, ești abonat" : "Legătura nu mai lucrează"}
        lead={
          reusit
            ? "Îți scriem doar când apare ceva care chiar ajută. Te poți dezabona din orice email."
            : undefined
        }
      />

      <section className="mx-auto max-w-[640px] px-5 pb-20 text-center">
        <span
          className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${
            reusit ? "bg-primary/10 text-primary" : "bg-tint-2 text-ink-3"
          }`}
        >
          {reusit ? <Check className="h-6 w-6" /> : <X className="h-6 w-6" />}
        </span>

        {!reusit && (
          <p className="mt-4 text-[15px] leading-[1.7] text-ink-2">
            Se poate să fi apăsat de două ori, sau legătura să fie dintr-un email mai vechi:
            un jeton de confirmare lucrează o singură dată. Dacă nu ești sigur că abonarea a
            mers, scrie adresa din nou pe pagina blogului.
          </p>
        )}

        <p className="mt-6">
          <Link
            href="/blog"
            className="text-[14px] font-semibold text-ink underline-offset-4 hover:underline"
          >
            Înapoi la articole
          </Link>
        </p>
      </section>

      <FinalCta />
    </>
  );
}
