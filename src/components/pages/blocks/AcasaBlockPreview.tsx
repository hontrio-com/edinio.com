import type { AcasaBlock } from "@/lib/pages/blocks.types";
import { etichetaSectiunii, SECTIUNI_ACASA, VARIANTE_HERO } from "@/lib/pages/pagina-acasa";

/**
 * Cum arata in EDITOR un bloc „Din pagina principala".
 *
 * Nu e sectiunea insasi: aceea are nevoie de catalog, cos si toate produsele,
 * pe care editorul de pagini nu le are. Pe magazin se randeaza sectiunea
 * adevarata (vezi `lib/storefront/design/pagina-acasa.ts`).
 */
export function AcasaBlockPreview({ block, estePaginaAcasa }: { block: AcasaBlock; estePaginaAcasa: boolean }) {
  const descriere = SECTIUNI_ACASA.find((s) => s.cheie === block.sectiune)?.descriere ?? "";
  const detaliu = block.sectiune === "hero"
    ? VARIANTE_HERO.find((v) => v.valoare === (block.varianta ?? "banners"))?.eticheta
    : block.sectiune === "catalog" && block.cuBara === false ? "Fara bara de cautare" : null;
  return (
    <div className="px-4 py-3">
      <div className="mx-auto max-w-6xl rounded-xl border border-dashed border-border bg-muted/40 px-4 py-5 text-center">
        <p className="text-sm font-semibold text-foreground">{etichetaSectiunii(block.sectiune)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{descriere}{detaliu ? ` · ${detaliu}` : ""}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {estePaginaAcasa
            ? "Pe magazin apare sectiunea reala, cu continutul din Editeaza magazinul."
            : "Apare doar cand pagina e setata ca pagina principala (Pagini > Acasa)."}
        </p>
      </div>
    </div>
  );
}
