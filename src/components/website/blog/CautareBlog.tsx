import { Search } from "lucide-react";

/**
 * Caseta de căutare din blog.
 *
 * ⚠ FORMULAR OBIȘNUIT, CU `method="get"`. Fără nicio linie de JavaScript:
 * merge la fel pe un browser cu JS oprit, pe un cititor de ecran, și pentru
 * un crawler care vede o adresă cu parametru în loc de un buton mort.
 *
 * `get`, nu `post`, fiindcă o căutare e o CITIRE: rezultatul are adresa lui,
 * care se poate da mai departe, pune la favorite sau reîncărca fără avertismentul
 * „vrei să retrimiți formularul?".
 */
export function CautareBlog({ initial = "" }: { initial?: string }) {
  return (
    <form action="/blog/cautare" method="get" role="search" className="relative w-full sm:max-w-[280px]">
      <label htmlFor="cautare-blog" className="sr-only">
        Caută în articole
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
        aria-hidden="true"
      />
      <input
        id="cautare-blog"
        type="search"
        name="q"
        defaultValue={initial}
        placeholder="Caută în articole"
        /* `minLength` oprește căutările de o literă ÎNAINTE de a pleca cererea.
           Regula adevărată e tot pe server, în `cautaArticole`; asta e doar ca
           omul să afle pe loc, nu după o pagină goală. */
        minLength={2}
        className="h-10 w-full rounded-full border border-hairline bg-white pl-9 pr-4 text-[14px] text-ink placeholder:text-ink-3 focus:border-ink-3/40 focus:outline-none"
      />
    </form>
  );
}
