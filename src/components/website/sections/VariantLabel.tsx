/**
 * TEMPORAR — despărțitorul dintre variantele puse una sub alta pentru ales.
 *
 * Există numai cât timp se compară ceva pe pagină. Se șterge odată cu varianta
 * care pierde, împreună cu apelurile din `app/(website)/page.tsx`.
 *
 * Desenat dinadins ca schelă: linie întreruptă și scris mărunt cu majuscule. Un
 * despărțitor frumos s-ar fi citit ca parte din pagină și ar fi rămas acolo.
 */
export function VariantLabel({ letter, title }: { letter: string; title: string }) {
  return (
    <div className="bg-white py-14 lg:py-16">
      <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-5 sm:px-6 lg:px-8">
        <span className="h-px flex-1 border-t border-dashed border-ink-3/40" />
        <span className="whitespace-nowrap text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-3">
          {letter} · {title}
        </span>
        <span className="h-px flex-1 border-t border-dashed border-ink-3/40" />
      </div>
    </div>
  );
}
