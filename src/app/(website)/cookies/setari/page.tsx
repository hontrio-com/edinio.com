import type { Metadata } from "next";
import Link from "next/link";
import { SetariCookieClient } from "@/components/edinio-marketing/SetariCookieClient";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  „SETARI COOKIES" — O PAGINA ADEVARATA, NU UN BUTON
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE O PAGINA SI NU UN MODAL. O adresa se poate pune in subsol, se poate
  trimite pe email, se poate salva la favorite, si supravietuieste unei
  reincarcari. Retragerea trebuie sa fie la fel de usoara ca acordul; o fereastra
  care se deschide dintr-un buton exista numai pe paginile unde cineva s-a gandit
  sa puna butonul.

  ⚠ SI DE CE SUB `/cookies/`, nu la radacina. `cookies` e deja in
  `NON_STORE_SEGMENTS` (`src/proxy.ts`), deci ruta nu cere nicio schimbare acolo.
  Un segment nou de radacina ar fi cerut una — altfel fiecare cerere ar fi facut o
  interogare degeaba, iar un magazin cu acel slug si domeniu propriu ar fi furat
  pagina cu un 307.
*/

export const metadata: Metadata = {
  title: "Setări Cookies",
  description:
    "Alege ce ai voie să măsurăm pe edinio.com. Îți poți schimba sau retrage alegerea oricând.",
  robots: { index: false, follow: true },
};

export default function PaginaSetariCookie() {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink sm:text-[34px]">
        Setări Cookies
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-3">
        Aici alegi ce ai voie să măsurăm pe edinio.com. Poți schimba sau retrage alegerea
        oricând — nimic din site nu depinde de ea. Ce înseamnă fiecare categorie scrie în{" "}
        <Link href="/cookies" className="underline underline-offset-2 hover:text-primary">
          Politica de cookie-uri
        </Link>
        .
      </p>

      <div className="mt-10">
        <SetariCookieClient />
      </div>
    </main>
  );
}
