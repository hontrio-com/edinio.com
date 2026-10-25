"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { esteEcranIntreg } from "@/lib/editor-magazin/ecran-intreg";

/**
 * Cadrul panoului: bara laterala, bannerele, bara de sus si meniul de jos in jurul paginii.
 *
 * In editorul magazinului nu se deseneaza niciunul, iar editorul ia tot ecranul (25.10.2026, vezi
 * `esteEcranIntreg`). Se iese din bara editorului, cu „Ieși”.
 *
 * ⚠ Decizia se ia AICI, pe client, nu in layout: un layout din App Router nu se randeaza din nou la
 * navigarea intre paginile lui, deci o adresa citita pe server ar fi ramas cea de la intrare.
 *
 * Bara de impersonare ramane si in editor: un administrator trebuie sa vada mereu in contul cui
 * scrie (vezi `ImpersonationBanner`).
 */
export function CadruPanou({ banda, laterala, sus, jos, children }: {
  /** Bara de impersonare, cand e cazul. */
  banda: ReactNode;
  laterala: ReactNode;
  /** Bannerele de abonament si bara de sus. */
  sus: ReactNode;
  /** Meniul de jos, pe telefon. */
  jos: ReactNode;
  children: ReactNode;
}) {
  const ecranIntreg = esteEcranIntreg(usePathname());

  if (ecranIntreg) {
    return (
      <div className="h-dvh flex flex-col overflow-hidden">
        {banda}
        <main className="flex-1 min-h-0">{children}</main>
      </div>
    );
  }

  return (
    <>
      {banda}
      {laterala}
      <div className="lg:pl-[var(--sidebar-width)]">
        {sus}
        <main className="min-h-screen pb-20 lg:pb-0">{children}</main>
      </div>
      {jos}
    </>
  );
}
