"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageProductCard } from "./PageProductCard";
import type { PageProduct } from "./ProductsBlock";

export function ProductCarousel({ products, color, basePath, storeSlug, columns, addToCart }: {
  products: PageProduct[]; color: string; basePath: string; storeSlug: string; columns: number; addToCart: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };
  const wCls = columns === 2 ? "w-[72%] sm:w-[48%]" : columns === 3 ? "w-[64%] sm:w-[31%]" : "w-[58%] sm:w-[40%] lg:w-[23%]";
  return (
    <div className="relative">
      <div ref={ref} className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 px-1 -mx-1">
        {products.map((p) => (
          <div key={p.id} className={`snap-start shrink-0 ${wCls}`}>
            <PageProductCard p={p} color={color} basePath={basePath} storeSlug={storeSlug} addToCart={addToCart} />
          </div>
        ))}
      </div>
      {products.length > columns && (
        <>
          <button type="button" aria-label="Inapoi" onClick={() => scroll(-1)} className="hidden md:flex absolute left-0 top-1/3 -translate-x-1/2 w-9 h-9 rounded-full bg-white shadow-md border border-border items-center justify-center hover:bg-muted z-10"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" aria-label="Inainte" onClick={() => scroll(1)} className="hidden md:flex absolute right-0 top-1/3 translate-x-1/2 w-9 h-9 rounded-full bg-white shadow-md border border-border items-center justify-center hover:bg-muted z-10"><ChevronRight className="h-4 w-4" /></button>
        </>
      )}
    </div>
  );
}
