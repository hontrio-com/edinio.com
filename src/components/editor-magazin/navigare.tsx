"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { adresaSetarii, type CheieSetare } from "@/lib/editor-magazin/setari";

/**
 * Deschide o setare din fila „Setări” a editorului (etapa 8). In editor, o nota care spune „asta se
 * completeaza la Informații generale” o deschide pe loc, fara navigare: o adresa catre aceeasi pagina
 * n-ar fi schimbat fila, iar o reincarcare ar fi aruncat ce era deschis.
 */
export const DeschideSetareaContext = createContext<((setare: CheieSetare) => void) | null>(null);

const trimitereCls = "inline-flex items-center gap-1 font-medium text-primary hover:underline";

/** Trimiterea spre o setare: in editor, pe loc; in afara lui (o componenta folosita si altundeva), prin adresa. */
export function TrimitereSetare({ setare, children }: { setare: CheieSetare; children: React.ReactNode }) {
  const deschide = useContext(DeschideSetareaContext);
  if (deschide) {
    return (
      <button type="button" onClick={() => deschide(setare)} className={trimitereCls}>
        {children}
        <ChevronRight className="h-3 w-3" />
      </button>
    );
  }
  return (
    <Link href={adresaSetarii(setare)} className={trimitereCls}>
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}
