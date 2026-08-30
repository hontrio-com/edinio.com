"use client";

import { useEffect, useRef } from "react";
import { numaraCitirea } from "@/lib/actions/blog-public.actions";

/**
 * Numără o citire, o singură dată pe deschidere de pagină.
 *
 * ⚠ NU RANDEAZĂ NIMIC ȘI NU ÎNTÂRZIE NIMIC. Articolul e întreg în HTML-ul venit
 * de la server înainte ca bucata asta să pornească; dacă JavaScript-ul e oprit
 * sau cititorul e un păianjen care nu-l execută, articolul se citește la fel,
 * doar nu se numără. Exact ordinea bună a lucrurilor.
 *
 * ⚠ REFERINȚA OPREȘTE A DOUA NUMĂRARE. În dezvoltare, React montează de două ori
 * dinadins, ca să scoată la iveală efectele care nu suportă asta. Fără gardul de
 * aici, fiecare citire ar fi fost numărată de două ori local, iar cifrele din
 * panou ar fi mințit exact cât să nu se observe.
 */
export function NumaraCitirea({ slug }: { slug: string }) {
  const numarat = useRef(false);

  useEffect(() => {
    if (numarat.current) return;
    numarat.current = true;
    /* Fără `await`: nimic din pagină nu depinde de rezultat. */
    void numaraCitirea(slug);
  }, [slug]);

  return null;
}
