import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import type { ArticolDeLista } from "@/lib/blog/citire";

/**
 * Cartonașul unui articol din listă.
 *
 * ⚠ FĂRĂ `unoptimized`, spre deosebire de ecranele de admin. Copertele stau pe
 * R2, iar `supabase-image-loader` le redimensionează la edge. Pe o pagină
 * publică, imaginea de deschidere e de obicei chiar elementul care hotărăște
 * LCP-ul, deci servirea ei la mărimea cerută nu e un moft.
 */
export function CardArticol({
  articol,
  mare = false,
  prioritar = false,
}: {
  articol: ArticolDeLista;
  /** Primul articol din listă stă lat, cu imaginea deasupra. */
  mare?: boolean;
  /** Doar pentru cel dintâi: îi spune browserului să nu-l amâne. */
  prioritar?: boolean;
}) {
  const data = articol.published_at
    ? new Date(articol.published_at).toLocaleDateString("ro-RO", {
        day: "numeric", month: "long", year: "numeric",
      })
    : null;

  return (
    <Link
      href={`/blog/${articol.slug}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-white transition-colors duration-200 hover:border-ink-3/40",
        mare && "sm:col-span-2",
      )}
    >
      {articol.cover_url ? (
        <div className={cn("relative w-full overflow-hidden bg-tint", mare ? "aspect-[16/7]" : "aspect-[16/9]")}>
          <Image
            src={articol.cover_url}
            alt={articol.cover_alt ?? ""}
            fill
            sizes={mare ? "(max-width: 640px) 100vw, 800px" : "(max-width: 640px) 100vw, 400px"}
            priority={prioritar}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-5">
        {articol.categorie ? (
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
            {articol.categorie.name}
          </span>
        ) : null}

        <h2 className={cn("mt-2 font-semibold leading-[1.3] text-ink", mare ? "text-[22px]" : "text-[17px]")}>
          {articol.title}
        </h2>

        {articol.excerpt ? (
          <p className="mt-2 text-[14px] leading-[1.6] text-ink-2 line-clamp-3">{articol.excerpt}</p>
        ) : null}

        {/* Data și minutele stau jos, lipite de marginea de jos oricât de scurt
            ar fi textul: altfel cartonașele de pe un rând nu se aliniază. */}
        <div className="mt-auto flex items-center gap-2 pt-4 text-[12.5px] text-ink-3">
          {articol.autor ? <span>{articol.autor.name}</span> : null}
          {articol.autor && data ? <span aria-hidden="true">·</span> : null}
          {data ? <time dateTime={articol.published_at ?? undefined}>{data}</time> : null}
          {articol.reading_minutes ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{articol.reading_minutes} min</span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
