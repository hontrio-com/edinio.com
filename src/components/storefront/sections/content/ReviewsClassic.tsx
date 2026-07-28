"use client";

import { cdnImage } from "@/lib/cdn-image";
import { formatDate } from "@/lib/utils/format";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

const STAR_PATH =
  "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

/**
 * Sectiunea de recenzii, varianta classic: media pe cinci stele in antet, apoi
 * o grila de carduri. Continutul vine din `page_content.reviews_section`.
 */
export function ReviewsClassic() {
  const { pageContent, color } = useStoreChrome();
  const reviews = pageContent.reviews_section;
  if (!reviews?.enabled || reviews.items.length === 0) return null;

  const numar = reviews.items.length;
  const medie = (reviews.items.reduce((s, r) => s + r.rating, 0) / numar).toFixed(1);
  // Stelele din antet urmau media doar in cifra de langa ele: la 3,1 se vedeau
  // cinci stele pline, adica un scor umflat afisat clientilor.
  const steleMedie = Math.round(Number(medie));

  return (
    <section className="mb-16">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-xl font-semibold text-foreground">{reviews.title || "Ce spun clientii nostri"}</h2>
        <div className="h-px flex-1 bg-border" />
        <div className="flex items-center gap-1" role="img"
          aria-label={`Media ${medie} din 5, ${numar} ${numar === 1 ? "recenzie" : "recenzii"}`}>
          {[1, 2, 3, 4, 5].map((s) => (
            <svg key={s} viewBox="0 0 20 20" className="h-4 w-4"
              fill={s <= steleMedie ? "#FBBF24" : "none"}
              stroke={s <= steleMedie ? "#FBBF24" : "#D1D5DB"} strokeWidth="1.5">
              <path d={STAR_PATH} />
            </svg>
          ))}
          <span className="text-xs font-semibold text-foreground ml-1">{medie}</span>
          <span className="text-xs text-muted-foreground">({numar})</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reviews.items.map((review, i) => (
          <div key={i} className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <svg key={s} viewBox="0 0 20 20" className="h-3.5 w-3.5"
                  fill={s <= review.rating ? "#FBBF24" : "none"}
                  stroke={s <= review.rating ? "#FBBF24" : "#D1D5DB"} strokeWidth="1.5">
                  <path d={STAR_PATH} />
                </svg>
              ))}
            </div>
            {review.text && (
              <p className="text-sm text-foreground leading-relaxed flex-1">
                &ldquo;{review.text}&rdquo;
              </p>
            )}
            <div className="flex items-center gap-2.5 pt-1 border-t border-border">
              {review.image ? (
                /* Cercul are 32 px, poza incarcata de comerciant are adesea cativa
                   MB: fara CDN, sase recenzii aduceau zeci de MB degeaba. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cdnImage(review.image, 64)} alt={review.name || "Client"}
                  width={32} height={32} loading="lazy"
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-border" />
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: color }}>
                  {review.name?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{review.name || "Anonim"}</p>
                {review.date && !Number.isNaN(new Date(review.date).getTime()) && (
                  <p className="text-[10px] text-muted-foreground">{formatDate(review.date)}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
