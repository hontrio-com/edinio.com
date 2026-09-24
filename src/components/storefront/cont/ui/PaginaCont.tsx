import type { ReactNode } from "react";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { RotesteJetonul } from "@/components/storefront/cont/RotesteJetonul";
import type { PaginaDeCont } from "@/lib/cont/pagina";
import type { RezumatCont } from "@/lib/cont/rezumat";
import { CadruCont, type PropsCadru } from "./CadruCont";

/**
 * Invelisul unei pagini de cont dupa intrare: tema magazinului, antetul si
 * subsolul lui, cadrul contului si rotirea jetonului.
 *
 * ⚠ `RotesteJetonul` sta AICI, pe fiecare pagina, nu numai pe `/cont`: omul care
 * intra direct pe o comanda dintr-un email n-ar mai fi trecut niciodata prin
 * pagina de start, iar jetonul lui n-ar fi fost rotit.
 */
export function PaginaCont({
  pag,
  rezumat,
  children,
  ...cadru
}: Omit<PropsCadru, "contId" | "nume" | "numeMagazin" | "rezumat" | "contact" | "greutateTitlu"> & {
  pag: PaginaDeCont;
  rezumat: RezumatCont;
  children: ReactNode;
}) {
  return (
    <StorefrontThemeScope style={pag.resolved.style}>
      <StorePageShell chrome={pag.chrome} design={pag.resolved.design} className="flex min-h-screen flex-col">
        {pag.sesiune && <RotesteJetonul trebuie={pag.sesiune.trebuieRotit} />}
        <CadruCont
          {...cadru}
          contId={pag.sesiune?.contId ?? null}
          nume={pag.sesiune?.nume ?? null}
          numeMagazin={pag.storeName}
          rezumat={rezumat}
          contact={pag.contact}
          greutateTitlu={pag.greutateTitlu}
        >
          {children}
        </CadruCont>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
