"use client";

import Link from "next/link";
import { Package, Plus, Sparkles, Ticket } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/*
  Butonul „Adauga" din bara de sus: cele trei lucruri pe care un comerciant le
  face cel mai des, la un clic distanta din orice pagina.

  Pana acum, ca sa adaugi un produs trebuia sa mergi la Produse si sa cauti
  butonul de acolo; la un discount, si mai departe, fiindca formularul se
  deschidea doar dintr-un buton din pagina.

  ⚠ Discountul nu are pagina proprie: formularul lui e o fereastra care se
  deschide din lista. De aceea legatura duce la `?nou=1`, iar lista o citeste la
  prima randare (vezi `DiscountsClient`). Fara asta, „Adauga discount" ar fi
  lasat omul in fata listei, cautand acelasi buton ca inainte.
*/

const DE_ADAUGAT = [
  { href: "/dashboard/products/new", icon: Package, titlu: "Produs", detaliu: "Un produs nou in catalog" },
  { href: "/dashboard/discounts?nou=1", icon: Ticket, titlu: "Discount", detaliu: "Un cod promotional" },
  { href: "/dashboard/offers/new", icon: Sparkles, titlu: "Oferta", detaliu: "O reducere pe produse" },
];

export function ButonAdauga() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background transition-colors hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Adauga</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
        {DE_ADAUGAT.map(({ href, icon: Icon, titlu, detaliu }) => (
          <DropdownMenuItem
            key={href}
            className="gap-3 rounded-lg p-2.5"
            render={<Link href={href} />}
          >
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-muted text-foreground">
              <Icon className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{titlu}</span>
              <span className="block text-xs text-muted-foreground">{detaliu}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
