import { cn } from "@/lib/utils/cn";

/**
 * Forma cenusie care tine locul continutului cat se incarca.
 *
 * DE CE O PRIMITIVA. Existau 45 de fisiere `loading.tsx`, fiecare cu acelasi
 * dreptunghi scris de mana (`bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse`).
 * Culorile sunt pastrate exact ca inainte, ca sa nu se schimbe nimic vizual.
 *
 * DE CE CONTEAZA ACUM. `loading.tsx` acopera TOATA pagina si dispare abia cand
 * sunt gata TOATE datele — deci un singur apel lent tine ecranul gri complet.
 * Aceleasi forme, folosite ca `fallback` pentru `<Suspense>`, tin locul doar
 * bucatii care intarzie, iar restul paginii se vede imediat.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      // `aria-hidden`: pentru cititoarele de ecran forma nu inseamna nimic, iar
      // anuntarea a zece dreptunghiuri goale e zgomot, nu informatie.
      aria-hidden="true"
      className={cn("bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse", className)}
    />
  );
}

/** Un sir de randuri de aceeasi inaltime — liste, tabele, jurnale. */
export function SkeletonRanduri({
  randuri = 8,
  inaltime = "h-14",
  className,
}: {
  randuri?: number;
  inaltime?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: randuri }).map((_, i) => (
        <Skeleton key={i} className={cn(inaltime, "rounded-xl")} />
      ))}
    </div>
  );
}

/** Titlu plus lista — tiparul celor mai multe pagini de panou. */
export function SkeletonPagina({ randuri = 8 }: { randuri?: number }) {
  return (
    <>
      <Skeleton className="h-8 w-48" />
      <SkeletonRanduri randuri={randuri} className="mt-6" />
    </>
  );
}
