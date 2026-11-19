"use client";

import Link from "next/link";
import { useIdentitateMagazin } from "@/components/storefront/IdentitateMagazin";

/**
 * 404-ul magazinelor.
 *
 * Pana acum, orice adresa gresita de sub `/[slug]` cadea pe 404-ul radacinii:
 * pagina platformei, cu butonul „Inapoi la pagina principala" care ducea la
 * edinio.com. Pe domeniul unui comerciant, asta insemna ca o adresa gresita
 * scotea vizitatorul din magazin.
 *
 * Antetul paginii (titlu, descriere, OpenGraph) NU se scrie aici: `not-found.tsx`
 * nu accepta `generateMetadata`, iar antetul vine de la layout-ul de deasupra.
 * Acolo l-am pus, in `[slug]/layout.tsx`.
 *
 * ⚠ 19.11.2026 (auditul temelor). Pagina afla magazinul din gazda cererii, deci
 * numai pe domeniu propriu; pe adresa cu slug (`edinio.com/magazin/...`, cum
 * sunt cele mai multe magazine) nu stia nici numele, nici culoarea, iar butonul
 * ducea la `/`: SCOTEA cumparatorul din magazin, pe site-ul platformei. Acum
 * numele, culoarea si prima pagina vin de la layout (`IdentitateMagazin`), care
 * are randul magazinului si stie daca adresele poarta slugul. A disparut si
 * interogarea dupa gazda, facuta la fiecare 404.
 *
 * Tot atunci, din axe: pagina nu avea `<main>`, cifra era la 1,3:1 pe alb, iar
 * butonul scria alb pe orice culoare (2,4:1 pe verdele platformei). Textul
 * butonului e acum culoarea care se citeste pe fondul lui (`contrastOn`).
 */
export default function StoreNotFound() {
  const { nume, culoare, culoareText, acasa } = useIdentitateMagazin();

  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      {/* Decor: titlul de dedesubt spune acelasi lucru. Griul trece de 3:1, pragul textului mare. */}
      <p aria-hidden="true" className="text-6xl font-black text-[#8e8e98]">404</p>
      <h1 className="text-lg font-semibold mt-4">Pagina nu a fost gasita</h1>
      <p className="text-sm text-zinc-600 mt-1 max-w-md">
        {nume
          ? `Adresa pe care ai deschis-o nu exista in magazinul ${nume}. Poate a fost mutata sau stearsa.`
          : "Adresa pe care ai deschis-o nu exista sau a fost mutata."}
      </p>
      <Link href={acasa}
        className="mt-6 inline-flex min-h-11 items-center px-5 text-sm font-semibold rounded-xl transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111827]/50 focus-visible:ring-offset-2"
        style={{ backgroundColor: culoare, color: culoareText }}>
        Inapoi in magazin
      </Link>
    </main>
  );
}
