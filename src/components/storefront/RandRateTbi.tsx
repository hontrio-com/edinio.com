/**
 * Mesajul „plateste in rate" de pe pagina produsului, forma `rand` (implicita), cu sigla tbi pe o
 * pastila. Bannerele (`BannerRateTbi`, `VideoRateTbi`) stau pe un card alb (`CardTbi`) si folosesc
 * sigla mare, fara pastila (`LogoTbi`).
 *
 * Un singur loc pentru marcaj: il folosesc pagina produsului (`RateTbi`, din `_shared/pieces.tsx`,
 * care decide CAND si IN CE FORMA apare) si previzualizarea din panoul tbi, ca alegerea din panou
 * sa arate exact ce va vedea clientul, nu o copie care se dezlipeste in timp.
 *
 * ⚠ Sigla sta pe o pastila ALBA: are textul aproape negru (#0D0D0D) pe fond transparent, deci pe
 * temele inchise s-ar fi vazut doar portocaliul. Fara diacritice: e text de vitrina.
 */
export function SiglaTbi({ mare = false, className }: { mare?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md bg-white px-1.5 py-0.5 ring-1 ring-black/10${className ? ` ${className}` : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/integrations/tbi.svg" alt="tbi bank" width={37} height={16} className={mare ? "h-5 w-auto" : "h-4 w-auto"} loading="lazy" decoding="async" />
    </span>
  );
}

/** `nota`: intre ce sume se poate plati in rate, la produsele cu pretul in afara limitelor (`tbiPePaginaProdusului`). */
export function RandRateTbi({ className, nota }: { className?: string; nota?: string | null }) {
  const rand = (
    <p className={`flex items-center justify-center gap-1.5 text-xs text-muted-foreground${!nota && className ? ` ${className}` : ""}`}>
      <span>Plateste in rate cu</span>
      <SiglaTbi />
      <span className="sr-only">: alegi plata in rate la finalizarea comenzii.</span>
    </p>
  );
  if (!nota) return rand;
  return (
    <div className={`space-y-0.5${className ? ` ${className}` : ""}`}>
      {rand}
      <p className="text-center text-[11px] text-muted-foreground">{nota}</p>
    </div>
  );
}
