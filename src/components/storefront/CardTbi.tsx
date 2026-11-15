import type { ReactNode } from "react";

/**
 * Cardul comun al bannerelor tbi (formele `banner` si `video` de pe pagina produsului).
 *
 * Chenarul in straturi e preluat din „Texture Card", Cult UI
 * (https://www.cult-ui.com/docs/components/texture-card, licenta MIT, © Nolly Studio): cinci chenare
 * imbricate, cu raze care scad cate un pixel, dau marginea „lucrata" fara fonduri translucide colorate.
 *
 * ⚠ Culori FIXE, deschise, fara variante `dark:`: e un insert al bancii, cu sigla ei (textul „bank" e
 * aproape negru), deci trebuie sa ramana deschis si pe temele inchise ale magazinului. Din acelasi
 * motiv nu foloseste tokenii temei pentru fond si text.
 */
export function CardTbi({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[20px] border border-white/60 bg-gradient-to-b from-neutral-100 to-white/70 text-left shadow-[0_1px_2px_rgb(0_0_0/0.06)]${className ? ` ${className}` : ""}`}>
      <div className="rounded-[19px] border border-black/10">
        <div className="rounded-[18px] border border-white/50">
          <div className="rounded-[17px] border border-neutral-950/20">
            <div className="w-full overflow-hidden rounded-[16px] border border-white/50 bg-white">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Sigla tbi bank la marimea de banner (cea oficiala, `public/integrations/tbi.svg`, 101x44). */
export function LogoTbi({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/integrations/tbi.svg" alt="tbi bank" width={101} height={44} loading="lazy" decoding="async"
      className={`h-8 w-auto shrink-0${className ? ` ${className}` : ""}`} />
  );
}
