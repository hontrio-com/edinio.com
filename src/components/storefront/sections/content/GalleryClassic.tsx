"use client";

import Image from "next/image";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

/**
 * Galeria foto a magazinului, varianta classic. Imaginile vin din
 * `businesses.gallery`; click deschide lightbox-ul paginii.
 */
export function GalleryClassic() {
  const { gallery, features, openLightbox } = useStoreChrome();
  if (features.show_gallery === false || gallery.length === 0) return null;

  return (
    <section className="mb-16">
      <h2 className="text-xl font-semibold text-foreground mb-6">Galerie foto</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {gallery.map((url, i) => (
          <button key={i} type="button" onClick={() => openLightbox(url)}
            aria-label={`Deschide imaginea ${i + 1} din galerie`}
            className="relative aspect-square rounded-2xl overflow-hidden bg-muted border border-border hover:scale-[1.02] hover:shadow-md transition-all duration-200">
            <Image src={url} alt={`Galerie ${i + 1}`} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover" />
          </button>
        ))}
      </div>
    </section>
  );
}
