import { cn } from "@/lib/utils/cn";
import { LOGO_AREA, type LogoKey } from "@/lib/website/logos";
import { Logo } from "./Logo";

/**
 * O placă albă cu o siglă înăuntru.
 *
 * Aceeași piesă în două locuri: benzile care curg pe pagina de start și câmpul
 * care plutește în hero-ul paginii „Integrări". Stă într-un fișier al ei tocmai
 * ca să nu ajungă două — cu o copie de fiecare parte, prima corectură făcută
 * într-un loc le-ar fi despărțit, iar cele două n-ar mai fi arătat ca aceeași
 * platformă.
 *
 * `caseta-sigla` ADUCE albul și umbrele; nu se pune `bg-white` lângă ea.
 * Socoteala umbrei — de ce patru straturi și nu unul — e în globals.css.
 *
 * Aici s-au încercat cândva patru tratamente (granule, sticlă cu refracție, crom,
 * relief) și clientul le-a respins pe toate (2026-08-07). A cerut alb curat,
 * deosebit de pagină doar prin umbră. Deci nimic în fond.
 *
 * Mărimea și rotunjirea vin din afară, prin `className`: în bandă caseta e de
 * 68/84px cu colț de 16, în câmpul plutitor e la fel de mare dar cu colțul mai
 * moale, ca în referința aleasă de client.
 */

/**
 * Lățimea utilă dinăuntrul celei mai mici casete (68px, cu 6px de respirație de
 * fiecare parte).
 *
 * NU e stil, e limita cutiei. Fără ea, o siglă foarte lată — About You are
 * raportul 9,13 — ar ieși de 121px la suprafața `tile` și ar sparge rândul. Cu ea
 * plus `object-contain`, siglele late se micșorează singure până intră.
 * Se schimbă DOAR odată cu lățimea casetei celei mai mici.
 */
export const LATIME_UTILA = 56;

export function CasetaSigla({
  cheie,
  className,
  prioritara,
  suprafata = LOGO_AREA.tile,
  latimeUtila = LATIME_UTILA,
}: {
  cheie: LogoKey;
  className?: string;
  prioritara?: boolean;
  /**
   * Cât de mare se desenează sigla, în pixeli pătrați.
   *
   * ⚠ SE SCHIMBĂ ODATĂ CU MĂRIMEA CASETEI, ȘI NU LINIAR: suprafața crește cu
   * PĂTRATUL laturii. O casetă de 52px în loc de 68 e 0,76 din latură, deci
   * 0,58 din suprafață. Cine pune o casetă mai mică și lasă suprafața neatinsă
   * capătă sigle care ies din ea — `object-contain` le va strânge, dar atunci
   * nu mai sunt egale între ele, care e tot rostul socotelii.
   */
  suprafata?: number;
  /** Lățimea utilă dinăuntru, tot pe măsura casetei. Vezi `LATIME_UTILA`. */
  latimeUtila?: number;
}) {
  return (
    <div className={cn("caseta-sigla flex items-center justify-center", className)}>
      <Logo k={cheie} area={suprafata} maxWidth={latimeUtila} prioritara={prioritara} />
    </div>
  );
}

/**
 * Măsurile casetei mici, cea din panoul de meniu.
 *
 * ⚠ CASETA E PĂTRATĂ, ca cea mare. Prima formă îi dădea doar înălțime și o lăsa
 * să se întindă pe coloană: măsurat, ieșea de 56px lată la 1024 și de 73 la
 * 1280, adică un dreptunghi care se schimba cu fereastra. Caseta de pe pagina
 * „Integrări" e pătrată, și tocmai pătratul o face să arate a pictogramă.
 *
 * 56 din 68: 56/68 = 0,824, iar suprafața merge cu PĂTRATUL laturii, deci
 * 1600 × 0,824² ≈ 1085. Lățimea utilă, tot pe măsură: 56 × 0,824 ≈ 46.
 */
export const CASETA_MICA = {
  /** Latura, în pixeli. Trebuie să se potrivească cu clasa de mărime din panou. */
  latura: 56,
  suprafata: 1085,
  latimeUtila: 46,
} as const;
