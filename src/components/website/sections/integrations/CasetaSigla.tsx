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
}: {
  cheie: LogoKey;
  className?: string;
  prioritara?: boolean;
}) {
  return (
    <div className={cn("caseta-sigla flex items-center justify-center", className)}>
      <Logo
        k={cheie}
        area={LOGO_AREA.tile}
        maxWidth={LATIME_UTILA}
        prioritara={prioritara}
      />
    </div>
  );
}
