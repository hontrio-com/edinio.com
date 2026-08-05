import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroMesh } from "./hero-backgrounds";

/**
 * Hero-ul paginii de acasă: totul pe mijloc, peste un mesh de lumină verde.
 *
 * Verdele stă unde contează: butonul principal, eticheta „Nou" și lumina din
 * spate. Titlul rămâne negru — verdele care sare în ochi dintr-un cuvânt de
 * mijloc era exact tiparul de care am scăpat în restul site-ului.
 */

const TRUST = "15 zile gratuit, fără card de credit. Anulezi oricând.";

export function Hero() {
  return (
    /*
     * `-mt-18 pt-18` urcă secțiunea sub bara de sus și îi pune la loc spațiul
     * înăuntru. Bara e lipicioasă, deci stă în curgere: fără asta, lumina s-ar
     * opri brusc la marginea ei de jos și s-ar vedea o dungă peste tot ecranul.
     * Așa vine din marginea de sus a ferestrei, iar când derulezi, sticla mată a
     * barei o estompează, ceea ce arată chiar bine.
     */
    <section className="relative isolate -mt-18 overflow-hidden bg-white pt-18">
      <HeroMesh />

      {/*
        Spatiul de sus e mult mai mic pe telefon decat pe ecran mare. Pe desktop,
        o respiratie de 112px face hero-ul sa para asezat; pe un ecran de 650px
        inaltime, aceeasi respiratie manaca a cincea parte din tot ce se vede
        inainte de derulare si impinge butonul spre marginea de jos.
      */}
      <div className="relative mx-auto max-w-[1200px] px-5 pt-10 pb-16 text-center sm:px-6 sm:pt-16 sm:pb-20 lg:px-8 lg:pt-28 lg:pb-32">
        {/*
          Eticheta sta pe UN rand si pe telefon. Textul lung se rupea in doua si
          arata ingramadit, asa ca partea de detaliu apare abia de la `sm` in sus,
          unde incape. Pe telefon rimane doar miezul.
        */}
        <Link
          href="/magazin-online"
          className="inline-flex max-w-full items-center gap-2 rounded-full border border-hairline bg-white/70 py-1.5 pl-1.5 pr-3.5 text-[12px] font-medium text-ink-2 backdrop-blur-sm transition-colors duration-200 hover:border-ink-3/40 sm:pr-4 sm:text-[13px]"
        >
          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-white sm:text-[11px]">
            Nou
          </span>
          <span className="truncate">
            Pagină de magazin
            <span className="hidden sm:inline">, cu filtre pe brand și specificații</span>
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Link>

        <h1 className="mx-auto mt-6 max-w-[900px] text-[38px] font-bold leading-[1.04] tracking-[-0.035em] text-ink sm:mt-7 sm:text-[56px] lg:text-[66px]">
          Magazinul tău online, deschis în câteva minute
        </h1>

        <p className="mx-auto mt-5 max-w-[640px] text-[16px] leading-[1.6] text-ink-2 sm:mt-6 sm:text-[19px]">
          Îți deschizi magazinul și începi să vinzi în aceeași zi. Toate
          integrările sunt incluse: curieri cu AWB automat, plăți cu cardul și
          facturare. Iar mentenanța și asistența rămân gratuite, permanent.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:mt-10">
          <Link
            href="/register"
            className="inline-flex h-13 items-center justify-center rounded-[8px] bg-primary px-8 text-[15px] font-semibold text-white shadow-[0_8px_28px_-8px_rgba(26,181,84,0.55)] transition-transform duration-200 hover:scale-[1.02] active:scale-100"
          >
            Începe gratuit
          </Link>
          <Link
            href="/#preturi"
            className="group inline-flex h-13 items-center gap-1.5 rounded-[8px] px-6 text-[15px] font-medium text-ink-2 transition-colors duration-200 hover:bg-tint-2 hover:text-ink"
          >
            Vezi prețurile
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/*
          Un rand de text, nu trei bife.
          Randul de bife verzi e semnul din nastere al oricarui hero facut in
          graba: aceleasi trei casute, aceeasi iconita, pe orice site. Aceeasi
          informatie, spusa ca o propozitie, nu mai cere atentie si nu mai seamana
          cu a nimanui.
        */}
        <p className="mt-7 text-[14px] text-ink-3">{TRUST}</p>
      </div>
    </section>
  );
}
