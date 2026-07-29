"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CartProvider } from "@/components/storefront/cart/CartProvider";
import { ChromeSection } from "@/components/storefront/SectionRenderer";
import { StoreChromeProvider } from "@/components/storefront/StorefrontProvider";
import { cdnImage } from "@/lib/cdn-image";
import { StoreCartPanels } from "@/components/storefront/StoreCartPanels";
import type { StoreChromeData } from "@/lib/storefront/chrome-value";
import { standaloneAnnouncement } from "@/lib/storefront/design/chrome";
import type { StoreDesign } from "@/lib/storefront/design/types";

/**
 * Invelisul paginilor publice care nu au catalog: pagini custom, politici,
 * retur, confirmare.
 *
 * Aduce acolo exact aceleasi bara de anunt, header si footer ca pe pagina de
 * magazin, alese din aceeasi configuratie de design. Pana acum fiecare dintre
 * paginile astea isi avea propria copie de header si footer, asa ca designul
 * ales de comerciant se oprea la primul click pe un produs.
 *
 * `CartProvider` e montat si aici pentru ca numarul din cos sa fie citit dintr-un
 * singur loc pe toate paginile. Nu schimba ce se randeaza pe server: cosul
 * porneste gol si se completeaza dupa montare, exact ca inainte.
 */
export function StorePageShell({
  chrome,
  design,
  className,
  children,
}: {
  chrome: StoreChromeData;
  design: StoreDesign;
  className?: string;
  children: ReactNode;
}) {
  // Galeria foto poate aparea in orice sectiune de continut, deci lightbox-ul
  // trebuie sa existe si aici, nu doar pe pagina de magazin.
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Sertarul de cos si fereastra de comanda, montate mai jos. Vezi `StoreCartPanels`.
  const [cosDeschis, setCosDeschis] = useState(false);
  const [comandaDeschisa, setComandaDeschisa] = useState(false);
  const value = useMemo(
    () => ({
      ...chrome,
      // Aceeasi sursa ca bara randata mai jos: sectiunea stinsa sau stearsa din
      // editor, ori banda purtata in interiorul header-ului, nu lasa nimic de
      // ocolit deasupra lui.
      hasAnnouncementBar: chrome.hasAnnouncementBar && standaloneAnnouncement(design)?.enabled === true,
      // Butonul de cos deschide sertarul CHIAR AICI cand magazinul are sertar.
      // Era o functie goala, iar header-ul cadea pe linkul catre magazin.
      openCart: () => setCosDeschis(true),
      openLightbox: setLightbox,
    }),
    [chrome, design],
  );

  return (
    <CartProvider slug={chrome.business.slug}>
      <StoreChromeProvider value={value}>
        <div className={className}>
          <ChromeSection section={standaloneAnnouncement(design)} />
          <ChromeSection section={design.chrome.header} />
          {children}
          <ChromeSection section={design.chrome.footer} />
        </div>
        <StoreCartPanels
          chrome={chrome}
          design={design}
          cosDeschis={cosDeschis}
          inchideCos={() => setCosDeschis(false)}
          comandaDeschisa={comandaDeschisa}
          deschideComanda={() => setComandaDeschisa(true)}
          inchideComanda={() => setComandaDeschisa(false)}
        />
        {lightbox && (
          <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setLightbox(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cdnImage(lightbox, 2560)} alt="Imagine galerie marita"
              className="max-w-full max-h-full object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </StoreChromeProvider>
    </CartProvider>
  );
}
